# Changelog

All notable changes are recorded here.

## v1 — First public beta (2026-10-05)

The `v1` tag starts this repository's public release history. Dashboard and SDK
package metadata remain at `1.1.0`; installing the source at this tag is separate
from installing an older package from PyPI.

- Import the cleaned public source without development history, private notes,
  credentials, local model checkpoints, or earlier tags.
- Remove the hypothetical judge-cost card and its unused dashboard queries.
- Keep the personal handbook outside the public tree and workstation development
  origins in local environment settings.

- Keep the red-team pack version private to its API route so strict production route type checks pass. Verify OpenAI Agents trace/tool delivery independently of background HTTP batch timing.
- Exercise exact native framework versions in isolated CI jobs; fix Pydantic AI Hooks, LlamaIndex callbacks, Haystack hooks, Composio modifiers and Vercel AI SDK 6 payload mapping. Bound the AG2 extra to the verified API and disclose MetaGPT's upstream dependency override.
- Move the multiagent example into `examples/multiagent` to prevent shadowing the OpenAI Agents SDK's `agents` module.
- Recover interrupted detection passes through an authenticated worker and completion markers; make finding and judge inserts idempotent. Add concurrent replay, hard-crash, stale-job recovery and PostgreSQL backup/restore checks.
- Replace obsolete Laya training and notebook APIs with actual pinned-weight decision-head training, source-family-separated train/calibration/test splits, strict evaluation and model-required service mode.
- Publish an optional experimental trained Laya artifact with exact datasets, weight-change verification, model card, evaluation and checksums. It remains disabled by default: 64.4% synthetic test accuracy is below the 68.9% majority baseline, with 3/9 benign false positives. Preserve regular judge trigger/sampling review for uncertain model results.
- Present MIMORI's framework-agnostic scope and integration matrix: 16 Python framework/provider adapters, the Vercel source adapter, and custom Python/HTTP runtimes.
- Add runnable custom Python and Node.js examples and authenticate/persist both through the browser onboarding suite.
- Add an integration issue template and clarify that adapter unit coverage is distinct from live native-framework compatibility.
- Simplify the public README, add a documentation index, group telemetry and live-model examples, and give maintained documentation version-independent filenames.
- Remove legacy illustrative demo assets and obsolete manual adapter scripts; use the maintained SDK and browser suites for verification.
- Replace the invalid shell-array pre-commit hook with the release secret scanner and ignore isolated `.venv-*` environments.
- Fix custom-rule creation to include the server-resolved organization ID; verify rule saving and disabling through an authenticated browser and database reads.
- Add a 72-second silent walkthrough with live local Llama 3.1/LangChain recordings and dashboard control interactions.
- Keep launch planning, social copy, workstation notes, recording/editing scripts, and redundant demo assets out of the public repository tree.
- Refresh public documentation, architecture, roadmap, and source-install examples to distinguish shipped behavior, historical checks, and unverified integrations.
- Restrict deployment judge credentials to official provider endpoints; reject HTTP redirects. Custom HTTPS endpoints require an operator-approved origin and a caller-supplied key.
- Remove shared demo login credentials and preserve HTTPS OAuth callback origins. Set `APP_URL` to the public HTTPS origin in production.
- Upgrade Next.js to 16.3.8 and sharp to 0.35.5; make npm and installed Python dependency audits gate CI.
- Preserve bounded SDK security observations through redaction, with a configurable rule for reported credential exposure. Observations are untrusted telemetry, not proof an action executed.
- Repair local setup without resetting data; separate sandbox identity seeding from production rules. Provision 12 starter rules automatically for new organizations.
- Compare tool input fingerprints and execution order; reject malformed CLI responses. Redacted values cannot be distinguished by comparison, and fingerprints are not an anonymization guarantee.
- Validate guardrail modes, bound structural evaluation and custom regex patterns, inspect normalized text, and reject inputs above one million characters.
- Enforce tenant boundaries on rules, event ancestry, and detection rule references. Add five migrations; composite foreign keys preserve historical rows pending an explicit consistency audit.
- Bound ingestion bodies while streaming, enforce event budgets atomically, and return retryable 503 errors when rate-limit storage is unavailable.
- Keep API key authentication and email callbacks reachable; preserve all refreshed session cookie chunks.
- Add authenticated browser onboarding, disposable database validation, SDK distribution verification, and history/candidate-file secret scanning to release checks.
- Correct dashboard counts and snapshot labels. Remove the hypothetical judge-cost estimate and its related overview fields.
- Package the JavaScript adapter and typing marker in the SDK wheel. Document source installation until the matching release is published.

Validation and remaining public release gates are tracked in [the release checklist](docs/release-checklist.md).

## 1.1.0

### New Features
- **Laya Classifier (Layer 1.5)**: Added optional Laya classification between rules and the asynchronous judge. Available classifications route events according to configured thresholds; unavailable services fall back to trigger terms and sampling. Coverage and latency depend on the service and inputs.
- **SDK Laya-Enhanced Guardrails**: `MIMORIGuardrail` accepts `use_classifier=True` for optional classification after regex checks. Unavailable services fall back to regex; detection quality requires separate evaluation.
- **New Detection Layer**: Detections now report `layer: "laya"` alongside `"rule"` and `"llm_judge"`. Webhook alerts include Laya as a distinct detection source.

## 1.0.1

### Security Hardening
- **DISABLE_AUTH NODE_ENV Guard**: `DISABLE_AUTH` bypass is now blocked in production. Auth collapse is prevented if the env var is accidentally set on deployed instances.
- **Dashboard Route Authentication**: Added authentication checks to 8 previously unauthenticated dashboard API routes (`/api/agents`, `/api/detections`, `/api/stats/overview`, `/api/stats/judge`, `/api/sessions/[id]/events`, `/api/agents/[id]/sessions`, `/api/behavior-diff`, `/api/export/detections`).
- **Rate Limiter Fail-Closed**: Rate limiter now denies requests on database error instead of failing open, preventing abuse during infrastructure outages.
- **Timing-Safe Secret Comparison**: Worker authorization now uses `crypto.timingSafeEqual` to prevent timing attacks on CRON_SECRET verification.
- **Workers Require CRON_SECRET Always**: Removed dev-mode authentication skip in `/api/workers/retention` and `/api/workers/llm-judge`. CRON_SECRET is required in all environments; returns 500 if unset.
- **Sanitized LLM Error Messages**: Error messages from LLM judge failures are now stripped of API keys, URLs, internal addresses, and tokens before being stored in the `llm_judge_jobs` table.
- **Hardened LLM Judge Prompt**: Wrapped telemetry payload in `<<<MIMORI_UNTRUSTED_DATA_START>>>`/`<<<MIMORI_UNTRUSTED_DATA_END>>>` delimiters to resist XML-based prompt injection. Moved classification instructions to the `system` message role across all providers (OpenAI, DeepSeek, Ollama, Gemini, Anthropic). Added explicit instruction to never follow commands found in telemetry data.
- **Removed Hardcoded Supabase Keys**: Replaced hardcoded JWT fallback keys in `app/lib/env.ts` with `"REPLACE_ME"` placeholders. `requireEnv()` now throws in production if a placeholder value is detected.
- **Security Headers**: Added `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy` to all responses via `next.config.mjs`.
- **SDK HTTP Warning**: The Python SDK now emits a warning at startup if configured with an insecure HTTP URL for non-localhost deployments.
- **Settings/Judge RLS**: Replaced service-role client with RLS-scoped server client in `/api/settings/judge` and `/api/stats/judge` to respect row-level security policies.
- **Key Expiration Enforcement**: `expires_in_days` parameter in key creation is now enforced by computing and storing an `expires_at` timestamp on the `api_keys` record.

### API Layer Quality
- **Normalized Error Responses**: All API routes now return the structured `{ error: { code, message } }` envelope via `apiError()`. Removed ad-hoc `{ error: "string" }` responses from settings/judge, settings/judge/test, workers/retention, and export/detections routes.
- **Structured Logging Everywhere**: Added `pino` logger to all 19 API routes. Previously only 4 routes used structured logging; the rest relied on `console.error`.
- **Eliminated Duplicated Schemas**: Removed 3 duplicated Zod schemas (`patchRuleSchema`, `judgeSettingsPutSchema`, `judgeTestSchema`) from route files. All routes now import from the canonical `app/lib/schemas.ts`.

### Dashboard/UI Quality
- **Route-Level Error Boundaries**: Added `error.tsx` to agents, detections, rules, events, and settings routes. Previously only the root route had an error boundary; any page-level database error crashed the entire app.
- **Loading Skeletons**: Added `loading.tsx` to agents, detections, rules, and events routes for instant visual feedback during navigation.
- **Global Error Boundary**: Added `global-error.tsx` for unrecoverable root layout errors.
- **Replaced `alert()` with Inline UI**: Key creation/revocation/deletion errors in the API Keys page now display as inline toast notifications. Rule toggle errors display as inline error text below the toggle.
- **Standardized Empty States**: Rules, agent detail, session timeline, and top agents table now use the shared `<EmptyState>` component instead of ad-hoc inline JSX.
- **Accessibility**: Added `aria-current="page"` to the active navigation link. Added `aria-hidden="true"` to decorative terminal window controls. Removed misleading `cursor-pointer` from non-functional elements.
- **Design Token Consistency**: Replaced hardcoded hex colors (`bg-[#131313]`, `bg-[#161616]`) with Tailwind design tokens (`bg-surface-dim`) in behavior-diff, key-actions, and top-agents-table components.

### Cleanup
- Removed unused `app/lib/constants.ts` (empty file) and `app/lib/db/browser.ts` (never imported).

## 1.0.0

- **Automated LLM Judge Sampling**: Introduced `LLM_JUDGE_SAMPLING_RATE` to drastically reduce AI inference costs while maintaining deterministic trigger coverage.
- **Enhanced Observability**: Added structured JSON logging via `pino` and a 30-day automated data retention policy worker for optimized storage.
- **Power User UI Polish**: Deployed a one-click CSV Export functionality on the Threat Detections dashboard.
- **Robust Local Testing**: Shipped the core rule pack seed (`supabase/seed/001_rules.sql`) for local environments.
- **Modernized Core Tech Stack**: Upgraded Next.js to 16.x, React to 19.x, and TypeScript to 5.7+ with zero breakages, and streamlined Playwright + Vitest suites.

## 0.1.1-alpha

- SDK version bump to `0.1.1` to track minor fixes.

## 0.1.0-alpha

- Initial public alpha of MIMORI observability, detection rules, dashboard, behavior diff, and Python SDK.
- The project observes and detects agent behavior; it does not enforce or block actions.
