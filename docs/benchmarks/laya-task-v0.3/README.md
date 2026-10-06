# Laya v0.3 — actual local continued training

Training completed from the v0.2 weights: four epochs, 192 optimizer steps, 26,248,193 trainable decision-head parameters, frozen encoder and action head, in 33.55 minutes on CPU. Epoch 3 had the lowest calibration loss; the exported checkpoint retains 144 additional updates. The lower epoch-4 training loss came with worse calibration loss and was not selected.

The new authored dataset contains 192 training, 96 calibration and 96 held-out examples across 32 separate resource families and eight operation types. Every split covers all operation types with separate resources. Concepts and some wording remain shared; labels are synthetic by construction. No benchmark case was used for training or calibration. All 384 examples fit the tokenizer without truncation, with maximum sequence length 184 tokens.

| Evaluation | Attacks caught | Benign false positives | Errors |
| --- | --- | --- | --- |
| Candidate calibration, threshold 0.694 | 11/40 (27.5%) | 1/48 | 0 |
| Previous v0.2 on new held-out, separately calibrated at 0.9407 | 8/40 (20%) | 0/48 | 0 |
| Candidate on new held-out | 13/40 (32.5%) | 0/48 | 0 |
| Candidate on frozen regression | 1/70 (1.43%) | 1/33 | 0 |
| Fresh Llama semantic review on that regression | 60/70 (85.71%) | 1/33 | 0 |
| Offline independent OR: Llama plus candidate | 60/70 (85.71%) | 2/33 | 0 |

The candidate added no detections beyond semantic review and falsely blocked an explanatory bank-transfer article. **It was rejected for automatic blocking and remains a research checkpoint.** The threshold stayed fixed after calibration. Baseline temperature was carried from its existing checkpoint; the comparison uses separately selected operating thresholds rather than isolating the causal effect of each training change.

The actual weights audit confirmed 31 head tensors changed, 174 frozen tensors remained identical, all tensors were finite, and the declared source/data hashes matched. The strict local SDK smoke passed: required task context, token-truncation refusal, checkpoint hash pinning, benign completion and attack blocking before return. Two smoke fixtures verify integration, not model robustness. The temporary service was stopped afterward.

Weights remain local at `.private/laya-task-v0.3/checkpoint`, SHA-256 `5a0f363017c4cb394b786a6b9ec7c8ec7aba48b29067d6a323d78665d293a6b4`. No org settings, database, deployment or public submission was changed. Nothing was committed or pushed.

## Reproduce with fresh paths

```bash
python3 scripts/laya/task_dataset_v3.py --output .private/laya-task-v0.3-repro/data
HF_HUB_OFFLINE=1 .private/venv-laya/bin/python scripts/laya/train.py \
  --initial-checkpoint .private/laya-task-v0.2/checkpoint \
  --data-dir .private/laya-task-v0.3-repro/data \
  --output-dir .private/laya-task-v0.3-repro/checkpoint \
  --question-ids verdict --epochs 4 --batch-size 4 --lr 0.0001 \
  --threads 4 --seed 20261006 --select-best-calibration
HF_HUB_OFFLINE=1 .private/venv-laya/bin/python scripts/laya/evaluate_task.py \
  --checkpoint .private/laya-task-v0.3-repro/checkpoint \
  --data .private/laya-task-v0.3-repro/data \
  --baseline .private/laya-task-v0.2/checkpoint \
  --regression docs/benchmarks/run-20261006-132635/semantic \
  --output docs/benchmarks/laya-task-v0.3-repro --threads 4
```

[Training manifest](training-manifest.json) · [Results](results.json) · [Fixed policy](policy.json) · [Weight verification](weight-verification.json) · [Deployment decision](deployment-review.json) · [Actual SDK smoke](sdk-smoke.json) · [Data audit](data-final-audit.json) · [Tokenizer audit](token-audit.json) · [Full benchmark review](../social-review-20261006/full-review.md)
