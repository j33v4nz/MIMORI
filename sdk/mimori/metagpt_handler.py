"""MetaGPT integration for MIMORI telemetry.

MetaGPT has no native callback/hook system.  This handler provides a
base ``Action`` class that subclasses intercept LLM and tool calls.
"""

from __future__ import annotations

from typing import Any

from mimori.client import MIMORIClient


def _truncate(value: Any, limit: int = 100_000) -> str:
    text = str(value) if value is not None else ""
    return text[:limit] if len(text) > limit else text


class MIMORIMetaGPTHandler:
    """MetaGPT instrumentation handler for MIMORI.

    Since MetaGPT has no callback system, this handler provides:
    1. A ``wrap_action`` class decorator for intercepting ``Action.run()``
    2. A ``LoggedAction`` base class you can subclass instead of ``Action``

    Usage with decorator::

        from metagpt.actions.action import Action
        from mimori import MIMORIMetaGPTHandler

        handler = MIMORIMetaGPTHandler(api_key="...", agent_name="...")

        @handler.wrap_action
        class MyAction(Action):
            ...

    Usage with base class::

        from mimori.metagpt_handler import LoggedAction

        class MyAction(LoggedAction):
            async def run(self, *args, **kwargs):
                return await super().run(*args, **kwargs)

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
            framework="metagpt",
        )

    def wrap_action(self, action_cls: type) -> type:
        """Class decorator that wraps ``run()`` and ``_aask()`` with MIMORI telemetry."""
        handler = self
        original_run = action_cls.run
        original_aask = getattr(action_cls, "_aask", None)

        async def wrapped_run(self: Any, *args: Any, **kwargs: Any) -> Any:
            action_name = type(self).__name__
            handler._client.log("chain_start", {"chain": {"name": action_name}})
            try:
                result = await original_run(self, *args, **kwargs)
                handler._client.log("chain_end", {"outputs": _truncate(str(result))})
                return result
            except Exception:
                handler._client.log("chain_end", {"error": "action failed"})
                raise

        async def wrapped_aask(self: Any, prompt: Any, system_msgs: Any = None, **kwargs: Any) -> Any:
            handler._client.log(
                "llm_start",
                {
                    "serialized": {"name": type(self).__name__},
                    "prompts": [_truncate(str(prompt))],
                },
            )
            result = await original_aask(self, prompt, system_msgs=system_msgs, **kwargs)  # type: ignore[misc]
            handler._client.log("llm_end", {"response": _truncate(str(result))})
            return result

        action_cls.run = wrapped_run  # type: ignore[assignment]
        if original_aask is not None:
            action_cls._aask = wrapped_aask  # type: ignore[assignment]
        return action_cls

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> MIMORIMetaGPTHandler:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


class LoggedAction:
    """Base ``Action`` subclass with built-in MIMORI telemetry.

    Subclass this instead of ``metagpt.actions.action.Action``::

        from mimori.metagpt_handler import LoggedAction

        class MySearch(LoggedAction):
            async def run(self, query: str) -> str:
                # your logic here
                return "result"
    """

    _mimori_client: MIMORIClient | None = None

    @classmethod
    def set_mimori_client(cls, client: MIMORIClient) -> None:
        cls._mimori_client = client

    async def run(self, *args: Any, **kwargs: Any) -> Any:
        if self._mimori_client:
            self._mimori_client.log("chain_start", {"chain": {"name": type(self).__name__}})
        result = await self._original_run(*args, **kwargs)  # type: ignore[attr-defined]
        if self._mimori_client:
            self._mimori_client.log("chain_end", {"outputs": _truncate(str(result))})
        return result

    async def _aask(self, prompt: Any, system_msgs: Any = None, **kwargs: Any) -> Any:
        if self._mimori_client:
            self._mimori_client.log(
                "llm_start",
                {"serialized": {"name": type(self).__name__}, "prompts": [_truncate(str(prompt))]},
            )
        result = await self._original_aask(prompt, system_msgs=system_msgs, **kwargs)  # type: ignore[attr-defined]
        if self._mimori_client:
            self._mimori_client.log("llm_end", {"response": _truncate(str(result))})
        return result
