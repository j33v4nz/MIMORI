create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  key_prefix text not null,
  key_hash text not null unique,
  name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  framework text not null default 'langchain',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (org_id, name)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  external_session_id text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (agent_id, external_session_id)
);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  pattern text not null,
  pattern_type text not null check (pattern_type in ('regex', 'keyword')),
  category text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  event_type text not null check (event_type in (
    'llm_start',
    'llm_end',
    'tool_start',
    'tool_end',
    'chain_start',
    'chain_end',
    'agent_action',
    'manual'
  )),
  payload jsonb not null,
  sequence_number integer not null check (sequence_number > 0),
  created_at timestamptz not null default now(),
  unique (session_id, sequence_number)
);

create table public.detections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  layer text not null check (layer in ('rule', 'llm_judge')),
  rule_id uuid references public.rules(id),
  category text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  confidence numeric(3,2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  verdict text not null check (verdict in ('benign', 'suspicious', 'malicious')),
  raw_model_output jsonb,
  created_at timestamptz not null default now(),
  check (
    (layer = 'rule' and rule_id is not null)
    or (layer = 'llm_judge' and rule_id is null)
  )
);

create table public.llm_judge_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id)
);

create index idx_api_keys_prefix on public.api_keys(key_prefix) where revoked_at is null;
create index idx_agents_org on public.agents(org_id, last_seen_at desc);
create index idx_sessions_agent on public.sessions(agent_id, started_at desc);
create index idx_events_session on public.events(session_id, sequence_number);
create index idx_detections_event on public.detections(event_id);
create index idx_detections_severity on public.detections(severity, created_at desc);
create index idx_llm_judge_jobs_status on public.llm_judge_jobs(status, created_at);

create schema if not exists private;

grant usage on schema private to anon, authenticated;

create or replace function private.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.org_members
    where org_members.org_id = target_org_id
      and org_members.user_id = auth.uid()
  );
$$;

grant execute on function private.is_org_member(uuid) to anon, authenticated;

alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.api_keys enable row level security;
alter table public.agents enable row level security;
alter table public.sessions enable row level security;
alter table public.events enable row level security;
alter table public.detections enable row level security;
alter table public.llm_judge_jobs enable row level security;
alter table public.rules enable row level security;

create policy "org members can read organizations"
  on public.organizations for select
  using (private.is_org_member(id));

create policy "org members can read memberships"
  on public.org_members for select
  using (private.is_org_member(org_id));

create policy "org members can read api keys"
  on public.api_keys for select
  using (private.is_org_member(org_id));

create policy "org members can read agents"
  on public.agents for select
  using (private.is_org_member(org_id));

create policy "org members can read sessions"
  on public.sessions for select
  using (
    agent_id in (
      select agents.id
      from public.agents
      where private.is_org_member(agents.org_id)
    )
  );

create policy "org members can read events"
  on public.events for select
  using (
    session_id in (
      select sessions.id
      from public.sessions
      join public.agents on agents.id = sessions.agent_id
      where private.is_org_member(agents.org_id)
    )
  );

create policy "org members can read detections"
  on public.detections for select
  using (
    event_id in (
      select events.id
      from public.events
      join public.sessions on sessions.id = events.session_id
      join public.agents on agents.id = sessions.agent_id
      where private.is_org_member(agents.org_id)
    )
  );

create policy "org members can read llm judge jobs"
  on public.llm_judge_jobs for select
  using (
    event_id in (
      select events.id
      from public.events
      join public.sessions on sessions.id = events.session_id
      join public.agents on agents.id = sessions.agent_id
      where private.is_org_member(agents.org_id)
    )
  );

create policy "authenticated users can read rules"
  on public.rules for select
  to authenticated
  using (true);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  display_name text;
begin
  display_name := coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1), 'MIMORI');

  insert into public.organizations (name)
  values (display_name || ' Org')
  returning id into new_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();
