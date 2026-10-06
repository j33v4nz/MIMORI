"""Unit tests for PII/secret redaction in MIMORI telemetry payloads."""

import pytest

from mimori.client import MIMORIClient, MIMORIConfig, _json_safe, _redact_text
import base64
import json


AWS_KEY = "AKIAIOSFODNN7EXAMPLE"
GITHUB_TOKEN = "ghp_" + "a" * 36
GITHUB_PAT = "github_pat_" + "b" * 26
SK_PROJ = "sk-proj-" + "c" * 24
SK_ANT = "sk-ant-" + "d" * 24
SLACK_TOKEN = "xoxb-123456789012-abcdefghij"
GOOGLE_KEY = "AIza" + "E" * 35
PRIVATE_KEY_BLOCK = (
    "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7b==\n-----END RSA PRIVATE KEY-----"
)
EMAIL = "alice@example.com"
IPV4 = "10.20.30.40"


@pytest.mark.parametrize("secret", [GITHUB_TOKEN, base64.b64encode(GITHUB_TOKEN.encode()).decode()])
def test_security_signal_survives_secret_redaction(secret):
    client = MIMORIClient(api_key="test", agent_name="test", auto_start=False)
    client.log("manual", {"input": secret})
    event = client._events.get_nowait()
    assert secret not in json.dumps(event)
    assert event["payload"]["_mimori_security"] == {
        "version": 1, "signals": ["credential_exposure"]
    }
    client.close()


def test_split_secret_emits_signal_and_plain_pii_does_not():
    client = MIMORIClient(api_key="test", agent_name="test", auto_start=False)
    client.log("manual", {"a": "ghp_", "b": "a" * 18, "c": "a" * 18})
    assert client._events.get_nowait()["payload"]["_mimori_security"]["signals"] == ["credential_exposure"]
    client.log("manual", {"aws_key": EMAIL, "input": IPV4 + " [REDACTED_AWS_KEY]"})
    assert "_mimori_security" not in client._events.get_nowait()["payload"]
    client.close()


def test_redact_aws_key():
    keys: list[str] = []
    out = _json_safe({"prompt": f"my key {AWS_KEY} here"}, redacted_keys=keys)
    assert AWS_KEY not in out["prompt"]
    assert "[REDACTED_AWS_KEY]" in out["prompt"]
    assert "aws_key" in keys
    assert "prompt" in keys  # field key collected for audit


def test_redact_github_token_and_pat():
    out = _json_safe({"t": GITHUB_TOKEN})
    assert GITHUB_TOKEN not in out["t"]
    assert "[REDACTED_GITHUB_TOKEN]" in out["t"]
    out = _json_safe({"t": GITHUB_PAT})
    assert GITHUB_PAT not in out["t"]
    assert "[REDACTED_GITHUB_TOKEN]" in out["t"]


def test_redact_sk_proj_and_sk_ant():
    for secret in (SK_PROJ, SK_ANT):
        out = _json_safe({"v": secret})
        assert secret not in out["v"]
        assert "[REDACTED_API_KEY]" in out["v"]


def test_redact_slack_and_google_keys():
    out = _json_safe({"v": SLACK_TOKEN})
    assert "[REDACTED_SLACK_TOKEN]" in out["v"]
    out = _json_safe({"v": GOOGLE_KEY})
    assert "[REDACTED_GOOGLE_API_KEY]" in out["v"]


def test_redact_private_key_block():
    out = _json_safe({"v": f"leaked:\n{PRIVATE_KEY_BLOCK}\ndone"})
    assert "PRIVATE KEY" not in out["v"]
    assert "[REDACTED_PRIVATE_KEY]" in out["v"]


def test_redact_email_and_ipv4_strict():
    out = _json_safe({"msg": f"contact {EMAIL} at {IPV4}"})
    assert EMAIL not in out["msg"]
    assert IPV4 not in out["msg"]
    assert "[REDACTED_EMAIL]" in out["msg"]
    assert "[REDACTED_IP]" in out["msg"]


def test_permissive_mode_redacts_secrets_only():
    out = _json_safe(
        {"msg": f"{AWS_KEY} {EMAIL} {IPV4}"}, redaction_mode="permissive"
    )
    assert AWS_KEY not in out["msg"]
    assert "[REDACTED_API_KEY]" not in out["msg"]  # AWS has its own marker
    assert "[REDACTED_AWS_KEY]" in out["msg"]
    # PII passes through in permissive mode.
    assert EMAIL in out["msg"]
    assert IPV4 in out["msg"]


def test_permissive_mode_still_redacts_all_secret_types():
    keys: list[str] = []
    out = _json_safe(
        {"v": f"{GITHUB_TOKEN} {SK_PROJ} {SK_ANT}"},
        redaction_mode="permissive",
        redacted_keys=keys,
    )
    assert GITHUB_TOKEN not in out["v"]
    assert SK_PROJ not in out["v"]
    assert SK_ANT not in out["v"]
    assert keys, "expected redacted pattern names to be collected"


def test_redaction_in_nested_structures():
    payload = {"a": [{"b": f"email {EMAIL}"}], "c": ("ip", IPV4)}
    out = _json_safe(payload)
    assert "[REDACTED_EMAIL]" in out["a"][0]["b"]
    assert "[REDACTED_IP]" in out["c"][1]


def test_benign_text_untouched():
    assert _json_safe("hello world") == "hello world"
    assert _json_safe({"a": 1}) == {"a": 1}


def test_redact_text_helper_returns_markers():
    redacted = _redact_text(f"hi {EMAIL}")
    assert "[REDACTED_EMAIL]" in redacted


def test_config_defaults_to_strict():
    cfg = MIMORIConfig(api_key="k", agent_name="a")
    assert cfg.redaction_mode == "strict"


def test_config_rejects_invalid_redaction_mode():
    with pytest.raises(ValueError):
        MIMORIConfig(api_key="k", agent_name="a", redaction_mode="bogus")


def test_client_log_redacts_payload_and_collects_keys():
    client = MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        auto_start=False,
    )
    client.log("llm_start", {"prompt": f"key {AWS_KEY} mail {EMAIL}"})
    event = client._events.get_nowait()
    assert AWS_KEY not in event["payload"]["prompt"]
    assert EMAIL not in event["payload"]["prompt"]
    assert "[REDACTED_AWS_KEY]" in event["payload"]["prompt"]
    assert "[REDACTED_EMAIL]" in event["payload"]["prompt"]
    assert "prompt" in client.last_redacted_keys
    client.close()


def test_client_permissive_mode_leaves_pii():
    client = MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        auto_start=False,
        redaction_mode="permissive",
    )
    client.log("llm_start", {"prompt": f"key {AWS_KEY} mail {EMAIL}"})
    event = client._events.get_nowait()
    assert AWS_KEY not in event["payload"]["prompt"]
    assert EMAIL in event["payload"]["prompt"]
    client.close()


# ---------------------------------------------------------------------------
# Flagship wave-2 fix 1: truncation-before-redaction must not leak key body
# ---------------------------------------------------------------------------

TRUNCATED_KEY_PAYLOAD = (
    "-----BEGIN RSA PRIVATE KEY-----\n" + ("M" * 120_000)
)  # no END marker: what a truncated 100k payload looks like


def test_truncated_private_key_redacts_to_end():
    """BEGIN at start, no END: the whole key body must be redacted.

    Handlers truncate to 100_000 chars *before* redaction, so the END
    marker may already be gone when the redactor runs. The private-key
    pattern treats END as optional so the match runs to the end of the
    string instead of leaking the body.
    """
    from mimori.anthropic_handler import _truncate

    truncated = _truncate(TRUNCATED_KEY_PAYLOAD)  # handler truncation path
    assert len(truncated) == 100_000
    assert "BEGIN" in truncated and "END" not in truncated

    out = _json_safe({"v": truncated})
    assert "[REDACTED_PRIVATE_KEY]" in out["v"]
    assert "PRIVATE KEY" not in out["v"]
    assert "M" * 50 not in out["v"]  # no key material survives
    assert len(out["v"]) <= 64  # nothing near the 100k payload remains


def test_client_log_truncated_private_key_never_ships_key_body():
    """End-to-end: a 100k truncated key queued via client.log ships clean."""
    from mimori.anthropic_handler import _truncate

    client = MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        auto_start=False,
    )
    client.log("llm_start", {"prompt": _truncate(TRUNCATED_KEY_PAYLOAD)})
    event = client._events.get_nowait()
    stored = event["payload"]["prompt"]
    assert "[REDACTED_PRIVATE_KEY]" in stored
    assert "M" * 50 not in stored
    assert "BEGIN" not in stored
    client.close()


def test_complete_private_key_block_still_redacts():
    """The END-present path keeps working (END no longer required-only)."""
    body = "MIIE" * 100
    block = f"key:\n-----BEGIN RSA PRIVATE KEY-----\n{body}\n-----END RSA PRIVATE KEY-----\ndone"
    out = _json_safe({"v": block})
    assert "[REDACTED_PRIVATE_KEY]" in out["v"]
    assert body not in out["v"]
    assert out["v"].endswith("\ndone")  # content after END untouched


# ---------------------------------------------------------------------------
# Flagship wave-2 fix 2: config.max_payload_chars enforced in _json_safe
# ---------------------------------------------------------------------------


def test_json_safe_enforces_max_chars_on_every_string():
    out = _json_safe({"v": "x" * 5000}, max_chars=128)
    assert len(out["v"]) == 128


def test_json_safe_max_chars_applies_nested_and_repr_fallback():
    class Weird:
        def __repr__(self) -> str:
            return "W" * 4000

    out = _json_safe({"a": ["y" * 4000, Weird(), {"deep": "z" * 4000}]}, max_chars=100)
    assert len(out["a"][0]) == 100
    assert len(out["a"][1]) == 100
    assert len(out["a"][2]["deep"]) == 100


def test_json_safe_without_max_chars_stays_unlimited():
    """Default (None) means no cap so standalone calls keep old behavior."""
    assert _json_safe("x" * 5000) == "x" * 5000


def test_json_safe_redacts_before_truncating():
    """Redaction runs first so caps never cut a secret mid-marker."""
    # The key sits at chars 11..31; a naive truncate-first of 40 chars
    # would keep the entire key unredactable. Redact-first yields marker.
    value = "a" * 10 + " " + AWS_KEY + " " + "b" * 4000
    out = _json_safe({"v": value}, max_chars=40)
    assert AWS_KEY not in out["v"]
    assert len(out["v"]) == 40
    # With a cap that still fits the marker, the marker itself survives.
    out = _json_safe({"v": value}, max_chars=64)
    assert "[REDACTED_AWS_KEY]" in out["v"]


def test_client_max_payload_chars_config_is_live():
    """MIMORIConfig.max_payload_chars was previously dead config."""
    client = MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        auto_start=False,
        max_payload_chars=50,
    )
    client.log("manual", {"v": "y" * 10_000})
    event = client._events.get_nowait()
    assert len(event["payload"]["v"]) == 50
    # Small strings below the cap are untouched.
    client.log("manual", {"v": "short"})
    event = client._events.get_nowait()
    assert event["payload"]["v"] == "short"
    client.close()


def test_client_max_payload_chars_from_config_object():
    """Same enforcement when built from a MIMORIConfig instance."""
    cfg = MIMORIConfig(
        api_key="mmr_dev_config",
        agent_name="config-agent",
        session_id="sess_config",
        max_payload_chars=25,
    )
    client = MIMORIClient(config=cfg, auto_start=False)
    client.log("manual", {"nested": {"deep": "z" * 5000}})
    event = client._events.get_nowait()
    assert len(event["payload"]["nested"]["deep"]) == 25
    client.close()


# ---------------------------------------------------------------------------
# Flagship wave-2 pentester fix 2: encoded & split-across-fields bypass
# ---------------------------------------------------------------------------


def test_redact_base64_encoded_secret():
    import base64

    blob = base64.b64encode(AWS_KEY.encode()).decode()
    out = _json_safe({"v": f"auth blob: {blob}"})
    assert AWS_KEY not in out["v"]  # raw key only ever exists encoded here
    assert "[REDACTED_AWS_KEY]" in out["v"]


def test_redact_base64_secret_glued_to_prefix():
    """'=' glues prefixes onto tokens; the encoded segment still decodes."""
    import base64

    blob = base64.b64encode(AWS_KEY.encode()).decode()
    out = _json_safe({"v": f"token={blob}"})
    assert AWS_KEY not in out["v"]
    assert "[REDACTED_AWS_KEY]" in out["v"]


def test_benign_base64_blob_not_redacted():
    """Only secret hits in a decoded view redact — not arbitrary base64."""
    import base64

    blob = base64.b64encode(b"the quick brown fox jumps").decode()
    assert len(blob) >= 16
    assert _json_safe({"v": blob})["v"] == blob


def test_redact_hex_encoded_secret():
    hx = GITHUB_TOKEN.encode().hex()
    assert len(hx) >= 16
    out = _json_safe({"v": hx})
    assert "[REDACTED_GITHUB_TOKEN]" in out["v"]
    # The raw token can appear only via the hex view, never raw.
    assert GITHUB_TOKEN not in out["v"]


def test_benign_hex_string_not_redacted():
    dead = "deadbeef" * 4
    assert _json_safe({"v": dead})["v"] == dead


def test_encoded_scan_skips_strings_longer_than_4096_chars():
    """Perf guard: decode attempts only run on strings of 16..4096 chars."""
    import base64

    blob = base64.b64encode(AWS_KEY.encode()).decode()
    oversized = blob + "x" * 5000
    assert len(oversized) > 4096
    out = _json_safe({"v": oversized})
    assert blob in out["v"]  # scan intentionally skipped past the cap
    assert "[REDACTED_AWS_KEY]" not in out["v"]


def test_redact_ipv6_public_and_private_strict():
    for text in [
        "peer 2001:db8:85a3::8a2e:370:7334 connected",
        "bound to fe80::1",
        "mapped ::ffff:192.168.0.1",
        "full 2001:0db8:0000:0000:0000:0000:0000:0001 form",
    ]:
        out = _json_safe({"v": text})
        assert "[REDACTED_IP]" in out["v"], text


def test_ipv6_lookalikes_not_redacted():
    """Version strings, times, and MACs must pass through untouched."""
    for text in [
        "at 12:34:56 today",
        "mac aa:bb:cc:dd:ee:ff",
        "build v1:2:3",
        "rev 2026:09:22",
    ]:
        out = _json_safe({"v": text})
        assert out["v"] == text, text


def test_permissive_mode_leaves_ipv6():
    out = _json_safe({"v": "peer 2001:db8::1"}, redaction_mode="permissive")
    assert "2001:db8::1" in out["v"]


def test_split_across_fields_group_redaction():
    keys: list[str] = []
    payload = {"p1": "ghp_", "p2": "a" * 19, "p3": "a" * 17}
    out = _json_safe(payload, redacted_keys=keys)
    assert out["p1"] == out["p2"] == out["p3"] == "[REDACTED_GROUP]"
    # Audit trail records both the pattern and the participating fields.
    assert "github_token" in keys
    assert "p1" in keys and "p3" in keys


def test_split_group_redacts_with_neighboring_fields():
    """Boundary views restore word boundaries around a secret glued to
    neighboring short values (plain join alone cannot satisfy them)."""
    out = _json_safe({"pre": "use", "p1": "ghp_", "p2": "a" * 19, "p3": "a" * 17})
    assert out["p1"] == "[REDACTED_GROUP]"
    assert out["pre"] == "[REDACTED_GROUP]"
    assert GITHUB_TOKEN not in "".join(out.values())


def test_split_group_respects_redaction_mode_for_pii():
    payload = {"p": "alice@", "q": "example.com"}
    permissive = _json_safe(dict(payload), redaction_mode="permissive")
    assert permissive == payload  # emails are pii: untouched in permissive
    strict = _json_safe(dict(payload))
    assert strict["p"] == "[REDACTED_GROUP]" and strict["q"] == "[REDACTED_GROUP]"


def test_benign_short_fields_not_group_redacted():
    payload = {"status": "ok", "env": "prod", "count": "42", "region": "eu-1"}
    assert _json_safe(dict(payload)) == payload


def test_client_log_redacts_base64_encoded_secret_end_to_end():
    import base64

    client = MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        auto_start=False,
    )
    blob = base64.b64encode(AWS_KEY.encode()).decode()
    client.log("llm_start", {"prompt": f"blob {blob}"})
    event = client._events.get_nowait()
    assert "[REDACTED_AWS_KEY]" in event["payload"]["prompt"]
    assert AWS_KEY not in event["payload"]["prompt"]
    client.close()


# ---------------------------------------------------------------------------
# Flagship wave-2 pentester fix 3: marker forgery
# ---------------------------------------------------------------------------


def test_forged_redaction_marker_neutralized():
    """Pre-existing [REDACTED_*] literals are not trusted as redaction output."""
    out = _json_safe({"v": "audit says [REDACTED_AWS_KEY] but no scan ran"})
    assert "[REDACTED_AWS_KEY]" not in out["v"]
    assert "[REDACTED]" in out["v"]


def test_forged_marker_cannot_shadow_real_secret_redaction():
    """A forged marker is neutralized while the real token still redacts."""
    out = _json_safe({"v": f"before [REDACTED_GITHUB_TOKEN] after {GITHUB_TOKEN}"})
    assert GITHUB_TOKEN not in out["v"]
    # Exactly one genuine marker: issued for the real token, not the forgery.
    assert out["v"].count("[REDACTED_GITHUB_TOKEN]") == 1
    assert out["v"].count("[REDACTED]") == 1
