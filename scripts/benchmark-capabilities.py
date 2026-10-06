"""Check proposed attack-tool scope against explicit task capabilities.

This uses dataset tool labels, not generated agent actions. Report it as a
policy coverage check, never as detection recall or an official ASR score.
"""
import ast
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sdk"))
from mimori import ToolCapabilityPolicy

dataset = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/mimori-injecagent") / "data"
rows = []
hashes = {}
for family in ("dh", "ds"):
    path = dataset / f"test_cases_{family}_base.json"
    hashes[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    for index, case in enumerate(json.loads(path.read_text())):
        arguments = ast.literal_eval(case["Tool Parameters"])
        policy = ToolCapabilityPolicy([(case["User Tool"], arguments)])
        denied = [name for name in case["Attacker Tools"] if not policy.allows_tool(name)]
        same_scope = [name for name in case["Attacker Tools"] if policy.allows_tool(name)]
        rows.append({"id": f"{family}-{index}", "authorized_original_call": policy.allows(case["User Tool"], arguments),
                     "proposed_attack_tools": case["Attacker Tools"], "denied_tool_names": denied,
                     "same_tool_requires_argument_check": same_scope})
controls_path = dataset / "user_cases.jsonl"
control_allowed = []
for line in controls_path.read_text().splitlines():
    case = json.loads(line)
    args = ast.literal_eval(case["Tool Parameters"])
    control_allowed.append(ToolCapabilityPolicy([(case["User Tool"], args)]).allows(case["User Tool"], args))
report = {"scope": "Task-scoped capability coverage of dataset proposed tool names, not agent ASR or prompt-injection recall",
          "cases": len(rows), "cases_with_a_denied_proposed_attack_tool": sum(bool(r["denied_tool_names"]) for r in rows),
          "cases_with_all_proposed_attack_tool_names_denied": sum(not r["same_tool_requires_argument_check"] for r in rows),
          "cases_needing_same_tool_argument_checks": sum(bool(r["same_tool_requires_argument_check"]) for r in rows),
          "original_calls_allowed": sum(r["authorized_original_call"] for r in rows),
          "distinct_control_calls": len(control_allowed), "distinct_control_calls_allowed": sum(control_allowed),
          "dataset_sha256": hashes,
          "policy_source_sha256": hashlib.sha256((ROOT / "sdk/mimori/capabilities.py").read_bytes()).hexdigest(),
          "limitations": ["Grant is supplied from the fixture's legitimate original tool and arguments; real applications must implement this task-scoped grant process.",
                          "No agent ran and no attack tools executed; attacker tool names come from dataset labels.",
                          "One case includes the authorized tool name as a first attack step. Its arguments need checking; the later email tool is denied.",
                          "A task requiring wider tool access needs wider grants; coverage may change."]}
out = ROOT / "docs/benchmarks/capabilities"
out.mkdir(parents=True, exist_ok=True)
(out / "results.json").write_text(json.dumps(report, indent=2) + "\n")
(out / "cases.jsonl").write_text("\n".join(json.dumps(row) for row in rows) + "\n")
print(json.dumps(report, indent=2))
