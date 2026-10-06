# MIMORI Architecture

MIMORI accepts telemetry asynchronously and evaluates configured signals after ingestion. Throughput and latency depend on deployment and workload; ingestion and detection do not block agent actions.

## Components

- **Frontend / Dashboard:** Next.js 16 (App Router) styled with Tailwind CSS, delivering a fast, terminal-inspired brutalist UI.
- **Ingestion & API:** Next.js Serverless routes handle event ingestion from the Python SDK. The `POST /api/ingest/event` endpoint parses and structures the telemetry.
- **Detection Engine:** A deterministic rules engine evaluates incoming payload strings (prompts, tool inputs, responses) against active regex and keyword signatures. It's backed up by an **asynchronous LLM Judge** that does deep semantic analysis on complex payloads without blocking the ingestion queue.
- **Background Workers:** Authenticated POST endpoints recover interrupted detection passes, process judge jobs and enforce retention. The operator must schedule them and monitor pending work and failures. See [recovery and durability](durability.md).
- **Database & Auth:** Supabase (PostgreSQL) handles all state. Row Level Security (RLS) policies ensure multi-tenant data isolation, while Supabase Auth manages dashboard access.
- **Telemetry Integrations:** A base Python client and 16 Python framework/provider adapters, a Vercel AI SDK source adapter, and authenticated HTTP for custom runtimes. All feed the same event contract; see the [integration matrix](integrations.md) for adapter sources and verification scope.

## Data Flow

```
┌─────────────────┐     POST /api/ingest/event     ┌─────────────────┐
│  Python SDK      │ ──────────────────────────────▶│  Next.js API    │
│  (mimori)        │◀── { accepted, ... } ──────────│  Ingestion      │
└─────────────────┘                                 └────────┬────────┘
                                                            │
                                                            ▼
                                                   ┌─────────────────┐
                                                   │  Supabase DB     │
                                                   │  (PostgreSQL)    │
                                                   │                  │
                                                   │  ┌────────────┐  │
                                                   │  │ events      │  │
                                                   │  │ sessions    │  │
                                                   │  │ agents      │  │
                                                   │  │ detections  │  │
                                                   │  │ rules       │  │
                                                   │  └────────────┘  │
                                                   └────────┬────────┘
                                                            │
                                          ┌─────────────────┼─────────────────┐
                                          │                 │                 │
                                          ▼                 ▼                 ▼
                                 ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                                 │ Rules Engine  │ │ LLM Judge    │ │ Dashboard    │
                                 │ (synchronous) │ │ (async RPC)  │ │ (Next.js UI) │
                                 │               │ │              │ │              │
                                 │ Pattern match │ │ Semantic     │ │ Stats, tables│
                                 │ on payload    │ │ analysis via │ │ filters,     │
                                 │ text          │ │ Ollama/GPT/  │ │ severity     │
                                 │               │ │ Claude/Gemini│ │ badges       │
                                 └──────┬───────┘ └──────┬───────┘ └──────────────┘
                                        │                │
                                        ▼                ▼
                                 ┌─────────────────────────────┐
                                 │    detections table          │
                                 │    (rule + llm_judge rows)   │
                                 └─────────────────────────────┘
```

### Ingestion Path

1. Agent calls SDK → SDK sends `POST /api/ingest/event` with API key
2. API validates key, rate-limits, parses envelope
3. Agent/Session upserted → Events batch-inserted
4. Rules engine runs synchronously against enabled rules for the key's organization
5. Unmatched events use optional Laya classification, or trigger terms and sampling when Laya is disabled/unavailable, to decide whether to record a classifier finding or queue judge work
6. HTTP 202 response returns accepted count, external/internal session IDs, immediate detections, and any skipped-event metadata

### Detection Path

1. **Rule-based (sync):** Payload text scanned against compiled regex/keyword rules
2. **Laya (optional):** Unmatched payloads go to the configured service. The bundled adapter uses heuristics without a compatible supplied checkpoint; scores are not independently validated probabilities.
3. **LLM Judge (async):** A scheduled worker claims queued jobs, sends payloads to the configured provider, and stores qualifying findings.
4. Findings carry layer attribution: `rule`, `laya`, or `llm_judge`.

### Dashboard Path

1. Server components query Supabase with RLS-scoped RPCs
2. `getOverviewStats()` computes vigilance level from detection severity counts
3. Pages show recorded snapshots; refresh to load new events. Continuous Realtime updates are future work.

## Database Schema

Core tables:
- `organizations` → multi-tenant boundary
- `org_members` → user-org membership with roles
- `api_keys` → per-org API authentication
- `agents` → observed AI agents
- `sessions` → execution sessions per agent
- `events` → telemetry events within sessions
- `detections` → findings from rules, optional Laya, or the LLM judge
- `rules` → detection rule definitions
- `llm_judge_jobs` → async LLM analysis queue
- `judge_settings` → per-org LLM judge configuration

## Deployment Topology

- Dashboard hosted on Vercel (or any Next.js compatible platform)
- Database hosted on Supabase (cloud or self-hosted)
- SDK deployed locally on your AI agent servers
- Local dev via `docker-compose.yml` or `.devcontainer`
