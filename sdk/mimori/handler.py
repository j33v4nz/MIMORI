"""LangChain callback handler for MIMORI."""

from __future__ import annotations

from typing import Any

from mimori.client import MIMORIClient

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
    ) -> None:
        super().__init__()
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

    def on_tool_end(self, output: Any, **kwargs: Any) -> None:
        self.client.log(
            "tool_end",
            {
                "output": _safe_response(output),
                "kwargs": kwargs,
            },
        )

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
