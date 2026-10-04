#!/usr/bin/env python3
"""Scan candidate public working files and every git ref; print metadata, never values.

Requires gitleaks on PATH (or GITLEAKS_BIN). Full history requires a full clone.
Reports stay in a temporary directory and are removed after metadata extraction.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
scanner = os.environ.get("GITLEAKS_BIN", "gitleaks")
if not shutil.which(scanner):
    sys.exit("Install gitleaks or set GITLEAKS_BIN to its executable.")
findings = []
reviewed = []
warnings = []
allowlist_path = root / "scripts/release/reviewed-secret-fixtures.json"
allowlist = json.loads(allowlist_path.read_text()) if allowlist_path.exists() else []
with tempfile.TemporaryDirectory(prefix="mimori-secret-review-") as directory:
    temporary = Path(directory)
    tree = temporary / "tracked"
    tree.mkdir()
    tracked = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root).decode().split("\0")
    for name in filter(None, tracked):
        source = root / name
        if source.is_file() and not source.is_symlink():
            target = tree / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    for mode, source in [("git", root), ("dir", tree)]:
        report = temporary / f"{mode}.json"
        # Reports contain values only inside this temporary directory so we can
        # compare exact reviewed fixture hashes. No raw scanner output is emitted.
        command = [scanner, mode, str(source), "--redact=0", "--no-banner", "--log-level=error",
                   "--report-format=json", f"--report-path={report}"]
        config = root / ".gitleaks.toml"
        if config.exists():
            command.append(f"--config={config}")
        if mode == "git":
            command.append("--log-opts=--all")
        result = subprocess.run(command, cwd=root, capture_output=True)
        if result.returncode not in (0, 1):
            sys.exit(f"Secret scanner failed in {mode} mode (exit {result.returncode}); raw output suppressed.")
        if report.exists():
            for finding in json.loads(report.read_text()):
                path = finding.get("File", "")
                if mode == "dir":
                    path = path.removeprefix(str(tree) + "/")
                import hashlib
                digest = hashlib.sha256(finding.get("Secret", "").encode()).hexdigest()
                metadata = {"scope": mode, "file": path, "line": finding.get("StartLine"),
                            "commit": finding.get("Commit", ""), "rule": finding.get("RuleID")}
                approved = next((entry for entry in allowlist if entry["file"] == path and entry["sha256"] == digest
                                 and ("commit" not in entry or entry["commit"] == metadata["commit"])), None)
                if approved:
                    destination = warnings if approved.get("kind") == "historical_warning" else reviewed
                    destination.append({**metadata, "reason": approved["reason"]})
                else:
                    findings.append(metadata)
print(json.dumps({"findings": findings, "count": len(findings), "historical_warnings": warnings,
                  "reviewed_fixture_count": len(reviewed)}, indent=2))
sys.exit(1 if findings or warnings else 0)
