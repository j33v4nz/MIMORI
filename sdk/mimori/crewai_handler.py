"""CrewAI integration for MIMORI telemetry."""

from __future__ import annotations

from typing import Any

from mimori.client import MIMORIClient

try:
    from crewai.hooks import (
        LLMCallHookContext,
        ToolCallHookContext,
        after_llm_call,
        after_tool_call,
        before_llm_call,
        before_tool_call,
    )

    HAS_CREWAI_HOOKS = True
except ImportError:
    HAS_CREWAI_HOOKS = False
    LLMCallHookContext = Any  # type: ignore[misc,assignment]
    ToolCallHookContext = Any  # type: ignore[misc,assignment]

try:
    from crewai.hooks import InterceptionPoint, on
except ImportError:
    InterceptionPoint = None  # type: ignore[assignment]
    on = None  # type: ignore[assignment]


def _truncate(value: Any, limit: int = 100_000) -> str:
    text = str(value) if value is not None else ""
    return text[:limit] if len(text) > limit else text


class MIMORICrewAIHandler:
    """Captures CrewAI execution events and sends them to MIMORI.

    Uses CrewAI's global hook system (supports crewai >= 1.15.0).
    Hooks fire for **all** crews in the process. Instantiate once and call
    :meth:`close` when your crew finishes.

    Args:
        api_key: MIMORI API key for authentication.
        agent_name: Logical name of the AI agent / crew.
        api_url: Base URL of the MIMORI server.
        session_id: Optional session identifier. Auto-generated if omitted.
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
            framework="crewai",
        )
        self._registered = False
        self._register_hooks()

    # ------------------------------------------------------------------
    # Internal hook registrations
    # ------------------------------------------------------------------

    def _register_hooks(self) -> None:
        if self._registered:
            return
        self._registered = True

        handler = self

        if HAS_CREWAI_HOOKS:

            @before_llm_call
            def _before_llm(ctx: LLMCallHookContext) -> None:
                agent = getattr(ctx, "agent", None)
                agent_name = (
                    getattr(agent, "role", None)
                    or getattr(agent, "name", None)
                    or "agent"
                )
                task = getattr(ctx, "task", None)
                task_name = getattr(task, "description", None) or "crew-task"

                messages = getattr(ctx, "messages", [])
                prompts = [_truncate(str(m)) for m in messages] if messages else [""]

                handler.client.log("chain_start", {"chain": {"name": task_name}})
                handler.client.log(
                    "llm_start",
                    {
                        "serialized": {"name": agent_name},
                        "prompts": prompts,
                    },
                )

            @after_llm_call
            def _after_llm(ctx: LLMCallHookContext) -> None:
                response = getattr(ctx, "response", "") or ""
                raw = _truncate(response)
                handler.client.log("llm_end", {"response": raw})
                handler.client.log("chain_end", {"outputs": {"result": raw}})

            @before_tool_call
            def _before_tool(ctx: ToolCallHookContext) -> None:
                tool_name = getattr(ctx, "tool_name", "unknown")
                tool_input = getattr(ctx, "tool_input", {})
                handler.client.log(
                    "tool_start",
                    {"tool": {"name": tool_name}, "input": _truncate(tool_input)},
                )

            @after_tool_call
            def _after_tool(ctx: ToolCallHookContext) -> None:
                tool_name = getattr(ctx, "tool_name", "unknown")
                result = (
                    getattr(ctx, "tool_result", None)
                    or getattr(ctx, "raw_tool_result", None)
                    or ""
                )
                handler.client.log("tool_end", {"output": _truncate(result)})

        elif on is not None and InterceptionPoint is not None:
            try:
                pre_step_point = getattr(InterceptionPoint, "PRE_STEP", None)
                if pre_step_point is not None:

                    @on(pre_step_point)
                    def _pre_step(ctx: Any) -> None:
                        if getattr(ctx, "kind", None) != "task":
                            return
                        agent_role = getattr(ctx, "agent_role", None) or "agent"
                        step_name = getattr(ctx, "step_name", None) or "crew-task"
                        handler.client.log(
                            "chain_start", {"chain": {"name": step_name}}
                        )
                        handler.client.log(
                            "llm_start",
                            {
                                "serialized": {"name": agent_role},
                                "prompts": [_truncate(getattr(ctx, "payload", ""))],
                            },
                        )

                post_step_point = getattr(InterceptionPoint, "POST_STEP", None)
                if post_step_point is not None:

                    @on(post_step_point)
                    def _post_step(ctx: Any) -> None:
                        if getattr(ctx, "kind", None) != "task":
                            return
                        output = getattr(ctx, "payload", None)
                        raw = getattr(output, "raw", None) or _truncate(output)
                        handler.client.log("llm_end", {"response": raw})
                        handler.client.log("chain_end", {"outputs": {"result": raw}})

                pre_tool_point = getattr(InterceptionPoint, "PRE_TOOL_CALL", None)
                if pre_tool_point is not None:

                    @on(pre_tool_point)
                    def _pre_tool(ctx: Any) -> None:
                        tool_name = getattr(ctx, "tool_name", "unknown")
                        tool_input = getattr(ctx, "tool_input", {})
                        handler.client.log(
                            "tool_start",
                            {
                                "tool": {"name": tool_name},
                                "input": _truncate(tool_input),
                            },
                        )

                post_tool_point = getattr(InterceptionPoint, "POST_TOOL_CALL", None)
                if post_tool_point is not None:

                    @on(post_tool_point)
                    def _post_tool(ctx: Any) -> None:
                        tool_name = getattr(ctx, "tool_name", "unknown")
                        result = getattr(ctx, "tool_result", None) or ""
                        handler.client.log("tool_end", {"output": _truncate(result)})

            except Exception:
                pass

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def close(self) -> None:
        """Stop the background flush thread and send remaining events."""
        self.client.close()

    def __enter__(self) -> MIMORICrewAIHandler:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
