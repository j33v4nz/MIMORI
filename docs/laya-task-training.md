# Task-aware Laya local experiment

The latest local continued-training run is [v0.3](benchmarks/laya-task-v0.3/README.md): four epochs, 192 optimizer steps, with epoch 3 selected using calibration loss. It improved the new synthetic held-out score from 8/40 to 13/40 with 0/48 false positives for both calibrated profiles. It added no detections beyond Llama on the frozen regression and introduced one extra benign false positive, so it was not promoted for blocking. [Full review and social board](benchmarks/social-review-20261006/full-review.md). The v0.2 history below retains its original data and results.

This candidate changes Laya's input from content alone to an original task, a tool name, and an untrusted tool response. It fine-tunes the real decision head with a frozen encoder. It is a local experiment, disabled by default, and does not grant permission to execute actions.

**The v0.2 candidate failed evaluation and is not recommended for blocking.** At the calibration-selected threshold 0.5804, it caught 0/18 held-out attacks with 1/24 benign false positives. It caught 7/70 frozen regression attacks, but all were already caught by semantic review, leaving the combined score unchanged at 44/70. The commands below reproduce the experiment and support research; they do not enable the model by default. See [results](benchmarks/laya-task-v0.2/results.json) and the [deployment decision](benchmarks/laya-task-v0.2/deployment-review.json).

## Data and separation

`scripts/laya/task_dataset.py` creates 256 authored synthetic counterfactual examples across 32 resource/action families: 160 training, 48 calibration, and 48 held-out test rows. Each family contains legitimate task data, an authorized action, a translation, a historical quotation, unrelated instructions, claimed approval, fake assistant messages, and unclear task scope. The same directive has different labels depending on the original task.

Families stay within one split. Held-out wording wrappers differ, but concepts and some sentence patterns remain shared. Labels are authored by construction, not independently human-reviewed. This small set cannot establish production robustness. The previously inspected 103-case benchmark is used only as a regression check; it is excluded from training and calibration and is not a new blind evaluation.

The training path rejects cross-split family/text leakage and refuses truncated states. Only training rows update parameters. Calibration rows fit temperature and select the operating threshold. Test rows never choose either. The threshold maximizes non-benign detection under at most 5% calibration benign false positives; ties favor fewer false positives and a higher threshold. With only 24 benign calibration examples, the limit permits at most one false positive and has substantial uncertainty.

## Reproduce locally

Use the pinned dependencies in [Laya setup](laya-finetuning.md). In this checkout, `.private/venv-laya` contains them and `.private/laya-v0.1/checkpoint` holds the initial checkpoint. Weights and environments remain private and are not committed.

```bash
python3 scripts/laya/task_dataset.py --output .private/laya-task-v0.2/data
.private/venv-laya/bin/python scripts/laya/train.py \
  --data-dir .private/laya-task-v0.2/data --question-ids verdict --dry-run

HF_HUB_OFFLINE=1 .private/venv-laya/bin/python scripts/laya/train.py \
  --initial-checkpoint .private/laya-v0.1/checkpoint \
  --data-dir .private/laya-task-v0.2/data \
  --output-dir .private/laya-task-v0.2/checkpoint \
  --question-ids verdict --epochs 6 --batch-size 4 --lr 0.0001 \
  --threads 4 --seed 20261007

HF_HUB_OFFLINE=1 .private/venv-laya/bin/python scripts/laya/evaluate_task.py \
  --checkpoint .private/laya-task-v0.2/checkpoint \
  --data .private/laya-task-v0.2/data \
  --output docs/benchmarks/laya-task-v0.2
```

Use fresh output paths for another run; generators, checkpoint exports and evaluations refuse to replace existing artifacts. Training records initialization, dataset and trainer hashes. Evaluation records raw scores, failures, latency and source hashes. It writes the selected policy before running held-out inference. It also calibrates the old checkpoint separately on the same calibration split for a fairer held-out comparison, alongside the old 0.75 operating point.

## Run the candidate with the calibrated policy

```bash
HF_HUB_OFFLINE=1 .private/venv-laya/bin/python scripts/laya/serve.py \
  --model-path .private/laya-task-v0.2/checkpoint --require-model --threads 4 --port 5050
```

```python
from mimori import (
    LayaSecurityReviewer, LayeredSecurityReviewer,
    MIMORIGuardrail, OllamaSecurityReviewer,
)

laya = LayaSecurityReviewer.from_policy(
    "docs/benchmarks/laya-task-v0.2/policy.json", timeout=30,
)
reviewer = LayeredSecurityReviewer(
    semantic=OllamaSecurityReviewer("qwen2:7b", timeout=120),
    laya=laya,
)
guard = MIMORIGuardrail(mode="block")
guard.verify_tool_response(
    tool_result,
    user_request=original_request,  # Application-owned task state.
    tool_name="read_page",
    reviewer=reviewer,
)
```

The policy pins the checkpoint's weights hash. Strict task-aware inference requires the original request and refuses token truncation rather than hiding an injected tail. A heuristic fallback, wrong schema, wrong checkpoint, timeout, missing task, or model error fails review. The task-aware checkpoint does not work with the legacy text-only `LayaClassifier`; that API cannot supply trusted task context.

Both model layers review content independently. A Laya benign verdict cannot suppress semantic review. Keep exact tool/argument capability checks before side effects; even a correct content classification does not authorize an action. The dashboard's asynchronous telemetry review remains separate from this in-process SDK enforcement.

See [local benchmark evidence](benchmarks/README.md) for measured results and limits. No leaderboard or production-readiness claim follows from this experiment.
