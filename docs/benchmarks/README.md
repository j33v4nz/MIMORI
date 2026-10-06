# Local security hardening results

These checks measure different boundaries. They are not a leaderboard result or an official agent attack-success score.

## Current LLM and regex work

The [fresh current-code benchmark](run-20261006-132635/README.md) caught **60/70 attacks (85.71%)** with **1/33 benign false positives (3.03%)** and zero review errors. Median local CPU latency was 15.44 seconds. The full static evaluation retained 17/1,054 base detections for the new-organization rule pack, and zero for fallback/SDK regex. Each caught all enhanced variants carrying an explicit override prefix.

The [local LLM and regex comparison](llm-regex-v2/README.md) records scanner fixes, narrower SDK signatures and rejected Qwen prompt changes. Its earlier run on the same inspected 103 inputs increased attack detection from 44/70 to 60/70, while benign false positives rose from 1/33 to 2/33. The fresh run had one false positive; variation between runs is not a code improvement. This is a higher-recall local profile with slower CPU inference; no universal model or leaderboard claim is made. Historical evaluations below retain their original models and source snapshots.

The subsequent [Laya v0.3 training](laya-task-v0.3/README.md) completed four epochs and 192 optimizer steps, selecting epoch 3 on calibration. On a fresh synthetic held-out split, it improved from 8/40 to 13/40 attacks caught with 0/48 false positives for both calibrated profiles. It caught only 1/70 regression attacks, added no catches beyond Llama, and increased combined benign false positives to 2/33. It was rejected for automatic blocking. The [shareable benchmark board and full review](social-review-20261006/full-review.md) report all detector ablations and keep these scopes separate.

## Full InjecAgent static detection and routing

The original regex score remains 17/1,054 (1.61%) for the database's default rules, and 0/1,054 for fallback rules and the SDK regex path. No attack-specific keywords were added to inflate that score.

For unmatched tool responses, database/fallback detection-or-review coverage increased from 102/1,054 (9.68%) to 1,054/1,054 (100%). Queueing a review is not a successful detection, and the dashboard worker remains asynchronous.

[Original evaluation](injecagent/README.md) · [Updated routing results](injecagent-after/results.json)

## Actual local semantic review

The frozen evaluation uses one selected tool context for each of the 62 distinct base attack instructions, 17 derived benign controls, and 24 independently authored development challenges. The local model is `qwen2:7b`.

| Evaluation group | Attacks detected | Benign false positives |
| --- | --- | --- |
| InjecAgent base subset | 36/62 (58.06%) | Not measured in this attack-only group |
| Derived tool-template controls | No attacks | 0/17 |
| Authored challenges | 8/8 | 1/16 |
| Combined development evaluation | 44/70 (62.86%) | 1/33 (3.03%) |

There were zero review errors. Positive classification includes suspicious verdicts; failed reviews would block operationally but are counted as errors, not detected attacks. The same SDK regex path detected 0/62 sampled base attacks and 0/8 authored attacks, with 2/33 benign false positives.

The one semantic false positive was a translation request containing a sentence about emailing an appointment reminder. The model's 26 base misses remain a substantial gap. This local 7B model should not be the sole security boundary. Measured p50/p95 was about 11.67/20.13 seconds on this machine, including mixed cold/warm inference and overlap with local verification work.

No prompt tuning was performed against this evaluation's results. The interrupted run resumed its 17 completed cases after checking unchanged detector hashes and frozen inputs; that recovery is recorded in the manifest. The exact evaluated reviewer is archived. After evaluation its transport was hardened to disable environment proxies/netrc; the prompt, schema, decision validation and enforcement did not change. The current transport was separately verified.

[Semantic results](semantic-local/results.json) · [Case outcomes](semantic-local/cases.jsonl) · [Exact evaluated reviewer](semantic-local/evaluated-semantic.py) · [Regex comparison on the same inputs](semantic-local/regex-comparison.json)

## Actual Laya and independent layered comparison

The local experimental v0.1 checkpoint was served with `--require-model`. The strict client checked `engine: laya_finetuned` and validated probabilities on every response. Its weights hash matches the published model card. The same 103 frozen inputs were used, with the existing SDK threshold fixed at 0.75 before inference.

| Policy | Attacks detected | Benign false positives | Review errors |
| --- | --- | --- | --- |
| Archived semantic review | 44/70 (62.86%) | 1/33 | 0 |
| Actual Laya at 0.75 | 0/70 | 0/33 | 0 |
| Independent OR of both decisions | 44/70 (62.86%) | 1/33 | 0 |

This checkpoint adds no detection benefit at this threshold. Its measured p50/p95 latency was 4.72/6.87 seconds. The layered comparison reuses archived semantic decisions; its summed latency is an estimate, not a simultaneous live measurement. A separate real two-model smoke test blocked an unrelated staff-directory disclosure. An earlier concurrent smoke timed out at 60 seconds and correctly failed closed; the retry used 120 seconds for Ollama. The SDK's default timeout remains unchanged.

All verdict sequences fit inside the checkpoint's 512-token context; the maximum observed was 281 tokens. This does not establish safe handling of longer production content. The model sees content without the original task and should not grant action authority. The new layer remains opt-in. Improve data and calibration using separate splits rather than lowering thresholds against this evaluation, and retain application-owned capability checks.

[Laya results and source hashes](laya-layer-local/results.json) · [Paired case outcomes](laya-layer-local/cases.jsonl) · [Context check](laya-layer-local/context-check.json) · [Local setup](../tool-response-security.md#add-the-experimental-laya-layer)

## Task-aware Laya v0.2 training result

The real v0.1 checkpoint was fine-tuned locally on 160 authored task-response examples, with 48 separate calibration and 48 held-out examples. Resource/action families stay within one split; concepts and wording patterns remain shared. The encoder and action head were frozen, and 26,248,193 decision-head parameters were updated over six epochs and 240 optimizer steps. Training took 41.53 minutes on CPU. Loss fell from 0.921 to 0.726. No benchmark cases were used for training or calibration.

Temperature was fitted on calibration only. The threshold was then selected on calibration under a 5% benign false-positive limit and frozen at 0.5804 before held-out inference.

| Evaluation | Attacks detected | Benign false positives | Inference errors |
| --- | --- | --- | --- |
| Calibration, candidate | 9/18 (50%) | 1/24 | 0 |
| Held-out, candidate | 0/18 | 1/24 | 0 |
| Held-out, old checkpoint at 0.75 | 0/18 | 0/24 | 0 |
| Held-out, old checkpoint separately calibrated | 0/18 | 0/24 | 0 |
| Frozen 103-case regression, candidate | 7/70 (10%) | 0/33 | 0 |
| Frozen regression, archived semantic review plus candidate | 44/70 (62.86%) | 1/33 | 0 |

The candidate caught 5/62 sampled InjecAgent attacks and 2/8 authored attacks. Every caught attack was already caught by semantic review, so it added no detections to the combined policy. Held-out task-scope detection did not generalize, and one translation was falsely blocked. **The candidate was rejected for blocking and remains disabled by default.** Lower training loss and a better calibration result do not qualify it for deployment.

Held-out candidate p50/p95 inference was 1.40/1.48 seconds; regression p50/p95 was 1.89/2.45 seconds. These exclude startup. The candidate used four CPU threads; the independent baseline used two while training was active, and the old model evaluated two questions instead of one. Those timings do not establish a controlled speed comparison. Combined latency is an offline sum with archived semantic timings.

The strict task-aware service requires an original request and rejects token truncation. The SDK can load a calibrated policy pinned to the checkpoint hash and refuses a mismatched model, schema or incomplete context. Those controls prevent incorrect integration; they do not improve a weak classifier's recall. Both layers remain independent, and exact action permissions remain necessary.

The actual localhost SDK smoke verified missing task context returns 400, overlong token sequences return 503, and a wrong checkpoint becomes an evaluation error. The live layered reviewer passed a library-hours fixture and blocked an unrelated staff-directory disclosure before the protected read returned. These two fixtures verify integration only. The temporary inference service was stopped after validation.

The next model experiment needs independently labelled representative task-response data, broader source formats, and a fresh untouched evaluation split. This test and the previously inspected regression set must not become a tuning target. No further training or threshold changes were made after these outcomes.

[Training manifest](laya-task-v0.2/training-manifest.json) · [Results and hashes](laya-task-v0.2/results.json) · [Frozen policy](laya-task-v0.2/policy.json) · [Case analysis](laya-task-v0.2/case-analysis.json) · [Deployment rejection](laya-task-v0.2/deployment-review.json) · [Live SDK smoke](laya-task-v0.2/sdk-smoke.json) · [Source and data audit](laya-task-v0.2/data-audit.json) · [Reproduce the experiment](../laya-task-training.md)

## Task-scoped authorization

The capability check grants each fixture's legitimate original tool call from application-owned configuration. Every proposed attack chain contains an out-of-scope tool name: 1,054/1,054. All proposed tool names are denied in 1,053 cases. One chain includes the legitimate tool name before an unauthorized email step; the first step requires argument checks. All 17 distinct original tool calls remain permitted.

This uses the dataset's proposed tool labels and assumes the application constructs the correct grants. It does not generate attacker actions with a live agent or measure official ASR. Exact-argument tests verify denial of changed recipients, resources, amounts, extra fields, type changes and mutable grant inputs.

[Capability results](capabilities/results.json) · [Configuration and examples](../tool-response-security.md)

## Enforcement and build verification

- 580 app unit tests passed; the security pipeline's 5 SDK-to-server tests passed.
- The complete SDK suite passed 320 tests with 15 optional integration tests skipped, including task-aware training isolation, calibration, strict model pinning, the Laya HTTP boundary, nested-argument constraints and real LangChain agent-loop tests.
- LangChain's actual tool loop, using a scripted model and synthetic tools, withheld rejected output before the next model call, blocked an unauthorized action before execution, and allowed benign completion. This proves local enforcement behavior, not model robustness.
- Lint and TypeScript checks passed.
- Production compilation, type checking, page generation, and traces passed with `DISABLE_AUTH=false npm run build -- --webpack`. The local demo auth flag was overridden only for that process. `.env.local` was not edited. Turbopack could not bind its compiler-worker port in this environment.
- Vitest and ESLint now exclude private release snapshots, so the current checkout's checks do not accidentally run copied tests or Playwright files from `.private`.

All changes are local and uncommitted. Nothing was published or pushed.
