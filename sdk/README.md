# MIMORI SDK

Python package for sending AI agent telemetry to MIMORI. Works with any framework via drop-in handlers or manual logging.

## Install

```bash
pip install -e ./sdk
```

Run from the cloned repository root. These examples target the source SDK; verify a published package's version and features separately. For development and tests:

```bash
pip install -e './sdk[dev]'
```

Install only the framework extras you need, preferably in a separate environment per agent. Some framework dependencies conflict when combined; there is no shared lockfile for all optional adapters. The commands here use pip (`uv pip install` also supports these source installs).

## Quick Start

```python
from mimori import MIMORIClient

client = MIMORIClient(
    api_key="mmr_dev_...",
    agent_name="my-agent",
    api_url="http://localhost:3000",
)

client.log("llm_start", {"serialized": {"name": "gpt-4o"}, "prompts": ["Hello!"]})
client.log("llm_end", {"response": "Hi there!"})
client.close()
```

## Framework Integrations

MIMORI provides 16 Python framework/provider adapters, a Vercel AI SDK source adapter, and direct instrumentation. Each handler translates the lifecycle hooks it observes into MIMORI telemetry events. See the [integration matrix and verification scope](../docs/integrations.md): adapter mapping tests do not prove native compatibility with every upstream version.

For a framework-independent starting point, run the [custom Python or Node.js examples](examples/README.md). Guardrails and Laya are optional capabilities rather than additional framework integrations.

| Framework | Handler | Install | Event Mapping |
|-----------|---------|---------|---------------|
| [LangChain](#langchain) | `MIMORIHandler` | `pip install -e './sdk[langchain]'` | Callbacks |
| [CrewAI](#crewai) | `MIMORICrewAIHandler` | `pip install -e './sdk[crewai]'` | `@on` hooks |
| [AutoGen / AG2](#autogen--ag2) | `MIMORIAutoGenHandler` | `pip install -e './sdk[autogen]'` | `register_hook()` |
| [LlamaIndex](#llamaindex) | `MIMORILlamaIndexHandler` | `pip install -e './sdk[llama-index]'` | `BaseCallbackHandler` |
| [DSPy](#dspy) | `MIMORIDSPyHandler` | `pip install -e './sdk[dspy]'` | `BaseCallback` |
| [OpenAI Agents SDK](#openai-agents-sdk) | `MIMORIOpenAIAgentsHandler` | `pip install -e './sdk[openai-agents]'` | `TracingProcessor` |
| [Smolagents](#smolagents) | `MIMORISmolagentsHandler` | `pip install -e './sdk[smolagents]'` | `step_callbacks` |
| [Pydantic AI](#pydantic-ai) | `MIMORIPydanticAIHandler` | `pip install -e './sdk[pydantic-ai]'` | `Hooks` capability |
| [LangGraph](#langgraph) | `MIMORILangGraphHandler` | `pip install -e './sdk[langgraph]'` | Extends LangChain + `GraphCallbackHandler` |
| [Google ADK](#google-adk) | `MIMORIGoogleADKHandler` | `pip install -e './sdk[google-adk]'` | Agent callbacks |
| [Semantic Kernel](#semantic-kernel) | `MIMORISemanticKernelHandler` | `pip install -e './sdk[semantic-kernel]'` | Filter middleware |
| [Haystack](#haystack) | `MIMORIHaystackHandler` | `pip install -e './sdk[haystack]'` | `@hook` decorator |
| [MetaGPT](#metagpt) | `MIMORIMetaGPTHandler` | `pip install -e './sdk[metagpt]'` | Subclass wrapping |
| [Agno (Phidata)](#agno-phidata) | `MIMORIAgnoHandler` | `pip install -e './sdk[agno]'` | Pre/post hooks + tool middleware |
| [Composio](#composio) | `MIMORIComposioHandler` | `pip install -e './sdk[composio]'` | `@before/after_execute` |
| [Anthropic Claude](#anthropic-claude-sdk) | `MIMORIAnthropicHandler` | `pip install -e './sdk[anthropic]'` | Client wrapper |
| [Vercel AI SDK (JS)](#vercel-ai-sdk) | `MIMORIVercelAIHandler` | Copy `sdk/mimori/vercel-ai-handler.js` as `.mjs` | `generateTextConfig()` |
| [Active Guardrails & Laya](#laya-enhanced-guardrails) | `MIMORIGuardrail` | `pip install -e './sdk[laya]'` | Pre-execution firewall |
| [Direct / Manual SDK](#manual-logging) | `MIMORIClient` / `log_event` | `pip install -e ./sdk` | Python REST client |

### LangChain

Install the adapter and current agent API from the repository root:

```bash
pip install -e './sdk[langchain]' 'langchain>=1,<2'
```

```python
import os
from langchain.agents import create_agent
from mimori import MIMORIHandler

agent = create_agent(model="openai:gpt-4.1-mini", tools=tools)
with MIMORIHandler(
    api_key=os.environ["MIMORI_API_KEY"],
    agent_name="my-agent",
    api_url="http://localhost:3000",
) as handler:
    result = agent.invoke(
        {"messages": [{"role": "user", "content": "Hello"}]},
        config={"callbacks": [handler]},
    )
# Flushes remaining telemetry on exit.
```

Use your existing `tools` and model configuration. This OpenAI example requires `langchain-openai` and `OPENAI_API_KEY`. Attach callbacks through invocation config so model and tool events propagate through the agent. For legacy `AgentExecutor`, pass the same invocation config to `invoke`.

Try the [runnable synthetic fintech example](examples/README.md) without a cloud model key.

### CrewAI

```python
from mimori import MIMORICrewAIHandler

handler = MIMORICrewAIHandler(
    api_key="mmr_dev_...",
    agent_name="my-crew",
    api_url="http://localhost:3000",
)

# Handler registers global @on hooks automatically
# Just run your crew normally
result = crew.kickoff()

handler.close()
```

### AutoGen / AG2

```python
from mimori import MIMORIAutoGenHandler

handler = MIMORIAutoGenHandler(
    api_key="mmr_dev_...",
    agent_name="my-agent",
    api_url="http://localhost:3000",
)

# Register hooks on each agent
handler.register(assistant_agent)
handler.register(user_proxy)

# Run your conversation
assistant_agent.initiate_chat(user_proxy, message="Hello!")

handler.close()
```

### LlamaIndex

```python
from llama_index.core.callbacks import CallbackManager
from mimori import MIMORILlamaIndexHandler

handler = MIMORILlamaIndexHandler(
    api_key="mmr_dev_...",
    agent_name="my-index",
    api_url="http://localhost:3000",
)

# Set globally
from llama_index.core import Settings
Settings.callback_manager = CallbackManager([handler])

# Or per-operation
query_engine = index.as_query_engine(callback_manager=CallbackManager([handler]))
response = query_engine.query("What is MIMORI?")
```

### DSPy

```python
import dspy
from mimori import MIMORIDSPyHandler

handler = MIMORIDSPyHandler(
    api_key="mmr_dev_...",
    agent_name="my-dspy-agent",
    api_url="http://localhost:3000",
)

# Global
dspy.configure(callbacks=[handler])

# Or per-LM
lm = dspy.LM("openai/gpt-4o-mini", callbacks=[handler])

cot = dspy.ChainOfThought("question -> answer")
result = cot(question="What is 2+2?")
```

### OpenAI Agents SDK

```python
from agents import Runner, add_trace_processor, set_trace_processors
from mimori import MIMORIOpenAIAgentsHandler

handler = MIMORIOpenAIAgentsHandler(
    api_key="mmr_dev_...",
    agent_name="my-agent",
    api_url="http://localhost:3000",
)

# Add alongside default OpenAI exporter
add_trace_processor(handler)

# Or replace default
set_trace_processors([handler])

result = Runner.run_sync(agent, "Hello!")
```

### Smolagents

```python
from smolagents import CodeAgent
from mimori import MIMORISmolagentsHandler

handler = MIMORISmolagentsHandler(
    api_key="mmr_dev_...",
    agent_name="my-agent",
    api_url="http://localhost:3000",
)

agent = CodeAgent(
    tools=[...],
    model=model,
    step_callbacks=[handler.step_callback],
    before_tool_call_hooks=[handler.tool_hook],
)

result = agent.run("Do something")
handler.close()
```

### Pydantic AI

```python
from pydantic_ai import Agent
from mimori import MIMORIPydanticAIHandler

handler = MIMORIPydanticAIHandler(
    api_key="mmr_dev_...",
    agent_name="my-agent",
    api_url="http://localhost:3000",
)

agent = Agent("openai:gpt-4o", capabilities=[handler.hooks])
result = agent.run_sync("Hello!")
handler.close()
```

### LangGraph

```python
from mimori import MIMORILangGraphHandler

handler = MIMORILangGraphHandler(
    api_key="mmr_dev_...",
    agent_name="my-graph",
    api_url="http://localhost:3000",
)

# Pass via config at invocation time
result = graph.invoke(input, config={"callbacks": [handler]})

# Or attach to compiled graph
compiled = graph.compile().with_config(callbacks=[handler])
result = compiled.invoke(input)
```

### Google ADK

```python
from mimori import MIMORIGoogleADKHandler

handler = MIMORIGoogleADKHandler(
    api_key="mmr_dev_...",
    agent_name="my-adk-agent",
    api_url="http://localhost:3000",
)

# Attach all callbacks at once
agent = handler.apply(agent)

# Or individually
agent = LlmAgent(
    name="my_agent",
    model="gemini-2.0-flash",
    before_model_callback=handler.before_model,
    after_model_callback=handler.after_model,
    before_tool_callback=handler.before_tool,
    after_tool_callback=handler.after_tool,
)
```

### Semantic Kernel

```python
from semantic_kernel import Kernel
from mimori import MIMORISemanticKernelHandler

handler = MIMORISemanticKernelHandler(
    api_key="mmr_dev_...",
    agent_name="my-sk-agent",
    api_url="http://localhost:3000",
)

kernel = Kernel()
handler.apply(kernel)

result = await kernel.invoke_prompt("Hello!")
handler.close()
```

### Haystack

```python
from haystack.components.agents import Agent
from mimori import MIMORIHaystackHandler

handler = MIMORIHaystackHandler(
    api_key="mmr_dev_...",
    agent_name="my-agent",
    api_url="http://localhost:3000",
)

agent = Agent(
    chat_generator=OpenAIChatGenerator(model="gpt-4o"),
    tools=[my_tool],
    hooks=handler.hooks_dict(),
)

result = agent.run(messages=[ChatMessage.from_user("Hello!")])
handler.close()
```

### MetaGPT

MetaGPT 0.8.2 pins an unavailable LanceDB release, so its normal optional-extra install currently fails upstream. The native Action test uses the explicit [dependency override](tests/native/metagpt-overrides.txt); it verifies Action wrapping only, not MetaGPT's LanceDB/RAG stack. See the [version matrix](../docs/integrations.md).

```python
from mimori import MIMORIMetaGPTHandler

handler = MIMORIMetaGPTHandler(
    api_key="mmr_dev_...",
    agent_name="my-metagpt-agent",
    api_url="http://localhost:3000",
)

# Use the action decorator
@handler.wrap_action
class MyAction(Action):
    async def run(self, *args, **kwargs):
        return await super().run(*args, **kwargs)

handler.close()
```

### Agno (Phidata)

```python
from agno.agent import Agent
from mimori import MIMORIAgnoHandler

handler = MIMORIAgnoHandler(
    api_key="mmr_dev_...",
    agent_name="my-agent",
    api_url="http://localhost:3000",
)

# Attach all hooks at once
agent = handler.apply(agent)

# Or individually
agent = Agent(
    model=...,
    tools=[...],
    pre_hooks=[handler.pre_hook],
    post_hooks=[handler.post_hook],
    tool_hooks=[handler.tool_middleware],
)

agent.print_response("Hello!")
handler.close()
```

### Composio

```python
from composio import Composio
from mimori import MIMORIComposioHandler

handler = MIMORIComposioHandler(
    api_key="mmr_dev_...",
    agent_name="my-agent",
    api_url="http://localhost:3000",
)

composio = Composio()
result = composio.tools.execute(
    slug="GITHUB_CREATE_ISSUE",
    arguments={"title": "Bug", "body": "..."},
    user_id="user-123",
    modifiers=handler.modifiers(),
)

handler.close()
```

### Anthropic Claude SDK

```python
import anthropic
from mimori import MIMORIAnthropicHandler

handler = MIMORIAnthropicHandler(
    api_key="mmr_dev_...",
    agent_name="my-agent",
    api_url="http://localhost:3000",
)

# Wrap the client
client = handler.wrap(anthropic.Anthropic())

# Use normally — telemetry is captured
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=256,
    messages=[{"role": "user", "content": "Hello!"}],
)

handler.close()
```

### Vercel AI SDK

For TypeScript and JavaScript agents using the Vercel AI SDK, copy `sdk/mimori/vercel-ai-handler.js` into your project as `mimori-vercel-ai.mjs`. This adapter is distributed as a source file; there is no published npm SDK package:

```javascript
import { MIMORIVercelAIHandler } from "./mimori-vercel-ai.mjs";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const handler = new MIMORIVercelAIHandler({
  apiKey: "mmr_dev_...",
  agentName: "my-vercel-agent",
  apiUrl: "http://localhost:3000",
});

const result = await generateText({
  model: openai("gpt-4o"),
  prompt: "Hello!",
  ...handler.generateTextConfig(),
});
await handler.close(); // Drain pending telemetry before process shutdown.
```

**Payload truncation (`MAX_PAYLOAD_CHARS`):** the Vercel AI handler truncates
each captured string to `MAX_PAYLOAD_CHARS` (default `2000`, exported from
the copied handler module). Python framework handlers truncate at `100_000`
chars per string (`_truncate(value, limit=100_000)`; `MIMORIConfig`
documents `max_payload_chars` defaulting to `100_000`). The budgets
intentionally differ by runtime (browser/edge payloads vs. server-side
Python) — do not assume parity.

## Active Guardrails

Check known threat patterns before tool execution by explicitly wrapping each protected tool. These checks have limited coverage and must be evaluated against your workloads:

```python
from mimori import MIMORIGuardrail, SecurityViolation

guard = MIMORIGuardrail(mode="block")

# Protect a tool function
@guard.protect_tool
def execute_database_query(sql: str):
    return db.query(sql)

# Evaluate prompt directly (bounded regex pass; no timing guarantee)
verdict = guard.evaluate(user_prompt)
if not verdict.allowed:
    print(f"Blocked: {verdict.reason}")
```

### Tool-response review and task authorization

For indirect prompt injection, review external content against the original task before the agent reads it. The opt-in semantic path reviews every response and blocks failed reviews in block mode:

```python
from mimori import MIMORIGuardrail, OllamaSecurityReviewer

guard = MIMORIGuardrail(mode="block")
reviewer = OllamaSecurityReviewer(model="llama3.1:latest", timeout=120)  # Local model must be installed.
guard.verify_tool_response(
    tool_output,
    user_request=original_user_request,  # From trusted application task state.
    reviewer=reviewer,
    tool_name="read_page",
)
```

Use `protect_tool_result` to review a read tool's return value, and `protect_tool(..., authorize=...)` or `ToolCapabilityPolicy` to check action permissions before execution. A semantic allow decision does not authorize a new action. LangChain and LangGraph handlers accept opt-in review and authorization configuration; telemetry-only use retains its existing behavior. See [setup, examples, and measured limits](../docs/tool-response-security.md).

`LayeredSecurityReviewer(semantic=reviewer, laya=LayaSecurityReviewer())` optionally adds the experimental local Laya checkpoint. It requires real model inference, refuses heuristic fallback, and keeps semantic review mandatory. Either layer may block; failures are evaluation errors. Benchmark recall, false positives and latency before enabling it. See [Laya setup and the independent-layer comparison](../docs/tool-response-security.md#add-the-experimental-laya-layer).

For a task-aware checkpoint, use `LayaSecurityReviewer.from_policy(path)` with its calibration policy. This requires matching task schema, complete context and the calibrated checkpoint's weights hash. See [task-aware training, calibration and local serving](../docs/laya-task-training.md).

### Laya-Enhanced Guardrails

Enable the optional [Laya](https://github.com/NandhaKishorM/laya) classifier for an additional signal beyond regex. Model scores are not validated or calibrated for your workload; evaluate the model before using its output to block wrapped operations.

```bash
pip install -e './sdk[laya]'
```

```python
from mimori import MIMORIGuardrail, LayaClassifier

# Quick start — uses default Laya at localhost:5050
guard = MIMORIGuardrail(mode="block", use_classifier=True)

# Custom classifier configuration
guard = MIMORIGuardrail(
    mode="block",
    use_classifier=True,
    classifier=LayaClassifier(
        base_url="http://my-laya-host:5050",
        model="convaiinnovations/laya-large",
        threshold=0.8,   # Minimum classifier score to block (default: 0.75)
        timeout=2.0,     # Request timeout in seconds (default: 2.0)
    ),
)

# Regex checks known patterns first; Laya classifies remaining inputs
verdict = guard.evaluate(user_prompt)
```

**How it works:** `evaluate()` first runs regex rules over overlapping chunks of the input, with normalized views for instruction patterns. Inputs over 1,000,000 characters return a violation; block mode prevents wrapped tool execution. Matches spanning more than the 2,500-character overlap can require custom validation. If no regex match is found and `use_classifier=True`, it calls the optional Laya service. The bundled service uses a heuristic fallback unless a compatible checkpoint is supplied. If the service is unreachable, an otherwise unmatched input is allowed; existing regex matches and evaluation limits still apply.

## Manual Logging

For frameworks without a built-in handler, use the manual logging helper:

```python
from mimori import log_event

log_event(
    api_key="mmr_dev_...",
    agent_name="my-custom-agent",
    event_type="tool_start",
    payload={"tool": {"name": "calculator"}, "input": "2 + 2"},
    api_url="http://localhost:3000",
)
```

**Client caching:** Each unique `(api_key, agent_name, session_id, api_url)` combination creates a cached `MIMORIClient` with a background flush thread. Clients are flushed and closed on process exit via `atexit`. If you call `log_event()` with many different `session_id` values, each creates a separate background thread.

## Event Payload Schemas

If you are logging manually, use these recommended JSON structures for the `payload` object to ensure events render correctly in the dashboard:

| Event Type | Expected `payload` Keys | Example |
|------------|------------------------|---------|
| `llm_start` | `serialized` (dict), `prompts` (list) | `{"serialized": {"name": "gpt-4o"}, "prompts": ["Hello!"]}` |
| `llm_end` | `response` (any) | `{"response": "Hi there!"}` |
| `tool_start` | `tool` (dict), `input` (any) | `{"tool": {"name": "calculator"}, "input": "2 + 2"}` |
| `tool_end` | `output` (any) | `{"output": "4"}` |
| `chain_start` | `chain` (dict), `inputs` (dict) | `{"chain": {"name": "my-chain"}, "inputs": {"query": "test"}}` |
| `chain_end` | `outputs` (dict) | `{"outputs": {"answer": "result"}}` |
| `agent_action` | `action` (any) | `{"action": "Agent decided to use calculator"}` |
| `manual` | Freeform | `{"message": "Agent workflow started."}` |

The SDK batches telemetry in a background thread and fails open if MIMORI is unreachable. It is designed to avoid disrupting agent execution, so it must not be the sole audit trail for security-critical operations.
