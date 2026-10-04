# MIMORI Laya experimental v0.1

**Research candidate. Do not use this checkpoint as a production security filter or enable it as MIMORI's default classifier.**

[Download the archived experimental release](https://github.com/j33v4nz/MIMORIii/releases/tag/laya-experimental-v0.1). This optional research artifact remains in the development archive; it is not bundled with the fresh MIMORI `v1` release. Weights are release assets, rather than Git source files. The base model is [convaiinnovations/laya](https://huggingface.co/convaiinnovations/laya), pinned at `7b928d828b7b0e022f929d9bd2e44165aa270148`, with Apache 2.0 model licensing and Convai Innovations attribution. MIMORI source retains its separate MIT license.

## What was trained

- Supervised decision-head fine-tuning: type embeddings, transformer head and scorer; 26,248,193 trainable parameters.
- Frozen encoder and action-policy head. Export verification found 31 changed trained tensors and unchanged frozen tensors.
- Six epochs, 318 optimizer steps, AdamW learning rate 0.0001, batch size 8, seed 42.
- CPU PyTorch 2.13.0, Laya 0.3.26. Actual training took 3,652 seconds.
- 210 train rows, 45 calibration rows and 45 test rows. Source families and exact text are disjoint across splits.
- Calibration uses only its own split. The model's verdict and category questions are trained; severity and action-policy outputs are not.
- Full FP16 export contains about 421 million state values and an approximately 842 MB weight file.

The artifact includes exact synthetic datasets, training manifest, evaluations, strict HTTP smoke results, upstream model card and Apache license. Exact dataset hashes are authoritative: generator ordering was made deterministic after the archived splits were created. The training manifest records this and the export temperature-format correction. Reproducing this experiment requires the archived data.

## Actual held-out results

45 synthetic rows: 31 malicious, 9 benign and 5 suspicious. This is a small development test, not an independent attack benchmark.

| Metric | Original base | Trained candidate |
| --- | --- | --- |
| Verdict accuracy | 37.8% (17/45) | 64.4% (29/45) |
| Malicious precision | 88.9% | 75.8% |
| Malicious recall | 25.8% | 80.6% |
| Benign recall | 100% | 44.4% |
| Benign classified malicious | 0/9 | 3/9 |
| Suspicious recall | 0% | 0% |
| Brier score | 0.6687 | 0.5444 |
| Expected calibration error | 0.2217 | 0.1393 |
| Heuristic fallbacks | 0 | 0 |

The majority-class baseline is **68.9% (31/45)**, above the trained candidate. Five of nine benign rows were classified non-benign. Category recall was zero for encoding evasion, prompt extraction and threat on this small set. At MIMORI's 0.90 auto-detect threshold, **zero rows qualified**, so auto-detect precision is undefined. Raising or lowering a threshold does not repair unproven generalization.

The candidate's measured inference p50/p95/p99 was approximately 3.70/4.76/5.53 seconds on an Intel i5-1235U CPU with four PyTorch threads. Some service smoke inference overlapped briefly; baseline inference overlapped training. These are local experiment measurements, not a controlled latency comparison or a deployment guarantee.

[Full candidate evaluation](models/laya-experimental-v0.1/evaluation.json) · [Base evaluation](models/laya-experimental-v0.1/baseline-evaluation.json) · [Training manifest](models/laya-experimental-v0.1/training-manifest.json)

## Load it for experiments

Install the [pinned training/runtime dependencies](laya-finetuning.md#install), then:

```bash
curl -fL -O https://github.com/j33v4nz/MIMORIii/releases/download/laya-experimental-v0.1/mimori-laya-experimental-v0.1.tar.gz
curl -fL -O https://github.com/j33v4nz/MIMORIii/releases/download/laya-experimental-v0.1/SHA256SUMS
sha256sum -c SHA256SUMS
mkdir -p scripts/laya/checkpoint
tar -xzf mimori-laya-experimental-v0.1.tar.gz -C scripts/laya checkpoint data
python scripts/laya/serve.py --model-path scripts/laya/checkpoint --require-model --port 5050 --threads 4
```

Verify health returns `loaded_model: true` and classification metadata returns `engine: "laya_finetuned"`. Strict mode returns HTTP 503 for inference failure and refuses heuristic fallback.

Evaluate exact archived test rows:

```bash
python scripts/laya/evaluate.py --data-file scripts/laya/data/test.jsonl --model-path scripts/laya/checkpoint --output scripts/laya/checkpoint/evaluation.json --threads 4
```

Weights SHA256: `ae2d4fc9373b8443e1630baeb498f63dbcc982a0071664eb0ea4faf3b1bd3ea4`.

## Release decision

This artifact proves actual fine-tuning, compatible export and inference. It **does not meet a production classifier quality gate**. Keep `LAYA_ENABLED=false` for the default MIMORI release. An uncertain result uses the regular trigger/sampling path; classification confidence is not validated security assurance.

Further model work needs representative labeled traces, stronger benign and ambiguous examples, class balancing, independent attack evaluation, subgroup metrics and threshold validation. No real customer data, credentials, paid provider calls or hosted production workload were used.
