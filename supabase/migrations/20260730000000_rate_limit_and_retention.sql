-- Migration 20260730000000_rate_limit_and_retention.sql

-- 1. Add api_key_id to events for per-key rate limiting
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_api_key_created ON public.events(api_key_id, created_at DESC) WHERE api_key_id IS NOT NULL;

-- 2. Backfill api_key_id from existing sessions -> agents -> orgs chain
-- We can't reliably backfill without knowing which key was used, so we leave existing rows NULL.
-- Only new ingestions will have api_key_id populated.

-- 3. Create RPC for atomic rate limit checking
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_api_key_id uuid, p_window_seconds integer, p_limit integer)
RETURNS TABLE(allowed boolean, current_count bigint, window_reset_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (COUNT(e.id) < p_limit) AS allowed,
    COUNT(e.id) AS current_count,
    (now() + (p_window_seconds || ' seconds')::interval) AS window_reset_at
  FROM public.events e
  WHERE e.api_key_id = p_api_key_id
    AND e.created_at >= now() - (p_window_seconds || ' seconds')::interval;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, integer, integer) TO service_role;
-- Legacy signature: deny PUBLIC/anon (replaced by atomic 4-arg fn in 20260923010000).
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
