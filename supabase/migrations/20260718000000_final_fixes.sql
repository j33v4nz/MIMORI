-- Migration 20260718000000_final_fixes.sql

-- 1. Drop vulnerable policy on rules
DROP POLICY IF EXISTS "authenticated users can update rule enabled" ON public.rules;

-- 2. Drop the insecure judge settings policies and recreate them securely
DROP POLICY IF EXISTS "org members can update judge settings" ON public.judge_settings;
DROP POLICY IF EXISTS "org members can insert judge settings" ON public.judge_settings;

CREATE POLICY "org owners can update judge settings"
  ON public.judge_settings FOR UPDATE
  USING (
    private.is_org_member(org_id) 
    AND (SELECT role FROM public.org_members WHERE user_id = auth.uid() AND org_id = judge_settings.org_id) = 'owner'
  );

CREATE POLICY "org owners can insert judge settings"
  ON public.judge_settings FOR INSERT
  WITH CHECK (
    private.is_org_member(org_id) 
    AND (SELECT role FROM public.org_members WHERE user_id = auth.uid() AND org_id = judge_settings.org_id) = 'owner'
  );

-- 3. Grant API permissions for UPDATE and INSERT
GRANT UPDATE, INSERT ON public.judge_settings TO authenticated;
GRANT UPDATE, INSERT ON public.detections TO authenticated;
GRANT UPDATE, INSERT ON public.sessions TO authenticated;
GRANT UPDATE, INSERT ON public.events TO authenticated;

-- 4. Add org_id to tables and create cascading foreign keys
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.detections ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.llm_judge_jobs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 5. Drop old RLS policies
DROP POLICY IF EXISTS "org members can read sessions" ON public.sessions;
DROP POLICY IF EXISTS "org members can read events" ON public.events;
DROP POLICY IF EXISTS "org members can read detections" ON public.detections;
DROP POLICY IF EXISTS "org members can read llm judge jobs" ON public.llm_judge_jobs;

-- 6. Create optimized RLS policies using org_id directly
CREATE POLICY "org members can read sessions"
  ON public.sessions FOR SELECT
  USING (private.is_org_member(org_id));

CREATE POLICY "org members can read events"
  ON public.events FOR SELECT
  USING (private.is_org_member(org_id));

CREATE POLICY "org members can read detections"
  ON public.detections FOR SELECT
  USING (private.is_org_member(org_id));

CREATE POLICY "org members can read llm judge jobs"
  ON public.llm_judge_jobs FOR SELECT
  USING (private.is_org_member(org_id));

-- 7. Fix detections foreign key constraint to CASCADE
ALTER TABLE public.detections DROP CONSTRAINT IF EXISTS detections_rule_id_fkey;
ALTER TABLE public.detections ADD CONSTRAINT detections_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.rules(id) ON DELETE CASCADE;

-- 8. Add missing indexes for performance
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON public.api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_detections_rule_id ON public.detections(rule_id);
CREATE INDEX IF NOT EXISTS idx_sessions_org_id ON public.sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_events_org_id ON public.events(org_id);
CREATE INDEX IF NOT EXISTS idx_detections_org_id ON public.detections(org_id);
CREATE INDEX IF NOT EXISTS idx_llm_judge_jobs_org_id ON public.llm_judge_jobs(org_id);

-- 9. Drop redundant index
DROP INDEX IF EXISTS idx_events_session;

-- 10. Grant privileges on private schema and its functions to API roles
GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_org_member(uuid) TO anon, authenticated;

-- 11. Secure organization access control for production (service role bypass handles local dev)
CREATE OR REPLACE FUNCTION private.is_org_member(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members 
    WHERE user_id = auth.uid() AND org_id = target_org_id
  );
$$;
