"""Microsoft Semantic Kernel integration for MIMORI telemetry."""

from __future__ import annotations

from typing import Any, Callable

from mimori.client import MIMORIClient


def _truncate(value: Any, limit: int = 100_000) -> str:
    text = str(value) if value is not None else ""
    return text[:limit] if len(text) > limit else text


class MIMORISemanticKernelHandler:
    """Semantic Kernel filter-based handler that sends telemetry to MIMORI.

    Register as filters on your ``Kernel``::

        from semantic_kernel import Kernel
        from mimori import MIMORISemanticKernelHandler

        handler = MIMORISemanticKernelHandler(api_key="...", agent_name="...")
        kernel = Kernel()
        kernel.add_filter("function_invocation", handler.function_filter)
        kernel.add_filter("prompt_rendering", handler.prompt_filter)

    Or use :meth:`apply` to register all filters at once::

        handler.apply(kernel)

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
            framework="semantic-kernel",
        )

    def apply(self, kernel: Any) -> None:
        """Register MIMORI filters on a Semantic Kernel instance."""
        kernel.add_filter("function_invocation", self.function_filter)
        kernel.add_filter("prompt_rendering", self.prompt_filter)

    async def function_filter(self, context: Any, next: Callable) -> None:
        """Filter for every KernelFunction invocation — maps to tool_start/end."""
        func = getattr(context, "function", None)
        func_name = (
            f"{getattr(func, 'plugin_name', '')}.{getattr(func, 'name', 'unknown')}"
            if func
            else "unknown"
        )
        args = getattr(context, "arguments", {})
        self._client.log(
            "tool_start",
            {"tool": {"name": func_name}, "input": _truncate(str(args))},
        )

        await next(context)

        result = getattr(context, "result", None)
        self._client.log("tool_end", {"output": _truncate(str(result))})

    async def prompt_filter(self, context: Any, next: Callable) -> None:
        """Filter for prompt rendering — maps to llm_start/end."""
        func = getattr(context, "function", None)
        func_name = getattr(func, "name", "prompt") if func else "prompt"
        rendered = getattr(context, "rendered_prompt", "")
        self._client.log(
            "llm_start",
            {"serialized": {"name": func_name}, "prompts": [_truncate(rendered)]},
        )

        await next(context)

        result = getattr(context, "function_result", None)
        value = getattr(result, "value", str(result)) if result else ""
        self._client.log("llm_end", {"response": _truncate(str(value))})

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> MIMORISemanticKernelHandler:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
