"""MIMORI Connector Agent — bridges LangChain agents to MIMORI telemetry.

Creates MIMORIHandler instances for each agent and manages lifecycle.
"""

from __future__ import annotations

import os
import sys
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk"))

from mimori.handler import MIMORIHandler
from mimori.client import MIMORIClient
from examples.multiagent.config import MIMORI_API_KEY, MIMORI_API_URL


class MIMORIConnector:
    """Manages MIMORI telemetry connections for all agents in the system."""

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self._handlers: dict[str, MIMORIHandler] = {}
        self._clients: dict[str, MIMORIClient] = {}

    def get_handler(self, agent_name: str) -> MIMORIHandler:
        """Get or create a MIMORIHandler for a specific agent."""
        if agent_name not in self._handlers:
            self._handlers[agent_name] = MIMORIHandler(
                api_key=MIMORI_API_KEY,
                agent_name=agent_name,
                api_url=MIMORI_API_URL,
                session_id=f"{self.session_id}_{agent_name}",
                flush_interval=0.5,
                batch_size=10,
            )
        return self._handlers[agent_name]

    def get_client(self, agent_name: str) -> MIMORIClient:
        """Get or create a raw MIMORIClient for non-LangChain logging."""
        if agent_name not in self._clients:
            self._clients[agent_name] = MIMORIClient(
                api_key=MIMORI_API_KEY,
                agent_name=agent_name,
                api_url=MIMORI_API_URL,
                session_id=f"{self.session_id}_{agent_name}",
                framework="multi-agent-system",
                flush_interval=0.5,
                batch_size=10,
            )
        return self._clients[agent_name]

    def close(self) -> None:
        """Flush and close all connections."""
        for handler in self._handlers.values():
            handler.close()
        for client in self._clients.values():
            client.close()

    def __enter__(self) -> MIMORIConnector:
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()
