"""Anthropic Claude SDK integration for MIMORI telemetry.

The ``anthropic`` package has no native callback system.  This handler
provides a wrapper class that intercepts ``client.messages.create()``
and ``client.messages.stream()`` calls.
"""

from __future__ import annotations

from typing import Any

from mimori.client import MIMORIClient


def _truncate(value: Any, limit: int = 100_000) -> str:
    text = str(value) if value is not None else ""
    return text[:limit] if len(text) > limit else text


def _extract_prompt(kwargs: dict[str, Any]) -> str:
    system_val = kwargs.get("system")
    system_text = ""
    if system_val:
        if isinstance(system_val, list):
            system_text = "\n".join(
                str(b.get("text", b)) if isinstance(b, dict) else str(getattr(b, "text", b))
                for b in system_val
            )
        else:
            system_text = str(system_val)

    messages = kwargs.get("messages", [])
    last_msg = ""
    if messages:
        last = messages[-1]
        if isinstance(last, dict):
            content = last.get("content", "")
            last_msg = content if isinstance(content, str) else str(content)
        else:
            last_msg = str(last)

    if system_text and last_msg:
        return f"System: {system_text}\nHuman: {last_msg}"
    return system_text or last_msg


class MIMORIAnthropicHandler:
    """Anthropic Claude SDK wrapper for MIMORI telemetry.

    Wrap your ``anthropic.Anthropic`` or ``anthropic.AsyncAnthropic`` client::

        import anthropic
        from mimori import MIMORIAnthropicHandler

        handler = MIMORIAnthropicHandler(api_key="...", agent_name="...")
        client = handler.wrap(anthropic.Anthropic())

        # Use the wrapped client normally — telemetry is captured automatically
        response = client.messages.create(
            model="claude-sonnet-4-6",
            messages=[{"role": "user", "content": "Hello!"}],
        )

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
            framework="anthropic",
        )

    def wrap(self, anthropic_client: Any) -> Any:
        """Wrap an Anthropic client to capture telemetry.

        Returns a proxy that delegates all attributes to the original client
        but intercepts ``messages.create()`` and ``messages.stream()``.
        """
        handler = self
        original = anthropic_client

        class _WrappedMessages:
            def __init__(self, messages_resource: Any) -> None:
                self._messages = messages_resource

            def create(self, **kwargs: Any) -> Any:
                model = kwargs.get("model", "unknown")
                prompt_text = _extract_prompt(kwargs)
                handler._client.log(
                    "llm_start",
                    {"serialized": {"name": model}, "prompts": [_truncate(prompt_text)]},
                )
                response = self._messages.create(**kwargs)
                response_text = ""
                if hasattr(response, "content") and response.content:
                    response_text = "".join(
                        getattr(block, "text", str(block)) for block in response.content
                    )
                handler._client.log("llm_end", {"response": _truncate(response_text)})
                return response

            def stream(self, **kwargs: Any) -> Any:
                model = kwargs.get("model", "unknown")
                prompt_text = _extract_prompt(kwargs)
                handler._client.log(
                    "llm_start",
                    {"serialized": {"name": model}, "prompts": [_truncate(prompt_text)]},
                )

                # Wrap the stream context manager
                original_stream = self._messages.stream(**kwargs)

                class _StreamProxy:
                    def __init__(self, stream: Any) -> None:
                        self._stream = stream
                        self._texts: list[str] = []

                    def __enter__(self) -> _StreamProxy:
                        self._stream.__enter__()
                        return self

                    def __exit__(self, *args: Any) -> None:
                        self._stream.__exit__(*args)
                        combined = "".join(self._texts)
                        handler._client.log("llm_end", {"response": _truncate(combined)})

                    def __iter__(self) -> Any:
                        return self

                    def __next__(self) -> Any:
                        event = next(self._stream)
                        if hasattr(event, "type") and event.type == "content_block_delta":
                            delta = getattr(event, "delta", None)
                            if delta and hasattr(delta, "text"):
                                self._texts.append(delta.text)
                        return event

                    async def __aiter__(self) -> Any:
                        async for event in self._stream:
                            if hasattr(event, "type") and event.type == "content_block_delta":
                                delta = getattr(event, "delta", None)
                                if delta and hasattr(delta, "text"):
                                    self._texts.append(delta.text)
                            yield event
                        combined = "".join(self._texts)
                        handler._client.log("llm_end", {"response": _truncate(combined)})

                return _StreamProxy(original_stream)

            def __getattr__(self, name: str) -> Any:
                return getattr(self._messages, name)

        class _WrappedClient:
            def __init__(self) -> None:
                self.messages = _WrappedMessages(original.messages)

            def __getattr__(self, name: str) -> Any:
                return getattr(original, name)

        return _WrappedClient()

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> MIMORIAnthropicHandler:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
