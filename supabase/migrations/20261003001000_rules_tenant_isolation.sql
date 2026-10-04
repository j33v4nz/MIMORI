-- PostgreSQL combines permissive policies with OR. The initial global rules
-- read policy survived the later scoped policy and exposed other tenants.
DROP POLICY IF EXISTS "authenticated users can read rules" ON public.rules;
DROP POLICY IF EXISTS "authenticated users can update rule enabled" ON public.rules;

-- Keep a restrictive tenant boundary so legacy permissive read policies cannot
-- accidentally grant access to another organization's rule pack again.
DROP POLICY IF EXISTS "rules tenant read boundary" ON public.rules;
CREATE POLICY "rules tenant read boundary"
ON public.rules AS RESTRICTIVE FOR SELECT TO authenticated
USING (org_id IS NULL OR private.is_org_member(org_id));

DROP POLICY IF EXISTS "rules tenant update boundary" ON public.rules;
CREATE POLICY "rules tenant update boundary"
ON public.rules AS RESTRICTIVE FOR UPDATE TO authenticated
USING (org_id IS NOT NULL AND private.is_org_member(org_id))
WITH CHECK (org_id IS NOT NULL AND private.is_org_member(org_id));
