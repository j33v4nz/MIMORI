#!/usr/bin/env python3
"""Fail on every npm advisory except a narrowly reviewed dev-only GHSA."""

from datetime import date
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
ALLOWLIST = ROOT / "scripts/release/npm-audit-allowlist.json"


def audit(*flags: str) -> tuple[int, dict]:
    env = {key: value for key, value in os.environ.items() if not key.lower().startswith("npm_")}
    result = subprocess.run(
        [*shlex.split(os.environ.get("NPM_BIN", "npm")), "audit", "--json", *flags],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError:
        sys.exit("npm audit did not return JSON; check registry/network access.")
    if report.get("error"):
        sys.exit("npm audit failed; check registry/network access.")
    return result.returncode, report


def via_ids(vulnerability: dict) -> list[str]:
    return sorted(
        item.get("url", item.get("name", "")) if isinstance(item, dict) else item
        for item in vulnerability.get("via", [])
    )


def main() -> None:
    exception = json.loads(ALLOWLIST.read_text())
    if date.today() >= date.fromisoformat(exception["review_after"]):
        sys.exit("The npm advisory exception has expired; review and update its allowlist.")

    production_code, production = audit("--omit=dev")
    if production_code or production.get("vulnerabilities"):
        sys.exit("Production dependency audit failed; no production findings are allowlisted.")

    full_code, full = audit()
    findings = full.get("vulnerabilities", {})
    if not findings:
        if full_code:
            sys.exit("Full npm audit failed without a parseable advisory report.")
        print("Production and full npm dependency audits passed.")
        return

    expected = exception["dependency_graph"]
    if set(findings) != set(expected):
        unknown = sorted(set(findings) ^ set(expected))
        sys.exit(f"npm advisory set changed; review required for packages: {', '.join(unknown)}")

    for package, vulnerability in findings.items():
        if vulnerability.get("severity") != exception["severity"]:
            sys.exit(f"Unexpected severity for npm finding in {package}.")
        if via_ids(vulnerability) != sorted(expected[package]):
            sys.exit(f"Unexpected advisory path for npm finding in {package}.")
        if not vulnerability.get("nodes"):
            sys.exit(f"npm did not report dependency locations for {package}.")

    lock = json.loads((ROOT / "package-lock.json").read_text())
    root_version = lock.get("packages", {}).get(f"node_modules/{exception['root_package']}", {}).get("version")
    if root_version != exception["root_version"]:
        sys.exit("The vulnerable package version changed; review the advisory exception.")
    if full_code != 1:
        sys.exit("npm audit exited unexpectedly while reporting the known exception.")

    print("Production dependency audit: clean.")
    print(
        "Full audit contains only the reviewed development-tree advisory "
        f"{exception['advisory']} through the pinned dependency graph."
    )
    print(f"Review by {exception['review_after']}: {exception['reason']}")


if __name__ == "__main__":
    main()
