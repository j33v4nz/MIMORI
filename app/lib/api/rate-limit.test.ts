import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkRateLimit, rateLimitMetrics, getIngestRateLimit } from "./rate-limit";

vi.mock("../logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function rpcSupabase(data: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) } as any;
}

describe("checkRateLimit (atomic RPC)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMetrics.reset();
  });

  it("returns allowed: true when RPC allows", async () => {
    const supabase = rpcSupabase([
      { allowed: true, current_count: 5, window_reset_at: new Date(Date.now() + 60000).toISOString() },
    ]);
    const result = await checkRateLimit(supabase, "key-1", 120, 60);
    expect(result.allowed).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_api_key_id: "key-1",
      p_window_seconds: 60,
      p_limit: 120,
      p_event_count: 1,
    });
    expect(rateLimitMetrics.allowed).toBe(1);
  });

  it("returns allowed: false when count reaches limit", async () => {
    const supabase = rpcSupabase([
      { allowed: false, current_count: 120, window_reset_at: new Date(Date.now() + 60000).toISOString() },
    ]);
    const result = await checkRateLimit(supabase, "key-1", 120, 60);
    expect(result.allowed).toBe(false);
    expect(rateLimitMetrics.denied).toBe(1);
  });

  it("fails closed when RPC returns an error", async () => {
    const supabase = rpcSupabase(null, { message: "db down" });
    const result = await checkRateLimit(supabase, "key-1", 120, 60);
    expect(result.allowed).toBe(false);
    expect(result.unavailable).toBe(true);
    expect(rateLimitMetrics.unavailable).toBe(1);
  });

  it("fails closed when RPC throws", async () => {
    const supabase = { rpc: vi.fn(async () => { throw new Error("boom"); }) } as any;
    const result = await checkRateLimit(supabase, "key-1", 120, 60);
    expect(result.allowed).toBe(false);
    expect(result.unavailable).toBe(true);
    expect(rateLimitMetrics.unavailable).toBe(1);
  });

  it("fails closed on empty RPC result", async () => {
    const supabase = rpcSupabase([]);
    const result = await checkRateLimit(supabase, "key-1", 120, 60);
    expect(result.allowed).toBe(false);
    expect(result.unavailable).toBe(true);
    expect(rateLimitMetrics.unavailable).toBe(1);
  });

  it("respects custom limit and windowSeconds parameters", async () => {
    const supabase = rpcSupabase([
      { allowed: false, current_count: 10, window_reset_at: new Date(Date.now() + 30000).toISOString() },
    ]);
    const result = await checkRateLimit(supabase, "key-1", 10, 30);
    expect(result.allowed).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_api_key_id: "key-1",
      p_window_seconds: 30,
      p_limit: 10,
      p_event_count: 1,
    });
  });

  it("forwards event count for batch accounting", async () => {
    const supabase = rpcSupabase([
      { allowed: true, current_count: 5, window_reset_at: new Date(Date.now() + 60000).toISOString() },
    ]);
    await checkRateLimit(supabase, "key-1", 120, 60, 500);
    expect(supabase.rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_api_key_id: "key-1",
      p_window_seconds: 60,
      p_limit: 120,
      p_event_count: 500,
    });
  });

  it("guards non-finite reset timestamps", async () => {
    const supabase = rpcSupabase([
      { allowed: false, current_count: 120, window_reset_at: "not-a-date" },
    ]);
    const result = await checkRateLimit(supabase, "key-1", 120, 60);
    expect(result.allowed).toBe(false);
    expect(Number.isFinite(result.resetAt)).toBe(true);
  });

  it("caps a concurrent 130-request burst at the 120 limit (shared atomic stub)", async () => {
    // Shared stub emulating the atomic server-side counter: every call
    // increments the same counter, so exactly `limit` callers are allowed.
    let count = 0;
    const limit = 120;
    const supabase = {
      rpc: vi.fn(async (_fn: string, args: { p_event_count: number }) => {
        count += args.p_event_count;
        const current = count;
        return {
          data: [
            {
              allowed: current <= limit,
              current_count: current,
              window_reset_at: new Date(Date.now() + 60000).toISOString(),
            },
          ],
          error: null,
        };
      }),
    } as any;

    const results = await Promise.all(
      Array.from({ length: 130 }, () => checkRateLimit(supabase, "key-burst", limit, 60))
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(120);
    expect(results.filter((r) => !r.allowed)).toHaveLength(10);
    expect(rateLimitMetrics.allowed).toBe(120);
    expect(rateLimitMetrics.denied).toBe(10);
  });
});


describe("ingestion budget configuration", () => {
  it("uses a bounded positive event budget", () => {
    const previous = process.env.INGEST_EVENTS_PER_MINUTE;
    try {
      process.env.INGEST_EVENTS_PER_MINUTE = "5000";
      expect(getIngestRateLimit()).toBe(5000);
      for (const value of ["", "-1", "NaN", "Infinity", "1000001", "12.5"]) {
        process.env.INGEST_EVENTS_PER_MINUTE = value;
        expect(getIngestRateLimit()).toBe(1200);
      }
    } finally {
      if (previous === undefined) delete process.env.INGEST_EVENTS_PER_MINUTE;
      else process.env.INGEST_EVENTS_PER_MINUTE = previous;
    }
  });
});
