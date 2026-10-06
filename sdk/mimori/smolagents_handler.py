"""Smolagents (HuggingFace) integration for MIMORI telemetry."""

from __future__ import annotations

from typing import Any

from mimori.client import MIMORIClient

try:
    from smolagents import ActionStep
except ImportError:

    class ActionStep:  # type: ignore[no-redef]
        pass


def _truncate(value: Any, limit: int = 100_000) -> str:
    text = str(value) if value is not None else ""
    return text[:limit] if len(text) > limit else text


class MIMORISmolagentsHandler:
    """Smolagents callback handler that sends telemetry to MIMORI.

    Attach as a ``step_callback`` on your agent::

        from mimori import MIMORISmolagentsHandler

        handler = MIMORISmolagentsHandler(api_key="...", agent_name="...")
        agent = CodeAgent(
            tools=[...],
            model=model,
            step_callbacks=[handler.step_callback],
        )

    For tool-level interception, also pass :meth:`tool_hook` to
    ``before_tool_call_hooks``::

        agent = CodeAgent(
            ...,
            step_callbacks=[handler.step_callback],
            before_tool_call_hooks=[handler.tool_hook],
        )

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
        self._client = MIMORIClient(
            api_key=api_key,
            agent_name=agent_name,
            api_url=api_url,
            session_id=session_id,
            framework="smolagents",
        )
        self._hooked_tools: set[str] = set()

    def step_callback(self, memory_step: Any, agent: Any = None) -> None:
        """Fires after each action step.  Pass as ``step_callbacks=[handler.step_callback]``."""
        if not isinstance(memory_step, ActionStep):
            return

        step_num = getattr(memory_step, "step_number", "?")
        model_output = getattr(memory_step, "model_output", "")
        tool_calls = getattr(memory_step, "tool_calls", None) or []
        observations = getattr(memory_step, "observations", "")
        token_usage = getattr(memory_step, "token_usage", None)

        # Extract prompt text from memory step
        model_input_messages = getattr(memory_step, "model_input_messages", None)
        prompt_text = ""
        if model_input_messages:
            if isinstance(model_input_messages, list):
                prompt_text = "\n".join(
                    (
                        str(m.get("content", m))
                        if isinstance(m, dict)
                        else str(getattr(m, "content", m))
                    )
                    for m in model_input_messages
                )
            else:
                prompt_text = str(model_input_messages)
        elif hasattr(memory_step, "step_input") and memory_step.step_input:
            prompt_text = str(memory_step.step_input)
        elif model_output:
            prompt_text = f"Action step {step_num}"

        # LLM call happened
        if model_output or prompt_text:
            self._client.log(
                "llm_start",
                {
                    "serialized": {"name": "smolagents-model"},
                    "prompts": [_truncate(prompt_text or str(model_output))],
                },
            )
            if model_output:
                self._client.log("llm_end", {"response": _truncate(str(model_output))})

        # Tool calls happened
        for tc in tool_calls:
            tc_name = (
                getattr(tc, "name", "unknown")
                if hasattr(tc, "name")
                else tc.get("name", "unknown") if isinstance(tc, dict) else "unknown"
            )
            tc_args = (
                getattr(tc, "arguments", "")
                if hasattr(tc, "arguments")
                else tc.get("arguments", "") if isinstance(tc, dict) else ""
            )
            call_key = f"{tc_name}:{str(tc_args)}"
            if call_key in self._hooked_tools:
                self._hooked_tools.discard(call_key)
            else:
                self._client.log(
                    "tool_start",
                    {"tool": {"name": str(tc_name)}, "input": _truncate(str(tc_args))},
                )
            self._client.log("tool_end", {"output": _truncate(str(observations))})

        # Chain-level step summary
        self._client.log(
            "agent_action",
            {"action": f"step {step_num}: {_truncate(str(model_output)[:200])}"},
        )

    def tool_hook(self, tool_name: str, arguments: Any, agent: Any = None) -> bool:
        """Fires before each tool executes.  Pass as ``before_tool_call_hooks=[handler.tool_hook]``."""
        call_key = f"{tool_name}:{str(arguments)}"
        self._hooked_tools.add(call_key)
        self._client.log(
            "tool_start",
            {"tool": {"name": tool_name}, "input": _truncate(str(arguments))},
        )
        return True  # allow execution

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> MIMORISmolagentsHandler:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
