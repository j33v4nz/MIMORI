"""Native framework dispatch tests. Only provider responses/telemetry HTTP are simulated.

Set MIMORI_NATIVE_FRAMEWORK to select a runtime; missing selected dependencies fail.
"""
import asyncio
import importlib
import json
import os

import pytest
import responses


def native(name, module):
    if name not in os.environ.get('MIMORI_NATIVE_FRAMEWORK', '').split(','):
        pytest.skip('Native runtime is checked in its isolated compatibility job')
    return importlib.import_module(module)


@pytest.fixture
def recorded():
    events = []
    def accept(request):
        body = json.loads(request.body)
        events.extend(body['events'])
        return 202, {}, json.dumps({'accepted': len(body['events'])})
    with responses.RequestsMock(assert_all_requests_are_fired=False) as mock:
        mock.add_callback('POST', 'http://localhost:3000/api/ingest/event', callback=accept)
        yield events


def handler(cls):
    return cls(api_key='native-test-only', agent_name='native-runtime')


def types(events):
    return {e['event_type'] for e in events}


def test_langgraph_dispatch(recorded):
    graph = native('langgraph', 'langgraph.graph')
    from mimori import MIMORILangGraphHandler
    builder = graph.StateGraph(dict)
    builder.add_node('balance', lambda state: {'balance': 1250})
    builder.add_edge(graph.START, 'balance')
    builder.add_edge('balance', graph.END)
    with handler(MIMORILangGraphHandler) as h:
        assert builder.compile().invoke({}, config={'callbacks': [h]})['balance'] == 1250
    assert {'chain_start', 'chain_end'} <= types(recorded)


def test_pydantic_ai_dispatch(recorded):
    framework = native('pydantic-ai', 'pydantic_ai')
    from pydantic_ai.models.test import TestModel
    from mimori import MIMORIPydanticAIHandler
    with handler(MIMORIPydanticAIHandler) as h:
        agent = framework.Agent(TestModel(), capabilities=[h.hooks])
        @agent.tool_plain
        def balance() -> int:
            return 1250
        result = agent.run_sync('Check balance')
        assert '1250' in str(result.output)
    assert {'llm_start', 'llm_end', 'tool_start', 'tool_end'} <= types(recorded)


def test_llama_index_dispatch(recorded):
    native('llama-index', 'llama_index.core')
    from llama_index.core.llms import MockLLM
    from llama_index.core.callbacks import CallbackManager
    from mimori import MIMORILlamaIndexHandler
    with handler(MIMORILlamaIndexHandler) as h:
        result = MockLLM(callback_manager=CallbackManager([h])).complete('Check balance')
        assert result.text
    assert {'llm_start', 'llm_end'} <= types(recorded)


def test_openai_agents_dispatch(recorded):
    sdk = native('openai-agents', 'agents')
    from mimori import MIMORIOpenAIAgentsHandler
    with handler(MIMORIOpenAIAgentsHandler) as h:
        sdk.set_trace_processors([h])
        with sdk.trace('balance-review'):
            with sdk.function_span('balance', input='{}') as span:
                span.span_data.output = '1250'
        h.force_flush()
        sdk.set_trace_processors([])
    assert {'chain_start', 'chain_end', 'tool_start', 'tool_end'} <= types(recorded)


def test_anthropic_dispatch(recorded):
    sdk = native('anthropic', 'anthropic')
    httpx = importlib.import_module('httpx2' if 'httpx2' in sdk.DefaultHttpxClient.__mro__[1].__module__ else 'httpx')
    from mimori import MIMORIAnthropicHandler
    response = {'id': 'msg_fixture', 'type': 'message', 'role': 'assistant', 'model': 'fixture',
                'content': [{'type': 'text', 'text': '1250'}], 'stop_reason': 'end_turn',
                'stop_sequence': None, 'usage': {'input_tokens': 4, 'output_tokens': 1}}
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=response))
    with handler(MIMORIAnthropicHandler) as h, httpx.Client(transport=transport) as http:
        client = h.wrap(sdk.Anthropic(api_key='provider-test-only', http_client=http))
        assert client.messages.create(model='fixture', max_tokens=8,
               messages=[{'role': 'user', 'content': 'balance'}]).content[0].text == '1250'
    assert {'llm_start', 'llm_end'} <= types(recorded)


def test_dspy_dispatch(recorded):
    sdk = native('dspy', 'dspy')
    from mimori import MIMORIDSPyHandler
    with handler(MIMORIDSPyHandler) as h:
        with sdk.context(callbacks=[h]):
            tool = sdk.Tool(lambda account: 1250, name='balance')
            assert tool(account='fixture') == 1250
    assert {'tool_start', 'tool_end'} <= types(recorded)


def test_smolagents_dispatch(recorded):
    sdk = native('smolagents', 'smolagents')
    from smolagents.models import ChatMessageToolCall, ChatMessageToolCallFunction
    from mimori import MIMORISmolagentsHandler
    class FixtureModel(sdk.Model):
        def generate(self, messages, **kwargs):
            return sdk.ChatMessage(role='assistant', content='', tool_calls=[ChatMessageToolCall(
                id='fixture', type='function', function=ChatMessageToolCallFunction(
                    name='final_answer', arguments={'answer': '1250'}))])
    with handler(MIMORISmolagentsHandler) as h:
        agent = sdk.ToolCallingAgent(tools=[], model=FixtureModel(),
                                     step_callbacks=[h.step_callback], max_steps=2)
        assert agent.run('Return fixture balance') == '1250'
    assert {'tool_start', 'tool_end', 'agent_action'} <= types(recorded)


def test_haystack_dispatch(recorded):
    sdk = native('haystack', 'haystack')
    from haystack.components.agents import Agent
    from haystack.dataclasses import ChatMessage, ToolCall
    from haystack.tools import Tool
    from haystack.hooks import hook
    from mimori import MIMORIHaystackHandler
    @sdk.component
    class FixtureGenerator:
        @sdk.component.output_types(replies=list[ChatMessage])
        def run(self, messages: list[ChatMessage], tools=None):
            if any(m.is_from('tool') for m in messages):
                return {'replies': [ChatMessage.from_assistant('1250')]}
            return {'replies': [ChatMessage.from_assistant(tool_calls=[ToolCall(
                tool_name='balance', arguments={}, id='fixture')])]}
    with handler(MIMORIHaystackHandler) as h:
        agent = Agent(chat_generator=FixtureGenerator(), tools=[Tool(name='balance',
            description='Fixture', parameters={'type':'object','properties':{}}, function=lambda:1250)],
            hooks=h.hooks_dict(),
            max_agent_steps=3)
        result = agent.run(messages=[ChatMessage.from_user('Check balance')])
        assert result['messages'][-1].text == '1250'
    assert {'llm_start', 'llm_end', 'tool_start', 'tool_end'} <= types(recorded)


def test_composio_modifier_dispatch(recorded):
    native('composio', 'composio')
    from composio.core.models._modifiers import apply_modifier_by_type
    from mimori import MIMORIComposioHandler
    with handler(MIMORIComposioHandler) as h:
        mods = h.modifiers()
        request = apply_modifier_by_type(modifiers=mods, toolkit='fixture', tool='BALANCE',
            type='before_execute', request={'arguments':{}})
        assert request == {'arguments':{}}
        response = apply_modifier_by_type(modifiers=mods, toolkit='fixture', tool='BALANCE',
            type='after_execute', response={'data':{'balance':1250}})
        assert response['data']['balance'] == 1250
    assert {'tool_start', 'tool_end'} <= types(recorded)


def test_crewai_hook_dispatch(recorded):
    native('crewai', 'crewai')
    from crewai.hooks.tool_hooks import ToolCallHookContext, run_before_tool_call_hooks, run_after_tool_call_hooks
    from crewai.tools import tool
    from mimori import MIMORICrewAIHandler
    @tool('balance')
    def balance() -> str:
        """Fixture balance."""
        return '1250'
    with handler(MIMORICrewAIHandler):
        context = ToolCallHookContext(tool_name='balance', tool_input={}, tool=balance)
        assert not run_before_tool_call_hooks(context)
        context.tool_result = balance.run()
        run_after_tool_call_hooks(context)
        assert context.tool_result == '1250'
    assert {'tool_start', 'tool_end'} <= types(recorded)


def test_google_adk_dispatch(recorded):
    native('google-adk', 'google.adk')
    from google.adk.agents import LlmAgent
    from google.adk.models.base_llm import BaseLlm
    from google.adk.models.llm_response import LlmResponse
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types as genai
    from mimori import MIMORIGoogleADKHandler
    class FixtureLlm(BaseLlm):
        async def generate_content_async(self, llm_request, stream=False):
            called = any(p.function_response for c in llm_request.contents for p in c.parts)
            part = genai.Part(text='1250') if called else genai.Part(
                function_call=genai.FunctionCall(name='balance', args={}))
            yield LlmResponse(content=genai.Content(role='model', parts=[part]))
    def balance() -> int:
        """Fixture balance."""
        return 1250
    async def run(h):
        agent = h.apply(LlmAgent(name='fixture', model=FixtureLlm(model='fixture'), tools=[balance]))
        sessions = InMemorySessionService()
        await sessions.create_session(app_name='fixture', user_id='fixture', session_id='fixture')
        runner = Runner(app_name='fixture', agent=agent, session_service=sessions)
        events = [e async for e in runner.run_async(user_id='fixture', session_id='fixture',
            new_message=genai.Content(role='user', parts=[genai.Part(text='Check balance')]))]
        assert any(e.is_final_response() for e in events)
    with handler(MIMORIGoogleADKHandler) as h:
        asyncio.run(run(h))
    assert {'chain_start', 'chain_end', 'llm_start', 'llm_end', 'tool_start', 'tool_end'} <= types(recorded)


def test_metagpt_action_dispatch(recorded):
    native('metagpt', 'metagpt')
    from metagpt.actions.action import Action
    from mimori import MIMORIMetaGPTHandler
    with handler(MIMORIMetaGPTHandler) as h:
        @h.wrap_action
        class Balance(Action):
            async def run(self, *args, **kwargs):
                return '1250'
        assert asyncio.run(Balance().run()) == '1250'
    assert {'chain_start', 'chain_end'} <= types(recorded)


def test_semantic_kernel_dispatch(recorded):
    sdk = native('semantic-kernel', 'semantic_kernel')
    from semantic_kernel.functions import kernel_function
    from mimori import MIMORISemanticKernelHandler
    class Account:
        @kernel_function(name='balance')
        def balance(self) -> int:
            return 1250
    with handler(MIMORISemanticKernelHandler) as h:
        kernel = sdk.Kernel()
        kernel.add_plugin(Account(), plugin_name='account')
        h.apply(kernel)
        assert str(asyncio.run(kernel.invoke(plugin_name='account', function_name='balance'))) == '1250'
    assert {'tool_start', 'tool_end'} <= types(recorded)


def test_autogen_dispatch(recorded):
    sdk = native('autogen', 'autogen')
    from mimori import MIMORIAutoGenHandler
    with handler(MIMORIAutoGenHandler) as h:
        agent = sdk.ConversableAgent('balance', llm_config=False, code_execution_config=False,
                                     function_map={'balance': lambda: 1250})
        h.register(agent)
        success, result = agent.generate_tool_calls_reply(messages=[{'role':'assistant',
            'tool_calls':[{'id':'fixture','type':'function','function':{'name':'balance','arguments':'{}'}}]}])
        assert success and '1250' in str(result['content'])
    assert {'tool_start', 'tool_end'} <= types(recorded)


def test_agno_dispatch(recorded):
    native('agno', 'agno')
    from agno.tools.function import Function, FunctionCall
    from mimori import MIMORIAgnoHandler
    with handler(MIMORIAgnoHandler) as h:
        fn = Function.from_callable(lambda: 1250, name='balance')
        fn.tool_hooks = [h.tool_middleware]
        call = FunctionCall(function=fn, arguments={})
        call.execute()
        assert call.result == 1250
    assert {'tool_start', 'tool_end'} <= types(recorded)
