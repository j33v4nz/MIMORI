from __future__ import annotations

import responses

from mimori import MIMORIHandler


@responses.activate
def test_handler_captures_all_callbacks(handler: MIMORIHandler) -> None:
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 7, "session_id": "sess_handler", "immediate_detections": []},
        status=202,
    )

    handler.on_llm_start({"id": ["model"]}, ["hello"])
    handler.on_llm_end(type("Resp", (), {"generations": [["ok"]]})())
    handler.on_tool_start({"name": "search"}, "latest docs")
    handler.on_tool_end("search results")
    handler.on_chain_start({"name": "qa"}, {"query": "test"})
    handler.on_chain_end({"result": "answer"})
    handler.on_agent_action({"tool": "search", "tool_input": "latest docs"})

    handler.client.flush()

    assert len(responses.calls) == 1
    body = responses.calls[0].request.body
    assert b'"event_type": "llm_start"' in body
    assert b'"event_type": "llm_end"' in body
    assert b'"event_type": "tool_start"' in body
    assert b'"event_type": "tool_end"' in body
    assert b'"event_type": "chain_start"' in body
    assert b'"event_type": "chain_end"' in body
    assert b'"event_type": "agent_action"' in body


@responses.activate
def test_handler_session_id(handler: MIMORIHandler) -> None:
    assert handler.session_id == "sess_handler"


@responses.activate
def test_handler_close(handler: MIMORIHandler) -> None:
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_handler", "immediate_detections": []},
        status=202,
    )
    handler.on_llm_start({"id": ["model"]}, ["test"])
    handler.close()
    assert not handler.client._thread.is_alive()


def test_safe_response_with_dict_method() -> None:
    from mimori.handler import _safe_response

    class FakePydanticV1:
        def dict(self) -> dict:
            return {"v1": True}

    assert _safe_response(FakePydanticV1()) == {"v1": True}


def test_safe_response_with_model_dump() -> None:
    from mimori.handler import _safe_response

    class FakePydanticV2:
        def model_dump(self) -> dict:
            return {"v2": True}

    assert _safe_response(FakePydanticV2()) == {"v2": True}


def test_safe_response_plain_object() -> None:
    from mimori.handler import _safe_response

    obj = "plain string"
    assert _safe_response(obj) == "plain string"


# ---------------------------------------------------------------------------
# New tests — error callbacks
# ---------------------------------------------------------------------------


@responses.activate
def test_handler_captures_error_callbacks(handler: MIMORIHandler) -> None:
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 3, "session_id": "sess_handler", "immediate_detections": []},
        status=202,
    )

    handler.on_llm_error(RuntimeError("llm爆了"))
    handler.on_tool_error(ValueError("tool坏"))
    handler.on_chain_error(Exception("chain挂"))

    handler.client.flush()

    assert len(responses.calls) == 1
    body = responses.calls[0].request.body
    assert b'"event_type": "llm_end"' in body
    assert b'"event_type": "tool_end"' in body
    assert b'"event_type": "chain_end"' in body
    assert b'llm' in body
    assert b'tool' in body
    assert b'chain' in body


@responses.activate
def test_handler_error_callback_includes_error_message(handler: MIMORIHandler) -> None:
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_handler", "immediate_detections": []},
        status=202,
    )

    handler.on_llm_error(RuntimeError("something broke"))

    handler.client.flush()

    body = responses.calls[0].request.body
    assert b'"error": "something broke"' in body
