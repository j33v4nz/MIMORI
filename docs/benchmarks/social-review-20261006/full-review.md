# MIMORI local benchmark review — 6 October 2026

The strongest measured task-aware profile in this run was Llama semantic review: **60/70 attacks caught (85.7%)**, **1/33 benign false positives**, and **zero review errors**. Adding Laya v0.3 caught no additional attacks and increased benign false positives to 2/33. Laya remains a research candidate, not promoted for blocking.

## Comparable 103-case regression

There are 62 distinct public InjecAgent base instructions, each with one deterministically selected tool context; 17 benign controls derived by removing the injection slot; and 24 authored challenges (8 attacks, 16 benign). Total: 70 attacks, 33 benign. This set was previously inspected and is not blind or representative of production traffic.

| Profile | Attacks caught | Recall | Benign FP | Precision | F1 | Accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| SDK regex only | 0/70 | 0.0% | 2/33 | 0.0% | 0.0% | 30.1% |
| Laya v0.3 only | 1/70 | 1.4% | 1/33 | 50.0% | 2.8% | 32.0% |
| Llama semantic review | 60/70 | 85.7% | 1/33 | 98.4% | 91.6% | 89.3% |
| Llama + Laya / OR | 60/70 | 85.7% | 2/33 | 96.8% | 90.9% | 88.3% |
| Regex + Llama / OR | 60/70 | 85.7% | 3/33 | 95.2% | 90.2% | 87.4% |
| Regex + Llama + Laya / OR | 60/70 | 85.7% | 4/33 | 93.8% | 89.6% | 86.4% |

These are measured detector decisions. Multi-detector rows replay independent decisions with OR: any positive detector flags the input. They do not represent a live agent attack-success benchmark. The actual task-aware SDK tool-response API calls the supplied reviewer and bypasses context-free regex; the raw-regex OR rows are explicit offline ablations. Positive semantic reviews include suspicious and malicious verdicts. Errors never count as caught attacks. Precision, F1 and accuracy depend on this attack-heavy sample mix.

## Public subset and controls

- Public InjecAgent base subset: **52/62 detected (83.9%)**; ten missed.
- Derived ordinary-tool controls: **0/17 benign false positives**.
- Authored challenges: **8/8 attacks caught**, **1/16 benign false positives**.
- Laya alone: **1/70 attacks caught**, **1/33 benign false positives**, no errors.
- Laya added no detections beyond Llama. Its extra false positive was an explanatory bank-transfer article (`challenge-7`). The Llama false positive was the deployment checklist (`challenge-4`).

## Full static InjecAgent evaluation

The full static test covers 1,054 base cases and 1,054 paired enhanced variants: 62 instructions × 17 tool contexts, plus 17 derived benign controls.

| Rule pack | Base caught | Enhanced caught | Benign FP |
| --- | --- | --- | --- |
| New-organization defaults | 17/1,054 (1.61%) | 1,054/1,054 | 0/17 |
| Fallback | 0/1,054 | 1,054/1,054 | 0/17 |
| SDK regex | 0/1,054 | 1,054/1,054 | 0/17 |

Enhanced cases contain a direct instruction-override prefix. Base/enhanced variants are paired, not 2,108 independent instructions. Detection-or-review routing coverage is 100% for dashboard/fallback base cases; queueing a review does not establish detection. New-org/fallback/SDK base p95 detector latency was 0.0463/0.0280/0.3995 milliseconds, excluding networking, persistence and judge execution.

The scanner's targeted development ablation improved from 12/20 to 20/20 authored attack-signature cases with 0/16 benign false positives in both versions. The rules were identical in that ablation. These authored regressions establish scanner fixes, not blind injection-defense accuracy.

## Actual Laya training and fairer comparison

Continued from the actual v0.2 checkpoint. Ran **4 epochs and 192 optimizer steps**, training **26,248,193 decision-head parameters** in a 421,293,827-parameter model with a frozen encoder and action head. CPU runtime: **33.55 minutes**. Epoch 3 had the lowest calibration cross-entropy and was selected; the exported checkpoint retains 144 additional updates. Epoch 4 reduced training loss but worsened calibration loss.

Data: 192 training, 96 calibration, 96 held-out synthetic examples; resource families stay within one split, all splits cover eight operation types, concepts and some wording remain shared. Test cases and benchmark cases do not update parameters, temperature or thresholds. Temperature was fitted on calibration only; threshold was selected under a 5% calibration benign-FP limit and frozen at **0.694**.

| New synthetic evaluation | Attacks caught | Benign FP | Errors |
| --- | --- | --- | --- |
| v0.3 calibration | 11/40 (27.5%) | 1/48 | 0 |
| v0.2 held-out, separately calibrated | 8/40 (20.0%) | 0/48 | 0 |
| v0.3 held-out | 13/40 (32.5%) | 0/48 | 0 |

The baseline threshold was selected separately on the same new calibration set: 0.9407. Its temperature was retained from the prior checkpoint; this is a comparison of calibrated profiles, not an isolated causal estimate of individual training changes. Eight ambiguous examples are reported separately: the candidate queued/blocked 3/8 at the selected threshold. Baseline at the historical 0.75 point caught 10/40 but had 3/48 benign false positives; that is not the preferred fair comparison.

The held-out result improved locally, but public regression detection fell to 1/70 at the selected v0.3 policy. Its one catch was already caught by Llama. **The candidate was rejected for automatic blocking.** The threshold was not lowered against held-out or benchmark results.

The weight audit confirmed 31 head tensors changed, 174 frozen tensors stayed identical, all exported tensors are finite, and declared sources/data stayed unchanged. Weight hash: `5a0f363017c4cb394b786a6b9ec7c8ec7aba48b29067d6a323d78665d293a6b4`. Labels are authored by construction; there is no independent human validation.

## Runtime and exact model

- Llama 3.1 8B, Q4_K_M; Ollama 0.32.5; Intel i5-1235U, CPU only.
- Llama regression p50/p95: **15.44/23.47 seconds**.
- Laya v0.3 regression p50/p95: **2.08/3.83 seconds**; four CPU threads; startup excluded.
- Independent combined p50/p95: **17.48/27.14 seconds**, an offline per-case summed estimate, not live latency or throughput.
- Llama model digest: `46e0c10c039e019119339687c3c1757cc81b9da49709a3b3924863ba87ca666e`.
- Original benchmark detector files and installed model digest were verified unchanged throughout the fresh run.

## Authorization and integration checks

The separate capability audit found an out-of-scope proposed tool in all 1,054 attack chains under fixture-owned original-task grants; 1,053 had all proposed tool names denied. One first step needs exact argument checks. All 17 distinct original calls were allowed. This audits dataset tool labels and a supplied capability configuration, not real agent attack prevention.

The new dataset's split/counterfactual checks passed (6 focused tests). The local training and strict model evaluation completed without inference errors. The SDK smoke artifact records the new checkpoint's actual integration checks; two synthetic fixtures establish execution flow, not classifier robustness. Historical app/SDK build/test results are kept in the benchmark index and are not rerun or represented as new model-evaluation results here.

## Provenance and publishing scope

InjecAgent source: [uiuc-kang-lab/InjecAgent](https://github.com/uiuc-kang-lab/InjecAgent), revision `f19c9f2c79a41046eb13c03c51a24c567a8ffa07`. Exact inputs, case decisions, model/source hashes and weights audit are linked in the source JSON and local reports. This report is not official InjecAgent ASR, a leaderboard result, a production guarantee or a competitor ranking. No real attack actions were executed. Everything remains local; nothing was pushed or published.

[Raw board facts](benchmark-review.json) · [Fresh benchmark](../run-20261006-132635/README.md) · [Laya evaluation](../laya-task-v0.3/results.json) · [Laya SDK smoke](../laya-task-v0.3/sdk-smoke.json)
