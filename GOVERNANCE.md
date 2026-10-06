# Governance

MIMORI is maintainer-led. Maintainers review correctness, security impact, documentation, and fit with its framework-agnostic agent telemetry, security review, and behavior comparison scope. Framework adapters and custom runtimes are part of that scope.

Changes affecting authentication, RLS, API keys, ingestion, telemetry handling, or database migrations require explicit security review before merge. New detection rules require focused positive and negative tests.

Releases are tagged from `main` after the [release checklist](docs/release-checklist.md) is complete. Breaking changes, migration requirements, and rule-pack changes are documented in [CHANGELOG.md](CHANGELOG.md).
