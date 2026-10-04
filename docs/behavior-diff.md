# Behavior Diff

Compare a baseline session with a candidate recording at `/behavior-diff`. Run the same tasks with comparable inputs in both versions: different test prompts or tool arguments are expected to produce a review signal.

## What the comparison inspects

- Counts of recorded event types and event/tool/model names.
- SHA256 fingerprints of supported input fields: `input`, `inputs`, `arguments`, `args`, `kwargs`, `parameters`, `command`, `sql`, `url`, `uri`, `destination`, `endpoint`, `path`, `prompt`, `prompts`, `messages`, `tool_input`, and `interrupts`. These are inspected at the payload root and within `tool`, `action`, `function`, `tool_call`, and `tool_call.function`.
- String `action` payloads, including opaque adapter action records.
- Relative order of common recorded action signatures, including when another action was added or removed.
- Added and removed detection category/severity counts.

Python tool adapters and the Vercel adapter normally emit `tool.name` plus `input`; model callbacks normally emit `serialized.name` plus `prompts`. Manual telemetry can use the other supported fields. Having an adapter file does not prove compatibility with every installed framework version or that the framework exposes all its actions.

Object keys are sorted for stable fingerprints; array order and string bytes remain significant. Adapters that stringify arguments may therefore show differences caused by formatting. Callback `kwargs` entries named `run_id`, `parent_run_id`, `tags`, `metadata`, `callbacks`, or `run_manager` are excluded as run bookkeeping; do not store security-relevant business arguments only in these fields. Prompts, arguments and destinations appear as fingerprints in comparison labels, rather than plaintext. Fingerprints reveal equality and can be guessed for low-entropy inputs: they are not encryption.

Recognized LangChain message bookkeeping (`id`, `tool_call_id`, `response_metadata`, and `usage_metadata`) and generated tool-call IDs are excluded while message content and tool arguments remain significant. Recognized concurrent LangGraph tool branches are ordered consistently between branches within the same step; ordering inside each branch remains significant. Other action sequences remain order-sensitive.

The JSON result retains `added` and `removed` signature counts and `detectionChanges` for added findings. It also exposes:

- `inputChanges`: groups changed input fingerprints under their common event/tool identity (`behavior`, `baselineFingerprints`, `candidateFingerprints`).
- `removedDetections`: findings present in the baseline but absent from the candidate recording. This is not evidence that a vulnerability was fixed or a detection was resolved.
- `orderChanged`: relative order of common signatures differs. Repeated identical signatures cannot establish individual action identity.
- `comparisonWarnings`: insufficient or redacted evidence.

## Meaning of the decision

- `clear`: no differences in the recorded signatures, inspected inputs, order or detection counts. It does not certify security, successful task execution or complete behavior equivalence.
- `review`: recorded behavior or detection counts changed, or a recording contains no events. Removed findings also require review.
- `high_risk`: new high/critical findings appeared, or the maximum detected severity increased to high/critical. Existing identical high findings can still produce `clear`; inspect both sessions before approving a release.

Redaction can replace different original values with the same marker. SDK truncation can remove meaningful content before ingestion. Outputs, timing, task outcomes, unsupported fields, missing events and uninstrumented actions are outside this comparison. Asynchronous judge results can change the result after jobs finish; compare completed recordings and review judge-job status separately. Input structures exceeding 32 traversal levels or 20,000 nodes, or containing cycles, fail comparison explicitly rather than producing a partial fingerprint.

## API and CI

```text
GET /api/behavior-diff?baseline=<session-record-id>&candidate=<session-record-id>
```

Use `Authorization: Bearer <api-key>` for machine callers. Session access is scoped to the key's organization. Browser callers can use their dashboard session; visibility is controlled by Supabase RLS. Invalid credentials and unavailable recordings produce errors.

```bash
# Run from the repository root to use the documented CLI.
pip install -e ./sdk
export MIMORI_API_URL="https://mimori.example.com"
export MIMORI_API_KEY="mmr_dev_..."
mimori diff --baseline <baseline-session-id> --candidate <candidate-session-id> --fail-on review
```

`--fail-on high_risk` fails on `high_risk`; `--fail-on review` also fails on `review`. Missing or invalid server decisions fail the gate. These commands review stored recordings; they do not automatically run an agent, generate attacks, wait for judge jobs or block runtime tool execution.

See [.github/workflows/mimori-diff.yml](../.github/workflows/mimori-diff.yml) for the manual GitHub Actions example. Establish a real baseline and candidate before using it as a release check.
