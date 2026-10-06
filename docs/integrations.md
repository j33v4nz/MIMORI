# Frameworks and custom runtimes

MIMORI's ingestion, detection, organization-scoped storage, and behavior comparison use a common event contract. A framework adapter translates the lifecycle events it can observe into that contract. Custom runtimes can use the Python client or send HTTP events directly; no LangChain dependency is required for these paths.

## Choose an integration

Install only the Python extra needed by your agent, in an isolated environment. Commands below run from the repository root. Each listed adapter ships in source; framework versions and hook coverage must be verified for your application.

| Framework / provider | Python extra | Adapter source |
| --- | --- | --- |
| LangChain | `langchain` | [MIMORIHandler](../sdk/mimori/handler.py) |
| LangGraph | `langgraph` | [MIMORILangGraphHandler](../sdk/mimori/langgraph_handler.py) |
| CrewAI | `crewai` | [MIMORICrewAIHandler](../sdk/mimori/crewai_handler.py) |
| AutoGen / AG2 | `autogen` | [MIMORIAutoGenHandler](../sdk/mimori/autogen_handler.py) |
| LlamaIndex | `llama-index` | [MIMORILlamaIndexHandler](../sdk/mimori/llamaindex_handler.py) |
| DSPy | `dspy` | [MIMORIDSPyHandler](../sdk/mimori/dspy_handler.py) |
| OpenAI Agents SDK | `openai-agents` | [MIMORIOpenAIAgentsHandler](../sdk/mimori/openai_agents_handler.py) |
| Smolagents | `smolagents` | [MIMORISmolagentsHandler](../sdk/mimori/smolagents_handler.py) |
| Pydantic AI | `pydantic-ai` | [MIMORIPydanticAIHandler](../sdk/mimori/pydantic_ai_handler.py) |
| Google ADK | `google-adk` | [MIMORIGoogleADKHandler](../sdk/mimori/google_adk_handler.py) |
| Semantic Kernel | `semantic-kernel` | [MIMORISemanticKernelHandler](../sdk/mimori/semantic_kernel_handler.py) |
| Haystack | `haystack` | [MIMORIHaystackHandler](../sdk/mimori/haystack_handler.py) |
| MetaGPT | `metagpt` | [MIMORIMetaGPTHandler](../sdk/mimori/metagpt_handler.py) |
| Agno | `agno` | [MIMORIAgnoHandler](../sdk/mimori/agno_handler.py) |
| Composio | `composio` | [MIMORIComposioHandler](../sdk/mimori/composio_handler.py) |
| Anthropic SDK | `anthropic` | [MIMORIAnthropicHandler](../sdk/mimori/anthropic_handler.py) |

Example: `pip install -e './sdk[crewai]'`. The [SDK guide](../sdk/README.md#framework-integrations) explains the hook/configuration for each adapter. Optional frameworks have incompatible dependency combinations; installing every extra in one environment is not a supported setup path.

### JavaScript and Vercel AI SDK

The [Vercel AI SDK adapter](../sdk/mimori/vercel-ai-handler.js) is a source module, not a published npm package. Copy it into your ESM project as `.mjs` and follow the [JavaScript integration guide](../sdk/README.md#vercel-ai-sdk). Verify the hook signatures for your installed AI SDK version. Its string truncation differs from the Python SDK, and it does not provide the Python SDK's recognized-value redaction.

### Custom Python

Install `pip install -e ./sdk`, then use `MIMORIClient` or `log_event` around your own model/tool loop. The client queues events, redacts recognized sensitive values, and flushes on context-manager exit. [Runnable custom Python example](../sdk/examples/manual_agent.py).

### Other languages and HTTP

Send an authenticated event envelope to `POST /api/ingest/event`. Supply an agent name, session ID, ordered event sequence numbers, and supported event types. Direct callers must sanitize data before sending it. [API contract](api-spec.md), [OpenAPI](openapi.yaml), and [runnable custom Node.js example](../sdk/examples/custom-agent.mjs).

## What has been verified

The native integration workflow installs each runtime in a separate CI job. Tests use real framework dispatchers; model/provider responses and the telemetry HTTP receiver are synthetic fixtures. This verifies attachment, dispatch, event mapping, and output preservation without provider credentials. It does not establish live provider availability or compatibility with every version.

| Runtime version checked | Native execution path |
| --- | --- |
| LangChain 1.4.3 | Current agent model/tool loop (dedicated CI job) |
| LangGraph 1.2.12 | Compiled state graph dispatch |
| CrewAI 1.15.23 | Native hook registry and tool execution |
| AG2 0.14.0 | ConversableAgent tool-call reply dispatch |
| LlamaIndex core 0.14.25 | MockLLM through native callback manager |
| DSPy 3.4.0 | Native Tool through callback context |
| OpenAI Agents 0.23.1 | Native trace/function spans |
| Smolagents 1.26.0 | ToolCallingAgent loop with scripted model |
| Pydantic AI slim 2.54.0 | Agent/TestModel model and tool loop |
| Google ADK 2.11.0 | Runner/LlmAgent loop with fixture BaseLlm |
| Semantic Kernel 1.44.1 | Kernel function/filter dispatch |
| Haystack 3.3.0 | Agent loop, native hooks, and fixture generator |
| MetaGPT 0.8.2 | Experimental native Action wrapper; override below |
| Agno 3.1.1 | Native FunctionCall/tool middleware |
| Composio 0.25.0 | Native modifier dispatcher; no connected account |
| Anthropic 1.11.0 | Real synchronous client with fixture HTTP transport |
| Vercel AI SDK 6.0.300 | generateText/tool loop with awaited delivery |

**AG2:** This adapter uses `autogen.ConversableAgent` in AG2 0.14.x. The extra is bounded below 1.0; AG2 1.x changed the package surface and is not validated by this adapter.

**MetaGPT:** Upstream 0.8.2 pins unavailable `lancedb==0.4.0`. The isolated Action test uses [an explicit override](../sdk/tests/native/metagpt-overrides.txt) to LanceDB 0.30.0. No LanceDB/RAG behavior is exercised. This is experimental wrapper evidence, not proof that the normal MetaGPT extra installs successfully. Existing MetaGPT applications can use the source wrapper with their resolved dependencies. Do not install all extras together.

- The SDK test suite exercises client delivery/redaction, guardrails, and adapter event mapping, with simulated framework objects and HTTP responses in many tests.
- The dedicated LangChain CI job exercises a current LangChain agent loop; the recorded local-model demo separately uses Ollama/Llama 3.1 with synthetic tools.
- Authenticated onboarding executes the custom Python and Node.js examples against the real local ingestion API and checks persisted events and tool results.
- Database gates exercise concurrent replay, a hard PostgreSQL crash, worker recovery, and backup/restore; browser checks exercise the authenticated detection recovery endpoint. See [durability](durability.md).
- These checks do not establish native compatibility with every release of every listed framework or live provider. A shipped adapter and a passing callback unit test are different from a live native integration test.

When reporting an integration problem, include the framework/version, Python or Node version, adapter hook, expected event, and redacted reproduction. Do not attach API keys or customer traces. Use the [integration issue template](../.github/ISSUE_TEMPLATE/integration.yml).

## Shared limits

Only instrumented events are visible. Telemetry is observational; enforcement requires explicitly wrapped SDK guardrails. Python redaction is pattern-based rather than exhaustive. Comparison sees recorded evidence, including any truncation or redaction, and cannot prove successful task execution. See [security boundaries](security-architecture.md) and [comparison limits](behavior-diff.md).
