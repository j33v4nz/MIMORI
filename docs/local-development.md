# Local Development

MIMORI supports a managed Supabase quickstart and a fully local Supabase stack. Both paths use the same migrations, core rule seed, and application configuration.

## Prerequisites

- Node.js 20 or newer and npm
- Python 3.10 or newer for SDK work
- A managed Supabase project, or Docker/compatible container runtime for the local stack
- Optional: Ollama for local LLM judge mode

Install project dependencies first:

```bash
npm ci
cp .env.example .env.local
```

## Managed Supabase quickstart

1. Create a Supabase project with Auth enabled.
2. Copy its project URL, anon key, and service-role key into `.env.local`:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

3. In the Supabase SQL Editor, run every file in `supabase/migrations/` in filename order.
4. Start the application with `npm run dev`, open `http://localhost:3000`, and sign up.
5. New organizations receive starter rules automatically. To provision pre-existing organizations that have no rules, run `supabase/seed/001_rules.sql`. Do not run `000_dev_org.sql` on a hosted database.

New Supabase projects require the explicit Data API grants in the final migration. Do not skip it: authenticated dashboard reads use the Supabase Data API and remain constrained by RLS.

## Local Supabase quickstart

The simplest way to start and configure the local Supabase stack is with the automated setup command. Docker must be running before you execute this command:

```bash
npm run setup
```

This command automatically:
* Copies `.env.example` to `.env.local` (if it does not exist)
* Starts the local Supabase services
* Applies pending migrations with `npx supabase migration up --local`, then applies the local sandbox seed and core rules through the database container, preserving existing data
* Fetches the local Supabase credentials and populates them directly in your `.env.local` file

#### Manual Alternative (Optional/Debugging)
If you prefer to configure the credentials manually:
1. Start Supabase and reset the database:
   ```bash
   npx supabase start
   ```
   ```bash
   npx supabase db reset
   ```
2. Copy the credentials printed by `npx supabase status -o env` into `.env.local`:
   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

`npx supabase db reset` deletes local data and applies migrations and the local seeds. Use it only when you deliberately want a clean database. `000_dev_org.sql` provisions a sandbox identity without password login for optional `DISABLE_AUTH=true`; never apply it to production.

Then start the dashboard:

```bash
npm run dev
```

Local Supabase Studio runs at `http://127.0.0.1:54323` and Mailpit at `http://127.0.0.1:54324`. Stop the stack with `npx supabase stop` when finished.

## Create an ingestion key and run the demo

Sign up at `http://localhost:3000`; local confirmation emails appear at `http://127.0.0.1:54324`. Open the dashboard at `http://localhost:3000` (in sandbox mode with `DISABLE_AUTH=true`, you will be logged in automatically; otherwise, sign up) and create an API key from **API Keys**. Export that key in the shell running the demo:

```bash
export MIMORI_DEV_API_KEY="mmr_dev_your_key_here"
npm run demo
npm run evaluate:attacks
```

The scripts read `.env.local` automatically. They submit sample telemetry through the real ingestion and detection path but do not execute payloads.

## LLM judge configuration

Configure the LLM judge from **Settings**. Local mode targets Ollama or another OpenAI-compatible endpoint. For Gemini or DeepSeek, configure the provider key in `.env.local`; the application does not persist it in Supabase.

## Python SDK

Install the current SDK from the repository root. PyPI currently contains an older release that lacks the current CLI, guardrails, and framework adapters:

```bash
pip install -e ./sdk
```

For SDK development and running the test suite:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e './sdk[dev]'
python -m pytest sdk/tests
```

Install the optional LangChain extra locally with `pip install -e './sdk[dev,langchain]'`.

## Production boundaries

- Use a separate Supabase project and separate ingestion keys for production.
- Never deploy `/api/dev/*` or the optional development seed.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` through a `NEXT_PUBLIC_` variable or client code.
- Configure retention and access controls before collecting sensitive telemetry.
- Review [SECURITY.md](../SECURITY.md) and [security-architecture.md](security-architecture.md) before exposing ingestion publicly.

## Production deployment

When deploying to production (Vercel, Docker, or self-hosted), ensure these environment variables are set:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service-role key (server-only) |
| `CRON_SECRET` | Yes | Shared secret for worker cron endpoints (`/api/workers/detections`, `/api/workers/retention`, `/api/workers/llm-judge`). Must be set in ALL environments — workers return 500 if unset. |
| `NODE_ENV` | Yes | Set to `production`. Controls auth guards, env validation, and security headers. |
| `DISABLE_AUTH` | **Must NOT be set** | A boot assertion in `app/lib/auth-flags.ts` throws when `NODE_ENV=production` and `DISABLE_AUTH=true`, so a misconfigured production deploy crashes at startup instead of silently disabling auth. `next build` also fails if `.env.local` still has `DISABLE_AUTH=true` — unset it before building. |
| `LLM_JUDGE_PROVIDER` | No | Enable async LLM judge (`ollama`, `gemini`, `deepseek`, `openai`, `anthropic`) |
| `LLM_JUDGE_SAMPLING_RATE` | No | Fraction of non-flagged events to sample for LLM judge (default `0.1`) |
| `LOG_LEVEL` | No | Server log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`). Default: `info` |
| `ALERT_WEBHOOK_URL` | No | Single webhook URL for critical/high threat alerts (Slack/Discord-compatible) |
| `ALERT_WEBHOOK_URLS` | No | Comma-separated webhook URLs (fan-out; combined with `ALERT_WEBHOOK_URL`). 3 attempts with backoff per URL |
| `ALERT_WEBHOOK_SECRET` | No | If set, each alert POST is signed with HMAC-SHA256 (`X-MIMORI-Signature: sha256=...`) |

**Workers:** Schedule `/api/workers/detections` every minute to recover interrupted detection passes, alongside `/api/workers/llm-judge` and `/api/workers/retention`. Authenticate with `Authorization: Bearer <CRON_SECRET>`. Monitor pending event age and worker failures; see [recovery and durability](durability.md).

- Retention: `POST /api/workers/retention?dryRun=1` reports what would be deleted without deleting. Per-org overrides live in `org_settings.retention_days` (default 30 days; strictest value wins).
- LLM judge: per-org `judge_settings.budget_monthly` caps jobs per calendar month and `kill_switch` pauses judging; over-budget/killed orgs are skipped and their jobs stay pending.

**SDK keys:** Generate ingestion keys from the dashboard after deployment. Never hardcode keys in application code — use environment variables.

## Troubleshooting

### Another app appears, or `/@vite/client`, `/index.tsx`, `/index.css` return 404

MIMORI uses Next.js. Those Vite paths and another project's browser title can
come from an older app cached at the same local address, including a service
worker left behind by another project.

1. With `npm run dev` running on port 3000, open **http://127.0.0.1:3000** in a
   fresh tab, or open **http://localhost:3000** in a private browser window.
2. To repair the original browser tab, open DevTools → Application → Service
   Workers and unregister the worker for that local origin, then hard-refresh
   with `Ctrl+Shift+R` (`Cmd+Shift+R` on macOS). MIMORI does not register a service
   worker. Preserve other projects' browser storage.
3. Check the port printed by Next.js if 3000 is occupied. Use that port in the
   browser and SDK's `MIMORI_API_URL`.

`localhost` and `127.0.0.1` have separate browser sessions, so sign in again when
changing between them. A missing session means the browser is signed out;
it does not by itself mean Supabase is offline.

### Access through a LAN address or development tunnel

For an additional development origin, set `MIMORI_DEV_ALLOWED_ORIGINS` in
`.env.local` to its hostname. Separate multiple hostnames with commas and omit
the scheme, port, and path. Restart `npm run dev` after changing the setting.
Keep workstation addresses in `.env.local` rather than committing them to
`next.config.mjs`. This setting applies only to development asset access.

### `npm run setup` fails

- **Docker not running:** Start Docker Desktop or your container runtime before running `npm run setup`.
- **Port conflict:** If ports 54321-54324 are in use, stop other Supabase instances with `npx supabase stop` or stop the process using those ports.
- **`supabase` CLI not found:** Run `npx supabase --version` to verify. Use the supported CLI installation instructions at https://supabase.com/docs/guides/local-development/cli/getting-started; the setup script uses `npx supabase`.

### `npm run dev` shows login page

You need to set `DISABLE_AUTH=true` in `.env.local` for local development without auth. This only works when `NODE_ENV !== "production"`.

### Demo returns `401 Unauthorized`

The demo requires a valid API key created via **API Keys** in the dashboard. Export it as `MIMORI_DEV_API_KEY` in the demo shell. Setup does not create ingestion keys; replace any stale key saved in `.env.local`.

### `npm run demo` can't reach the server

The demo script tries `http://localhost:3000` by default. If your dev server runs on a different port, set `MIMORI_API_URL` in `.env.local`:

```dotenv
MIMORI_API_URL=http://localhost:3001
```

### Python SDK import errors

The source SDK base installation (`pip install -e ./sdk`) has no required framework dependencies. If you see import errors for a specific framework handler, install the corresponding extra:

```bash
pip install -e './sdk[crewai]'     # CrewAI
pip install -e './sdk[autogen]'    # AutoGen/AG2
pip install -e './sdk[llama-index]' # LlamaIndex
pip install -e './sdk[dspy]'       # DSPy
pip install -e './sdk[openai-agents]' # OpenAI Agents SDK
pip install -e './sdk[pydantic-ai]'   # Pydantic AI
pip install -e './sdk[google-adk]'    # Google ADK
pip install -e './sdk[semantic-kernel]' # Semantic Kernel
pip install -e './sdk[haystack]'      # Haystack
pip install -e './sdk[agno]'          # Agno (Phidata)
pip install -e './sdk[composio]'      # Composio
pip install -e './sdk[anthropic]'     # Anthropic Claude SDK
```


## Isolated database smoke test

This checks SQL migrations, signup provisioning, and repeatable seeding in a
separate PostgreSQL container. It requires Docker, `postgres:16-alpine`, and an
existing local Supabase database container named `supabase_db_mimori`. The only
read from that existing database is an auth schema dump with no user rows. The
temporary database has no exposed ports and is removed when the script exits.
It complements a real browser signup and demo check; it does not exercise GoTrue
HTTP endpoints or the dashboard.

Run this from the repository root in Bash:

```bash
set -euo pipefail
smoke_dir=$(mktemp -d)
smoke_container="mimori-sql-smoke-$$-$RANDOM"
trap 'docker rm -f "$smoke_container" >/dev/null 2>&1 || true; rm -rf "$smoke_dir"' EXIT

docker exec supabase_db_mimori pg_dump -U postgres -d postgres \
  --schema-only --schema=auth --no-owner --no-privileges --section=pre-data \
  > "$smoke_dir/auth.sql"
# PostgreSQL 17 emits a setting PostgreSQL 16 does not recognize.
sed '/^SET transaction_timeout = /d' "$smoke_dir/auth.sql" > "$smoke_dir/auth-compatible.sql"
docker run -d --name "$smoke_container" --network none \
  --tmpfs /var/lib/postgresql/data -e POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:16-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$smoke_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
smoke_sql() {
  docker exec -i "$smoke_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1
}
smoke_sql <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA extensions;
SQL
smoke_sql < "$smoke_dir/auth-compatible.sql"
smoke_sql <<'SQL'
ALTER TABLE auth.users ADD PRIMARY KEY (id);
SQL
for migration in supabase/migrations/*.sql; do smoke_sql < "$migration"; done
smoke_sql < supabase/seed/000_dev_org.sql
smoke_sql < supabase/seed/001_rules.sql
smoke_sql <<'SQL'
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('11111111-1111-4111-8111-111111111111', 'smoke@example.invalid', '{"name":"Smoke"}');
UPDATE public.rules SET enabled = false WHERE name = 'SQL Injection';
SQL
smoke_sql < supabase/seed/000_dev_org.sql
smoke_sql < supabase/seed/001_rules.sql
smoke_sql <<'SQL'
DO $$ BEGIN
  IF (SELECT count(*) FROM public.rules) <> 36 THEN
    RAISE EXCEPTION 'Expected 12 rules for each of three organizations';
  END IF;
  IF (SELECT count(*) FROM public.org_members
      WHERE user_id = '11111111-1111-4111-8111-111111111111' AND role = 'owner') <> 1 THEN
    RAISE EXCEPTION 'Signup trigger did not provision an owner';
  END IF;
  IF (SELECT count(*) FROM public.rules WHERE name = 'SQL Injection' AND enabled = false) <> 2 THEN
    RAISE EXCEPTION 'Repeat seed overwrote existing rule toggles';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE coalesce(encrypted_password, '') <> '') THEN
    RAISE EXCEPTION 'Seed installed password credentials';
  END IF;
  IF EXISTS (SELECT 1 FROM public.api_keys) THEN
    RAISE EXCEPTION 'Seed installed a shared API key';
  END IF;
END $$;
SQL
```


## Authenticated browser smoke

Run the canonical first-user journey against local Supabase and Mailpit:

```bash
python -m venv sdk/.venv
sdk/.venv/bin/python -m pip install -e ./sdk
npx playwright install chromium
npx playwright test --config playwright.auth.config.ts
```

The config starts a separate auth-enabled development server at
`http://127.0.0.1:3107`, using `.next-auth-smoke` for build artifacts. It never
uses `DISABLE_AUTH` or shared credentials. The tests create unique accounts and
organizations, verify visible starter rules, create an API key through the UI,
run the real telemetry demo, and open the resulting behavior diff. A source Python SDK event is also checked for credential redaction and a persisted critical detection. Set up `sdk/.venv` with the SDK dependencies first, or set `MIMORI_SMOKE_PYTHON` to your Python environment. A separate
invite test verifies actual Mailpit delivery and account confirmation, then
signs in through the normal password form. Local Supabase defaults to automatic
signup confirmation; when signup confirmation is enabled, the signup test also
follows that account's email link.

Only the unique test accounts, their organizations and their Mailpit messages
are cleaned up. Cleanup refuses to delete an organization containing another
user. Screenshots are stored in `test-results/authenticated-onboarding/`;
tracing is disabled to avoid recording generated API keys. Override the test
port with `MIMORI_SMOKE_PORT` and Mailpit address with `MIMORI_MAILPIT_URL`.
Apply pending migrations before running; automatic new-organization rules and
strict rule tenant isolation require the October 3 migrations.

The existing `npm run test:e2e` suite exercises dashboard rendering in local
sandbox mode. Use the authenticated config above to verify signup and ingestion
with real sessions and unique keys.
