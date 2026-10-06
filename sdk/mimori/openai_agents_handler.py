"""OpenAI Agents SDK integration for MIMORI telemetry."""

from __future__ import annotations

from typing import Any

from mimori.client import MIMORIClient

try:
    from agents.tracing import TracingProcessor, Span
except ImportError:

    class TracingProcessor:  # type: ignore[no-redef]
        pass

    class Span:  # type: ignore[no-redef]
        pass


def _truncate(value: Any, limit: int = 100_000) -> str:
    text = str(value) if value is not None else ""
    return text[:limit] if len(text) > limit else text


class MIMORIOpenAIAgentsHandler(TracingProcessor):
    """OpenAI Agents SDK tracing processor that sends telemetry to MIMORI.

    Attach via ``set_trace_processors``::

        from agents import set_trace_processors
        from mimori import MIMORIOpenAIAgentsHandler

        handler = MIMORIOpenAIAgentsHandler(api_key="...", agent_name="...")
        set_trace_processors([handler])

    Or add alongside the default exporter::

        from agents import add_trace_processor
        add_trace_processor(handler)

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
            framework="openai-agents",
        )
        self._span_states: dict[str, str] = {}

    def on_trace_start(self, trace: Any) -> None:
        name = getattr(trace, "name", "openai-agents-trace")
        self._client.log("chain_start", {"chain": {"name": name}})

    def on_trace_end(self, trace: Any) -> None:
        self._client.log(
            "chain_end", {"outputs": {"trace_id": getattr(trace, "trace_id", "")}}
        )

    def on_span_start(self, span: Any) -> None:
        sd = getattr(span, "span_data", None)
        span_type = getattr(sd, "type", None) if sd else None

        if span_type == "generation":
            model = getattr(sd, "model", "unknown")
            self._client.log(
                "llm_start",
                {
                    "serialized": {"name": model},
                    "prompts": [_truncate(str(getattr(sd, "input", "")))],
                },
            )
        elif span_type == "function":
            tool_name = getattr(sd, "name", "unknown")
            self._client.log(
                "tool_start",
                {
                    "tool": {"name": tool_name},
                    "input": _truncate(str(getattr(sd, "input", ""))),
                },
            )
        elif span_type == "handoff":
            from_agent = getattr(sd, "from_agent", "unknown")
            to_agent = getattr(sd, "to_agent", "unknown")
            self._client.log(
                "agent_action",
                {"action": f"handoff: {from_agent} -> {to_agent}"},
            )

        self._span_states[getattr(span, "span_id", id(span))] = span_type or ""

    def on_span_end(self, span: Any) -> None:
        sd = getattr(span, "span_data", None)
        span_type = getattr(sd, "type", None) if sd else None
        span_id = getattr(span, "span_id", id(span))

        if span_type == "generation":
            output = getattr(sd, "output", "")
            self._client.log("llm_end", {"response": _truncate(str(output))})
        elif span_type == "function":
            output = getattr(sd, "output", "")
            self._client.log("tool_end", {"output": _truncate(str(output))})

        self._span_states.pop(span_id, None)

    def shutdown(self) -> None:
        self._client.close()

    def close(self) -> None:
        self.shutdown()

    def __enter__(self) -> MIMORIOpenAIAgentsHandler:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def force_flush(self) -> None:
        self._client.flush()
