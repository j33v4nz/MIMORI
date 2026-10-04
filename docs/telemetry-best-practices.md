# Telemetry Best Practices for MIMORI

When deploying MIMORI to production, especially for high-volume or highly active AI agents, you need to consider how telemetry is processed, stored, and evaluated.

## Data Retention
MIMORI stores the events your instrumentation submits. Coverage depends on the adapter and application; recorded volume can grow rapidly.
- **Short-term storage:** We recommend keeping detailed raw payloads (which include full prompts and model outputs) for **14 to 30 days**.
- **Long-term storage:** Aggregate statistics and critical detections should be retained long-term, while raw events can be archived to cold storage (e.g., S3) or purged.
- **Built-in Pruning:** Schedule authenticated POST requests to `/api/workers/retention` using `CRON_SECRET`. The default retention is 30 days, with organization-specific policies and bounded deletion batches. Preview with `?dryRun=true` before deleting. Related findings may be removed through database cascades; export required evidence before pruning. This is not an archival service.

## Sampling Strategies
If your agents handle hundreds of events per second, running the full deterministic and LLM judge pipeline on every single interaction may be expensive or overwhelming.
- **Automated LLM Judge Sampling:** With Laya disabled or unavailable, unmatched events can be queued by trigger terms or `LLM_JUDGE_SAMPLING_RATE` (e.g., `0.1` for 10% sampling). Events already matched by deterministic rules produce immediate findings and skip judge routing. When Laya is enabled and returns a classification, its configured thresholds determine detection or judge routing instead. Sampling is not complete semantic coverage.
- **Targeted Monitoring:** Enable full telemetry only for agents in testing, beta groups, or agents exhibiting strange behavior.

## Cost Implications
- **Database Costs:** High telemetry volume will require scaling your database (Supabase/Postgres) vertically for write throughput and horizontally/storage for data volume.
- **LLM Judge Costs:** The Asynchronous LLM Judge conducts deep semantic evaluation. If using paid APIs (Gemini, DeepSeek), evaluate the cost per token. For high volume, strongly consider using the local Ollama integration, which shifts the cost from API usage to your own compute infrastructure.

## Privacy & Secrets
- Never log raw PII (Personally Identifiable Information) if it can be avoided.
- Use pre-ingestion scrubbers in your application code if your agents frequently handle sensitive user data that should not exist in the MIMORI database.
