# Security Policy

## Supported versions

The source package version is **1.1.0**, with early-release/public-beta status. Check GitHub releases and package metadata for the version actually distributed; source changes on `main` can be newer than a tagged or published package. Security fixes go to `main`; there is no LTS support window.

## Data privacy & LLM secrets

MIMORI stores agent telemetry in Supabase. Prompts, tool inputs, outputs, and detections should all be treated as sensitive — set up retention and access controls that make sense for your deployment.

An Ollama judge sends requests to its configured endpoint; those requests stay local only when that endpoint is local. Database and webhook destinations determine other data transfers. Cloud-provider API keys are not persisted in judge settings and should stay as server-only environment variables; temporary connection tests may accept a caller-supplied key.

The Supabase service-role key is only used by server routes. Never expose it through a `NEXT_PUBLIC_` variable, client component, browser bundle, issue, or log. Public-schema access is locked down with RLS — review any migration that touches tables, policies, views, functions, or Data API grants.

More details in [docs/security-architecture.md](docs/security-architecture.md).

## Reporting a vulnerability

If you find a security issue — especially anything involving the control plane, telemetry ingestion, or detection engine bypasses — please report it through [GitHub Security Advisories](https://github.com/j33v4nz/MIMORI/security/advisories/new).

**Don't open a public GitHub issue for security vulnerabilities.**

Please include:

- What the vulnerability is
- How to reproduce it
- Any relevant logs or payloads (redact your API keys)
- Potential impact

We'll acknowledge your report within 48 hours and share a timeline for a fix.

Thanks for helping keep AI agents safe.
