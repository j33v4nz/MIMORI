"""Composio integration for MIMORI telemetry."""

from __future__ import annotations

from typing import Any

from mimori.client import MIMORIClient

try:
    from composio import before_execute, after_execute
except ImportError:

    def before_execute(*a: Any, **kw: Any) -> Any:  # type: ignore[misc]
        def decorator(fn: Any) -> Any:
            return fn

        return decorator

    def after_execute(*a: Any, **kw: Any) -> Any:  # type: ignore[misc]
        def decorator(fn: Any) -> Any:
            return fn

        return decorator


def _truncate(value: Any, limit: int = 100_000) -> str:
    text = str(value) if value is not None else ""
    return text[:limit] if len(text) > limit else text


class MIMORIComposioHandler:
    """Composio modifier-based handler for MIMORI telemetry.

    Composio operates at the tool-execution layer only (not agent/LLM level).
    This handler creates ``@before_execute`` / ``@after_execute`` modifiers
    that you pass when executing tools::

        from mimori import MIMORIComposioHandler

        handler = MIMORIComposioHandler(api_key="...", agent_name="...")
        result = composio.tools.execute(
            slug="GITHUB_CREATE_ISSUE",
            arguments={...},
            user_id="user-123",
            modifiers=handler.modifiers(),
        )

    Note: Composio modifiers are **tool-level only**.  LLM call telemetry
    must be captured by the underlying agent framework's handler.

    Args:
        api_key: MIMORI API key.
        agent_name: Logical agent name.
        api_url: MIMORI server URL.
        session_id: Optional session identifier.
        toolkit_filter: Optional list of toolkit slugs to monitor.
            If ``None``, monitors all toolkits.
    """

    def __init__(
        self,
        api_key: str,
        agent_name: str,
        api_url: str = "http://localhost:3000",
        session_id: str | None = None,
        toolkit_filter: list[str] | None = None,
    ) -> None:
        self._client = MIMORIClient(
            api_key=api_key,
            agent_name=agent_name,
            api_url=api_url,
            session_id=session_id,
            framework="composio",
        )
        self._toolkit_filter = toolkit_filter

    def modifiers(self) -> list[Any]:
        """Return a list of ``@before_execute`` / ``@after_execute`` modifiers."""
        handler = self
        tk_filter = self._toolkit_filter

        @before_execute(toolkits=tk_filter or [])
        def _before(tool: str, toolkit: str, params: dict[str, Any]) -> dict[str, Any]:
            if tk_filter and toolkit not in tk_filter:
                return params
            handler._client.log(
                "tool_start",
                {
                    "tool": {"name": f"{toolkit}/{tool}"},
                    "input": _truncate(str(params.get("arguments", {}))),
                },
            )
            return params

        @after_execute(toolkits=tk_filter or [])
        def _after(tool: str, toolkit: str, response: dict[str, Any]) -> dict[str, Any]:
            if tk_filter and toolkit not in tk_filter:
                return response
            handler._client.log(
                "tool_end",
                {
                    "output": _truncate(
                        str(response.get("data", response.get("error", "")))
                    )
                },
            )
            return response

        return [_before, _after]

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> MIMORIComposioHandler:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
