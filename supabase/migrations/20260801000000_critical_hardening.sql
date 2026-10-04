-- Migration 20260801000000_critical_hardening.sql

-- 1. Backfill org_id for historical rows that predate the column addition
--    These rows are invisible through RLS because org_id is NULL.
UPDATE public.sessions SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.events SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.detections SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.llm_judge_jobs SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- 2. Make org_id NOT NULL on all four tables (safe after backfill)
ALTER TABLE public.sessions ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.events ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.detections ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.llm_judge_jobs ALTER COLUMN org_id SET NOT NULL;

-- 3. Add INSERT policies so new rows must have a valid org_id
DROP POLICY IF EXISTS "org members can insert sessions" ON public.sessions;
CREATE POLICY "org members can insert sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (private.is_org_member(org_id));

DROP POLICY IF EXISTS "org members can insert events" ON public.events;
CREATE POLICY "org members can insert events"
  ON public.events FOR INSERT
  WITH CHECK (private.is_org_member(org_id));

DROP POLICY IF EXISTS "org members can insert detections" ON public.detections;
CREATE POLICY "org members can insert detections"
  ON public.detections FOR INSERT
  WITH CHECK (private.is_org_member(org_id));

DROP POLICY IF EXISTS "org members can insert llm judge jobs" ON public.llm_judge_jobs;
CREATE POLICY "org members can insert llm judge jobs"
  ON public.llm_judge_jobs FOR INSERT
  WITH CHECK (private.is_org_member(org_id));
