-- New Supabase projects no longer expose public-schema tables through the Data API by default.
-- RLS remains the authorization boundary; these grants only make the required tables reachable.

grant usage on schema public to anon, authenticated, service_role;

grant select on table
  public.organizations,
  public.org_members,
  public.api_keys,
  public.agents,
  public.sessions,
  public.events,
  public.detections,
  public.llm_judge_jobs,
  public.rules,
  public.judge_settings
to authenticated;

grant all privileges on table
  public.organizations,
  public.org_members,
  public.api_keys,
  public.agents,
  public.sessions,
  public.events,
  public.detections,
  public.llm_judge_jobs,
  public.rules,
  public.judge_settings
to service_role;
