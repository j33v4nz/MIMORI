"""Haystack integration for MIMORI telemetry."""

from __future__ import annotations

from typing import Any

from mimori.client import MIMORIClient

try:
    from haystack.components.agents.state import State
except ImportError:
    State = Any


def _truncate(value: Any, limit: int = 100_000) -> str:
    text = str(value) if value is not None else ""
    return text[:limit] if len(text) > limit else text


class MIMORIHaystackHandler:
    """Haystack hook-based handler that sends telemetry to MIMORI.

    Attach as hooks on your ``Agent``::

        from haystack.hooks import hook
        from mimori import MIMORIHaystackHandler

        handler = MIMORIHaystackHandler(api_key="...", agent_name="...")
        agent = Agent(
            chat_generator=...,
            tools=[...],
            hooks={
                "before_llm": [handler.before_llm],
                "before_tool": [handler.before_tool],
                "after_tool": [handler.after_tool],
                "on_exit": [handler.on_exit],
            },
        )

    Or use :meth:`hooks_dict`` to get the full hooks dictionary::

        agent = Agent(..., hooks=handler.hooks_dict())

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
            framework="haystack",
        )

    def hooks_dict(self) -> dict[str, list[Any]]:
        """Return a hooks dict ready to pass to ``Agent(hooks=...)``."""
        callbacks = {
            "before_llm": [self.before_llm],
            "before_tool": [self.before_tool],
            "after_tool": [self.after_tool],
            "on_exit": [self.on_exit],
        }
        try:
            from haystack.hooks import hook
        except ImportError:
            return callbacks
        return {name: [hook(fn) for fn in fns] for name, fns in callbacks.items()}

    def before_llm(self, state: State) -> None:
        """Hook that fires before every LLM call."""
        messages = state.data.get("messages", []) if hasattr(state, "data") else []
        last_msg = str(messages[-1]) if messages else ""
        self._client.log(
            "llm_start",
            {"serialized": {"name": "haystack-llm"}, "prompts": [_truncate(last_msg)]},
        )

    def before_tool(self, state: State) -> None:
        """Hook that fires before tool execution."""
        messages = state.data.get("messages", []) if hasattr(state, "data") else []
        if messages:
            last = messages[-1]
            tool_calls = getattr(last, "tool_calls", [])
            for tc in tool_calls:
                tc_name = getattr(tc, "tool_name", "unknown")
                tc_args = getattr(tc, "args", {})
                self._client.log(
                    "tool_start",
                    {"tool": {"name": str(tc_name)}, "input": _truncate(str(tc_args))},
                )

    def after_tool(self, state: State) -> None:
        """Hook that fires after tool execution."""
        messages = state.data.get("messages", []) if hasattr(state, "data") else []
        if messages:
            last = messages[-1]
            content = getattr(last, "text", str(last))
            self._client.log("tool_end", {"output": _truncate(content)})

    def on_exit(self, state: State) -> None:
        """Hook that fires when the agent is about to stop."""
        messages = state.data.get("messages", []) if hasattr(state, "data") else []
        if messages:
            last = messages[-1]
            content = getattr(last, "text", str(last))
            self._client.log("llm_end", {"response": _truncate(content)})
        self._client.log("chain_end", {"outputs": {"status": "agent_exit"}})

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> MIMORIHaystackHandler:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
