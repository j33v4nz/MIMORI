"""Shared test fixtures for MIMORI SDK tests."""

from __future__ import annotations

import pytest

from mimori import MIMORIClient, MIMORIHandler
from mimori.client import MIMORIConfig
from mimori import manual as _manual


@pytest.fixture()
def client() -> MIMORIClient:
    """Return a fresh ``MIMORIClient`` with auto_start disabled."""
    return MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        batch_size=10,
        auto_start=False,
    )


@pytest.fixture()
def handler() -> MIMORIHandler:
    """Return a fresh ``MIMORIHandler`` with a large flush interval."""
    h = MIMORIHandler(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_handler",
        batch_size=10,
        flush_interval=60,
    )
    yield h
    h.close()


@pytest.fixture()
def config() -> MIMORIConfig:
    """Return a ``MIMORIConfig`` for testing the config-based constructor."""
    return MIMORIConfig(
        api_key="mmr_dev_config",
        agent_name="config-agent",
        session_id="sess_config",
        batch_size=5,
    )


@pytest.fixture(autouse=True)
def _clean_manual_clients():
    """Reset the manual module's client cache between tests."""
    yield
    with _manual._clients_lock:
        for c in _manual._clients.values():
            try:
                c.close()
            except Exception:
                pass
        _manual._clients.clear()
