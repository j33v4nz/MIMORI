"""Strict experimental Laya review and independent layered enforcement."""
from __future__ import annotations

import math
import json
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

import requests

from mimori.guardrail import GuardrailVerdict, _bounded_content_text


class LayaSecurityReviewer:
    """Use actual local model inference; never accept heuristic fallback.

    Unlike the legacy optional classifier, failures raise so the tool-response
    guardrail can refuse unreviewed content. Task-aware checkpoints must receive
    application-owned context. Model output never grants action permissions.
    """

    def __init__(self, *, base_url: str = "http://127.0.0.1:5050",
                 timeout: float = 15.0, threshold: float = 0.75, require_task_context: bool = False,
                 expected_weights_sha256: str | None = None):
        parsed = urlparse(base_url)
        if (parsed.scheme not in {"http", "https"} or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
                or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}):
            raise ValueError("Laya security review requires a plain loopback origin")
        if not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("timeout must be positive and finite")
        if not math.isfinite(threshold) or not 0 < threshold <= 1:
            raise ValueError("threshold must be in (0, 1]")
        self.base_url, self.timeout, self.threshold = base_url.rstrip("/"), timeout, threshold
        self.require_task_context = require_task_context
        if expected_weights_sha256 is not None and (not isinstance(expected_weights_sha256, str)
                or len(expected_weights_sha256) != 64 or any(c not in '0123456789abcdef' for c in expected_weights_sha256)):
            raise ValueError("Expected weights hash must be a SHA-256 hex digest")
        self.expected_weights_sha256 = expected_weights_sha256

    @classmethod
    def from_policy(cls, path: str | Path, *, base_url: str = "http://127.0.0.1:5050", timeout: float = 15.0):
        """Load application-owned calibration policy and pin its model weights."""
        policy = json.loads(Path(path).read_text())
        if policy.get('source') != 'calibration only' or policy.get('require_task_context') is not True:
            raise ValueError("A task-aware calibration policy is required")
        if not isinstance(policy.get('weights_sha256'), str):
            raise ValueError("Calibration policy must pin model weights")
        return cls(base_url=base_url, timeout=timeout, threshold=policy['threshold'], require_task_context=True,
                   expected_weights_sha256=policy['weights_sha256'])

    def __call__(self, content: Any, *, user_request: str, tool_name: str = "") -> GuardrailVerdict:
        if not isinstance(user_request, str) or not user_request.strip():
            raise ValueError("Original user request is required")
        text = _bounded_content_text(content)
        if len(text.encode("utf8")) > 6000:
            raise ValueError("Laya review input exceeds 6,000 UTF-8 bytes")
        with requests.Session() as session:
            session.trust_env = False
            response = session.post(f"{self.base_url}/v1/classify", json={"input": text,
                "original_user_request": user_request, "tool_name": tool_name,
                "options": ["benign", "suspicious", "malicious"]}, timeout=self.timeout, allow_redirects=False)
        if response.status_code != 200:
            raise RuntimeError("Laya review request failed")
        data = response.json()
        if not isinstance(data, dict) or not isinstance(data.get("metadata"), dict) or data["metadata"].get("engine") != "laya_finetuned":
            raise ValueError("Actual Laya model inference is required")
        if self.require_task_context and (data["metadata"].get("task_context_used") is not True
                or data["metadata"].get("task_schema_version") != "mimori.task_response.v1"
                or data["metadata"].get("state_truncated") is not False):
            raise ValueError("Complete task-aware model inference is required")
        if self.expected_weights_sha256 is not None and data["metadata"].get("model_sha256") != self.expected_weights_sha256:
            raise ValueError("Laya checkpoint differs from the calibrated model")
        labels = {"benign", "suspicious", "malicious"}
        scores = data.get("scores")
        choice = data.get("choice")
        if not isinstance(scores, dict) or set(scores) != labels or choice not in labels:
            raise ValueError("Invalid Laya verdict")
        if any(type(v) not in {int, float} or not math.isfinite(v) or not 0 <= v <= 1 for v in scores.values()):
            raise ValueError("Invalid Laya probabilities")
        if not math.isclose(sum(scores.values()), 1, abs_tol=0.001) or scores[choice] != max(scores.values()):
            raise ValueError("Inconsistent Laya probabilities")
        if choice == "benign" or scores[choice] < self.threshold:
            return GuardrailVerdict(reason="Laya did not exceed the experimental risk threshold")
        return GuardrailVerdict(allowed=False, category="other", severity="high" if choice == "malicious" else "medium",
                               reason=f"Experimental Laya review: {choice} ({scores[choice]:.3f})")


class LayeredSecurityReviewer:
    """Require independent semantic and Laya reviews; either may deny.

    Both see the original content, not each other's scores. A Laya allow never
    suppresses semantic review. Errors propagate to fail-closed enforcement.
    """

    def __init__(self, *, semantic: Callable[..., GuardrailVerdict], laya: Callable[..., GuardrailVerdict]):
        self.semantic, self.laya = semantic, laya

    def __call__(self, content: Any, *, user_request: str, tool_name: str = "") -> GuardrailVerdict:
        semantic = self.semantic(content, user_request=user_request, tool_name=tool_name)
        laya = self.laya(content, user_request=user_request, tool_name=tool_name)
        for verdict in (semantic, laya):
            if not isinstance(verdict, GuardrailVerdict) or type(verdict.allowed) is not bool or (verdict.allowed and verdict.category != "benign"):
                raise ValueError("Invalid independent security verdict")
        return semantic if not semantic.allowed else laya
