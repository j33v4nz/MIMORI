create table public.judge_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade unique,
  provider text not null default 'ollama' check (provider in ('ollama', 'gemini', 'deepseek', 'openai', 'anthropic')),
  model text not null default 'llama3.2',
  base_url text default 'http://localhost:11434',
  updated_at timestamptz not null default now()
);

alter table public.judge_settings enable row level security;

create policy "org members can read judge settings"
  on public.judge_settings for select
  using (private.is_org_member(org_id));

create policy "org members can update judge settings"
  on public.judge_settings for update
  using (private.is_org_member(org_id));

create policy "org members can insert judge settings"
  on public.judge_settings for insert
  with check (private.is_org_member(org_id));
