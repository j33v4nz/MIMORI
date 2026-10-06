-- Flagship fix: account event count in rate-limit checks.
-- Backward compatible: p_event_count defaults to 1 so old callers keep working.
-- NOTE: the legacy 3-arg check-only overload (and its GRANT) is dropped later
-- in 20260923010000_atomic_rate_limit.sql, before the atomic 4-arg function is
-- created — granting it again here would resurrect the check-only bypass.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_api_key_id uuid,
  p_window_seconds integer,
  p_limit integer,
  p_event_count integer DEFAULT 1
)
RETURNS TABLE(allowed boolean, current_count bigint, window_reset_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ((COUNT(e.id) + COALESCE(p_event_count, 1) - 1) < p_limit) AS allowed,
    COUNT(e.id) AS current_count,
    (now() + (p_window_seconds || ' seconds')::interval) AS window_reset_at
  FROM public.events e
  WHERE e.api_key_id = p_api_key_id
    AND e.created_at >= now() - (p_window_seconds || ' seconds')::interval;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, integer, integer, integer) TO service_role;

-- Deny default PUBLIC/anon EXECUTE (also dropped in 20260923010000).
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
-- Duplicate 3-arg GRANT removed: the legacy check-only overload must not be
-- re-granted (dropped in 20260923010000_atomic_rate_limit.sql).
