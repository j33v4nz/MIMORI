-- Flagship wave-2 (BUILDER-G): true atomic rate limiting.
--
-- Replaces the check-only COUNT(*) over public.events (which let concurrent
-- bursts overshoot the budget) with a single-statement atomic increment
-- against public.rate_limit_counters. Each call inserts-or-bumps the counter
-- for (api_key_id) in the same row lock, resets the window when expired, and
-- accounts p_event_count so one 500-event request consumes batch budget.
-- Return shape is unchanged: (allowed, current_count, window_reset_at).

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  api_key_id uuid PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0)
);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- No direct access from API roles: only the SECURITY DEFINER function below
-- (executed as owner) and service_role touch this table.
REVOKE ALL ON TABLE public.rate_limit_counters FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.rate_limit_counters TO service_role;

-- Drop the legacy 3-arg check-only function (from
-- 20260730000000_rate_limit_and_retention.sql). It counted public.events in
-- the window WITHOUT incrementing anything (check-only bypass: concurrent
-- bursts all passed) and, once the 4-arg overload with a DEFAULT parameter
-- exists, a 3-arg call would be ambiguous. Must run BEFORE the CREATE below
-- so `check_rate_limit(uuid, integer, integer)` resolves to nothing.
DROP FUNCTION IF EXISTS public.check_rate_limit(uuid, integer, integer);

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
  v_limit integer := GREATEST(COALESCE(p_limit, 120), 1);
  v_window integer := GREATEST(COALESCE(p_window_seconds, 60), 1);
  v_events integer;
  v_row public.rate_limit_counters%ROWTYPE;
BEGIN
  -- Clamp the charge to [1, v_limit]: an oversized batch (e.g. a 500-event
  -- envelope with limit 120) must not push count so far past the limit that
  -- the key is permanently denied. Charge min(N, limit) instead: allowed :=
  -- count <= limit still admits the batch when the window just reset
  -- (count = 0 + limit = limit <= limit), and the whole window's budget is
  -- consumed by that one batch, so the next request is denied until reset.
  v_events := LEAST(GREATEST(COALESCE(p_event_count, 1), 1), v_limit);

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
      ELSE public.rate_limit_counters.count + v_events
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
