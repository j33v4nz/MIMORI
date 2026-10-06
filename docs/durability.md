# Recovery and durability

MIMORI stores telemetry in PostgreSQL before running its detection pass. This page describes recovery behavior and checks that exercise it. Local crash tests do not establish hosted uptime, capacity, or a production service-level objective.

## Interrupted detection passes

New events have `detection_processed_at = NULL` until findings and any judge job have been stored. An application restart, classifier error, or database error after the event commit leaves that marker pending. Authenticated `POST /api/workers/detections` processes up to 100 pending events per invocation, independently, and marks successful events complete. Finding and judge inserts are idempotent.

Apply all migrations before running the updated application. Existing events are marked complete by the migration; it does not rerun historic classification or change old findings. Schedule the recovery worker every minute alongside judge and retention workers. Use `Authorization: Bearer <CRON_SECRET>` from your scheduler's secret store. Monitor non-200 responses and the age/count of pending events. A failing batch returns 503; successful events still progress. Persistent failures require operator attention; this bounded worker does not establish a throughput guarantee.

```sql
select count(*) as pending, min(created_at) as oldest
from public.events where detection_processed_at is null;
```

The judge worker recovers processing jobs after its 15-minute stale window. Concurrent judge claims use PostgreSQL row locks and `SKIP LOCKED`. External model calls and best-effort webhook alerts are not exactly-once operations; recovered work can repeat an external request or alert.

## Reproducible checks

```bash
bash scripts/release/check-database.sh
npm run test:auth
```

The database gate creates its own disposable PostgreSQL container, applies migrations, checks tenant isolation, then runs:

- Eight concurrent senders replaying 4,000 submissions, retaining exactly 500 unique sequence identities.
- Four concurrent workers claiming 20 distinct jobs without duplicate claims.
- Hard termination during an open transaction, followed by WAL recovery: all committed fixture events survive and the uncommitted write rolls back.
- Persistence of pending detection markers and claimed judge jobs across restart; stale judge jobs can be reclaimed.
- A real `pg_dump`/`pg_restore` into another database, comparing event content, completed jobs, and RLS policy counts.

The authenticated browser gate separately commits an event without running detection, calls the recovery API, checks its completion marker and finding, rejects unauthorized worker access, and repeats the worker to check finding deduplication.

## Deployment responsibilities

Before handling production data, the operator must validate backups and point-in-time recovery on the actual provider, choose recovery-time/recovery-point targets, schedule all workers, monitor backlog growth and errors, and perform a sustained test on the intended deployment. Keep backups encrypted and access restricted. The local test uses synthetic data and checks a logical restore; it does not test cloud failover or disk corruption.

Python SDK telemetry is fail-open and queued in process memory. A source process crash before successful delivery can lose unsent events. Database recovery cannot restore data that never reached the server. Use direct HTTP with application-owned durable delivery when your workload requires a durable producer queue. Vercel callers must `await handler.close()` before process shutdown.
