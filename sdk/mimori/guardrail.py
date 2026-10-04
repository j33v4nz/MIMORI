"""Active in-process security guardrails for AI agents."""

from __future__ import annotations

import functools
import inspect
import logging
import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Callable, Sequence


logger = logging.getLogger("MIMORI")


class SecurityViolation(Exception):
    """Raised when an agent input, prompt, or tool call violates an active security policy."""

    def __init__(self, message: str, category: str = "threat", severity: str = "critical") -> None:
        super().__init__(message)
        self.category = category
        self.severity = severity


@dataclass(frozen=True)
class GuardrailVerdict:
    allowed: bool = True
    category: str = "benign"
    severity: str = "low"
    reason: str = ""
    matched_pattern: str | None = None

    @property
    def is_violation(self) -> bool:
        return not self.allowed


@dataclass(frozen=True)
class GuardrailRule:
    name: str
    pattern: re.Pattern[str]
    category: str
    severity: str
    description: str


DEFAULT_GUARDRAIL_RULES: tuple[GuardrailRule, ...] = (
    GuardrailRule(
        name="Destructive OS Command / RCE",
        pattern=re.compile(
            # The -rf flag matcher uses bounded quantifiers so adversarial
            # input like "-rrrrr...r" cannot trigger catastrophic backtracking.
            r"(\brm\s+(-[a-zA-Z]{0,64}r[a-zA-Z]{0,64}f[a-zA-Z]{0,64}|--recursive|--force)\s+[/~.]|\bmkfs\.[a-z0-9]+|\bchmod\s+-R\s+777|\bdd\s+if=/dev/(zero|urandom)|\bnc\s+-e\s+/bin/sh|/bin/(bash|sh)\s+-i)",
            re.IGNORECASE,
        ),
        category="excessive_agency",
        severity="critical",
        description="Destructive operating system command or reverse shell execution",
    ),
    GuardrailRule(
        name="Pipe-to-Shell Remote Execution",
        pattern=re.compile(
            r"\b(curl|wget)\b[^|\n]{0,2000}\|\s*(sh|bash|zsh|dash)\b",
            re.IGNORECASE,
        ),
        category="excessive_agency",
        severity="critical",
        description="Piping a remote download directly into a shell interpreter",
    ),
    GuardrailRule(
        name="Python Dynamic Code Execution",
        pattern=re.compile(
            r"(python3?\s+-c\b.{0,200}?os\.system|os\.system\s*\(|subprocess\.(Popen|call|run)\s*\()",
            re.IGNORECASE,
        ),
        category="excessive_agency",
        severity="critical",
        description="Dynamic Python code execution via os.system or subprocess",
    ),
    GuardrailRule(
        name="Database Destruction & SQL Injection",
        pattern=re.compile(
            r"\b(UNION\s+SELECT|DROP\s+TABLE|TRUNCATE\s+TABLE|ALTER\s+TABLE|--;\s*EXEC)\b",
            re.IGNORECASE,
        ),
        category="threat",
        severity="critical",
        description="Destructive database operation or SQL injection payload",
    ),
    GuardrailRule(
        name="Blind & Stacked SQL Injection",
        pattern=re.compile(
            r"(\bOR\s+1\s*=\s*1\b|\bSLEEP\s*\(|\bBENCHMARK\s*\(|;\s*DELETE\s+FROM\b|xp_cmdshell)",
            re.IGNORECASE,
        ),
        category="threat",
        severity="critical",
        description="Blind, stacked, or command-execution SQL injection payload",
    ),
    GuardrailRule(
        name="Cloud Metadata & Internal SSRF",
        pattern=re.compile(
            r"\b(169\.254\.169\.254|169\.254\.169\.253|metadata\.google\.internal|instance-data|localhost:2375|127\.0\.0\.1:2375|0\.0\.0\.0)\b",
            re.IGNORECASE,
        ),
        category="threat",
        severity="critical",
        description="SSRF attack targeting cloud metadata service or internal daemon",
    ),
    GuardrailRule(
        name="SSRF Evasion Encodings",
        pattern=re.compile(
            # Decimal forms stay bare; the hex form 0x7f...... is only
            # matched inside a URL authority. Bare hex cannot be told
            # apart from benign values — 0x7fffffff is both INT_MAX and
            # 127.255.255.255 — so "set INT_MAX to 0x7fffffff" passes
            # while http://0x7f.0.0.1/ and http://0x7f000001/ still block.
            r"\b(2130706433|3232235521)\b|\b(?:https?|wss?)://[^\s/?#<>]*0x7f[0-9a-f.]*",
            re.IGNORECASE,
        ),
        category="threat",
        severity="critical",
        description="SSRF loopback evasion via decimal or hexadecimal IP encoding",
    ),
    GuardrailRule(
        name="Cloud & AI API Secrets",
        pattern=re.compile(
            r"(-----BEGIN\s+[A-Z ]*PRIVATE\s+KEY-----|\bAKIA[0-9A-Z]{16}\b|\bsk-(proj|ant)-[A-Za-z0-9_\-]{20,}\b|\bAIza[0-9A-Za-z_\-]{35}\b)",
            re.IGNORECASE,
        ),
        category="data_exfiltration",
        severity="critical",
        description="Detected AWS credential, private key, OpenAI/Anthropic key, or Google API key",
    ),
    GuardrailRule(
        name="VCS & Collaboration Tokens",
        pattern=re.compile(
            r"(\bghp_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b|\bxox[bpas]-[A-Za-z0-9\-]{10,}\b)",
            re.IGNORECASE,
        ),
        category="data_exfiltration",
        severity="critical",
        description="Detected GitHub token or Slack token",
    ),
    GuardrailRule(
        name="Prompt Injection & Guardrail Bypass",
        pattern=re.compile(
            r"(ignore|disregard|forget|override|bypass|disable)\s+(all\s+)?(your\s+|these\s+|those\s+)?(previous|prior|above|system|earlier|original)\s+(instructions?|prompts?|messages?|directives?|constraints?|polic(y|ies)|guidelines?|rules?)",
            re.IGNORECASE,
        ),
        category="instruction_override",
        severity="high",
        description="Attempt to override system instructions and safety guardrails",
    ),
    GuardrailRule(
        name="Jailbreak Persona",
        pattern=re.compile(
            r"\b(DAN|do anything now|developer mode|jailbreak)\b",
            re.IGNORECASE,
        ),
        category="jailbreak_persona",
        severity="high",
        description="Jailbreak persona attempting to remove model safety constraints",
    ),
    GuardrailRule(
        name="System Prompt Extraction",
        pattern=re.compile(
            r"(system prompt|reveal.{0,200}instructions|repeat.{0,200}verbatim|show.{0,200}system.{0,200}prompt|disclose.{0,200}system.{0,200}instructions|print.{0,200}system.{0,200}prompt)",
            re.IGNORECASE,
        ),
        category="system_prompt_extraction",
        severity="high",
        description="Attempt to extract or disclose the system prompt",
    ),
)


# Invisible / formatting characters attackers use to split words past
# `\s+` patterns. Two normalized views are built (see
# _normalize_for_matching): a deletion view joins intra-word splits
# ("i[U+200B]gnore" -> "ignore") while a space-replacement view keeps
# inter-word splits matchable by `\s+` patterns ("ignore[U+200B]all"
# -> "ignore all"). U+00A0 (NBSP) needs no explicit handling: NFKC
# already folds it to a regular space.
_INVISIBLE_RE = re.compile(
    "[\u00ad\u034f\u2060\u200b\u200c\u200d\u200e\u200f\ufeff]"
)

# Cyrillic/Latin (plus one Greek/one compatibility) confusables folded
# to Latin in the normalized second pass only. The raw pass always runs
# first, so benign text like "café menu" is matched against its
# original bytes and this table never gets a chance to fabricate a hit.
_HOMOGLYPH_TABLE = str.maketrans({
    "\u0430": "a",  # Cyrillic a
    "\u0435": "e",  # Cyrillic ie
    "\u0456": "i",  # Cyrillic byelorussian-ukrainian i
    "\u043e": "o",  # Cyrillic o
    "\u0441": "c",  # Cyrillic es
    "\u0440": "p",  # Cyrillic er
    "\u0443": "y",  # Cyrillic u
    "\u0445": "x",  # Cyrillic ha
    "\u0455": "s",  # Cyrillic dze
    "\u0501": "d",  # Cyrillic komi de
    "\u03f3": "j",  # Greek yot
    "\u2170": "i",  # Roman numeral one (also NFKC-folded)
    "\u0410": "A",  # CYRILLIC CAPITAL LETTER A
    "\u0415": "E",  # CYRILLIC CAPITAL LETTER IE
    "\u0406": "I",  # CYRILLIC CAPITAL LETTER BYELORUSSIAN-UKRAINIAN I
    "\u041e": "O",  # CYRILLIC CAPITAL LETTER O
    "\u0421": "C",  # CYRILLIC CAPITAL LETTER ES
    "\u0420": "P",  # CYRILLIC CAPITAL LETTER ER
    "\u0423": "U",  # CYRILLIC CAPITAL LETTER U
    "\u0425": "X",  # CYRILLIC CAPITAL LETTER HA
    "\u0405": "S",  # CYRILLIC CAPITAL LETTER DZE
    "\u0500": "D",  # CYRILLIC CAPITAL LETTER KOMI DE
    "\u2160": "I",  # ROMAN NUMERAL CAPITAL LETTER ONE
})

_LEET_TABLE = str.maketrans({
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
})

# Scan the entire input in bounded, overlapping windows. The overlap
# covers the built-in bounded 2,000-character pipe-to-shell rule. Custom
# patterns are validated conservatively and evaluated only on short input.
_LONG_INPUT_LIMIT = 20_000
_LONG_INPUT_WINDOW = 10_000
_LONG_INPUT_OVERLAP = 2_500
_MAX_INPUT_CHARS = 1_000_000
_MAX_CONTENT_DEPTH = 32
_MAX_CONTENT_NODES = 20_000


def _bounded_content_text(content: Any) -> str:
    """Validate JSON-like structures before using their bounded repr.

    Arbitrary __str__/__repr__ methods are not executed. Cycles, deep
    nesting and oversized structures fail explicitly rather than being
    partially scanned or represented with Python's recursion markers.
    """
    ancestors: set[int] = set()
    nodes = 0
    chars = 0

    def visit(value: Any, depth: int) -> None:
        nonlocal nodes, chars
        nodes += 1
        if depth > _MAX_CONTENT_DEPTH or nodes > _MAX_CONTENT_NODES:
            raise ValueError("Structured input exceeds guardrail complexity limits")
        if type(value) in (dict, list, tuple, set, frozenset):
            marker = id(value)
            if marker in ancestors:
                raise ValueError("Cyclic input cannot be completely evaluated")
            ancestors.add(marker)
            children = (child for pair in value.items() for child in pair) if type(value) is dict else value
            for child in children:
                visit(child, depth + 1)
            ancestors.remove(marker)
        elif type(value) in (str, int, float, bool, type(None)):
            chars += len(value) if type(value) is str else 32
            if chars > _MAX_INPUT_CHARS:
                raise ValueError("Input exceeds the guardrail's 1,000,000-character evaluation limit")
        else:
            raise ValueError("Unsupported input type; provide text or a bounded built-in structure")

    visit(content, 0)
    text = str(content) if content is not None else ""
    if len(text) > _MAX_INPUT_CHARS:
        raise ValueError("Input exceeds the guardrail's 1,000,000-character evaluation limit")
    return text


def _validate_custom_pattern(pattern: re.Pattern[str]) -> None:
    """Accept finite, non-branching custom matches that fit the overlap.

    Python re has no evaluation timeout. Conservative validation rejects
    unbounded, nested or ambiguous repetitions instead of running them on
    agent-controlled arguments. The parser is internal to the stdlib;
    failure to inspect a pattern therefore rejects it rather than trusting it.
    """
    try:
        if not isinstance(pattern.pattern, str):
            raise ValueError("Custom regex must match text rather than bytes")
        if len(pattern.pattern) > 512:
            raise ValueError("Custom regex must be at most 512 characters")
        try:
            from re import _parser as parser
        except ImportError:  # Python 3.10
            import sre_parse as parser
        parsed = parser.parse(pattern.pattern, pattern.flags)
        if parsed.getwidth()[1] > _LONG_INPUT_OVERLAP:
            raise ValueError("Custom regex must have a finite maximum match width of 2,500 characters")

        def inspect(parts: Any, inside_repeat: bool = False) -> None:
            for op, arg in parts:
                name = str(op)
                if name in {"MAX_REPEAT", "MIN_REPEAT", "POSSESSIVE_REPEAT"}:
                    if inside_repeat:
                        raise ValueError("Custom regex cannot contain nested repetition")
                    if arg[0] != arg[1]:
                        raise ValueError("Custom regex repetitions must use a fixed count")
                    inspect(arg[2], True)
                elif name == "SUBPATTERN":
                    inspect(arg[-1], inside_repeat)
                elif name == "BRANCH":
                    raise ValueError("Custom regex cannot contain ambiguous alternatives")
                elif name not in {"LITERAL", "NOT_LITERAL", "IN", "ANY", "AT", "CATEGORY"}:
                    raise ValueError("Custom regex contains unsupported assertions or references")

        inspect(parsed)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("Custom regex cannot be safely inspected") from exc

# Categories whose rules are word-shaped (injection / jailbreak /
# system-prompt extraction) and therefore safe to re-run against the
# leet-normalized copy. Secret, IP, SQL, and RCE rules stay raw-only:
# leet folding (5→s, 1→i, ...) turns benign tokens like
# "xox5-abcdefghijkl" into fake secret matches.
_WORD_SHAPED_CATEGORIES = frozenset(
    {"instruction_override", "jailbreak_persona", "system_prompt_extraction"}
)


def _normalize_for_matching(text: str, *, invisible_to_space: bool = False) -> str:
    """Normalize text to defeat trivial regex-evasion tricks.

    Applies NFKC compatibility decomposition (catches full-width and
    compatibility characters), removes invisible/formatting characters,
    folds Cyrillic/Latin confusable homoglyphs to Latin, and maps common
    leet-speak digits back to letters (``0``->``o``, ``1``->``i``,
    ``3``->``e``, ``4``->``a``, ``5``->``s``, ``7``->``t``).

    Invisible characters (soft hyphen, zero-width space/joiners, word
    joiner, BOM, directional marks) are deleted by default so intra-word
    splits like "i<U+200B>gnore" rejoin into "ignore". With
    ``invisible_to_space=True`` they become a single space instead, so
    inter-word splits like "ignore<U+200B>all" normalize to
    "ignore all" and still match ``\\s+``-based patterns. NBSP (U+00A0)
    needs no special handling: NFKC already folds it to a regular space.

    The raw text is always matched first so genuinely benign content
    containing digits (IP addresses, tokens) or accented/non-Latin
    words is unaffected; the normalized form(s) are only a second-chance
    pass-2 catch for evasions, and only for word-shaped rules (see
    ``_WORD_SHAPED_CATEGORIES``).
    """
    normalized = unicodedata.normalize("NFKC", text)
    normalized = _INVISIBLE_RE.sub(" " if invisible_to_space else "", normalized)
    return normalized.translate(_HOMOGLYPH_TABLE).translate(_LEET_TABLE)


class LayaClassifier:
    """Optional Laya-based classifier for enhanced threat detection.
    
    Calls a local or remote Laya service for learned classification
    that catches threats regex patterns miss. Designed to be used
    as a secondary check after fast regex evaluation.
    
    Requires: ``pip install mimori-sdk[laya]`` (installs ``requests``).
    """

    def __init__(
        self,
        base_url: str = "http://localhost:5050",
        api_key: str | None = None,
        model: str = "convaiinnovations/laya-large",
        timeout: float = 2.0,
        threshold: float = 0.75,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.threshold = threshold

    def classify(self, text: str) -> GuardrailVerdict | None:
        """Classify text using the Laya service.
        
        Returns a GuardrailVerdict if Laya detects a threat above the
        confidence threshold, or None if benign or the service is
        unavailable (fail-open).
        """
        try:
            import requests
        except ImportError:
            return None

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        body = {
            "input": text,
            "model": self.model,
            "options": ["benign", "suspicious", "malicious"],
            "context": {
                "domain": "ai_agent_security",
                "categories": [
                    "instruction_override",
                    "jailbreak_persona",
                    "system_prompt_extraction",
                    "encoding_evasion",
                    "excessive_agency",
                    "data_exfiltration",
                    "threat",
                ],
            },
        }

        try:
            resp = requests.post(
                f"{self.base_url}/v1/classify",
                json=body,
                headers=headers,
                timeout=self.timeout,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            # Fail-open: if Laya is unavailable, fall through to allow
            return None

        choice = data.get("choice", "benign")
        scores = data.get("scores", {})
        confidence = scores.get(choice, 0.0)
        metadata = data.get("metadata", {})
        category = metadata.get("category", "other")

        if choice == "benign" or confidence < self.threshold:
            return None

        # Map severity from verdict + confidence
        if choice == "malicious" and confidence >= 0.9:
            severity = "critical"
        elif choice == "malicious":
            severity = "high"
        elif confidence >= 0.8:
            severity = "medium"
        else:
            severity = "low"

        return GuardrailVerdict(
            allowed=False,
            category=category,
            severity=severity,
            reason=f"Laya classifier: {choice} (confidence={confidence:.2f}, category={category})",
            matched_pattern=None,
        )


class MIMORIGuardrail:
    """Active in-process security guardrail evaluator.

    Provides low-latency evaluation of prompts, tool calls, and model outputs
    with configurable enforcement policies (``block``, ``warn``, or ``audit``).

    Enforcement-mode semantics:

    * ``block`` — :meth:`verify_or_raise` and :meth:`protect_tool` raise
      :class:`SecurityViolation` when content violates a rule. The
      ``on_violation`` callback (if set) is still invoked from
      :meth:`evaluate`.
    * ``warn`` — never raises. When a violation is detected, an auditable
      log line is emitted via the ``MIMORI`` logger (``WARNING`` level,
      including category, severity, reason, and the matched pattern) and
      the ``on_violation`` callback is invoked.
    * ``audit`` — never raises. *Every* evaluation is logged via the
      ``MIMORI`` logger with event details: violations at ``WARNING``
      level, allowed content at ``INFO`` level. The ``on_violation``
      callback is invoked for violations.

    Usage::

        from mimori.guardrail import MIMORIGuardrail, SecurityViolation

        guard = MIMORIGuardrail(mode="block")

        # Evaluate raw prompt or tool arguments:
        verdict = guard.evaluate("rm -rf /")
        if not verdict.allowed:
            print(f"Blocked: {verdict.reason}")

        # Protect a function/tool decorator:
        @guard.protect_tool
        def execute_query(sql: str):
            return db.execute(sql)
    """

    def __init__(
        self,
        mode: str = "block",  # "block" | "warn" | "audit"
        custom_rules: Sequence[GuardrailRule] | None = None,
        on_violation: Callable[[GuardrailVerdict], None] | None = None,
        use_classifier: bool = False,
        classifier: LayaClassifier | None = None,
    ) -> None:
        if not isinstance(mode, str) or mode.lower() not in {"block", "warn", "audit"}:
            raise ValueError("mode must be 'block', 'warn', or 'audit'")
        self.mode = mode.lower()
        self.rules: list[GuardrailRule] = list(DEFAULT_GUARDRAIL_RULES)
        self._has_custom_rules = bool(custom_rules)
        if custom_rules:
            for rule in custom_rules:
                _validate_custom_pattern(rule.pattern)
            self.rules.extend(custom_rules)
        self.on_violation = on_violation
        self._classifier: LayaClassifier | None = classifier if use_classifier else None
        if use_classifier and classifier is None:
            self._classifier = LayaClassifier()

    def evaluate(self, content: Any) -> GuardrailVerdict:
        """Evaluate text or structured arguments against guardrail policies.

        Returns a :class:`GuardrailVerdict` with ``allowed=True`` if benign,
        or ``allowed=False`` if a critical security policy was violated.

        Every part of the input is scanned in overlapping bounded chunks,
        including two normalized views for word-shaped categories. Very large
        inputs (>1,000,000 chars) are rejected rather than partially scanned.
        Custom regex must have fixed, finite repetitions and a maximum width
        of 2,500 characters; alternatives, references and assertions that
        cannot be bounded safely are rejected at construction. Custom-rule
        inputs over 20,000 characters fail with an evaluation-limit verdict.
        Structured inputs are limited to built-in types, 32 levels, and
        20,000 nodes. Normalized matches are tagged.

        Mode side effects: in ``warn`` mode a violation emits an auditable
        ``WARNING`` log line without raising; in ``audit`` mode every
        evaluation (allowed or blocked) is logged with event details and
        nothing ever raises. The ``on_violation`` callback fires on
        violations in all modes.

        When ``use_classifier=True``, events that pass regex rules are
        additionally evaluated by the Laya classifier for learned threat
        detection.
        """
        try:
            text = _bounded_content_text(content)
            if self._has_custom_rules and len(text) > _LONG_INPUT_LIMIT:
                raise ValueError("Custom rules require inputs at most 20,000 characters; larger content cannot be completely evaluated")
        except (ValueError, RecursionError) as exc:
            verdict = GuardrailVerdict(allowed=False, category="evaluation_limit", severity="high", reason=str(exc))
            if self.on_violation:
                self.on_violation(verdict)
            if self.mode in {"warn", "audit"}:
                logger.warning("MIMORI guardrail %s: %s", self.mode.upper(), verdict.reason)
            return verdict
        if not text:
            verdict = GuardrailVerdict(allowed=True)
            if self.mode == "audit":
                logger.info("MIMORI guardrail AUDIT: allowed empty content")
            return verdict

        if len(text) > _MAX_INPUT_CHARS:
            verdict = GuardrailVerdict(
                allowed=False, category="threat", severity="high",
                reason="Input exceeds the guardrail's 1,000,000-character evaluation limit",
            )
            if self.on_violation:
                self.on_violation(verdict)
            if self.mode in {"warn", "audit"}:
                logger.warning("MIMORI guardrail %s: %s", self.mode.upper(), verdict.reason)
            return verdict

        step = _LONG_INPUT_WINDOW - _LONG_INPUT_OVERLAP
        raw_targets = ([text] if len(text) <= _LONG_INPUT_LIMIT else
                       [text[start:start + _LONG_INPUT_WINDOW]
                        for start in range(0, len(text), step)])
        compact_text = re.sub(r"\s+", " ", text)
        compact_targets = ([] if compact_text == text else
                           [compact_text] if len(compact_text) <= _LONG_INPUT_LIMIT else
                           [compact_text[start:start + _LONG_INPUT_WINDOW]
                            for start in range(0, len(compact_text), step)])
        # Runs of whitespace must not let an attacker stretch a word-shaped
        # injection beyond the overlap. Compact before chunking, while leaving
        # the raw views intact for commands, secrets, and URL patterns.
        normalized_targets: list[str] = []
        for spaced in (False, True):
            # Normalize before chunking, so long invisible-character runs
            # cannot separate words across many chunks either.
            word_text = re.sub(r"\s+", " ", _normalize_for_matching(
                text, invisible_to_space=spaced
            ))
            normalized_targets.extend(
                [word_text] if len(word_text) <= _LONG_INPUT_LIMIT else
                [word_text[start:start + _LONG_INPUT_WINDOW]
                 for start in range(0, len(word_text), step)]
            )

        # Layer 1: bounded raw scan first, then normalized word-shaped scan.
        for rule in self.rules:
            match = None
            matched_on_normalized = False
            for target in raw_targets:
                match = rule.pattern.search(target)
                if match is not None:
                    break
            # Built-in whitespace-separated commands and SQL must not be
            # stretched beyond chunk overlap. Preserve pipe-to-shell newline
            # semantics and all user-defined regex semantics.
            if match is None and rule in DEFAULT_GUARDRAIL_RULES and rule.name != "Pipe-to-Shell Remote Execution":
                for target in compact_targets:
                    match = rule.pattern.search(target)
                    if match is not None:
                        matched_on_normalized = True
                        break
            if match is None and rule.category in _WORD_SHAPED_CATEGORIES:
                for candidate in normalized_targets:
                    match = rule.pattern.search(candidate)
                    if match is not None:
                        matched_on_normalized = True
                        break
            if match:
                matched_pattern = match.group(0)
                if matched_on_normalized:
                    matched_pattern += " (normalized)"
                verdict = GuardrailVerdict(
                    allowed=False,
                    category=rule.category,
                    severity=rule.severity,
                    reason=rule.description,
                    matched_pattern=matched_pattern,
                )
                if self.on_violation:
                    self.on_violation(verdict)
                if self.mode == "warn":
                    logger.warning(
                        "MIMORI guardrail WARN: blocked content "
                        "(category=%s severity=%s reason=%s matched=%r)",
                        verdict.category,
                        verdict.severity,
                        verdict.reason,
                        verdict.matched_pattern,
                    )
                elif self.mode == "audit":
                    logger.warning(
                        "MIMORI guardrail AUDIT: blocked content "
                        "(category=%s severity=%s reason=%s matched=%r)",
                        verdict.category,
                        verdict.severity,
                        verdict.reason,
                        verdict.matched_pattern,
                    )
                return verdict

        # Layer 1.5: Laya classifier (optional)
        if self._classifier is not None:
            laya_verdict = self._classifier.classify(text)
            if laya_verdict is not None:
                if self.on_violation:
                    self.on_violation(laya_verdict)
                if self.mode in ("warn", "audit"):
                    logger.warning(
                        "MIMORI guardrail %s: blocked content "
                        "(category=%s severity=%s reason=%s)",
                        self.mode.upper(),
                        laya_verdict.category,
                        laya_verdict.severity,
                        laya_verdict.reason,
                    )
                return laya_verdict

        if self.mode == "audit":
            logger.info(
                "MIMORI guardrail AUDIT: allowed content (snippet=%r)",
                text[:200],
            )
        return GuardrailVerdict(allowed=True)

    def verify_or_raise(self, content: Any) -> GuardrailVerdict:
        """Evaluate content and raise :class:`SecurityViolation` if blocked.

        Only raises in ``block`` mode. In ``warn`` mode the violation has
        already been emitted as an auditable log line by :meth:`evaluate`;
        in ``audit`` mode it has been logged with event details. Neither
        mode ever raises — the verdict is returned for the caller to
        inspect.
        """
        verdict = self.evaluate(content)
        if not verdict.allowed and self.mode == "block":
            raise SecurityViolation(
                message=f"MIMORI Guardrail Blocked: {verdict.reason} (matched: {verdict.matched_pattern})",
                category=verdict.category,
                severity=verdict.severity,
            )
        return verdict

    def protect_tool(self, func: Callable[..., Any]) -> Callable[..., Any]:
        """Decorator to wrap a tool function with pre-execution guardrail checks.

        In ``block`` mode a violating call raises :class:`SecurityViolation`
        before the wrapped function body runs. In ``warn``/``audit`` modes
        the call is allowed through but the violation is emitted as an
        auditable log line (see :meth:`evaluate`); these modes never raise.
        """
        guard = self

        if inspect.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                verdict = guard.evaluate({"args": args, "kwargs": kwargs})
                if not verdict.allowed:
                    if guard.mode == "block":
                        raise SecurityViolation(
                            message=f"MIMORI Guardrail Blocked Tool Call '{func.__name__}': {verdict.reason}",
                            category=verdict.category,
                            severity=verdict.severity,
                        )
                return await func(*args, **kwargs)

            return async_wrapper

        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            # Check all positional and keyword arguments
            verdict = guard.evaluate({"args": args, "kwargs": kwargs})
            if not verdict.allowed:
                if guard.mode == "block":
                    raise SecurityViolation(
                        message=f"MIMORI Guardrail Blocked Tool Call '{func.__name__}': {verdict.reason}",
                        category=verdict.category,
                        severity=verdict.severity,
                    )
            return func(*args, **kwargs)

        return wrapper
