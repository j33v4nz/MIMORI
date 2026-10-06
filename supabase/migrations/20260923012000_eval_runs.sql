-- Red-team eval runs: versioned attack-pack precision/recall snapshots.
--
-- Written by the red-team worker (POST /api/workers/redteam). One row per run.
-- pack_version pins the attack-pack + embedded rule snapshot so precision/recall
-- trends stay comparable across releases.

create table if not exists public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  pack_version text not null,
  precision double precision not null check (precision >= 0 and precision <= 1),
  recall double precision not null check (recall >= 0 and recall <= 1),
  total integer not null check (total >= 0),
  passed integer not null check (passed >= 0 and passed <= total),
  failed integer not null default 0 check (failed >= 0),
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.eval_runs enable row level security;

-- Service-role only: no public/org policies (worker writes via service client).
