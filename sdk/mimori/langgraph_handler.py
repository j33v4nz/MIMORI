"""LangGraph integration for MIMORI telemetry.

LangGraph extends LangChain callbacks.  This handler wraps the existing
``MIMORIHandler`` and adds LangGraph-specific ``GraphCallbackHandler``
support for interrupt/resume lifecycle events.
"""

from __future__ import annotations

from typing import Any

from mimori.client import MIMORIClient
from mimori.handler import MIMORIHandler

try:
    from langgraph.callbacks import GraphCallbackHandler
except ImportError:

    class GraphCallbackHandler:  # type: ignore[no-redef]
        pass


def _truncate(value: Any, limit: int = 100_000) -> str:
    text = str(value) if value is not None else ""
    return text[:limit] if len(text) > limit else text


class MIMORILangGraphHandler(MIMORIHandler, GraphCallbackHandler):
    """LangGraph + LangChain handler that sends telemetry to MIMORI.

    Extends both ``MIMORIHandler`` (LangChain callbacks) and
    ``GraphCallbackHandler`` (LangGraph interrupt/resume lifecycle).

    Attach via config at invocation time::

        from mimori import MIMORILangGraphHandler

        handler = MIMORILangGraphHandler(api_key="...", agent_name="...")
        result = graph.invoke(input, config={"callbacks": [handler]})

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
        **kwargs: Any,
    ) -> None:
        # Initialize both parent classes
        MIMORIHandler.__init__(
            self,
            api_key=api_key,
            agent_name=agent_name,
            api_url=api_url,
            session_id=session_id,
        )
        # GraphCallbackHandler has no __init__ args in the fallback

    # -- LangGraph-specific lifecycle hooks --

    def on_interrupt(self, event: Any) -> None:
        """Fires when a LangGraph graph pauses via ``interrupt()``."""
        checkpoint_id = getattr(event, "checkpoint_id", "")
        interrupts = getattr(event, "interrupts", ())
        payload = {
            "action": f"graph_interrupt checkpoint={checkpoint_id}",
            "interrupts": [_truncate(str(i)) for i in interrupts[:5]],
        }
        self.client.log("agent_action", payload)

    def on_resume(self, event: Any) -> None:
        """Fires when a LangGraph graph resumes from an interrupt."""
        checkpoint_id = getattr(event, "checkpoint_id", "")
        self.client.log(
            "agent_action",
            {"action": f"graph_resume checkpoint={checkpoint_id}"},
        )
