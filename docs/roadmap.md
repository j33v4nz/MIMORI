# MIMORI Roadmap

Updated October 4, 2026. Future items are proposals, not delivery commitments.

## Available in the current source

- Recorded agent/session traces, event filters, findings, and finding resolution.
- Baseline/candidate comparison of recorded signatures, inputs, ordering, and findings.
- Python SDK redaction of recognized sensitive values before telemetry transport.
- Opt-in in-process guardrails for operations the application explicitly wraps.
- Optional Laya routing and asynchronous judge workers; authenticated recovery of interrupted detection passes.
- An [experimental trained Laya research checkpoint](laya-model-card.md), distributed separately with measured errors. It is disabled by default and does not meet a production classifier quality gate.
- Organization-scoped rules, a live regex validator, API keys, and judge configuration.

## Launch priorities

- Reliable fresh installation and alignment of published SDK packages with source.
- More independently reproduced agent examples and adapter compatibility checks.
- Clear documentation of coverage, fail-open behavior, and operational limits.
- Contributor tasks driven by first-user feedback.

## Proposed future work

- Continuous dashboard updates rather than refresh-based snapshots.
- Richer trace visualization and review workflows.
- Versioned rule-pack metadata and evaluated signature updates.
- Evaluated statistical behavior baselines; these are separate from the shipped session diff.
- Output sanitization for user-facing responses; SDK telemetry redaction does not sanitize the application's response to its user.
- Independently evaluated classifier checkpoints and deployment guidance.
