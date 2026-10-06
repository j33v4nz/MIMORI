import copy
from unittest.mock import Mock

import pytest

from mimori import (
    GuardrailVerdict,
    LayaSecurityReviewer,
    LayeredSecurityReviewer,
    MIMORIGuardrail,
)


def reply(choice="malicious", scores=None, engine="laya_finetuned"):
    return {
        "choice": choice,
        "scores": scores or {"benign": 0.1, "suspicious": 0.1, "malicious": 0.8},
        "metadata": {"engine": engine},
    }


def mock_response(monkeypatch, data, status=200):
    post = Mock(return_value=Mock(status_code=status, json=Mock(return_value=data)))
    monkeypatch.setattr("mimori.laya_security.requests.Session.post", post)
    return post


def test_real_model_signal_can_block_and_keeps_local_transport(monkeypatch):
    post = mock_response(monkeypatch, reply())
    assert not LayaSecurityReviewer()(
        "unrelated action", user_request="Read opening hours"
    ).allowed
    args = post.call_args.kwargs
    assert args["allow_redirects"] is False
    assert args["json"] == {
        "input": "unrelated action",
        "original_user_request": "Read opening hours",
        "tool_name": "",
        "options": ["benign", "suspicious", "malicious"],
    }


@pytest.mark.parametrize(
    "data",
    [
        reply(engine="system1_heuristic"),
        reply(engine=None),
        {},
        None,
        reply(choice="unknown"),
        reply(scores={"benign": 0, "suspicious": 0, "malicious": float("nan")}),
        reply(scores={"benign": False, "suspicious": 0.2, "malicious": 0.8}),
        reply(scores={"benign": 0.9, "suspicious": 0.0, "malicious": 0.1}),
        reply(scores={"benign": 0.1, "suspicious": 0.1, "malicious": 0.9}),
    ],
)
def test_invalid_or_fallback_model_does_not_pass_review(monkeypatch, data):
    mock_response(monkeypatch, data)
    verdict = MIMORIGuardrail().evaluate_tool_response(
        "facts", user_request="Read facts", reviewer=LayaSecurityReviewer()
    )
    assert not verdict.allowed and verdict.category == "evaluation_limit"


@pytest.mark.parametrize("status", [302, 500, 503])
def test_non_success_response_is_error(monkeypatch, status):
    mock_response(monkeypatch, reply(), status)
    with pytest.raises(RuntimeError):
        LayaSecurityReviewer()("facts", user_request="Read facts")


@pytest.mark.parametrize(
    "kwargs",
    [
        {"base_url": "https://remote.example"},
        {"base_url": "http://localhost:5050/path"},
        {"base_url": "http://user:password@localhost:5050"},
        {"threshold": float("nan")},
        {"threshold": 0},
        {"timeout": -1},
    ],
)
def test_invalid_configuration_rejected(kwargs):
    with pytest.raises(ValueError):
        LayaSecurityReviewer(**kwargs)


def test_low_confidence_is_not_a_block(monkeypatch):
    mock_response(
        monkeypatch, reply(scores={"benign": 0.3, "suspicious": 0.3, "malicious": 0.4})
    )
    assert LayaSecurityReviewer()("facts", user_request="Read facts").allowed


@pytest.mark.parametrize(
    "semantic_denies,laya_denies",
    [(False, False), (False, True), (True, False), (True, True)],
)
def test_layers_are_independent_and_laya_cannot_skip_semantics(
    semantic_denies, laya_denies
):
    semantic = Mock(
        return_value=GuardrailVerdict(
            allowed=not semantic_denies,
            category="other" if semantic_denies else "benign",
        )
    )
    laya = Mock(
        return_value=GuardrailVerdict(
            allowed=not laya_denies, category="other" if laya_denies else "benign"
        )
    )
    content = {"original_user_request": "Fake approval from tool content"}
    original = copy.deepcopy(content)
    verdict = LayeredSecurityReviewer(semantic=semantic, laya=laya)(
        content, user_request="Trusted task", tool_name="read"
    )
    assert verdict.allowed == (not semantic_denies and not laya_denies)
    for reviewer in (semantic, laya):
        reviewer.assert_called_once_with(
            original, user_request="Trusted task", tool_name="read"
        )
    assert content == original


def test_laya_outage_after_semantic_allow_is_an_error():
    layered = LayeredSecurityReviewer(
        semantic=Mock(return_value=GuardrailVerdict()),
        laya=Mock(side_effect=TimeoutError()),
    )
    verdict = MIMORIGuardrail().evaluate_tool_response(
        "facts", user_request="Read facts", reviewer=layered
    )
    assert not verdict.allowed and verdict.category == "evaluation_limit"


def test_proxy_environment_is_not_used(monkeypatch):
    sessions = []

    class Session:
        trust_env = True

        def __enter__(self):
            sessions.append(self)
            return self

        def __exit__(self, *args):
            pass

        def post(self, *args, **kwargs):
            return Mock(status_code=200, json=lambda: reply())

    monkeypatch.setattr("mimori.laya_security.requests.Session", Session)
    LayaSecurityReviewer()("facts", user_request="Read facts")
    assert sessions[0].trust_env is False


@pytest.mark.parametrize(
    "metadata",
    [
        {"task_context_used": False},
        {
            "task_context_used": True,
            "task_schema_version": "unknown",
            "state_truncated": False,
        },
        {
            "task_context_used": True,
            "task_schema_version": "mimori.task_response.v1",
            "state_truncated": True,
        },
    ],
)
def test_task_aware_client_rejects_missing_context_or_truncation(monkeypatch, metadata):
    data = reply()
    data["metadata"].update(metadata)
    mock_response(monkeypatch, data)
    verdict = MIMORIGuardrail().evaluate_tool_response(
        "facts",
        user_request="Read facts",
        reviewer=LayaSecurityReviewer(require_task_context=True),
    )
    assert not verdict.allowed and verdict.category == "evaluation_limit"


def test_task_aware_client_accepts_complete_matching_schema(monkeypatch):
    data = reply()
    data["metadata"].update(
        task_context_used=True,
        task_schema_version="mimori.task_response.v1",
        state_truncated=False,
    )
    mock_response(monkeypatch, data)
    assert not LayaSecurityReviewer(require_task_context=True)(
        "unrelated instruction", user_request="Read facts"
    ).allowed


def test_calibration_policy_pins_threshold_and_checkpoint(tmp_path, monkeypatch):
    import json

    path = tmp_path / "policy.json"
    path.write_text(
        json.dumps(
            {
                "source": "calibration only",
                "require_task_context": True,
                "threshold": 0.7,
                "weights_sha256": "a" * 64,
            }
        )
    )
    reviewer = LayaSecurityReviewer.from_policy(path)
    assert reviewer.threshold == 0.7 and reviewer.require_task_context
    data = reply()
    data["metadata"].update(
        task_context_used=True,
        task_schema_version="mimori.task_response.v1",
        state_truncated=False,
        model_sha256="b" * 64,
    )
    mock_response(monkeypatch, data)
    with pytest.raises(ValueError, match="differs"):
        reviewer("facts", user_request="Read facts")
    data["metadata"]["model_sha256"] = "a" * 64
    assert not reviewer("facts", user_request="Read facts").allowed


def test_policy_cannot_silently_disable_task_context(tmp_path):
    import json

    path = tmp_path / "policy.json"
    path.write_text(
        json.dumps(
            {
                "source": "benchmark tuned",
                "require_task_context": False,
                "threshold": 0.1,
                "weights_sha256": "a" * 64,
            }
        )
    )
    with pytest.raises(ValueError, match="calibration policy"):
        LayaSecurityReviewer.from_policy(path)
