-- Flagship wave-2 (BUILDER-H): revert NULL-auth dev bypass.
-- 20260802000000_fix_is_org_member_null_auth.sql replaced private.is_org_member
-- with a permissive variant (auth.uid() IS NULL → true, plus a hard-coded
-- mock-user UUID match). That effect is deleted here: no permissive branch
-- remains, and the strict helper is re-applied so this migration wins by
-- timestamp over any out-of-order apply of the dev migration.
-- Same strict body as 20260923005000_harden_rls_strict.sql.

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
