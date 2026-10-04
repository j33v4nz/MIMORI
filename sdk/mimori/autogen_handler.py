"""AutoGen / AG2 integration for MIMORI telemetry."""

from __future__ import annotations

from typing import Any

from mimori.client import MIMORIClient


def _truncate(value: Any, limit: int = 100_000) -> str:
    text = str(value) if value is not None else ""
    return text[:limit] if len(text) > limit else text


def _extract_text(message: Any) -> str:
    if isinstance(message, dict):
        return message.get("content", str(message))
    if isinstance(message, str):
        return message
    return str(message)


class MIMORIAutoGenHandler:
    """Captures AutoGen / AG2 agent events and sends them to MIMORI.

    Works with both AG2 (``pip install ag2``) and Microsoft AutoGen v0.2
    (``pip install autogen-agentchat~=0.2``).  Attach to agents via
    :meth:`register` after creating them.

    Args:
        api_key: MIMORI API key for authentication.
        agent_name: Logical name of the AI agent.
        api_url: Base URL of the MIMORI server.
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
            framework="autogen",
        )
        self._client = self.client

    def register(self, agent: Any) -> None:
        """Register MIMORI hooks on an AutoGen ``ConversableAgent``.

        This installs four hooks:
        - ``safeguard_llm_inputs``  → ``llm_start``
        - ``safeguard_llm_outputs`` → ``llm_end``
        - ``safeguard_tool_inputs`` → ``tool_start``
        - ``safeguard_tool_outputs``→ ``tool_end``
        """
        handler = self

        def _llm_input_hook(llm_input: Any) -> Any:
            messages = []
            if isinstance(llm_input, dict):
                messages = llm_input.get("messages", [])
            prompt = _truncate(messages[-1] if messages else llm_input)
            handler.client.log(
                "llm_start",
                {"serialized": {"name": getattr(agent, "name", "agent")}, "prompts": [prompt]},
            )
            return llm_input

        def _llm_output_hook(llm_output: Any) -> Any:
            text = ""
            if isinstance(llm_output, dict):
                text = llm_output.get("content", str(llm_output))
            else:
                text = str(llm_output)
            handler.client.log("llm_end", {"response": _truncate(text)})
            return llm_output

        def _tool_input_hook(tool_input: Any) -> Any:
            name = "unknown"
            args = tool_input
            if isinstance(tool_input, dict):
                name = tool_input.get("name", tool_input.get("function", {}).get("name", "unknown"))
                args = tool_input.get("arguments", tool_input.get("function", {}).get("arguments", tool_input))
            handler.client.log(
                "tool_start",
                {"tool": {"name": name}, "input": _truncate(args)},
            )
            return tool_input

        def _tool_output_hook(response: Any) -> Any:
            result = response.get("content", str(response)) if isinstance(response, dict) else str(response)
            handler.client.log("tool_end", {"output": _truncate(result)})
            return response

        agent.register_hook("safeguard_llm_inputs", _llm_input_hook)
        agent.register_hook("safeguard_llm_outputs", _llm_output_hook)
        agent.register_hook("safeguard_tool_inputs", _tool_input_hook)
        agent.register_hook("safeguard_tool_outputs", _tool_output_hook)

    def close(self) -> None:
        """Stop the background flush thread and send remaining events."""
        self.client.close()

    def __enter__(self) -> MIMORIAutoGenHandler:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
