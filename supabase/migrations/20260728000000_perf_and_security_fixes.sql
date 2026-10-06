-- Migration 20260728000000_perf_and_security_fixes.sql

-- 1. Fix Rules Multi-Tenancy
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill org_id for existing rules using the dev org
UPDATE public.rules 
SET org_id = '00000000-0000-0000-0000-000000000001'
WHERE org_id IS NULL;

-- Make org_id required
ALTER TABLE public.rules ALTER COLUMN org_id SET NOT NULL;

-- Recreate unique constraint scoped by org_id instead of global
ALTER TABLE public.rules DROP CONSTRAINT IF EXISTS rules_name_key;
ALTER TABLE public.rules ADD CONSTRAINT rules_org_name_key UNIQUE (org_id, name);

-- Add index
CREATE INDEX IF NOT EXISTS idx_rules_org_id ON public.rules(org_id);

-- Enable RLS on rules if not already enabled
ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;

-- 2. Add RLS Policies for Rules
DROP POLICY IF EXISTS "org members can read rules" ON public.rules;
CREATE POLICY "org members can read rules"
  ON public.rules FOR SELECT
  USING (private.is_org_member(org_id));

DROP POLICY IF EXISTS "org members can update rules" ON public.rules;
CREATE POLICY "org members can update rules"
  ON public.rules FOR UPDATE
  USING (private.is_org_member(org_id));

GRANT UPDATE, SELECT ON public.rules TO authenticated;

-- 3. Fix Performance Bottleneck: Create RPC for getting agents with stats
CREATE OR REPLACE FUNCTION public.get_agents_with_stats()
RETURNS TABLE (
  id uuid,
  name text,
  framework text,
  last_seen_at timestamptz,
  session_count bigint,
  event_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    a.id, 
    a.name, 
    a.framework, 
    a.last_seen_at,
    COUNT(DISTINCT s.id) AS session_count,
    COUNT(e.id) AS event_count
  FROM public.agents a
  LEFT JOIN public.sessions s ON s.agent_id = a.id
  LEFT JOIN public.events e ON e.session_id = s.id
  WHERE private.is_org_member(a.org_id)
  GROUP BY a.id, a.name, a.framework, a.last_seen_at
  ORDER BY a.last_seen_at DESC;
$$;
