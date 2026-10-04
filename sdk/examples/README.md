# Agent and runtime examples

Choose an example independently of your agent framework. All account data and tools below are synthetic; no banking connection or money movement is involved. First start MIMORI, sign in, and generate your own API key.

## Custom Python (no framework)

```bash
pip install -e ./sdk
read -rsp 'MIMORI API key: ' MIMORI_API_KEY; echo
export MIMORI_API_KEY
export MIMORI_API_URL=http://localhost:3000
python sdk/examples/manual_agent.py
```

[manual_agent.py](manual_agent.py) executes a Python tool and records four chain/tool lifecycle events through the base client. The context manager flushes telemetry; check **Agents → custom-python-agent** to confirm persistence. It does not invoke an LLM.

## Custom Node.js (direct HTTP)

With Node.js 22 and the same API environment variables:

```bash
node sdk/examples/custom-agent.mjs
```

[custom-agent.mjs](custom-agent.mjs) executes a JavaScript tool, sends four events to the ingestion API, and checks the accepted count. Inspect **Agents → custom-node-agent**. Direct HTTP callers must sanitize their own telemetry; this example uses inert data and provides no general-purpose scrubber.

## LangChain fintech walkthrough

For a live local Llama 3.1 model through Ollama, use [fintech_ollama.py](fintech_ollama.py) with the [live-model setup instructions](../../docs/demo-video/README.md#run-the-live-model-example). The walkthrough below uses a scripted model for repeatability.

This example uses LangChain 1.x's real agent loop and tools with a scripted model and synthetic account data. It needs no cloud model key. It queries no financial database, sends no customer records, and moves no money.

1. Follow the root [quickstart](../../README.md#quickstart) to start MIMORI, sign in, and generate a new API key.
2. From the repository root, create an isolated Python environment and install:

   ```bash
   python3 -m venv .venv-fintech
   source .venv-fintech/bin/activate
   pip install -e './sdk[langchain]' 'langchain>=1,<2'
   ```

3. Set the key through your shell without embedding it in code or command history:

   ```bash
   read -rsp 'MIMORI API key: ' MIMORI_API_KEY; echo
   export MIMORI_API_KEY
   export MIMORI_API_URL=http://localhost:3000
   python sdk/examples/fintech_langchain.py
   ```

4. Open **Agents** → **fintech-first-developer** to inspect the two sessions. The baseline calls balance and transaction tools. The candidate adds a synthetic export containing a SQL attack string, email, and credential fixture. With the default rules enabled, the baseline has no detections and the candidate has high/critical findings. SDK telemetry redacts the fixture email and credential before sending them.
5. Open **Behavior Diff**, select the baseline and candidate sessions, and compare. The candidate should receive a **High Risk** review recommendation.

The printed session IDs are SDK external IDs shown in session labels; the dashboard/API use separate database session IDs. Use the dashboard selectors for this walkthrough.

Callbacks record behavior and findings. This example does not attach an enforcement guardrail, so the synthetic tool executes. Nested model/graph callbacks can produce multiple findings for the same fixture; detection counts represent recorded findings across events, not distinct attacks.

For a real model, replace `ScriptedFintechModel` with a provider model that supports tool calling and configure that provider's credentials separately. Real model quality, financial compliance, and production delivery guarantees are outside this example's validation.
