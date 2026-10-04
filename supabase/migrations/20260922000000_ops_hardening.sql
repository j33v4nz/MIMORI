-- Ops hardening (P0.4/P0.5/P0.6): judge budget + kill switch, per-org retention settings.
--
-- Safe defaults: budget_monthly NULL = unlimited, kill_switch FALSE = enabled,
-- org_settings.retention_days NULL = use global default (30 days).

-- 1. Judge budget + kill switch on judge_settings
alter table public.judge_settings
  add column if not exists budget_monthly integer
    check (budget_monthly is null or budget_monthly >= 0),
  add column if not exists kill_switch boolean not null default false;

comment on column public.judge_settings.budget_monthly is
  'Max LLM judge jobs per org per calendar month. NULL = unlimited, 0 = hard disable (usage >= 0 always holds, so every job exceeds the budget; equivalent to kill_switch).';
comment on column public.judge_settings.kill_switch is
  'When true, the LLM judge worker skips this org (jobs stay pending).';

-- 2. Per-org settings (retention override)
create table if not exists public.org_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  retention_days integer
    check (retention_days is null or (retention_days >= 1 and retention_days <= 3650)),
  updated_at timestamptz not null default now()
);

alter table public.org_settings enable row level security;

drop policy if exists "org members can read org settings" on public.org_settings;
create policy "org members can read org settings"
  on public.org_settings for select
  using (private.is_org_member(org_id));

drop policy if exists "org members can insert org settings" on public.org_settings;
create policy "org members can insert org settings"
  on public.org_settings for insert
  with check (private.is_org_member(org_id));

drop policy if exists "org members can update org settings" on public.org_settings;
create policy "org members can update org settings"
  on public.org_settings for update
  using (private.is_org_member(org_id));
