"""Evaluate static benchmark payloads only; never execute dataset instructions."""
import importlib.util
import json
from pathlib import Path
import sys
import time

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("benchmark_guardrail", root / "sdk/mimori/guardrail.py")
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
guard = module.MIMORIGuardrail(mode="block", use_classifier=False)
payloads = json.load(sys.stdin)
for payload in payloads[:50]:
    guard.evaluate(payload)
results = []
for payload in payloads:
    start = time.perf_counter_ns()
    verdict = guard.evaluate(payload)
    elapsed = (time.perf_counter_ns() - start) / 1e6
    results.append({"detected": verdict.is_violation, "categories": [verdict.category] if verdict.is_violation else [], "latency_ms": elapsed})
json.dump({"rule_count": len(guard.rules), "results": results}, sys.stdout)
