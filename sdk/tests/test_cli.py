"""Unit tests for the ``mimori diff`` release-gate CLI (sdk/mimori/cli.py)."""

from __future__ import annotations

import io
import json
import pytest
from urllib.error import HTTPError, URLError

from mimori import cli


API_KEY = "mmr_super_secret_key_do_not_leak"


# ---------------------------------------------------------------------------
# build_parser: defaults, required args, choices, env pickup
# ---------------------------------------------------------------------------


def test_build_parser_requires_command() -> None:
    with pytest.raises(SystemExit) as excinfo:
        cli.build_parser().parse_args([])
    assert excinfo.value.code == 2


def test_build_parser_diff_requires_baseline_and_candidate() -> None:
    with pytest.raises(SystemExit) as excinfo:
        cli.build_parser().parse_args(["diff"])
    assert excinfo.value.code == 2


def test_build_parser_rejects_unknown_fail_on() -> None:
    with pytest.raises(SystemExit) as excinfo:
        cli.build_parser().parse_args(
            ["diff", "--baseline", "b", "--candidate", "c", "--fail-on", "critical"]
        )
    assert excinfo.value.code == 2


def test_build_parser_rejects_unknown_command() -> None:
    with pytest.raises(SystemExit) as excinfo:
        cli.build_parser().parse_args(["frobnicate"])
    assert excinfo.value.code == 2


def test_build_parser_diff_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MIMORI_API_URL", raising=False)
    monkeypatch.delenv("MIMORI_API_KEY", raising=False)
    args = cli.build_parser().parse_args(
        ["diff", "--baseline", "b1", "--candidate", "c1"]
    )
    assert args.command == "diff"
    assert args.baseline == "b1"
    assert args.candidate == "c1"
    assert args.fail_on == "high_risk"
    assert args.api_url == "http://localhost:3000"
    assert args.api_key is None


def test_build_parser_picks_up_env_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MIMORI_API_URL", "https://env.example")
    monkeypatch.setenv("MIMORI_API_KEY", "mmr_env_key")
    args = cli.build_parser().parse_args(
        ["diff", "--baseline", "b", "--candidate", "c"]
    )
    assert args.api_url == "https://env.example"
    assert args.api_key == "mmr_env_key"
    # Explicit flags win over the environment.
    args = cli.build_parser().parse_args(
        [
            "diff",
            "--baseline", "b",
            "--candidate", "c",
            "--api-url", "https://flag.example",
            "--api-key", "mmr_flag_key",
        ]
    )
    assert args.api_url == "https://flag.example"
    assert args.api_key == "mmr_flag_key"


# ---------------------------------------------------------------------------
# should_fail matrix (status x --fail-on)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "status,fail_on,expected",
    [
        ("high_risk", "high_risk", True),
        ("high_risk", "review", True),
        ("review", "high_risk", False),
        ("review", "review", True),
        ("clear", "high_risk", False),
        ("clear", "review", False),
        ("unknown", "high_risk", True),
        ("unknown", "review", True),
    ],
)
def test_should_fail_matrix(status: str, fail_on: str, expected: bool) -> None:
    assert cli.should_fail(status, fail_on) is expected


@pytest.mark.parametrize(
    "status,expected",
    [("high_risk", True), ("review", False), ("clear", False)],
)
def test_should_fail_unknown_fail_on_falls_back_to_high_risk(
    status: str, expected: bool
) -> None:
    """A bogus --fail-on value degrades to the strictest threshold."""
    assert cli.should_fail(status, "bogus") is expected


# ---------------------------------------------------------------------------
# format_report shape
# ---------------------------------------------------------------------------


def test_format_report_full_shape() -> None:
    payload = {
        "diff": {
            "status": "high_risk",
            "summary": "candidate added 2 threats",
            "detectionChanges": [
                {"label": "SQL injection", "count": 3},
                {"label": "SSRF", "count": 1},
            ],
            "added": [{"label": "tool:shell_exec", "count": 2}],
        }
    }
    report = cli.format_report(payload)
    assert report.splitlines() == [
        "decision: high_risk",
        "summary: candidate added 2 threats",
        "new threats:",
        "  - SQL injection x3",
        "  - SSRF x1",
        "new behavior signatures:",
        "  - tool:shell_exec x2",
    ]


def test_format_report_empty_payload() -> None:
    assert cli.format_report({}).splitlines() == [
        "decision: unknown",
        "new threats: none",
    ]


def test_format_report_status_without_lists_or_summary() -> None:
    report = cli.format_report({"diff": {"status": "clear"}})
    assert report.splitlines() == ["decision: clear", "new threats: none"]


def test_format_report_missing_counts_and_labels() -> None:
    report = cli.format_report(
        {"diff": {"detectionChanges": [{"label": "x"}], "added": [{}]}}
    )
    lines = report.splitlines()
    assert "  - x xNone" in lines  # count absent renders as xNone, not a crash
    assert "  - None xNone" in lines


# ---------------------------------------------------------------------------
# run_diff / main exit codes
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "status,fail_on,expected_rc",
    [
        ("clear", "high_risk", 0),
        ("review", "high_risk", 0),
        ("high_risk", "high_risk", 1),
        ("clear", "review", 0),
        ("review", "review", 1),
        ("high_risk", "review", 1),
    ],
)
def test_run_diff_exit_codes(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    status: str,
    fail_on: str,
    expected_rc: int,
) -> None:
    monkeypatch.delenv("MIMORI_API_URL", raising=False)
    monkeypatch.setattr(
        cli, "fetch_diff", lambda *a, **k: {"diff": {"status": status}}
    )
    rc = cli.main(
        [
            "diff",
            "--baseline", "b",
            "--candidate", "c",
            "--fail-on", fail_on,
            "--api-key", API_KEY,
        ]
    )
    assert rc == expected_rc
    captured = capsys.readouterr()
    assert f"decision: {status}" in captured.out
    if expected_rc:
        assert (
            f"behavior-diff gate failed: status={status} (fail-on={fail_on})"
            in captured.err
        )
    else:
        assert "behavior-diff gate failed" not in captured.err
    # The API key must never appear in captured stdout/stderr.
    assert API_KEY not in captured.out
    assert API_KEY not in captured.err


def test_main_returns_zero_on_clean_diff(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(
        cli,
        "fetch_diff",
        lambda *a, **k: {
            "diff": {
                "status": "clear",
                "summary": "no regressions",
                "detectionChanges": [],
                "added": [],
            }
        },
    )
    rc = cli.main(["diff", "--baseline", "b1", "--candidate", "c1"])
    assert rc == 0
    captured = capsys.readouterr()
    assert "decision: clear" in captured.out
    assert "summary: no regressions" in captured.out
    assert "behavior-diff gate failed" not in captured.err


# ---------------------------------------------------------------------------
# Error paths: HTTP/URL failure => non-zero exit, no API key leakage
# ---------------------------------------------------------------------------


def test_http_failure_exits_nonzero_without_leaking_api_key(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv("MIMORI_API_URL", raising=False)
    def fake_urlopen(request, timeout=None):  # type: ignore[no-untyped-def]
        raise HTTPError(
            request.full_url,
            403,
            "Forbidden",
            {},
            io.BytesIO(b"access denied body"),
        )

    monkeypatch.setattr(cli, "urlopen", fake_urlopen)
    with pytest.raises(SystemExit) as excinfo:
        cli.main(
            [
                "diff",
                "--baseline", "base",
                "--candidate", "cand",
                "--api-key", API_KEY,
            ]
        )
    code = excinfo.value.code
    # sys.exit(str) reports the message on stderr and exits with status 1.
    assert isinstance(code, str) and code
    assert "behavior-diff request failed: HTTP 403" in code
    assert "access denied body" in code
    captured = capsys.readouterr()
    assert API_KEY not in code
    assert API_KEY not in captured.out
    assert API_KEY not in captured.err


def test_url_failure_exits_nonzero_without_leaking_api_key(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv("MIMORI_API_URL", raising=False)
    def fake_urlopen(request, timeout=None):  # type: ignore[no-untyped-def]
        raise URLError("dns lookup failed")

    monkeypatch.setattr(cli, "urlopen", fake_urlopen)
    with pytest.raises(SystemExit) as excinfo:
        cli.main(
            [
                "diff",
                "--baseline", "base",
                "--candidate", "cand",
                "--api-key", API_KEY,
            ]
        )
    code = excinfo.value.code
    assert isinstance(code, str) and code
    assert "behavior-diff request failed: dns lookup failed" in code
    captured = capsys.readouterr()
    assert API_KEY not in code
    assert API_KEY not in captured.out
    assert API_KEY not in captured.err


# ---------------------------------------------------------------------------
# Request shape: Bearer header + query params, key never echoed back
# ---------------------------------------------------------------------------


def test_api_key_sent_as_bearer_and_never_echoed(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    seen: dict[str, object] = {}
    payload = {
        "diff": {
            "status": "clear",
            "summary": "no regressions",
            "detectionChanges": [],
            "added": [],
        }
    }

    def fake_urlopen(request, timeout=None):  # type: ignore[no-untyped-def]
        seen["headers"] = {k.lower(): v for k, v in request.headers.items()}
        seen["url"] = request.full_url
        seen["timeout"] = timeout
        return io.BytesIO(json.dumps(payload).encode())

    monkeypatch.setattr(cli, "urlopen", fake_urlopen)
    rc = cli.main(
        [
            "diff",
            "--baseline", "b1",
            "--candidate", "c1",
            "--api-url", "https://mimori.example",
            "--api-key", API_KEY,
        ]
    )
    assert rc == 0

    headers = seen["headers"]
    assert isinstance(headers, dict)
    assert headers.get("authorization") == f"Bearer {API_KEY}"
    url = seen["url"]
    assert isinstance(url, str)
    assert url.startswith("https://mimori.example/api/behavior-diff?")
    assert "baseline=b1" in url and "candidate=c1" in url

    captured = capsys.readouterr()
    assert "decision: clear" in captured.out
    assert API_KEY not in captured.out
    assert API_KEY not in captured.err


def test_no_api_key_sent_when_unconfigured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict[str, object] = {}

    def fake_urlopen(request, timeout=None):  # type: ignore[no-untyped-def]
        seen["headers"] = {k.lower(): v for k, v in request.headers.items()}
        return io.BytesIO(json.dumps({"diff": {"status": "clear"}}).encode())

    monkeypatch.setattr(cli, "urlopen", fake_urlopen)
    rc = cli.main(["diff", "--baseline", "b", "--candidate", "c"])
    assert rc == 0
    headers = seen["headers"]
    assert isinstance(headers, dict)
    assert "authorization" not in headers


# ---------------------------------------------------------------------------
# Flagship wave-2 pentester fix 5: --api-key deprecation + plaintext guard
# ---------------------------------------------------------------------------


def test_api_key_flag_still_works_but_warns_to_stderr(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv("MIMORI_API_URL", raising=False)
    monkeypatch.setattr(
        cli, "fetch_diff", lambda *a, **k: {"diff": {"status": "clear"}}
    )
    rc = cli.main(
        ["diff", "--baseline", "b", "--candidate", "c", "--api-key", API_KEY]
    )
    assert rc == 0
    captured = capsys.readouterr()
    assert "decision: clear" in captured.out
    assert "deprecated" in captured.err
    assert "MIMORI_API_KEY" in captured.err
    assert API_KEY not in captured.err  # warning never echoes the key


def test_env_api_key_does_not_emit_deprecation_warning(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv("MIMORI_API_URL", raising=False)
    monkeypatch.setenv("MIMORI_API_KEY", "mmr_env_key")
    monkeypatch.setattr(
        cli, "fetch_diff", lambda *a, **k: {"diff": {"status": "clear"}}
    )
    rc = cli.main(["diff", "--baseline", "b", "--candidate", "c"])
    assert rc == 0
    assert "deprecated" not in capsys.readouterr().err


def test_refuses_plaintext_http_url_when_api_key_present(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("MIMORI_API_URL", raising=False)
    calls: list[tuple[object, ...]] = []
    monkeypatch.setattr(
        cli,
        "fetch_diff",
        lambda *a, **k: calls.append(a) or {"diff": {"status": "clear"}},
    )
    with pytest.raises(SystemExit) as excinfo:
        cli.main(
            [
                "diff",
                "--baseline", "b",
                "--candidate", "c",
                "--api-url", "http://mimori.example",
                "--api-key", API_KEY,
            ]
        )
    assert not calls  # refused before any request was made
    message = str(excinfo.value.code)
    assert "https" in message.lower()
    assert API_KEY not in message  # never echoes the key


def test_allows_localhost_http_with_api_key(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv("MIMORI_API_URL", raising=False)
    monkeypatch.setattr(
        cli, "fetch_diff", lambda *a, **k: {"diff": {"status": "clear"}}
    )
    rc = cli.main(
        [
            "diff",
            "--baseline", "b",
            "--candidate", "c",
            "--api-url", "http://localhost:3000",
            "--api-key", API_KEY,
        ]
    )
    assert rc == 0


def test_allows_127_0_0_1_http_with_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("MIMORI_API_URL", raising=False)
    monkeypatch.setattr(
        cli, "fetch_diff", lambda *a, **k: {"diff": {"status": "clear"}}
    )
    rc = cli.main(
        [
            "diff",
            "--baseline", "b",
            "--candidate", "c",
            "--api-url", "http://127.0.0.1:3000",
            "--api-key", API_KEY,
        ]
    )
    assert rc == 0


def test_allows_plaintext_http_without_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The transport guard only applies when a key would be sent."""
    monkeypatch.delenv("MIMORI_API_URL", raising=False)
    monkeypatch.delenv("MIMORI_API_KEY", raising=False)
    monkeypatch.setattr(
        cli, "fetch_diff", lambda *a, **k: {"diff": {"status": "clear"}}
    )
    rc = cli.main(
        [
            "diff",
            "--baseline", "b",
            "--candidate", "c",
            "--api-url", "http://mimori.example",
        ]
    )
    assert rc == 0


@pytest.mark.parametrize("payload", [None, [], {}, {"diff": None}, {"diff": []}, {"diff": {}}, {"diff": {"status": "unknown"}}, {"diff": {"status": "clean"}}, {"diff": {"status": ["clear"]}}])
def test_invalid_response_fails_closed(monkeypatch, capsys, payload):
    monkeypatch.setattr(cli, "fetch_diff", lambda *a, **k: payload)
    assert cli.main(["diff", "--baseline", "b", "--candidate", "c"]) == 1
    assert "invalid or missing decision" in capsys.readouterr().err
