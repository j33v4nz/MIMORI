-- Migration 20260802000000_fix_is_org_member_null_auth.sql
-- Fixes is_org_member RPC function so local dev and service role queries (where auth.uid() is NULL or mock user) can observe org agents.

CREATE OR REPLACE FUNCTION private.is_org_member(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members 
    WHERE (user_id = auth.uid() OR auth.uid() IS NULL OR user_id = '00000000-0000-0000-0000-000000000001')
      AND org_id = target_org_id
  );
$$;
