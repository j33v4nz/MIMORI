"""Comprehensive unit test coverage for all 15 Python SDK framework handlers."""

from __future__ import annotations

import asyncio
import json
import responses
import pytest
from types import SimpleNamespace
from unittest.mock import MagicMock, AsyncMock

from mimori.crewai_handler import MIMORICrewAIHandler
from mimori.autogen_handler import MIMORIAutoGenHandler
from mimori.llamaindex_handler import MIMORILlamaIndexHandler
from mimori.dspy_handler import MIMORIDSPyHandler
from mimori.openai_agents_handler import MIMORIOpenAIAgentsHandler
from mimori.smolagents_handler import MIMORISmolagentsHandler
from mimori.pydantic_ai_handler import MIMORIPydanticAIHandler
from mimori.langgraph_handler import MIMORILangGraphHandler
from mimori.google_adk_handler import MIMORIGoogleADKHandler
from mimori.semantic_kernel_handler import MIMORISemanticKernelHandler
from mimori.haystack_handler import MIMORIHaystackHandler
from mimori.metagpt_handler import MIMORIMetaGPTHandler
from mimori.agno_handler import MIMORIAgnoHandler
from mimori.composio_handler import MIMORIComposioHandler
from mimori.anthropic_handler import MIMORIAnthropicHandler


@responses.activate
def test_crewai_handler():
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 2, "session_id": "sess_crew", "immediate_detections": []},
        status=202,
    )
    with MIMORICrewAIHandler(
        api_key="mmr_dev_test", agent_name="crew-agent", session_id="sess_crew"
    ) as handler:
        assert handler.client.session_id == "sess_crew"
        handler.client.log("llm_start", {"prompts": ["crew prompt"]})
        handler.client.log("llm_end", {"response": "crew response"})
        handler.client.flush()

    assert len(responses.calls) == 1
    req_body = responses.calls[0].request.body.decode("utf-8")
    assert "crew prompt" in req_body


@responses.activate
def test_autogen_handler():
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_autogen", "immediate_detections": []},
        status=202,
    )
    mock_agent = MagicMock()
    with MIMORIAutoGenHandler(
        api_key="mmr_dev_test", agent_name="autogen-agent", session_id="sess_autogen"
    ) as handler:
        handler.register(mock_agent)
        assert mock_agent.register_hook.call_count >= 1
        handler.client.log("llm_start", {"prompts": ["autogen prompt"]})
        handler.client.flush()

    assert len(responses.calls) == 1
    assert b"autogen prompt" in responses.calls[0].request.body


@responses.activate
def test_llamaindex_handler():
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_llama", "immediate_detections": []},
        status=202,
    )
    with MIMORILlamaIndexHandler(
        api_key="mmr_dev_test", agent_name="llama-agent", session_id="sess_llama"
    ) as handler:
        handler.start_trace("trace-1")
        handler.on_event_start(
            event_type="query", payload={"query_str": "what is mimori"}
        )
        handler.on_event_end(
            event_type="query", payload={"response": "mimori is observability"}
        )
        handler.end_trace("trace-1")
        handler._client.flush()

    assert len(responses.calls) == 1
    assert b"what is mimori" in responses.calls[0].request.body


@responses.activate
def test_dspy_handler():
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_dspy", "immediate_detections": []},
        status=202,
    )
    with MIMORIDSPyHandler(
        api_key="mmr_dev_test", agent_name="dspy-agent", session_id="sess_dspy"
    ) as handler:
        handler.on_lm_start(
            call_id="call-1",
            instance=MagicMock(model="gpt-4o"),
            inputs={"prompt": "dspy prompt"},
        )
        handler.on_lm_end(call_id="call-1", outputs="dspy output", exception=None)
        handler.on_module_start(
            call_id="mod-1", instance=None, inputs={"query": "test"}
        )
        handler.on_module_end(call_id="mod-1", outputs={"result": "ok"}, exception=None)
        handler._client.flush()

    assert len(responses.calls) == 1
    assert b"dspy prompt" in responses.calls[0].request.body


@responses.activate
def test_openai_agents_handler():
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_oai", "immediate_detections": []},
        status=202,
    )
    with MIMORIOpenAIAgentsHandler(
        api_key="mmr_dev_test", agent_name="oai-agent", session_id="sess_oai"
    ) as handler:
        mock_trace = SimpleNamespace(trace_id="tr-1", name="root_trace")
        mock_span = SimpleNamespace(
            span_id="sp-1",
            span_data=SimpleNamespace(
                type="function", name="calc_tool", input="2+2", output="4"
            ),
        )
        handler.on_trace_start(mock_trace)
        handler.on_span_start(mock_span)
        handler.on_span_end(mock_span)
        handler.on_trace_end(mock_trace)
        handler.force_flush()
        handler.shutdown()

    # Background delivery may split a trace across HTTP batches. Verify all
    # callbacks arrive exactly once, independently of thread scheduling.
    batches = [json.loads(call.request.body) for call in responses.calls]
    assert batches
    assert all(batch["session_id"] == "sess_oai" for batch in batches)
    events = sorted(
        (event for batch in batches for event in batch["events"]),
        key=lambda event: event["sequence_number"],
    )
    assert [event["sequence_number"] for event in events] == [1, 2, 3, 4]
    assert [event["event_type"] for event in events] == [
        "chain_start",
        "tool_start",
        "tool_end",
        "chain_end",
    ]
    assert events[1]["payload"]["tool"]["name"] == "calc_tool"
    assert events[1]["payload"]["input"] == "2+2"
    assert events[2]["payload"]["output"] == "4"
    assert events[3]["payload"]["outputs"]["trace_id"] == "tr-1"


@responses.activate
def test_smolagents_handler():
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_smol", "immediate_detections": []},
        status=202,
    )
    with MIMORISmolagentsHandler(
        api_key="mmr_dev_test", agent_name="smol-agent", session_id="sess_smol"
    ) as handler:
        allowed = handler.tool_hook(tool_name="bash", arguments="ls -la", agent=None)
        assert allowed is True
        handler._client.flush()

    assert len(responses.calls) == 1
    assert b"bash" in responses.calls[0].request.body


@responses.activate
def test_pydantic_ai_handler():
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_pydantic", "immediate_detections": []},
        status=202,
    )
    with MIMORIPydanticAIHandler(
        api_key="mmr_dev_test", agent_name="pydantic-agent", session_id="sess_pydantic"
    ) as handler:
        assert handler.hooks is not None
        handler._client.log("llm_start", {"prompts": ["pydantic prompt"]})
        handler._client.flush()

    assert len(responses.calls) == 1
    assert b"pydantic prompt" in responses.calls[0].request.body


@responses.activate
def test_langgraph_handler():
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_lg", "immediate_detections": []},
        status=202,
    )
    with MIMORILangGraphHandler(
        api_key="mmr_dev_test", agent_name="lg-agent", session_id="sess_lg"
    ) as handler:
        mock_event = MagicMock(checkpoint_id="chk-123", interrupts=["approval_needed"])
        handler.on_interrupt(mock_event)
        handler.on_resume(mock_event)
        handler.client.flush()

    assert len(responses.calls) == 1
    assert b"chk-123" in responses.calls[0].request.body


@responses.activate
def test_google_adk_handler():
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_gadk", "immediate_detections": []},
        status=202,
    )
    with MIMORIGoogleADKHandler(
        api_key="mmr_dev_test", agent_name="gadk-agent", session_id="sess_gadk"
    ) as handler:
        mock_agent = MagicMock()
        handler.apply(mock_agent)
        assert mock_agent.before_agent_callback is not None

        mock_context = MagicMock(agent_name="gadk-agent")
        handler.before_agent(mock_context)
        handler.after_agent(mock_context)

        mock_req = MagicMock(
            model="gemini-2.0-flash",
            contents=[MagicMock(parts=[MagicMock(text="hello google")])],
        )
        mock_res = MagicMock(content=MagicMock(parts=[MagicMock(text="hello user")]))
        handler.before_model(mock_context, mock_req)
        handler.after_model(mock_context, mock_res)
        handler._client.flush()

    assert len(responses.calls) == 1
    assert b"hello google" in responses.calls[0].request.body


@responses.activate
def test_semantic_kernel_handler():
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_sk", "immediate_detections": []},
        status=202,
    )

    async def _run():
        with MIMORISemanticKernelHandler(
            api_key="mmr_dev_test", agent_name="sk-agent", session_id="sess_sk"
        ) as handler:
            mock_kernel = MagicMock()
            handler.apply(mock_kernel)
            assert mock_kernel.add_filter.call_count == 2

            mock_func = MagicMock()
            mock_func.plugin_name = "Search"
            mock_func.name = "Query"
            mock_ctx = MagicMock(
                function=mock_func, arguments={"q": "mimori"}, result="found"
            )
            mock_next = AsyncMock()
            await handler.function_filter(mock_ctx, mock_next)
            handler._client.flush()

    asyncio.run(_run())
    assert len(responses.calls) == 1
    assert b"Search.Query" in responses.calls[0].request.body


@responses.activate
def test_haystack_handler():
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_haystack", "immediate_detections": []},
        status=202,
    )
    with MIMORIHaystackHandler(
        api_key="mmr_dev_test", agent_name="haystack-agent", session_id="sess_haystack"
    ) as handler:
        hooks = handler.hooks_dict()
        assert "before_llm" in hooks
        mock_state = MagicMock(data={"messages": ["hello haystack"]})
        handler.before_llm(mock_state)
        handler.on_exit(mock_state)
        handler._client.flush()

    assert len(responses.calls) == 1
    assert b"hello haystack" in responses.calls[0].request.body


@responses.activate
def test_metagpt_handler():
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_metagpt", "immediate_detections": []},
        status=202,
    )

    async def _run():
        with MIMORIMetaGPTHandler(
            api_key="mmr_dev_test",
            agent_name="metagpt-agent",
            session_id="sess_metagpt",
        ) as handler:

            class DummyAction:
                async def run(self, *args, **kwargs):
                    return "dummy result"

            wrapped = handler.wrap_action(DummyAction)
            instance = wrapped()
            res = await instance.run()
            assert res == "dummy result"
            handler._client.flush()

    asyncio.run(_run())
    assert len(responses.calls) == 1
    assert b"DummyAction" in responses.calls[0].request.body


@responses.activate
def test_agno_handler():
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 1, "session_id": "sess_agno", "immediate_detections": []},
        status=202,
    )
    with MIMORIAgnoHandler(
        api_key="mmr_dev_test", agent_name="agno-agent", session_id="sess_agno"
    ) as handler:
        mock_agent = MagicMock(pre_hooks=[], post_hooks=[], tool_hooks=[])
        handler.apply(mock_agent)
        assert len(mock_agent.pre_hooks) == 1

        handler.pre_hook("agno input")
        handler.post_hook("agno output")
        handler._client.flush()

    assert len(responses.calls) == 1
    assert b"agno input" in responses.calls[0].request.body


@responses.activate
def test_composio_handler():
    with MIMORIComposioHandler(
        api_key="mmr_dev_test", agent_name="composio-agent", session_id="sess_composio"
    ) as handler:
        mods = handler.modifiers()
        assert len(mods) == 2


@responses.activate
def test_anthropic_handler():
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={
            "accepted": 1,
            "session_id": "sess_anthropic",
            "immediate_detections": [],
        },
        status=202,
    )
    with MIMORIAnthropicHandler(
        api_key="mmr_dev_test",
        agent_name="anthropic-agent",
        session_id="sess_anthropic",
    ) as handler:
        mock_client = MagicMock()
        mock_client.messages.create.return_value = MagicMock(
            content=[MagicMock(text="claude reply")]
        )
        wrapped = handler.wrap(mock_client)
        resp = wrapped.messages.create(
            model="claude-3-5-sonnet", messages=[{"role": "user", "content": "hi"}]
        )
        assert resp is not None
        handler._client.flush()

    assert len(responses.calls) == 1
    assert b"claude-3-5-sonnet" in responses.calls[0].request.body
