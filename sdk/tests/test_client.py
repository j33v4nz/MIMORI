from __future__ import annotations

import logging
import queue
import time

import pytest
import requests
import responses

from mimori import MIMORIClient, log_event
from mimori.client import MIMORIConfig, _json_safe

# ---------------------------------------------------------------------------
# Existing tests (updated to use conftest fixtures where appropriate)
# ---------------------------------------------------------------------------


@responses.activate
def test_client_batches_events(client: MIMORIClient) -> None:
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 2, "session_id": "sess_test", "immediate_detections": []},
        status=202,
    )

    client.log("llm_start", {"prompt": "hello"})
    client.log("tool_start", {"tool_name": "search", "input": "hello"})
    client.flush()

    assert len(responses.calls) == 1
    request = responses.calls[0].request
    assert request.headers["Authorization"] == "Bearer mmr_dev_test"
    assert b'"agent_name": "test-agent"' in request.body
    assert b'"sequence_number": 1' in request.body
    assert b'"sequence_number": 2' in request.body


@responses.activate
def test_manual_log_event_posts_single_event() -> None:
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_manual", "immediate_detections": []},
        status=202,
    )

    log_event(
        api_key="mmr_dev_test",
        agent_name="manual-agent",
        session_id="sess_manual",
        event_type="manual",
        payload={"message": "hello"},
    )

    import mimori.manual

    import hashlib

    hashed = hashlib.sha256("mmr_dev_test".encode()).hexdigest()[:16]
    key = (hashed, "manual-agent", "sess_manual", "http://localhost:3000")
    if key in mimori.manual._clients:
        mimori.manual._clients[key].flush()

    assert len(responses.calls) == 1
    assert b'"event_type": "manual"' in responses.calls[0].request.body


@responses.activate
def test_client_fails_open_on_network_error(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="MIMORI")
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        body=requests.ConnectionError("down"),
    )
    client = MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        auto_start=False,
    )

    client.log("llm_start", {"prompt": "hello"})
    client.flush()

    assert "MIMORI telemetry failed" in caplog.text


# ---------------------------------------------------------------------------
# New tests — retry logic
# ---------------------------------------------------------------------------


@responses.activate
def test_client_retries_on_connection_error() -> None:
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        body=requests.ConnectionError("fail 1"),
    )
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        body=requests.ConnectionError("fail 2"),
    )
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_test", "immediate_detections": []},
        status=202,
    )
    client = MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        auto_start=False,
        timeout=1,
    )

    client.log("llm_start", {"prompt": "retry me"})
    client.flush()

    assert len(responses.calls) == 3
    assert responses.calls[2].request.headers["Authorization"] == "Bearer mmr_dev_test"


# ---------------------------------------------------------------------------
# New tests — 429 rate limiting
# ---------------------------------------------------------------------------


@responses.activate
def test_client_retries_on_429(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="MIMORI")
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"error": "rate limited"},
        status=429,
    )
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_test", "immediate_detections": []},
        status=202,
    )
    client = MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        auto_start=False,
        timeout=1,
    )

    client.log("llm_start", {"prompt": "rate limit me"})
    client.flush()

    assert len(responses.calls) == 2
    second_resp = responses.calls[1].response
    assert second_resp.status_code == 202


# ---------------------------------------------------------------------------
# New tests — _json_safe
# ---------------------------------------------------------------------------


def test_json_safe_primitives() -> None:
    assert _json_safe(None) is None
    assert _json_safe("hello") == "hello"
    assert _json_safe(42) == 42
    assert _json_safe(3.14) == 3.14
    assert _json_safe(True) is True


def test_json_safe_nested_structures() -> None:
    data = {"a": [1, 2, {"b": "c"}], "d": (3, 4)}
    result = _json_safe(data)
    assert result == {"a": [1, 2, {"b": "c"}], "d": [3, 4]}


def test_json_safe_circular_reference() -> None:
    a: dict = {"x": 1}
    a["self"] = a
    result = _json_safe(a)
    assert result["x"] == 1
    assert result["self"] == "<circular reference>"


def test_json_safe_max_depth() -> None:
    deep: dict = {"level": 0}
    current = deep
    for i in range(110):
        current["next"] = {"level": i + 1}
        current = current["next"]
    result = _json_safe(deep)
    assert result["level"] == 0
    # Navigate deep enough that values become "<max depth reached>"
    node = result
    for _ in range(200):
        if not isinstance(node, dict) or "next" not in node:
            break
        node = node["next"]
    assert node == "<max depth reached>"


def test_json_safe_unknown_type() -> None:
    result = _json_safe(object())
    assert isinstance(result, str)
    assert "object" in result


def test_json_safe_set() -> None:
    result = _json_safe({1, 2, 3})
    assert isinstance(result, list)
    assert sorted(result) == [1, 2, 3]


def test_json_safe_bytes() -> None:
    result = _json_safe(b"hello")
    assert isinstance(result, str)


# ---------------------------------------------------------------------------
# New tests — queue-full drop
# ---------------------------------------------------------------------------


def test_client_drops_on_full_queue(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="MIMORI")
    client = MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        max_queue_size=2,
        auto_start=False,
    )

    client.log("llm_start", {"prompt": "1"})
    client.log("llm_start", {"prompt": "2"})
    client.log("llm_start", {"prompt": "3"})

    assert "MIMORI event queue is full" in caplog.text
    assert client._events.qsize() == 2


# ---------------------------------------------------------------------------
# New tests — close() drain
# ---------------------------------------------------------------------------


@responses.activate
def test_close_drains_remaining_events() -> None:
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 3, "session_id": "sess_test", "immediate_detections": []},
        status=202,
    )
    client = MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        auto_start=False,
    )

    client.log("llm_start", {"prompt": "a"})
    client.log("tool_start", {"tool": "b"})
    client.log("manual", {"data": "c"})
    client.close()

    assert len(responses.calls) == 1
    assert b'"sequence_number": 1' in responses.calls[0].request.body
    assert b'"sequence_number": 3' in responses.calls[0].request.body


# ---------------------------------------------------------------------------
# New tests — start() idempotency
# ---------------------------------------------------------------------------


def test_start_is_idempotent() -> None:
    client = MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        auto_start=False,
    )
    client.start()
    thread1 = client._thread
    client.start()
    thread2 = client._thread
    assert thread1 is thread2
    client.close()


# ---------------------------------------------------------------------------
# New tests — _warn_once deduplication
# ---------------------------------------------------------------------------


def test_warn_once_deduplicates(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="MIMORI")
    client = MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        auto_start=False,
    )

    client._warn_once("first warning")
    client._warn_once("second warning")
    client._warn_once("third warning")

    count = caplog.text.count("first warning")
    assert count == 1


# ---------------------------------------------------------------------------
# New tests — MIMORIConfig constructor
# ---------------------------------------------------------------------------


@responses.activate
def test_client_from_config(config: MIMORIConfig) -> None:
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_config", "immediate_detections": []},
        status=202,
    )
    client = MIMORIClient(config=config, auto_start=False)

    assert client.config.api_key == "mmr_dev_config"
    assert client.config.agent_name == "config-agent"
    assert client.session_id == "sess_config"

    client.log("manual", {"msg": "from config"})
    client.flush()

    assert len(responses.calls) == 1
    assert b'"agent_name": "config-agent"' in responses.calls[0].request.body
    client.close()


# ---------------------------------------------------------------------------
# New tests — session_id property
# ---------------------------------------------------------------------------


def test_session_id_auto_generated() -> None:
    client = MIMORIClient(
        api_key="key",
        agent_name="agent",
        auto_start=False,
    )
    assert client.session_id.startswith("sess_")
    client.close()


def test_session_id_explicit() -> None:
    client = MIMORIClient(
        api_key="key",
        agent_name="agent",
        session_id="my-session",
        auto_start=False,
    )
    assert client.session_id == "my-session"
    client.close()


# ---------------------------------------------------------------------------
# New tests — flush on empty queue
# ---------------------------------------------------------------------------


@responses.activate
def test_flush_on_empty_queue_makes_no_request() -> None:
    client = MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        auto_start=False,
    )
    client.flush()
    assert len(responses.calls) == 0
    client.close()


# ---------------------------------------------------------------------------
# New tests — sequence numbers increment
# ---------------------------------------------------------------------------


def test_sequence_numbers_increment() -> None:
    client = MIMORIClient(
        api_key="key",
        agent_name="agent",
        auto_start=False,
    )
    n1 = client._next_sequence_number()
    n2 = client._next_sequence_number()
    n3 = client._next_sequence_number()
    assert n1 == 1
    assert n2 == 2
    assert n3 == 3
    client.close()


# ---------------------------------------------------------------------------
# New tests — context manager
# ---------------------------------------------------------------------------


@responses.activate
def test_context_manager_enter_exit() -> None:
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_test", "immediate_detections": []},
        status=202,
    )
    with MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        auto_start=False,
    ) as client:
        client.log("manual", {"msg": "in context"})
        client.flush()
    assert len(responses.calls) == 1


def test_context_manager_returns_self() -> None:
    client = MIMORIClient(
        api_key="key",
        agent_name="agent",
        auto_start=False,
    )
    with client as ctx:
        assert ctx is client
    client.close()


# ---------------------------------------------------------------------------
# New tests — 429 silent drop warning
# ---------------------------------------------------------------------------


@responses.activate
def test_client_warns_on_429_final_retry(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="MIMORI")
    for _ in range(3):
        responses.add(
            responses.POST,
            "http://localhost:3000/api/ingest/event",
            json={"error": "rate limited"},
            status=429,
        )
    client = MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        auto_start=False,
        timeout=1,
    )

    client.log("llm_start", {"prompt": "rate limit me"})
    client.flush()

    assert len(responses.calls) == 3
    assert "MIMORI batch dropped" in caplog.text
    client.close()


# ---------------------------------------------------------------------------
# New tests — 429 warning deduplication
# ---------------------------------------------------------------------------


@responses.activate
def test_429_warning_deduplication(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="MIMORI")
    for _ in range(6):
        responses.add(
            responses.POST,
            "http://localhost:3000/api/ingest/event",
            json={"error": "rate limited"},
            status=429,
        )
    client = MIMORIClient(
        api_key="mmr_dev_test",
        agent_name="test-agent",
        session_id="sess_test",
        auto_start=False,
        timeout=1,
    )

    client.log("llm_start", {"prompt": "1"})
    client.flush()
    client.log("llm_start", {"prompt": "2"})
    client.flush()

    assert caplog.text.count("MIMORI batch dropped") == 1
    client.close()
