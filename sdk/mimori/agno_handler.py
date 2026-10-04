"""Agno (formerly Phidata) integration for MIMORI telemetry."""

from __future__ import annotations

from typing import Any, Callable

from mimori.client import MIMORIClient


def _truncate(value: Any, limit: int = 100_000) -> str:
    text = str(value) if value is not None else ""
    return text[:limit] if len(text) > limit else text


class MIMORIAgnoHandler:
    """Agno 3-tier hook handler for MIMORI telemetry.

    Attach to an ``Agent``::

        from agno.agent import Agent
        from mimori import MIMORIAgnoHandler

        handler = MIMORIAgnoHandler(api_key="...", agent_name="...")
        agent = Agent(
            model=...,
            tools=[...],
            pre_hooks=[handler.pre_hook],
            post_hooks=[handler.post_hook],
            tool_hooks=[handler.tool_middleware],
        )

    Or use :meth:`apply`` to attach all hooks at once::

        agent = handler.apply(agent)

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
            framework="agno",
        )

    def apply(self, agent: Any) -> Any:
        """Attach all MIMORI hooks to an Agno agent and return it."""
        agent.pre_hooks = list(getattr(agent, "pre_hooks", [])) + [self.pre_hook]
        agent.post_hooks = list(getattr(agent, "post_hooks", [])) + [self.post_hook]
        agent.tool_hooks = list(getattr(agent, "tool_hooks", [])) + [self.tool_middleware]
        return agent

    def pre_hook(self, run_input: Any, agent: Any = None, session: Any = None, run_context: Any = None) -> None:
        """Fires before the agent run — maps to chain_start."""
        input_text = ""
        if run_input is not None:
            input_text = getattr(run_input, "input_content", None) or str(run_input)
        self._client.log("chain_start", {"chain": {"name": self._client.config.agent_name}})
        self._client.log(
            "llm_start",
            {"serialized": {"name": self._client.config.agent_name}, "prompts": [_truncate(input_text)]},
        )

    def post_hook(self, run_output: Any, agent: Any = None, session: Any = None, run_context: Any = None) -> None:
        """Fires after the agent run — maps to chain_end."""
        output_text = ""
        if run_output is not None:
            output_text = getattr(run_output, "content", None) or str(run_output)
        self._client.log("llm_end", {"response": _truncate(output_text)})
        self._client.log("chain_end", {"outputs": {"result": _truncate(output_text)}})

    def tool_middleware(
        self,
        function_name: str,
        function_call: Callable,
        arguments: dict[str, Any],
    ) -> Any:
        """Middleware wrapping every tool call — maps to tool_start/end."""
        self._client.log(
            "tool_start",
            {"tool": {"name": function_name}, "input": _truncate(str(arguments))},
        )
        result = function_call(**arguments)
        self._client.log("tool_end", {"output": _truncate(str(result))})
        return result

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> MIMORIAgnoHandler:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
