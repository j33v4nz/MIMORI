"""Pydantic AI integration for MIMORI telemetry."""

from __future__ import annotations

from typing import Any

from mimori.client import MIMORIClient

try:
    from pydantic_ai.capabilities import Hooks
except ImportError:

    class Hooks:  # type: ignore[no-redef]
        pass


def _truncate(value: Any, limit: int = 100_000) -> str:
    text = str(value) if value is not None else ""
    return text[:limit] if len(text) > limit else text


class MIMORIPydanticAIHandler:
    """Pydantic AI hooks handler that sends telemetry to MIMORI.

    Attach to an agent via ``capabilities``::

        from pydantic_ai import Agent
        from mimori import MIMORIPydanticAIHandler

        handler = MIMORIPydanticAIHandler(api_key="...", agent_name="...")
        agent = Agent("openai:gpt-4o", capabilities=[handler.hooks])

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
            framework="pydantic-ai",
        )
        self.hooks = Hooks()
        self._register_hooks()

    def _register_hooks(self) -> None:
        if not hasattr(self.hooks, "on"):
            return
        instrumentation = self

        @self.hooks.on.model_request
        async def _model_request(
            ctx: Any,
            *,
            request_context: Any,
            handler: Any = None,
            handler_fn: Any = None,
        ) -> Any:
            model = getattr(request_context, "model", None)
            model_name = getattr(model, "model_name", "unknown") if model else "unknown"
            messages = getattr(request_context, "messages", [])
            last_msg = str(messages[-1]) if messages else ""
            instrumentation._client.log(
                "llm_start",
                {"serialized": {"name": model_name}, "prompts": [_truncate(last_msg)]},
            )
            response = await (handler or handler_fn)(request_context)
            instrumentation._client.log(
                "llm_end", {"response": _truncate(str(response))}
            )
            return response

        @self.hooks.on.tool_execute
        async def _tool_execute(
            ctx: Any,
            *,
            call: Any,
            tool_def: Any,
            args: Any,
            handler: Any = None,
            handler_fn: Any = None,
        ) -> Any:
            tool_name = getattr(call, "tool_name", "unknown") if call else "unknown"
            instrumentation._client.log(
                "tool_start",
                {"tool": {"name": str(tool_name)}, "input": _truncate(str(args))},
            )
            result = await (handler or handler_fn)(args)
            instrumentation._client.log("tool_end", {"output": _truncate(str(result))})
            return result

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> MIMORIPydanticAIHandler:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
