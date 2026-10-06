"""Exercise real LangChain agent callbacks, beyond manually invoked hooks."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest
import responses

agents = pytest.importorskip("langchain.agents")
if not hasattr(agents, "create_agent"):
    pytest.skip(
        "The current agent integration requires LangChain 1.x", allow_module_level=True
    )

spec = importlib.util.spec_from_file_location(
    "fintech_example", Path(__file__).parents[1] / "examples" / "fintech_langchain.py"
)
assert spec and spec.loader
example = importlib.util.module_from_spec(spec)
spec.loader.exec_module(example)


@pytest.mark.parametrize("candidate", [False, True])
@responses.activate
def test_current_agent_propagates_model_and_tool_callbacks(monkeypatch, candidate):
    monkeypatch.setenv("MIMORI_API_KEY", "test-only-key")
    monkeypatch.setenv("MIMORI_API_URL", "http://localhost:3000")
    events = []

    def accept(request):
        batch = json.loads(request.body)["events"]
        events.extend(batch)
        return 202, {}, json.dumps({"accepted": len(batch)})

    responses.add_callback(
        responses.POST, "http://localhost:3000/api/ingest/event", callback=accept
    )
    result = example.run_scenario(candidate=candidate)
    assert sum(e["event_type"] == "llm_start" for e in events) == 2
    assert sum(e["event_type"] == "llm_end" for e in events) == 2
    assert sum(e["event_type"] == "tool_end" for e in events) == (3 if candidate else 2)
    assert sorted(e["sequence_number"] for e in events) == list(
        range(1, len(events) + 1)
    )
    assert {e["event_type"] for e in events} == {
        "chain_start",
        "chain_end",
        "llm_start",
        "llm_end",
        "tool_start",
        "tool_end",
    }
    starts = [e for e in events if e["event_type"] == "tool_start"]
    assert {e["payload"]["tool"]["name"] for e in starts} == set(
        result["tools_executed"]
    )
    assert len(starts) == (3 if candidate else 2)
    message_inputs = [
        e["payload"]["inputs"]["messages"]
        for e in events
        if e["event_type"] == "chain_start"
        and isinstance(e["payload"]["inputs"], dict)
        and "messages" in e["payload"]["inputs"]
    ]
    assert message_inputs
    assert all(
        isinstance(message, dict) for group in message_inputs for message in group
    )
    encoded = json.dumps(events)
    assert "ghp_" + "A" * 36 not in encoded
    assert "synthetic.customer@example.invalid" not in encoded
    if candidate:
        assert "credential_exposure" in encoded
        assert "DROP TABLE customers" in encoded
