"""Google ADK integration for MIMORI telemetry."""

from __future__ import annotations

from typing import Any

from mimori.client import MIMORIClient


def _truncate(value: Any, limit: int = 100_000) -> str:
    text = str(value) if value is not None else ""
    return text[:limit] if len(text) > limit else text


class MIMORIGoogleADKHandler:
    """Google ADK callback handler that sends telemetry to MIMORI.

    Attach as callback functions on your ``LlmAgent``::

        from mimori import MIMORIGoogleADKHandler

        handler = MIMORIGoogleADKHandler(api_key="...", agent_name="...")
        agent = LlmAgent(
            name="my_agent",
            model="gemini-2.0-flash",
            instruction="...",
            before_model_callback=handler.before_model,
            after_model_callback=handler.after_model,
            before_tool_callback=handler.before_tool,
            after_tool_callback=handler.after_tool,
            before_agent_callback=handler.before_agent,
            after_agent_callback=handler.after_agent,
        )

    Or use :meth:`apply` to attach all callbacks at once::

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
            framework="google-adk",
        )

    def apply(self, agent: Any) -> Any:
        """Attach all MIMORI callbacks to a Google ADK agent and return it."""
        agent.before_agent_callback = self.before_agent
        agent.after_agent_callback = self.after_agent
        agent.before_model_callback = self.before_model
        agent.after_model_callback = self.after_model
        agent.before_tool_callback = self.before_tool
        agent.after_tool_callback = self.after_tool
        return agent

    # -- Agent lifecycle --

    def before_agent(self, callback_context: Any) -> None:
        agent_name = getattr(
            callback_context, "agent_name", self._client.config.agent_name
        )
        self._client.log("chain_start", {"chain": {"name": str(agent_name)}})
        return None

    def after_agent(self, callback_context: Any) -> None:
        self._client.log(
            "chain_end",
            {"outputs": {"agent": str(getattr(callback_context, "agent_name", ""))}},
        )
        return None

    # -- LLM lifecycle --

    def before_model(self, callback_context: Any, llm_request: Any) -> None:
        model_name = (
            getattr(llm_request, "model", "unknown") if llm_request else "unknown"
        )
        contents = getattr(llm_request, "contents", []) if llm_request else []
        last_content = ""
        if contents:
            last = contents[-1]
            parts = getattr(last, "parts", [])
            if parts:
                last_content = getattr(parts[0], "text", str(parts[0]))
        self._client.log(
            "llm_start",
            {
                "serialized": {"name": str(model_name)},
                "prompts": [_truncate(last_content)],
            },
        )
        return None

    def after_model(self, callback_context: Any, llm_response: Any) -> None:
        text = ""
        if llm_response:
            content = getattr(llm_response, "content", None)
            if content:
                parts = getattr(content, "parts", [])
                if parts:
                    text = getattr(parts[0], "text", str(parts[0]))
        self._client.log("llm_end", {"response": _truncate(text)})
        return None

    # -- Tool lifecycle --

    def before_tool(self, tool: Any, args: dict[str, Any], tool_context: Any) -> None:
        tool_name = getattr(tool, "name", "unknown") if tool else "unknown"
        self._client.log(
            "tool_start",
            {"tool": {"name": str(tool_name)}, "input": _truncate(str(args))},
        )
        return None

    def after_tool(
        self,
        tool: Any,
        args: dict[str, Any],
        tool_context: Any,
        tool_response: dict[str, Any],
    ) -> None:
        tool_name = getattr(tool, "name", "unknown") if tool else "unknown"
        self._client.log(
            "tool_end",
            {"output": _truncate(str(tool_response))},
        )
        return None

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> MIMORIGoogleADKHandler:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
