# MIMORI demo

[Watch the 72-second silent walkthrough](MIMORI-fast-silent-demo.mp4).

The demo connects a real local Llama 3.1 model through Ollama and LangChain to MIMORI. All fintech tools and data are synthetic; no money is moved and no SQL is executed. Inference waits are removed and playback is accelerated. The video has no audio or added captions.

## What it shows

- SDK callback integration and a normal agent run.
- Session traces, overview metrics, agent registry, and event filtering.
- Security findings, redacted payloads, and baseline/candidate behavior comparison.
- Finding resolution, rule presets, live regex validation, saving and disabling a rule.
- Creating and revoking a disposable API key, plus judge configuration.

The recorded baseline stored 18 events with no findings. The risky candidate called `export_records`, stored 14 events, and produced 16 event-level findings across callbacks. The comparison returned `high_risk`. Those findings are not 16 separate attacks.

Judge settings are shown; the video does not demonstrate a judge evaluation or every provider. Callback findings are review signals. This demonstration does not attach an execution-blocking guardrail or validate banking access, fine-tuned Laya, compliance, or production durability.

## Run the live-model example

From the repository root, follow the [local setup guide](../local-development.md), start the dashboard, create an account, and generate your own API key. With Python and Ollama installed:

```bash
pip install -e './sdk[langchain]' 'langchain>=1,<2' langchain-ollama
ollama pull llama3.1
read -rsp 'MIMORI API key: ' MIMORI_API_KEY; echo
export MIMORI_API_KEY
export MIMORI_API_URL=http://localhost:3000
python sdk/examples/fintech_ollama.py baseline
python sdk/examples/fintech_ollama.py candidate
```

Use the port where your dashboard is running. The model's final commentary is unverified; inspect recorded tool calls and fixture definitions to understand what actually executed.

For a repeatable example without model inference, see the [scripted fintech example](../../sdk/examples/README.md). For architecture and technical questions, see the [architecture guide](../architecture.md) and [API specification](../api-spec.md).
