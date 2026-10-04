# Security Architecture

## Trust boundaries

- The browser receives only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Next.js server routes use `SUPABASE_SERVICE_ROLE_KEY` for ingestion, API-key management, and asynchronous judge work. This key must never reach the client.
- Supabase RLS restricts authenticated dashboard reads to organization membership. Explicit Data API grants expose only the tables required by the application; RLS remains the authorization layer.
- The ingestion API accepts a MIMORI API key and stores the submitted telemetry. It observes and detects behavior but does not block an agent action.
- Local LLM judge mode sends payloads to a local Ollama-compatible endpoint. Cloud judge mode sends payloads to the configured provider and requires its API key as a server-side environment variable.

## Authentication and authorization

- `DISABLE_AUTH` bypass is blocked in production (`NODE_ENV === "production"`). If accidentally set on a deployed instance, auth remains enforced.
- Dashboard API routes require authenticated Supabase sessions. Behavior comparison also accepts an organization-scoped API key; invalid supplied bearer credentials are rejected even if a browser session is present. Rule creation requires owner authorization and assigns the server-resolved organization ID.
- Worker routes (`/api/workers/detections`, `/api/workers/retention`, `/api/workers/llm-judge`) require `CRON_SECRET` in all environments — no dev-mode skip. Authorization uses `crypto.timingSafeEqual` to prevent timing attacks.

## LLM judge security

- Telemetry payloads are wrapped in separately generated `<<<MIMORI_<random-id>_UNTRUSTED_DATA>>>` opening/closing delimiters. Instructions explicitly treat enclosed content as untrusted; this separation does not guarantee prompt-injection resistance.
- Classification instructions are placed in the `system` message role, separate from the untrusted user content.
- LLM error messages are sanitized (`sanitizeErrorMessage()`) before storage in `llm_judge_jobs` to prevent API keys, URLs, internal addresses, and tokens from leaking into the database.
- Settings and judge routes use the RLS-scoped server client instead of the service-role client.

## Security headers

All responses include via `next.config.mjs`:

- `Content-Security-Policy` — restricts configured sources and disallows framing. The current script policy permits `unsafe-inline` and `unsafe-eval`; it is not a nonce-based strict CSP. Review `next.config.mjs` before changing deployment policy.
- `X-Frame-Options: DENY` — prevents clickjacking.
- `X-Content-Type-Options: nosniff` — prevents MIME-type sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin` — limits referrer leakage.
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` — disables unnecessary browser APIs.

## Secrets management

- `SUPABASE_SERVICE_ROLE_KEY` is only used by server routes. Never expose through `NEXT_PUBLIC_`, client components, browser bundles, issues, or logs.
- Hardcoded Supabase JWT placeholders use `"REPLACE_ME"` — `requireEnv()` throws in production if a placeholder is detected.
- Cloud-provider LLM API keys are never persisted in the database. They are provided via environment variables.
- `expires_in_days` is enforced by computing and storing an `expires_at` timestamp on `api_keys`.

## Operational limits

- The Python SDK redacts recognized sensitive values before transport. The ingestion API does not provide a universal server-side scrubber: direct callers must sanitize their own payloads. Pattern redaction cannot guarantee removal of every secret or personal value; review retention and access controls for your data.
- The rate limiter is DB-backed (Supabase) and fails closed on database error. It works across multiple application instances but adds write latency to ingestion. Use an external shared limiter (e.g., Redis) before horizontally scaling to very high throughput.
- Development routes and the optional development seed are for local use only. Do not deploy `/api/dev/*` or the seeded development API key.

## Migration review

Review every migration for RLS, ownership checks, `SECURITY DEFINER` functions, Data API grants, and service-role exposure. Any new public table must enable RLS and include deliberate grants and policies before dashboard code depends on it.
