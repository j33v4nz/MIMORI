"""HTTP client and background batching for MIMORI telemetry."""

from __future__ import annotations

import atexit
import base64
import binascii
import ipaddress
import logging
import queue
import random
import re
import threading
import time
import uuid
import warnings
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal, TypedDict

import requests

EventType = Literal[
    "llm_start",
    "llm_end",
    "tool_start",
    "tool_end",
    "chain_start",
    "chain_end",
    "agent_action",
    "manual",
]


class MIMORIEvent(TypedDict):
    event_type: EventType
    sequence_number: int
    payload: dict[str, Any]
    timestamp: str


@dataclass(frozen=True)
class MIMORIConfig:
    api_key: str
    agent_name: str
    api_url: str = "http://localhost:3000"
    session_id: str | None = None
    framework: str | None = None
    flush_interval: float = 1.0
    batch_size: int = 25
    max_queue_size: int = 1000
    timeout: float = 2.0
    max_payload_chars: int = 100_000
    redaction_mode: Literal["strict", "permissive"] = "strict"

    def __post_init__(self) -> None:
        if not self.api_key:
            raise ValueError("api_key must not be empty.")
        if not self.agent_name:
            raise ValueError("agent_name must not be empty.")
        if not re.match(r"https?://", self.api_url):
            raise ValueError(
                f"api_url must start with http:// or https://, got: {self.api_url!r}"
            )
        if self.flush_interval <= 0:
            raise ValueError("flush_interval must be positive.")
        if self.batch_size < 1:
            raise ValueError("batch_size must be >= 1.")
        if self.max_queue_size < 1:
            raise ValueError("max_queue_size must be >= 1.")
        if self.timeout <= 0:
            raise ValueError("timeout must be positive.")
        if self.max_payload_chars < 1:
            raise ValueError("max_payload_chars must be >= 1.")
        if self.redaction_mode not in ("strict", "permissive"):
            raise ValueError(
                f"redaction_mode must be 'strict' or 'permissive', got: {self.redaction_mode!r}"
            )

    def __repr__(self) -> str:
        masked = self.api_key[:4] + "****" if len(self.api_key) > 4 else "****"
        return (
            f"MIMORIConfig(api_key={masked!r}, agent_name={self.agent_name!r}, "
            f"api_url={self.api_url!r}, session_id={self.session_id!r})"
        )


class MIMORIClient:
    """Queues telemetry and flushes it to MIMORI without blocking the agent.

    Args:
        api_key: MIMORI API key for authentication.
        agent_name: Logical name of the AI agent.
        api_url: Base URL of the MIMORI server.
        session_id: Optional session identifier. Auto-generated if omitted.
        framework: Optional agent framework name (e.g. "langchain").
        flush_interval: Seconds between background flush cycles.
        batch_size: Max events per HTTP request.
        max_queue_size: Max queued events before drops begin.
        timeout: HTTP request timeout in seconds.
        max_payload_chars: Maximum characters per payload string.
            Enforced inside ``_json_safe`` for every string after
            redaction (redact first, then truncate).
        auto_start: Start the background flush thread immediately.
        redaction_mode: PII redaction strictness applied to payloads before
            they are queued. ``"strict"`` (default) redacts secrets, email
            addresses, and IPv4 addresses; ``"permissive"`` redacts secrets
            only.
        config: A ``MIMORIConfig`` instance. When provided, all other
            parameters are ignored.
    """

    def __init__(
        self,
        api_key: str = "",
        agent_name: str = "",
        api_url: str = "http://localhost:3000",
        session_id: str | None = None,
        framework: str | None = None,
        flush_interval: float = 1.0,
        batch_size: int = 25,
        max_queue_size: int = 1000,
        timeout: float = 2.0,
        max_payload_chars: int = 100_000,
        auto_start: bool = True,
        redaction_mode: Literal["strict", "permissive"] = "strict",
        *,
        config: MIMORIConfig | None = None,
    ) -> None:
        if config is not None:
            self.config = config
        else:
            self.config = MIMORIConfig(
                api_key=api_key,
                agent_name=agent_name,
                api_url=api_url.rstrip("/"),
                session_id=session_id or f"sess_{uuid.uuid4()}",
                framework=framework,
                flush_interval=flush_interval,
                batch_size=batch_size,
                max_queue_size=max_queue_size,
                timeout=timeout,
                max_payload_chars=max_payload_chars,
                redaction_mode=redaction_mode,
            )
        self.last_redacted_keys: list[str] = []
        self._events: queue.Queue[MIMORIEvent] = queue.Queue(
            maxsize=self.config.max_queue_size
        )
        self._sequence_number = 0
        self._sequence_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._warning_logged = False
        self._logged_warnings: set[str] = set()
        self._warning_lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json",
            }
        )

        if (
            self.config.api_url.startswith("http://")
            and "localhost" not in self.config.api_url
        ):
            warnings.warn(
                f"MIMORI is configured with an insecure HTTP URL: {self.config.api_url}. "
                "Use HTTPS in production to protect API keys and telemetry in transit.",
                stacklevel=2,
            )

        if auto_start:
            self.start()
            atexit.register(self.close)

    @property
    def session_id(self) -> str:
        """Return the session identifier for this client."""
        return self.config.session_id or ""

    def start(self) -> None:
        """Start the background flush thread. No-op if already running."""
        if self._thread and self._thread.is_alive():
            return

        self._thread = threading.Thread(
            target=self._flush_loop,
            name="MIMORI-flush",
            daemon=True,
        )
        self._thread.start()

    def log(self, event_type: EventType, payload: dict[str, Any]) -> None:
        """Enqueue a telemetry event.

        Events are serialized, sanitized of non-JSON-safe values, redacted
        of PII/secrets per ``config.redaction_mode``, and placed on an
        internal queue. If the queue is full the event is silently
        dropped so that caller code is never blocked. Payload keys whose
        values were redacted are recorded on ``self.last_redacted_keys``.
        """
        redacted_keys: list[str] = []
        # Reserved metadata is generated by the SDK, never copied from caller input.
        payload = {
            key: value for key, value in payload.items() if key != "_mimori_security"
        }
        signals = _security_signals(payload)
        event = MIMORIEvent(
            event_type=event_type,
            sequence_number=self._next_sequence_number(),
            payload=_json_safe(
                payload,
                redaction_mode=self.config.redaction_mode,
                redacted_keys=redacted_keys,
                max_chars=self.config.max_payload_chars,
            ),
            timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        )
        if signals:
            event["payload"]["_mimori_security"] = {"version": 1, "signals": signals}
        self.last_redacted_keys = redacted_keys

        try:
            self._events.put_nowait(event)
        except queue.Full:
            self._warn_once("MIMORI event queue is full; dropping telemetry.")

    def flush(self) -> None:
        """Drain up to ``batch_size`` events and POST them to the server."""
        batch = self._drain_batch()

        if batch:
            self._post_batch(batch)

    def close(self) -> None:
        """Stop the background thread and flush any remaining events."""
        self._stop_event.set()

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=self.config.flush_interval + 0.5)

        while not self._events.empty():
            self.flush()

        self._session.close()

    def __enter__(self) -> MIMORIClient:
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()

    def _next_sequence_number(self) -> int:
        with self._sequence_lock:
            self._sequence_number += 1
            return self._sequence_number

    def _flush_loop(self) -> None:
        while not self._stop_event.is_set():
            while not self._events.empty() and not self._stop_event.is_set():
                self.flush()
            self._stop_event.wait(self.config.flush_interval)

    def _drain_batch(self) -> list[MIMORIEvent]:
        batch: list[MIMORIEvent] = []

        while len(batch) < self.config.batch_size:
            try:
                batch.append(self._events.get_nowait())
            except queue.Empty:
                break

        return batch

    def _post_batch(self, events: list[MIMORIEvent]) -> None:
        url = f"{self.config.api_url}/api/ingest/event"
        body = {
            "agent_name": self.config.agent_name,
            "session_id": self.config.session_id,
            "events": events,
        }
        if self.config.framework:
            body["framework"] = self.config.framework

        max_retries = 3
        base_delay = 1.0

        for attempt in range(max_retries):
            try:
                res = self._session.post(
                    url,
                    json=body,
                    timeout=self.config.timeout,
                )
                if res.status_code == 429:
                    if attempt == max_retries - 1:
                        self._warn_once(
                            f"MIMORI batch dropped after {max_retries} retries due to rate limiting."
                        )
                    else:
                        time.sleep(base_delay * (2**attempt) + random.uniform(0, 1))
                    continue
                res.raise_for_status()
                return
            except requests.ConnectionError as exc:
                if attempt == max_retries - 1:
                    self._warn_once(
                        f"MIMORI telemetry failed after {max_retries} attempts; continuing without it: {exc}"
                    )
                else:
                    time.sleep(base_delay * (2**attempt) + random.uniform(0, 1))
            except requests.Timeout as exc:
                if attempt == max_retries - 1:
                    self._warn_once(
                        f"MIMORI telemetry failed after {max_retries} attempts; continuing without it: {exc}"
                    )
                else:
                    time.sleep(base_delay * (2**attempt) + random.uniform(0, 1))
            except requests.HTTPError as exc:
                if exc.response is not None and exc.response.status_code < 500:
                    self._warn_once(
                        f"MIMORI telemetry failed with non-retryable error: {exc}"
                    )
                    return
                if attempt == max_retries - 1:
                    self._warn_once(
                        f"MIMORI telemetry failed after {max_retries} attempts; continuing without it: {exc}"
                    )
                else:
                    time.sleep(base_delay * (2**attempt) + random.uniform(0, 1))
            except requests.RequestException as exc:
                if attempt == max_retries - 1:
                    self._warn_once(
                        f"MIMORI telemetry failed after {max_retries} attempts; continuing without it: {exc}"
                    )
                else:
                    time.sleep(base_delay * (2**attempt) + random.uniform(0, 1))

    def _warn_once(self, message: str, key: str | None = None) -> None:
        warning_key = key or message[:60]
        with self._warning_lock:
            if warning_key in self._logged_warnings:
                return
            self._logged_warnings.add(warning_key)
            self._warning_logged = True

        logging.getLogger("MIMORI").warning(message)


# ---------------------------------------------------------------------------
# PII / secret redaction applied to telemetry payloads before queuing.
# Each entry is (name, pattern, marker, scope) where scope "secret" means
# the pattern is redacted in both "strict" and "permissive" modes, while
# scope "pii" is redacted in "strict" mode only.
# ---------------------------------------------------------------------------

_REDACTION_PATTERNS: tuple[tuple[str, re.Pattern[str], str, str], ...] = (
    (
        "aws_key",
        re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
        "[REDACTED_AWS_KEY]",
        "secret",
    ),
    (
        "github_token",
        re.compile(r"\bghp_[A-Za-z0-9]{36}\b"),
        "[REDACTED_GITHUB_TOKEN]",
        "secret",
    ),
    (
        "github_pat",
        re.compile(r"\bgithub_pat_[A-Za-z0-9_]{22,}\b"),
        "[REDACTED_GITHUB_TOKEN]",
        "secret",
    ),
    (
        "openai_key",
        re.compile(r"\bsk-proj-[A-Za-z0-9_\-]{20,}\b"),
        "[REDACTED_API_KEY]",
        "secret",
    ),
    (
        "anthropic_key",
        re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{20,}\b"),
        "[REDACTED_API_KEY]",
        "secret",
    ),
    (
        "slack_token",
        re.compile(r"\bxox[bpas]-[A-Za-z0-9\-]{10,}\b"),
        "[REDACTED_SLACK_TOKEN]",
        "secret",
    ),
    (
        "google_api_key",
        re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b"),
        "[REDACTED_GOOGLE_API_KEY]",
        "secret",
    ),
    (
        "private_key",
        # END marker is optional so a key that was truncated before
        # redaction (handlers cap payloads at 100_000 chars) still
        # redacts from BEGIN through the end of the string instead of
        # leaking the key body.
        re.compile(
            r"-----BEGIN [A-Z ]*PRIVATE KEY-----"
            r"[\s\S]*?"
            r"(?:-----END [A-Z ]*PRIVATE KEY-----|$)"
        ),
        "[REDACTED_PRIVATE_KEY]",
        "secret",
    ),
    (
        "email",
        re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"),
        "[REDACTED_EMAIL]",
        "pii",
    ),
    (
        "ipv4",
        re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
        "[REDACTED_IP]",
        "pii",
    ),
)


# Pre-existing redaction markers inside INPUT text are neutralized before
# any pattern runs: a forged "[REDACTED_AWS_KEY]" literal must not be able
# to impersonate (or anchor) real redaction output. Genuine secrets are
# still matched and replaced with freshly-issued markers afterwards.
_FORGED_MARKER_RE = re.compile(r"\[REDACTED_[A-Z_]+\]")
_FORGED_MARKER_NEUTRAL = "[REDACTED]"

# IPv6 candidates: at least two "hex:" groups, bounded by non-hex/non-colon
# characters so slices of longer hex runs never match, with an optional
# embedded IPv4 final group (e.g. "::ffff:192.168.0.1"). Matches are then
# validated with ipaddress: only real addresses are redacted (public and
# private alike, same as the IPv4 rule), while version strings, timestamps
# ("12:34:56") and MAC addresses ("aa:bb:cc:dd:ee:ff") fail validation and
# pass through untouched.
_IPV6_CANDIDATE_RE = re.compile(
    r"(?<![0-9A-Fa-f:.])"
    r"(?:[0-9A-Fa-f]{0,4}:){2,7}"
    r"(?:[0-9A-Fa-f]{0,4}|\d{1,3}(?:\.\d{1,3}){3})"
    r"(?![0-9A-Fa-f:.])"
)

# Encoded-view scanning: candidate tokens big enough to plausibly wrap a
# secret (hex tokens are a subset of the base64 alphabet, so one pass
# feeds both decode attempts). Decode work only runs on strings of
# 16.._ENCODED_SCAN_MAX chars to bound worst-case cost per string.
_ENCODED_TOKEN_RE = re.compile(r"[A-Za-z0-9+/=]{16,}")
_ENCODED_HEX_RE = re.compile(r"[0-9A-Fa-f]{16,}")
_ENCODED_SCAN_MIN = 16
_ENCODED_SCAN_MAX = 4096

# Split-across-fields redaction: consecutive dict values shorter than this
# are joined (up to _GROUP_MAX_KEYS keys) and scanned for secrets that only
# exist when reassembled. On a hit the whole group is replaced with this
# marker because the secret's bytes span field boundaries.
_GROUP_MAX_VALUE_CHARS = 20
_GROUP_MAX_KEYS = 8
_GROUP_REDACTION_MARKER = "[REDACTED_GROUP]"


def _redact_ipv6(text: str, redacted_keys: list[str] | None) -> str:
    """Redact real IPv6 addresses (strict mode only), leaving lookalikes."""

    def repl(match: re.Match[str]) -> str:
        candidate = match.group(0)
        try:
            ipaddress.ip_address(candidate)
        except ValueError:
            return candidate  # version string / timestamp / MAC, not an IP
        if redacted_keys is not None and "ipv6" not in redacted_keys:
            redacted_keys.append("ipv6")
        return "[REDACTED_IP]"

    return _IPV6_CANDIDATE_RE.sub(repl, text)


def _decoded_views(token: str) -> list[str]:
    """Base64- and hex-decoded views of an encoded candidate token.

    Both decodes are best-effort: invalid input yields an empty view
    instead of raising, and only views that decode cleanly are returned.
    """
    views: list[str] = []
    padded = token + "=" * (-len(token) % 4)
    try:
        raw = base64.b64decode(padded, validate=False)
    except (ValueError, binascii.Error):
        raw = b""
    if raw:
        views.append(raw.decode("utf-8", errors="ignore"))
    if len(token) % 2 == 0 and _ENCODED_HEX_RE.fullmatch(token):
        try:
            raw = bytes.fromhex(token)
        except ValueError:
            raw = b""
        if raw:
            views.append(raw.decode("utf-8", errors="ignore"))
    return views


def _secret_in_encoded_views(token: str) -> tuple[str, str] | None:
    """Return (name, marker) when a *secret* pattern hits a decoded view.

    Only secret-scope patterns are re-run here, so arbitrary base64 or
    hex blobs (checksums, hashes, ids) are never redacted — a decoded
    view must actually contain an API key, token, or private key.
    """
    for view in _decoded_views(token):
        for name, pattern, marker, scope in _REDACTION_PATTERNS:
            if scope != "secret":
                continue
            if pattern.search(view):
                return name, marker
    return None


def _redact_encoded_views(text: str, redacted_keys: list[str] | None) -> str:
    """Scan base64/hex-decoded views of candidate tokens for secrets."""
    if not (_ENCODED_SCAN_MIN <= len(text) <= _ENCODED_SCAN_MAX):
        return text

    def repl(match: re.Match[str]) -> str:
        run = match.group(0)
        # "=" glues prefixes onto real tokens ("token=<b64>"), so scan the
        # whole run plus every >=16-char segment between '=' separators.
        candidates = [run]
        for segment in run.split("="):
            if len(segment) >= _ENCODED_SCAN_MIN and segment != run:
                candidates.append(segment)
        result = run
        for candidate in candidates:
            hit = _secret_in_encoded_views(candidate)
            if hit is None:
                continue
            name, marker = hit
            if redacted_keys is not None and name not in redacted_keys:
                redacted_keys.append(name)
            result = result.replace(candidate, marker)
        return result

    return _ENCODED_TOKEN_RE.sub(repl, text)


def _redact_split_group(
    redacted: dict[str, Any],
    redaction_mode: str,
    redacted_keys: list[str] | None,
) -> None:
    """Redact secrets split across consecutive short string values.

    Some payloads stash one secret per field ("ghp_" / first half /
    second half). Individual value redaction cannot see those, so runs of
    consecutive short string values are joined (no separator, so split
    tokens reassemble) and scanned. On a hit every value in the run is
    replaced with ``[REDACTED_GROUP]`` because the secret's bytes span
    field boundaries.
    """
    items = list(redacted.items())
    total = len(items)
    i = 0
    while i < total:
        run: list[tuple[str, str]] = []
        j = i
        while j < total and len(run) < _GROUP_MAX_KEYS:
            key, value = items[j]
            if isinstance(value, str) and len(value) < _GROUP_MAX_VALUE_CHARS:
                run.append((key, value))
                j += 1
            else:
                break
        if len(run) < 2:
            i += 1
            continue
        values = [value for _, value in run]
        plain = "".join(values)
        # A secret spanning fields must stay adjacent (no separator) but
        # often needs word boundaries (\b) just OUTSIDE itself. Scan the
        # plain join plus views with newlines inserted at up to two field
        # boundaries — one match has at most two outer boundaries to
        # satisfy. This keeps split tokens reassemblable while restoring
        # the boundaries a glued neighbor value would otherwise kill.
        cuts: list[int] = []
        offset = 0
        for value in values[:-1]:
            offset += len(value)
            cuts.append(offset)
        views = [plain]
        for a in range(len(cuts)):
            for b in range(a, len(cuts)):
                views.append(
                    plain[: cuts[a]]
                    + "\n"
                    + plain[cuts[a] : cuts[b]]
                    + "\n"
                    + plain[cuts[b] :]
                )
        hits: list[str] = []
        for view in views:
            for name, pattern, _marker, scope in _REDACTION_PATTERNS:
                if name in hits:
                    continue
                if redaction_mode == "permissive" and scope != "secret":
                    continue
                if pattern.search(view):
                    hits.append(name)
        if hits:
            for key, _ in run:
                redacted[key] = _GROUP_REDACTION_MARKER
            if redacted_keys is not None:
                for name in hits:
                    if name not in redacted_keys:
                        redacted_keys.append(name)
                for key, _ in run:
                    if key not in redacted_keys:
                        redacted_keys.append(key)
        i = j


def _payload_strings(value: Any, seen: set[int] | None = None, depth: int = 0):
    """Walk values with the same cycle/depth bounds as serialization."""
    if depth > 100:
        return
    if isinstance(value, str):
        yield value
        return
    if not isinstance(value, (dict, list, tuple, set)):
        return
    seen = seen if seen is not None else set()
    if id(value) in seen:
        return
    seen.add(id(value))
    items = value.values() if isinstance(value, dict) else value
    for item in items:
        yield from _payload_strings(item, seen, depth + 1)
    seen.remove(id(value))


def _security_signals(payload: dict[str, Any]) -> list[str]:
    """Report threat classes without transmitting matched addresses or secrets.

    These are client-reported observations, not proof of an executed attack.
    A permissive redaction pass supplies only genuine secret markers (including
    encoded/split secrets); forged markers are neutralized by the redactor.
    """
    signals: list[str] = []
    metadata = re.compile(
        r"\b(?:169\.254\.169\.254|metadata\.google\.internal)\b", re.I
    )
    if any(metadata.search(text) for text in _payload_strings(payload)):
        signals.append("cloud_metadata_probe")
    secret_markers = {
        marker for _, _, marker, scope in _REDACTION_PATTERNS if scope == "secret"
    }
    secret_markers.update({"[REDACTED_ENCODED_SECRET]", _GROUP_REDACTION_MARKER})
    secret_view = _json_safe(payload, redaction_mode="permissive")
    if any(
        marker in text
        for text in _payload_strings(secret_view)
        for marker in secret_markers
    ):
        signals.append("credential_exposure")
    return signals


def _redact_text(
    text: str,
    redaction_mode: str = "strict",
    redacted_keys: list[str] | None = None,
) -> str:
    """Redact secrets/PII in a string, returning the redacted text.

    In ``"strict"`` mode (default) all patterns are applied; in
    ``"permissive"`` mode only secrets (API keys, tokens, private keys)
    are redacted while emails and IP addresses (v4 and v6) pass through.
    Names of patterns that matched are appended to ``redacted_keys``
    when given.

    Order of passes: forged ``[REDACTED_*]`` markers in the input are
    neutralized first, then IPv6 candidates (strict only), then the
    regular pattern list, and finally base64/hex-decoded views of
    candidate tokens are scanned for secrets so encoded smuggling is
    caught without redacting arbitrary encoded blobs.
    """
    # Finding: strip pre-existing marker literals so they cannot
    # impersonate redaction output produced by a previous stage.
    redacted = _FORGED_MARKER_RE.sub(_FORGED_MARKER_NEUTRAL, text)
    if redaction_mode != "permissive":
        redacted = _redact_ipv6(redacted, redacted_keys)
    for name, pattern, marker, scope in _REDACTION_PATTERNS:
        if redaction_mode == "permissive" and scope != "secret":
            continue
        if pattern.search(redacted):
            redacted = pattern.sub(marker, redacted)
            if redacted_keys is not None and name not in redacted_keys:
                redacted_keys.append(name)
    redacted = _redact_encoded_views(redacted, redacted_keys)
    return redacted


def _sanitize_string(
    text: str,
    redaction_mode: str,
    redacted_keys: list[str] | None,
    max_chars: int | None,
) -> str:
    """Redact secrets/PII, then enforce ``max_chars``.

    Redaction runs first so a truncation can never cut a secret marker
    or private-key END boundary and leak the tail of a secret; the
    length cap is applied to the redacted result so every string that
    leaves this function respects ``config.max_payload_chars``.
    """
    redacted = _redact_text(text, redaction_mode, redacted_keys)
    if max_chars is not None and len(redacted) > max_chars:
        redacted = redacted[:max_chars]
    return redacted


def _json_safe(
    value: Any,
    seen: set[int] | None = None,
    depth: int = 0,
    redaction_mode: str = "strict",
    redacted_keys: list[str] | None = None,
    max_chars: int | None = None,
) -> Any:
    """Return a JSON-serializable copy of ``value`` with PII redacted.

    Besides the usual circular-reference and max-depth guards, every
    string (including ``repr()`` fallbacks for unknown types) is passed
    through :func:`_redact_text` and then capped at ``max_chars``
    characters (when given) so ``MIMORIConfig.max_payload_chars`` is
    enforced for nested strings as well. When a redaction fires inside
    a dict value, that dict key is appended to ``redacted_keys`` (when
    given) so callers can audit which payload fields were scrubbed.
    """
    if depth > 100:
        return "<max depth reached>"

    if seen is None:
        seen = set()

    obj_id = id(value)
    if obj_id in seen:
        return "<circular reference>"

    is_container = isinstance(value, (dict, list, tuple, set))
    if is_container:
        seen.add(obj_id)

    result = None
    if value is None or isinstance(value, (int, float, bool)):
        result = value
    elif isinstance(value, str):
        result = _sanitize_string(value, redaction_mode, redacted_keys, max_chars)
    elif isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            skey = str(key)
            before = list(redacted_keys) if redacted_keys is not None else []
            redacted[skey] = _json_safe(
                item, seen, depth + 1, redaction_mode, redacted_keys, max_chars
            )
            if (
                redacted_keys is not None
                and len(redacted_keys) > len(before)
                and skey not in redacted_keys
            ):
                redacted_keys.append(skey)
        # Split-across-fields pass: secrets reassembled from consecutive
        # short string values are redacted as a group.
        _redact_split_group(redacted, redaction_mode, redacted_keys)
        result = redacted
    elif isinstance(value, (list, tuple, set)):
        result = [
            _json_safe(item, seen, depth + 1, redaction_mode, redacted_keys, max_chars)
            for item in value
        ]
    elif callable(getattr(value, "model_dump", None)):
        # Keep nested framework messages structured instead of stringifying
        # their repr, which includes generated IDs and obscures tool arguments.
        seen.add(obj_id)
        try:
            result = _json_safe(
                value.model_dump(),
                seen,
                depth + 1,
                redaction_mode,
                redacted_keys,
                max_chars,
            )
        except Exception:
            result = _sanitize_string(
                repr(value), redaction_mode, redacted_keys, max_chars
            )
        finally:
            seen.remove(obj_id)
    else:
        result = _sanitize_string(repr(value), redaction_mode, redacted_keys, max_chars)

    if is_container:
        seen.remove(obj_id)

    return result
