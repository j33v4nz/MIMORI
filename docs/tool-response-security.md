# Review tool responses before an agent acts

MIMORI's regex guardrail catches known exploit patterns. Indirect prompt injection also arrives as an ordinary request inside a web page, email, document, review, or other tool result. Such content is task data; it cannot authorize another action.

## Local semantic review

The opt-in `OllamaSecurityReviewer` reviews every tool response against the original user request, including content with no attack keywords. It uses a local Ollama model and a strict verdict schema. [Ollama's structured-output documentation](https://docs.ollama.com/capabilities/structured-outputs) describes the schema interface.

```python
from mimori import MIMORIGuardrail, OllamaSecurityReviewer

guard = MIMORIGuardrail(mode="block")
reviewer = OllamaSecurityReviewer(model="llama3.1:latest", timeout=120)  # Already installed locally.
request = "Find the city library's opening hours."

# Call immediately after retrieving external content and before an agent reads it.
guard.verify_tool_response(
    page_content,
    user_request=request,
    tool_name="read_page",
    reviewer=reviewer,
)
```

The current local `llama3.1:latest` profile catches more attacks than the previous Qwen profile, with higher CPU latency and more benign false positives on the frozen regression. This is an explicit higher-recall choice, not a guarantee for other workloads. The example allows 120 seconds for a CPU cold start. See the [local comparison](benchmarks/llm-regex-v2/README.md).

The user request must come from application-owned task state. Never extract it, permissions, or approval from the tool response. A model verdict is a risk assessment, not authority to execute a tool.

`verify_tool_response` raises `SecurityViolation` in block mode for suspicious or malicious content, incomplete/malformed reviews, timeouts, missing task context, and evaluation limits. `evaluate_tool_response` returns a verdict for callers that implement their own enforcement. Warn and audit modes record violations but allow the content through.

The reviewer refuses inputs over 6,000 UTF-8 bytes, including the task and tool metadata, instead of truncating away a possible attack. Split large sources into application-managed chunks and review every chunk before consumption, or use a separately validated reviewer with a larger context. Model errors are not evidence an attack was detected.

For a read-only tool, wrap its return path:

```python
safe_read_page = guard.protect_tool_result(
    read_page, user_request=request, reviewer=reviewer
)
content = safe_read_page(url)
```

Both synchronous and asynchronous tools are supported. The read executes before its output is reviewed. This wrapper does not undo side effects or authorize write tools.

## Add the experimental Laya layer

Start the actual checkpoint with strict inference; the service must report `loaded_model: true`:

```bash
.private/venv-laya/bin/python scripts/laya/serve.py \
  --model-path .private/laya-v0.1/checkpoint --require-model --threads 4 --port 5050
```

For a separately downloaded checkpoint, substitute its path and use the environment described in [Laya setup](laya-finetuning.md). The paths above refer to this checkout's private local files and are not included with the SDK.

```python
from mimori import LayaSecurityReviewer, LayeredSecurityReviewer

reviewer = LayeredSecurityReviewer(
    semantic=OllamaSecurityReviewer(model="qwen2:7b"),
    laya=LayaSecurityReviewer(timeout=15, threshold=0.75),
)
# Use this reviewer with the same guard.verify_tool_response or handler above.
```

Each layer sees the original content independently. Both run; either may block. Laya cannot suppress semantic review, change the original request, or grant a tool capability. The strict client accepts only `laya_finetuned` results, checks complete finite normalized verdict probabilities, disables redirects and environment proxies, and raises on model errors. The guardrail reports these failures as evaluation errors, not caught attacks.

This combination is opt-in. Laya v0.1 was trained on a small synthetic set, sees content without the original task, and has a short encoder context. Adding it can increase false positives without catching more attacks. Its benign score is not evidence of authorization. Benchmark before using it for blocking in your workload.

The local task-aware candidate uses a versioned task-response schema and a separately calibrated policy pinned to its weights. Its service refuses missing context and token truncation. See [training and calibrated deployment](laya-task-training.md); the legacy text-only classifier cannot supply the required context.

Improve the model with independently labelled examples of real tool responses, including quoted instructions, translations, task-authorized actions, and polite unrelated requests. Keep document sources and template families separate across training, calibration and held-out evaluation. Include the original task in a new training schema if the model must distinguish authorized instructions from unrelated actions; changing the inference schema alone is not a validated fix. Set thresholds on calibration data, then evaluate once on untouched data. Keep the existing frozen benchmark as a regression check and use new independent cases to assess improvements.

```bash
# Reuse frozen inputs and archived semantic decisions; run actual Laya inference:
python3 scripts/benchmark-laya-layer.py --output .private/benchmarks/laya-layer
```

The report labels the combined comparison as offline: semantic decisions are reused, Laya decisions are live, and combined latency is estimated from their sum. It does not rerun the full agent or establish a leaderboard score. The threshold is fixed at 0.75 before inference; the evaluator refuses to overwrite an existing output directory.

## Authorize actions before execution

An allow decision for a document does not grant permission to act. Bind each action's arguments to permissions held by your application. For example, the task may permit one known recipient; a document cannot change that recipient:

```python
approved_recipient = "owner@example.test"  # From the authenticated user's task.
safe_send_email = guard.protect_tool(
    send_email,
    authorize=lambda recipient, body: recipient == approved_recipient,
)
safe_send_email(approved_recipient, summary)
```

For operations with exact approved arguments, use a capability snapshot:

```python
from mimori import ToolCapabilityPolicy

policy = ToolCapabilityPolicy([
    ("read_record", {"record_id": "public-record"}),
])
safe_read_record = guard.protect_tool(
    read_record,
    authorize=lambda record_id: policy.allows("read_record", {"record_id": record_id}),
)
```

Changed resources, tool names, destinations, amounts, missing fields, and extra arguments do not match the grant. Mutating the original configuration dictionary does not change the stored snapshot. `allows_tool` is a name-only prefilter and never replaces `allows` on actual arguments. Build the policy in trusted application code; do not infer grants from external pages or let the agent edit them.

In block mode only the boolean `True` grants permission. A denied, invalid, or failed authorization callback raises before tool execution. The existing input guardrail also applies. The callback must validate every relevant permission, including resource, destination, amount, and destructive-operation approval as appropriate. Without an authorization callback, `protect_tool` retains its existing regex-only input protection.

## LangChain and LangGraph

Construct a separate handler for each task so the original request remains correctly scoped:

```python
from mimori import MIMORIHandler

handler = MIMORIHandler(
    api_key="your-mimori-api-key",
    agent_name="library-assistant",
    guardrail=guard,
    original_user_request=request,
    tool_response_reviewer=reviewer,
    tool_authorizer=lambda name, arguments: name in {"search_library", "read_library_page"},
)
# Supply handler in the agent's callbacks. Close it after the task completes.
```

This example permits only the two named read tools; applications should also validate their arguments. Blocking handlers set LangChain's `raise_error` flag so the callback manager propagates security exceptions. An integration that catches those exceptions and continues would defeat enforcement. `MIMORILangGraphHandler` forwards these configuration options to the same handler. Other framework handlers remain telemetry-only; use the direct wrappers for their tools.

## Dashboard review

The ingestion service now sends unmatched tool responses for semantic review even without keywords, and a confident benign Laya verdict cannot suppress that review. It preserves `event_type` from ingestion into the worker's review context. Tool-response shaped payloads also trigger review when the event label is absent.

The local Ollama dashboard provider uses `/api/chat` at the configured server origin, an explicit context budget and a compact strict verdict/category/severity schema. It rejects oversized, incomplete and truncated reviews. Its default timeout is 120 seconds for CPU inference; confidence is fixed at an uncalibrated 0.5 and its reason is generic. The SDK regression score does not measure this separate dashboard prompt.

This dashboard path is asynchronous and does not block an agent. It requires a configured judge and worker. Existing budgets and kill switches still apply; reviewing all unmatched tool responses can increase queue volume and model cost. The worker treats payload fields as observations, not permissions. If the original task is missing, the judge is instructed to preserve uncertainty rather than invent authorization.

## Evaluate

```bash
# Full static rule evaluation and review-routing coverage:
npm run benchmark:injecagent -- /tmp/mimori-injecagent docs/benchmarks/injecagent-after

# Actual local semantic review, all 62 distinct base instructions represented:
npm run benchmark:semantic -- --dataset /tmp/mimori-injecagent --model llama3.1:latest --output .private/benchmarks/llama-regression

# Task-scoped capability coverage of proposed attack tools:
python3 scripts/benchmark-capabilities.py /tmp/mimori-injecagent
```

The semantic evaluation also includes 17 derived controls and 24 authored challenges. Its subset is not comparable to the full static 1,054-case denominator or official agent attack-success rankings. Fail-closed review errors are reported separately from detected attacks. Benign examples include documentation, quotations, action descriptions, and translation requests to detect blanket blocking. Results measure detector decisions; they do not prove real-world attack prevention or establish a production false-positive rate.

The capability check grants the fixture's original tool call and evaluates its proposed attack-tool names. It finds a denied tool in 1,054/1,054 proposed chains, with all proposed tool names denied in 1,053 cases. One chain first uses the original tool name, where argument checking is necessary, then proposes an email tool that is denied. All 17 distinct original calls remain permitted. This checks configured policy scope using dataset labels; it is not generated agent execution or an attack-success score.

Interrupted semantic evaluations can resume with `--resume` when model, detector hashes, and frozen inputs match. Use a separate output directory for another model or policy; completed decisions are not silently replaced.

The npm semantic command defaults to `llama3.1:latest` and writes new results under `.private/benchmarks/semantic-llama`, leaving the archived evaluation in `docs/benchmarks` intact. If that output already exists, append `--resume` or supply a new `--output` directory.
