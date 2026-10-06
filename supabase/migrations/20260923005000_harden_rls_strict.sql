-- Flagship fix: re-assert strict RLS helper AFTER any NULL-accepting dev migration.
-- Guards against out-of-order applies resurrecting the anon bypass
-- (auth.uid() IS NULL → true). Strict version wins by timestamp.

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
