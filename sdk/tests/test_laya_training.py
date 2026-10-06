"""Dataset isolation and explicit training/evaluation failure gates."""

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(
        name, ROOT / "scripts/laya" / (name + ".py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_synthetic_families_do_not_leak_across_splits(tmp_path):
    generator = load("dataset_generator")
    splits = generator.generate_splits(300, 42)
    for name, rows in splits.items():
        (tmp_path / (name + ".jsonl")).write_text(
            "\n".join(json.dumps(r) for r in rows)
        )
    verified = load("train").verify_splits(tmp_path)
    assert sum(len(v) for v in verified.values()) == 300
    assert splits == generator.generate_splits(300, 42)
    for rows in splits.values():
        assert {r["verdict"] for r in rows} == {"benign", "suspicious", "malicious"}
    row = splits["train"][0]
    with (tmp_path / "test.jsonl").open("a") as f:
        f.write("\n" + json.dumps(row))
    with pytest.raises(ValueError, match="leakage"):
        load("train").verify_splits(tmp_path)


def test_evaluation_refuses_heuristic_results(tmp_path):
    path = tmp_path / "test.jsonl"
    path.write_text(
        json.dumps({"raw_text": "fixture", "verdict": "benign", "category": "none"})
    )

    class Heuristic:
        def classify(self, text):
            return {"metadata": {"engine": "system1_heuristic"}}

    with pytest.raises(RuntimeError, match="fell back"):
        load("evaluate").evaluate_dataset(Heuristic(), path)


def test_evaluation_counts_false_positives_and_gated_precision(tmp_path):
    path = tmp_path / "test.jsonl"
    labels = ["benign", "benign", "malicious", "suspicious"]
    path.write_text(
        "\n".join(
            json.dumps({"raw_text": str(i), "verdict": label, "category": "none"})
            for i, label in enumerate(labels)
        )
    )
    outputs = [
        ("malicious", 0.95),
        ("suspicious", 0.8),
        ("malicious", 0.91),
        ("suspicious", 0.8),
    ]

    class Model:
        def classify(self, text):
            choice, confidence = outputs[int(text)]
            scores = {
                label: (confidence if label == choice else (1 - confidence) / 2)
                for label in ["benign", "suspicious", "malicious"]
            }
            return {
                "choice": choice,
                "scores": scores,
                "metadata": {"engine": "laya_finetuned", "category": "other"},
            }

    report = load("evaluate").evaluate_dataset(Model(), path)
    assert report["verdict_accuracy"] == 0.5
    assert report["benign_false_positive_rate"] == 0.5
    assert report["benign_nonbenign_rate"] == 1
    assert report["auto_detect_at_0_9"] == {
        "flagged": 2,
        "precision": 0.5,
        "malicious_recall": 1,
    }
    assert report["classes"]["malicious"]["precision"] == 0.5
    assert report["confusion_matrix"]["benign->malicious"] == 1
