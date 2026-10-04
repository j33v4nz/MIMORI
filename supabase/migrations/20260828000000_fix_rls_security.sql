-- Migration 20260828000000_fix_rls_security.sql
-- Fixes critical RLS bypass vulnerability by ensuring private.is_org_member strictly requires authenticated user_id match.

CREATE OR REPLACE FUNCTION private.is_org_member(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members 
    WHERE user_id = auth.uid()
      AND org_id = target_org_id
  );
$$;
