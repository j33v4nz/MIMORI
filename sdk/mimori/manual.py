"""Framework-agnostic manual telemetry helpers for custom agent runtimes."""

from __future__ import annotations

import atexit
import collections
import hashlib
import threading
from typing import Any

from mimori.client import EventType, MIMORIClient

MAX_CACHED_CLIENTS = 128
_clients: collections.OrderedDict[tuple, MIMORIClient] = collections.OrderedDict()
_clients_lock = threading.Lock()


def _close_all_clients() -> None:
    """Flush and close all cached clients on process exit."""
    with _clients_lock:
        while _clients:
            _, client = _clients.popitem()
            try:
                client.close()
            except Exception:  # noqa: BLE001
                pass


atexit.register(_close_all_clients)


def log_event(
    api_key: str,
    agent_name: str,
    event_type: EventType,
    payload: dict[str, Any],
    api_url: str = "http://localhost:3000",
    session_id: str | None = None,
    framework: str | None = None,
    timeout: float = 2.0,
) -> None:
    """Send a single event without requiring LangChain.

    This helper still fails open: network/API errors are logged once by the
    client and never raised into customer code. Uses a background thread to
    prevent blocking.

    Args:
        api_key: MIMORI API key for authentication.
        agent_name: Logical name of the AI agent.
        event_type: One of the supported event types.
        payload: Event-specific data dictionary.
        api_url: Base URL of the MIMORI server.
        session_id: Optional session identifier.
        framework: Optional agent framework name.
        timeout: HTTP request timeout in seconds.
    """
    key = (hashlib.sha256(api_key.encode()).hexdigest()[:16], agent_name, session_id, api_url)
    with _clients_lock:
        if key in _clients:
            _clients.move_to_end(key)
            client = _clients[key]
        else:
            # Evict oldest client if capacity reached to avoid memory/thread leaks
            if len(_clients) >= MAX_CACHED_CLIENTS:
                _, old_client = _clients.popitem(last=False)
                try:
                    old_client.close()
                except Exception:  # noqa: BLE001
                    pass

            client = MIMORIClient(
                api_key=api_key,
                agent_name=agent_name,
                api_url=api_url,
                session_id=session_id,
                framework=framework,
                timeout=timeout,
                auto_start=True,
            )
            _clients[key] = client

    client.log(event_type, payload)
