import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../logger";

interface RateLimitResult {
  allowed: boolean;
  resetAt: number;
  currentCount?: number;
  unavailable?: true;
}

export const INGEST_RATE_LIMIT = 1200;
export const INGEST_RATE_WINDOW_SECONDS = 60;

export function getIngestRateLimit(): number {
  const configured = Number(process.env.INGEST_EVENTS_PER_MINUTE);
  return Number.isSafeInteger(configured) && configured > 0 && configured <= 1_000_000
    ? configured : INGEST_RATE_LIMIT;
}

// Process-local counters for rate-limit outcomes. Exported for tests and
// lightweight observability (a full metrics pipeline can scrape/log these).
export const rateLimitMetrics = {
  allowed: 0,
  denied: 0,
  unavailable: 0,
  reset() {
    this.allowed = 0;
    this.denied = 0;
    this.unavailable = 0;
  },
};

interface CheckRateLimitRow {
  allowed: boolean;
  current_count: number | string | bigint;
  window_reset_at: string;
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  apiKeyId: string,
  limit = INGEST_RATE_LIMIT,
  windowSeconds = INGEST_RATE_WINDOW_SECONDS,
  eventCount = 1
): Promise<RateLimitResult> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : INGEST_RATE_LIMIT;
  const safeWindow = Number.isFinite(windowSeconds) && windowSeconds > 0 ? Math.floor(windowSeconds) : INGEST_RATE_WINDOW_SECONDS;
  const safeEvents = Number.isFinite(eventCount) && eventCount > 0 ? Math.floor(eventCount) : 1;
  const fallbackResetAt = () => Date.now() + safeWindow * 1000;

  try {
    // Check-and-increment via the check_rate_limit RPC (service-role client).
    // NOTE: the RPC performs a single atomic INSERT...ON CONFLICT DO UPDATE
    // against rate_limit_counters (row-lock serialized), so concurrent bursts
    // cannot overshoot the budget. Event count is accounted so a single
    // 500-event request consumes batch budget, not just one request token.
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_api_key_id: apiKeyId,
      p_window_seconds: safeWindow,
      p_limit: safeLimit,
      p_event_count: safeEvents,
    });

    if (error) {
      // A database outage must not remove the ingestion resource boundary.
      logger.warn(
        { err: error.message, apiKeyId },
        "[checkRateLimit] RPC failed; ingestion temporarily unavailable"
      );
      rateLimitMetrics.unavailable += 1;
      return { allowed: false, unavailable: true, resetAt: fallbackResetAt() };
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | CheckRateLimitRow
      | null
      | undefined;

    if (!row || typeof row.allowed !== "boolean") {
      logger.warn({ apiKeyId }, "[checkRateLimit] invalid RPC result; ingestion temporarily unavailable");
      rateLimitMetrics.unavailable += 1;
      return { allowed: false, unavailable: true, resetAt: fallbackResetAt() };
    }

    const rawReset = row.window_reset_at
      ? new Date(row.window_reset_at).getTime()
      : fallbackResetAt();
    const resetAt = Number.isFinite(rawReset) ? rawReset : fallbackResetAt();

    const rawCount = Number(row.current_count ?? 0);
    const currentCount = Number.isFinite(rawCount) ? rawCount : 0;

    if (row.allowed) {
      rateLimitMetrics.allowed += 1;
    } else {
      rateLimitMetrics.denied += 1;
    }

    return {
      allowed: row.allowed,
      resetAt,
      currentCount,
    };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), apiKeyId },
      "[checkRateLimit] RPC threw; ingestion temporarily unavailable"
    );
    rateLimitMetrics.unavailable += 1;
    return { allowed: false, unavailable: true, resetAt: fallbackResetAt() };
  }
}
