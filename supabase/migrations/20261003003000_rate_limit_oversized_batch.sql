-- Deny oversized batches and prevent counter integer overflow.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_api_key_id uuid,
  p_window_seconds integer,
  p_limit integer,
  p_event_count integer DEFAULT 1
)
RETURNS TABLE(allowed boolean, current_count bigint, window_reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 1200), 1), 1000000);
  v_window integer := GREATEST(COALESCE(p_window_seconds, 60), 1);
  v_events integer;
  v_row public.rate_limit_counters%ROWTYPE;
BEGIN
  -- Saturate at one above the budget. Oversized batches must be denied,
  -- including the first request in a window; saturation prevents overflow.
  v_events := LEAST(GREATEST(COALESCE(p_event_count, 1), 1), v_limit + 1);

  -- One atomic statement: concurrent callers serialize on the row lock, so
  -- the window reset + increment cannot interleave and overshoot.
  INSERT INTO public.rate_limit_counters (api_key_id, window_start, count)
  VALUES (p_api_key_id, v_now, v_events)
  ON CONFLICT (api_key_id) DO UPDATE SET
    window_start = CASE
      WHEN public.rate_limit_counters.window_start + (v_window || ' seconds')::interval <= v_now
        THEN v_now
      ELSE public.rate_limit_counters.window_start
    END,
    count = CASE
      WHEN public.rate_limit_counters.window_start + (v_window || ' seconds')::interval <= v_now
        THEN v_events
      ELSE LEAST(public.rate_limit_counters.count::bigint + v_events::bigint, v_limit::bigint + 1)::integer
    END
  RETURNING * INTO v_row;

  allowed := v_row.count <= v_limit;
  current_count := v_row.count::bigint;
  window_reset_at := v_row.window_start + (v_window || ' seconds')::interval;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, integer, integer, integer) TO service_role;

-- SECURITY DEFINER functions default EXECUTE to PUBLIC. Without this, anon
-- could call /rpc/check_rate_limit via PostgREST to bypass ingest limits or
-- DoS a victim key's counter. Deny everyone, grant only the service role.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
-- Note: no 3-arg GRANT here — that legacy overload is dropped above.
