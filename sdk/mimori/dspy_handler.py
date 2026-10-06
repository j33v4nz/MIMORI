"""DSPy integration for MIMORI telemetry."""

from __future__ import annotations

from typing import Any

from mimori.client import MIMORIClient

try:
    from dspy.utils.callback import BaseCallback as DSPyBaseCallback
except ImportError:

    class DSPyBaseCallback:  # type: ignore[no-redef]
        pass


def _truncate(value: Any, limit: int = 100_000) -> str:
    text = str(value) if value is not None else ""
    return text[:limit] if len(text) > limit else text


class MIMORIDSPyHandler(DSPyBaseCallback):
    """DSPy callback handler that sends telemetry to MIMORI.

    Attach globally::

        import dspy
        from mimori import MIMORIDSPyHandler

        handler = MIMORIDSPyHandler(api_key="...", agent_name="...")
        dspy.configure(callbacks=[handler])

    Or per-LM::

        lm = dspy.LM("openai/gpt-4o-mini", callbacks=[handler])

    Args:
        api_key: MIMORI API key.
        agent_name: Logical agent name.
        api_url: MIMORI server URL.
        session_id: Optional session identifier.
    """

    def __init__(
        self,
        api_key: str,
        agent_name: str,
        api_url: str = "http://localhost:3000",
        session_id: str | None = None,
    ) -> None:
        self.client = MIMORIClient(
            api_key=api_key,
            agent_name=agent_name,
            api_url=api_url,
            session_id=session_id,
            framework="dspy",
        )
        self._client = self.client

    # -- LM lifecycle --

    def on_lm_start(self, call_id: str, instance: Any, inputs: dict[str, Any]) -> None:
        model_name = getattr(instance, "model", "dspy-lm")
        prompts = inputs.get("prompt", inputs.get("messages", []))
        if isinstance(prompts, str):
            prompts = [prompts]
        self._client.log(
            "llm_start",
            {
                "serialized": {"name": str(model_name)},
                "prompts": [_truncate(p) for p in prompts],
            },
        )

    def on_lm_end(
        self, call_id: str, outputs: Any, exception: BaseException | None
    ) -> None:
        if exception:
            self._client.log("llm_end", {"error": str(exception)})
        else:
            self._client.log("llm_end", {"response": _truncate(outputs)})

    # -- Module lifecycle --

    def on_module_start(
        self, call_id: str, instance: Any, inputs: dict[str, Any]
    ) -> None:
        module_name = type(instance).__name__ if instance else "dspy-module"
        self._client.log(
            "chain_start", {"chain": {"name": module_name}, "inputs": _truncate(inputs)}
        )

    def on_module_end(
        self, call_id: str, outputs: Any, exception: BaseException | None
    ) -> None:
        if exception:
            self._client.log("chain_end", {"error": str(exception)})
        else:
            self._client.log("chain_end", {"outputs": _truncate(outputs)})

    # -- Tool lifecycle --

    def on_tool_start(
        self, call_id: str, instance: Any, inputs: dict[str, Any]
    ) -> None:
        tool_name = getattr(instance, "name", "dspy-tool")
        self._client.log(
            "tool_start",
            {"tool": {"name": str(tool_name)}, "input": _truncate(inputs)},
        )

    def on_tool_end(
        self, call_id: str, outputs: Any, exception: BaseException | None
    ) -> None:
        if exception:
            self._client.log("tool_end", {"error": str(exception)})
        else:
            self._client.log("tool_end", {"output": _truncate(outputs)})

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> MIMORIDSPyHandler:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
