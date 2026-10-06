"""LlamaIndex integration for MIMORI telemetry."""

from __future__ import annotations

from typing import Any

from mimori.client import MIMORIClient

try:
    from llama_index.core.callbacks.base_handler import BaseCallbackHandler
    from llama_index.core.callbacks import CBEventType
except ImportError:

    class BaseCallbackHandler:  # type: ignore[no-redef]
        def __init__(self, *a: Any, **kw: Any) -> None:
            self.event_starts_to_ignore = kw.get("event_starts_to_ignore", [])
            self.event_ends_to_ignore = kw.get("event_ends_to_ignore", [])

    class CBEventType:  # type: ignore[no-redef]
        LLM = "llm"
        QUERY = "query"
        RETRIEVE = "retrieve"
        AGENT_STEP = "agent_step"


def _truncate(value: Any, limit: int = 100_000) -> str:
    text = str(value) if value is not None else ""
    return text[:limit] if len(text) > limit else text


class MIMORILlamaIndexHandler(BaseCallbackHandler):
    """LlamaIndex callback handler that sends telemetry to MIMORI.

    Attach via ``CallbackManager``::

        from llama_index.core.callbacks import CallbackManager
        from mimori import MIMORILlamaIndexHandler

        handler = MIMORILlamaIndexHandler(api_key="...", agent_name="...")
        manager = CallbackManager([handler])
        Settings.callback_manager = manager

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
        event_starts_to_ignore: list[Any] | None = None,
        event_ends_to_ignore: list[Any] | None = None,
    ) -> None:
        super().__init__(
            event_starts_to_ignore=event_starts_to_ignore or [],
            event_ends_to_ignore=event_ends_to_ignore or [],
        )
        self._client = MIMORIClient(
            api_key=api_key,
            agent_name=agent_name,
            api_url=api_url,
            session_id=session_id,
            framework="llama-index",
        )

    # -- BaseCallbackHandler interface -----------------------------------

    def start_trace(self, trace_id: str | None = None) -> None:
        self._client.log(
            "chain_start", {"chain": {"name": trace_id or "llama-index-trace"}}
        )

    def end_trace(
        self,
        trace_id: str | None = None,
        trace_map: dict[str, list[str]] | None = None,
    ) -> None:
        self._client.log("chain_end", {"outputs": {"trace_id": trace_id}})

    def on_event_start(
        self,
        event_type: Any,
        payload: dict[str, Any] | None = None,
        event_id: str = "",
        parent_id: str = "",
        **kwargs: Any,
    ) -> str:
        payload = payload or {}
        et = str(event_type).lower()

        if "llm" in et:
            prompts = payload.get(
                "prompts", payload.get("messages", payload.get("formatted_prompt", []))
            )
            self._client.log(
                "llm_start",
                {
                    "serialized": {"name": payload.get("model", "llm")},
                    "prompts": [
                        _truncate(p)
                        for p in (prompts if isinstance(prompts, list) else [prompts])
                    ],
                },
            )
        elif "query" in et or "retrieve" in et:
            self._client.log(
                "chain_start",
                {"chain": {"name": f"query:{payload.get('query_str', '')[:100]}"}},
            )
        elif "agent" in et:
            self._client.log("agent_action", {"action": _truncate(payload)})

        return event_id

    def on_event_end(
        self,
        event_type: Any,
        payload: dict[str, Any] | None = None,
        event_id: str = "",
        **kwargs: Any,
    ) -> None:
        payload = payload or {}
        et = str(event_type).lower()

        if "llm" in et:
            response = payload.get("response", payload.get("completion", ""))
            self._client.log("llm_end", {"response": _truncate(response)})
        elif "query" in et or "retrieve" in et:
            self._client.log("chain_end", {"outputs": _truncate(payload)})

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> MIMORILlamaIndexHandler:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
