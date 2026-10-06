"""MIMORI command-line interface.

Currently provides the ``mimori diff`` release-gate command, which calls
``GET /api/behavior-diff`` and fails the process when the candidate session
introduces risky behavior.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Sequence
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

FAIL_CHOICES = ("high_risk", "review")
FAILURE_STATUSES = {
    "high_risk": {"high_risk"},
    "review": {"review", "high_risk"},
}


def should_fail(status: str, fail_on: str) -> bool:
    """Return True when *status* should fail the gate under *fail_on*."""
    if status not in {"clear", "review", "high_risk"}:
        return True
    return status in FAILURE_STATUSES.get(fail_on, {"high_risk"})


def _flag_present(argv: Sequence[str], flag: str) -> bool:
    """Return True when *flag* appears explicitly (not via env/default)."""
    return any(arg == flag or arg.startswith(flag + "=") for arg in argv)


def ensure_secure_transport(api_url: str, api_key: str | None) -> None:
    """Refuse to send an API key over a plaintext, non-local connection.

    HTTPS is required whenever a key is present, except for loopback
    development hosts (localhost / 127.0.0.1). URLs without a scheme or
    with any other host over http:// are rejected because the bearer
    token would be visible on the wire.
    """
    if not api_key:
        return
    if api_url.lower().startswith("https://"):
        return
    host = urlsplit(api_url).hostname or ""
    if host in ("localhost", "127.0.0.1"):
        return
    raise SystemExit(
        "refusing to send API key over non-HTTPS URL "
        f"{api_url!r}; use an https:// URL (or http://localhost for "
        "local development) and pass the key via MIMORI_API_KEY."
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="mimori",
        description="MIMORI release-gate CLI (behavior-diff CI check).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    diff = sub.add_parser(
        "diff",
        description=(
            "Compare a baseline session against a candidate session via "
            "GET /api/behavior-diff and exit non-zero when the result "
            "meets the --fail-on threshold."
        ),
    )
    diff.add_argument("--baseline", required=True, help="Baseline session record ID.")
    diff.add_argument("--candidate", required=True, help="Candidate session record ID.")
    diff.add_argument(
        "--fail-on",
        choices=list(FAIL_CHOICES),
        default="high_risk",
        help="Fail when the decision is this severity or worse (default: high_risk).",
    )
    diff.add_argument(
        "--api-url",
        default=os.environ.get("MIMORI_API_URL", "http://localhost:3000"),
        help="Base URL of the MIMORI app (default: $MIMORI_API_URL or http://localhost:3000).",
    )
    diff.add_argument(
        "--api-key",
        default=os.environ.get("MIMORI_API_KEY"),
        help=(
            "API key sent as a Bearer token. DEPRECATED: prefer the "
            "MIMORI_API_KEY environment variable (keys on the command line "
            "are visible in process listings)."
        ),
    )
    return parser


def fetch_diff(api_url: str, baseline: str, candidate: str, api_key: str | None) -> dict[str, Any]:
    query = urlencode({"baseline": baseline, "candidate": candidate})
    url = f"{api_url.rstrip('/')}/api/behavior-diff?{query}"
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        with urlopen(Request(url, headers=headers), timeout=30) as resp:
            return json.load(resp)
    except HTTPError as exc:
        try:
            detail = exc.read().decode("utf-8", "replace")
        except Exception:
            detail = ""
        raise SystemExit(f"behavior-diff request failed: HTTP {exc.code} {detail}".strip())
    except URLError as exc:
        raise SystemExit(f"behavior-diff request failed: {exc.reason}")


def format_report(payload: dict[str, Any]) -> str:
    diff = payload.get("diff", {}) if isinstance(payload, dict) else {}
    status = diff.get("status", "unknown")
    summary = diff.get("summary", "")
    lines = [f"decision: {status}"]
    if summary:
        lines.append(f"summary: {summary}")
    new_threats = diff.get("detectionChanges") or []
    added = diff.get("added") or []
    if new_threats:
        lines.append("new threats:")
        for change in new_threats:
            lines.append(f"  - {change.get('label')} x{change.get('count')}")
    else:
        lines.append("new threats: none")
    if added:
        lines.append("new behavior signatures:")
        for change in added:
            lines.append(f"  - {change.get('label')} x{change.get('count')}")
    return "\n".join(lines)


def run_diff(args: argparse.Namespace) -> int:
    ensure_secure_transport(args.api_url, args.api_key)
    payload = fetch_diff(args.api_url, args.baseline, args.candidate, args.api_key)
    diff = payload.get("diff") if isinstance(payload, dict) else None
    if not isinstance(diff, dict) or diff.get("status") not in ("clear", "review", "high_risk"):
        print("behavior-diff gate failed: invalid or missing decision in server response", file=sys.stderr)
        return 1
    print(format_report(payload))
    status = diff["status"]
    if should_fail(status, args.fail_on):
        print(f"behavior-diff gate failed: status={status} (fail-on={args.fail_on})", file=sys.stderr)
        return 1
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    raw = list(sys.argv[1:]) if argv is None else list(argv)
    args = build_parser().parse_args(raw)
    if args.command == "diff":
        if _flag_present(raw, "--api-key"):
            # Deprecated: keys on the command line leak via process
            # listings and shell history. Still honored, but warn.
            print(
                "warning: --api-key is deprecated; pass the API key via the "
                "MIMORI_API_KEY environment variable instead (command-line "
                "arguments are visible in process listings).",
                file=sys.stderr,
            )
        return run_diff(args)
    raise SystemExit(f"unknown command: {args.command}")


if __name__ == "__main__":
    sys.exit(main())
