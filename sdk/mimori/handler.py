"""LangChain callback handler for MIMORI."""

from __future__ import annotations

from typing import Any, Callable
import logging

from mimori.client import MIMORIClient
from mimori.guardrail import MIMORIGuardrail, GuardrailVerdict, SecurityViolation

logger = logging.getLogger("MIMORI")

try:
    from langchain_core.callbacks import BaseCallbackHandler
except ImportError:  # pragma: no cover - exercised when LangChain is absent.

    class BaseCallbackHandler:  # type: ignore[no-redef]
        """Fallback so the SDK can be imported without LangChain installed."""


class MIMORIHandler(BaseCallbackHandler):
    """Captures LangChain callback events and sends them to MIMORI."""

    def __init__(
        self,
        api_key: str,
        agent_name: str,
        api_url: str = "http://localhost:3000",
        session_id: str | None = None,
        flush_interval: float = 1.0,
        batch_size: int = 25,
        max_queue_size: int = 1000,
        timeout: float = 2.0,
        guardrail: MIMORIGuardrail | None = None,
        original_user_request: str | None = None,
        tool_response_reviewer: Callable[..., GuardrailVerdict] | None = None,
        tool_authorizer: Callable[[str, str], bool] | None = None,
    ) -> None:
        super().__init__()
        if guardrail is not None and (not original_user_request or tool_response_reviewer is None):
            raise ValueError("Blocking tool review requires an original user request and reviewer")
        if guardrail is None and (tool_response_reviewer is not None or tool_authorizer is not None):
            raise ValueError("A guardrail is required for review or authorization")
        self.guardrail = guardrail
        self.original_user_request = original_user_request
        self.tool_response_reviewer = tool_response_reviewer
        self.tool_authorizer = tool_authorizer
        self._tool_names: dict[str, str] = {}
        # LangChain otherwise catches callback exceptions and continues.
        self.raise_error = guardrail is not None and guardrail.mode == "block"
        self.client = MIMORIClient(
            api_key=api_key,
            agent_name=agent_name,
            api_url=api_url,
            session_id=session_id,
            framework="langchain",
            flush_interval=flush_interval,
            batch_size=batch_size,
            max_queue_size=max_queue_size,
            timeout=timeout,
        )

    @property
    def session_id(self) -> str:
        return self.client.session_id

    def close(self) -> None:
        self.client.close()

    def __enter__(self) -> MIMORIHandler:
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()

    def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        **kwargs: Any,
    ) -> None:
        self.client.log(
            "llm_start",
            {
                "serialized": serialized,
                "prompts": prompts,
                "kwargs": kwargs,
            },
        )

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        payload: dict[str, Any] = {
            "response": _safe_response(response),
            "kwargs": kwargs,
        }
        if hasattr(response, "llm_output") and isinstance(response.llm_output, dict):
            if "token_usage" in response.llm_output:
                payload["token_usage"] = response.llm_output["token_usage"]
        self.client.log("llm_end", payload)

    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        **kwargs: Any,
    ) -> None:
        self.client.log(
            "tool_start",
            {
                "tool": serialized,
                "input": input_str,
                "kwargs": kwargs,
            },
        )
        if self.guardrail is not None:
            name = serialized.get("name", "unknown_tool")
            if self.tool_authorizer is not None:
                try:
                    approved = self.tool_authorizer(name, input_str) is True
                except Exception:
                    approved = False
                if not approved:
                    verdict = GuardrailVerdict(allowed=False, category="excessive_agency", severity="high",
                                              reason="Tool call is outside application-granted authorization")
                    if self.guardrail.on_violation:
                        self.guardrail.on_violation(verdict)
                    if self.guardrail.mode == "block":
                        raise SecurityViolation(verdict.reason, category=verdict.category, severity=verdict.severity)
                    logger.warning("MIMORI authorization %s: denied tool call", self.guardrail.mode.upper())
            self.guardrail.verify_or_raise({"tool": serialized, "input": input_str})
            self._tool_names[str(kwargs.get("run_id", "default"))] = name

    def on_tool_end(self, output: Any, **kwargs: Any) -> None:
        safe_output = _safe_response(output)
        self.client.log(
            "tool_end",
            {
                "output": safe_output,
                "kwargs": kwargs,
            },
        )
        if self.guardrail is not None:
            name = self._tool_names.pop(str(kwargs.get("run_id", "default")), "unknown_tool")
            self.guardrail.verify_tool_response(safe_output, user_request=self.original_user_request or "",
                                               reviewer=self.tool_response_reviewer, tool_name=name)

    def on_chain_start(
        self,
        serialized: dict[str, Any],
        inputs: dict[str, Any],
        **kwargs: Any,
    ) -> None:
        self.client.log(
            "chain_start",
            {
                "chain": serialized,
                "inputs": inputs,
                "kwargs": kwargs,
            },
        )

    def on_chain_end(self, outputs: dict[str, Any], **kwargs: Any) -> None:
        self.client.log(
            "chain_end",
            {
                "outputs": outputs,
                "kwargs": kwargs,
            },
        )

    def on_agent_action(self, action: Any, **kwargs: Any) -> None:
        self.client.log(
            "agent_action",
            {
                "action": _safe_response(action),
                "kwargs": kwargs,
            },
        )

    def on_llm_error(self, error: BaseException, **kwargs: Any) -> None:
        self.client.log(
            "llm_end",
            {
                "error": str(error),
                "kwargs": kwargs,
            },
        )

    def on_tool_error(self, error: BaseException, **kwargs: Any) -> None:
        self._tool_names.pop(str(kwargs.get("run_id", "default")), None)
        self.client.log(
            "tool_end",
            {
                "error": str(error),
                "kwargs": kwargs,
            },
        )

    def on_chain_error(self, error: BaseException, **kwargs: Any) -> None:
        self.client.log(
            "chain_end",
            {
                "error": str(error),
                "kwargs": kwargs,
            },
        )


def _safe_response(value: Any) -> Any:
    try:
        if hasattr(value, "model_dump") and callable(value.model_dump):
            return value.model_dump()

        if hasattr(value, "dict") and callable(value.dict):
            return value.dict()
    except Exception:
        return str(value)

    return value
