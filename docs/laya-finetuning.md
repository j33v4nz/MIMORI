# Experimental Laya training and evaluation

Laya is an optional telemetry classifier. Its output records findings or queues judge review. Blocking requires an application to wrap an operation with the Python guardrail.

The [trained experimental v0.1 checkpoint](laya-model-card.md) is available as a separate release asset. Its held-out results include poor false positives and accuracy below the majority baseline; it is disabled by default and is not recommended as a production filter.

This workflow trains the actual decision head from the pinned [Laya base checkpoint](https://huggingface.co/convaiinnovations/laya), revision `7b928d828b7b0e022f929d9bd2e44165aa270148`. The encoder and action-policy head stay frozen. It uses supervised soft labels and CPU feature caching.

## Install

Use a separate environment. CPU PyTorch avoids unnecessary CUDA dependencies:

```bash
python3 -m venv .venv-laya
. .venv-laya/bin/activate
python -m pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r scripts/laya/requirements.txt
```

Base weights require about 842 MB of downloads; caching and export need additional memory and disk. CPU training can take over an hour. The portable [notebook](../notebooks/finetune_laya_mimori_kaggle.ipynb) runs these same scripts. This trainer does not implement GPU/DDP or reinforcement learning.

## Generate separate datasets

```bash
python scripts/laya/dataset_generator.py --count 2400 --seed 42 --output-dir scripts/laya/data
python scripts/laya/train.py --data-dir scripts/laya/data --dry-run
```

The generator separates source template families before augmentation and writes `train.jsonl`, `calibration.jsonl`, `test.jsonl` and a manifest. Training verifies that families and exact texts do not overlap across splits. Family separation does not establish independence from the base model's training data.

Verdicts are benign, suspicious and malicious. Categories include instruction override, jailbreak persona, prompt extraction, encoding evasion, excessive agency, exfiltration and threat. Review labels and add representative workload data before relying on classifier results.

## Train and evaluate

```bash
python scripts/laya/train.py --data-dir scripts/laya/data --output-dir scripts/laya/checkpoint --epochs 6 --batch-size 8 --lr 0.0001 --threads 4
python scripts/laya/evaluate.py --data-file scripts/laya/data/test.jsonl --model-path scripts/laya/checkpoint --output scripts/laya/checkpoint/evaluation.json --threads 4
```

Only train rows update weights; calibration rows fit temperature; test rows are used only by evaluation. Missing dependencies fail explicitly. `--dry-run` validates data and does not train a checkpoint.

Export includes full model weights, tokenizer, encoder configuration, Laya configuration and a training manifest containing base revision, dataset hashes, losses, optimizer steps, temperature and elapsed time. Strict evaluation reports confusion counts, per-class precision/recall/F1, category metrics, benign false-positive rate, calibration error, Brier score and inference latency on recorded hardware. It rejects heuristic fallback.

Archive exact datasets alongside any published model. Hashes identify the files used; a new generator revision can produce different files even with the same seed.

## Run the actual model

```bash
python scripts/laya/serve.py --port 5050 --model-path scripts/laya/checkpoint --require-model
curl -s http://127.0.0.1:5050/health
curl -s http://127.0.0.1:5050/v1/classify -H 'Content-Type: application/json' -d '{"input":"Summarize the invoice totals","options":["benign","suspicious","malicious"]}'
```

Require `loaded_model: true` in health and `engine: "laya_finetuned"` in classification metadata. `--require-model` fails on loading or inference errors. Without that flag the service retains an explicit heuristic fallback for development.

The service binds to loopback and has no authentication. Remote use requires an authenticated proxy and access controls.

## Connect MIMORI

Set these application environment variables, then restart:

```env
LAYA_ENABLED=true
LAYA_BASE_URL=http://127.0.0.1:5050
LAYA_TIMEOUT_MS=15000
LAYA_CONFIDENCE_THRESHOLD=0.7
LAYA_AUTO_DETECT_THRESHOLD=0.9
```

Unmatched events can use Laya. A malicious result above the auto-detect threshold records a finding; other qualifying non-benign results can queue a judge. Unavailable or uncertain results fall back to the regular trigger and sampling path. The timeout above accommodates this CPU experiment; it is not a latency guarantee. Measure latency on your deployment.

For explicitly wrapped Python operations:

```python
from mimori import MIMORIGuardrail, LayaClassifier

guard = MIMORIGuardrail(
    mode="block",
    use_classifier=True,
    classifier=LayaClassifier(base_url="http://127.0.0.1:5050", threshold=0.75, timeout=15.0),
)
verdict = guard.evaluate(user_prompt)
```

An unavailable classifier allows an otherwise unmatched input; existing regex matches and input limits still apply.

## Publish evaluation honestly

Include exact model/data versions, class supports, false positives, calibration, hardware latency and fallback count. Synthetic results are development evidence, not an independent security benchmark. Treat the model as experimental, rather than your sole security control.

Weights are distributed separately from source with upstream license attribution. Generated weights and datasets are ignored by Git.
