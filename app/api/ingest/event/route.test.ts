import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Use the REAL checkRateLimit (atomic RPC path) — do not mock it here.
vi.mock("../../../lib/db/service", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock("../../../lib/api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/api/auth")>();
  return {
    ...actual,
    authenticateApiKey: vi.fn(async () => ({
      id: "key-1",
      orgId: "org-1",
      keyHash: "hash",
    })),
  };
});

vi.mock("../../../lib/services/ingest-service", () => ({
  processIngestion: vi.fn(async () => ({
    response: {
      accepted: 0,
      session_id: "sess_test",
      session_record_id: "00000000-0000-0000-0000-000000000010",
      immediate_detections: [],
    },
  })),
}));

vi.mock("../../../lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createSupabaseServiceClient } from "../../../lib/db/service";
import { rateLimitMetrics } from "../../../lib/api/rate-limit";
import { POST } from "./route";

function ingestRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/ingest/event", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      Authorization: "Bearer mmr_test_key",
      "Content-Type": "application/json",
    },
  });
}

const singleEvent = {
  event_type: "llm_start",
  sequence_number: 1,
  payload: { prompt: "hello" },
  timestamp: "2026-07-30T12:00:00.000Z",
};
const payload = { agent_name: "test-agent", events: [singleEvent] };

/**
 * RPC stub emulating the atomic check_rate_limit counter
 * (supabase/migrations/20260923010000_atomic_rate_limit.sql):
 *   charge = clamp(p_event_count, 1, p_limit); count += charge (always);
 *   allowed = count <= p_limit.
 * It honors the route-passed p_limit/p_event_count, so a double charge
 * (pre-check +1 on top of the N-event check) would fail these tests.
 */
function atomicRpcSupabase(defaultLimit = 120, windowSeconds = 60) {
  let count = 0;
  const rpc = vi.fn(async (_fn: string, args?: { p_limit?: number; p_event_count?: number }) => {
    const limit =
      Number.isFinite(args?.p_limit) && (args?.p_limit ?? 0) > 0
        ? Math.floor(args!.p_limit!)
        : defaultLimit;
    const charge = Math.min(Math.max(Math.floor(args?.p_event_count ?? 1), 1), limit + 1);
    count = Math.min(count + charge, limit + 1);
    const row = {
      allowed: count <= limit,
      current_count: count,
      window_reset_at: new Date(Date.now() + windowSeconds * 1000).toISOString(),
    };
    return { data: [row], error: null };
  });
  return { rpc } as any;
}

describe("POST /api/ingest/event atomic rate limiting", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMetrics.reset();
    vi.stubEnv("INGEST_EVENTS_PER_MINUTE", "120");
  });

  it("burst of 121 single-event requests: 120×202 then 1×429, ONE charge per request", async () => {
    const stub = atomicRpcSupabase();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(stub);

    let lastStatus = 0;
    let lastRes: Response | undefined;
    for (let i = 0; i < 121; i++) {
      const res = await POST(ingestRequest(payload));
      lastStatus = res.status;
      lastRes = res;
      if (i < 120) {
        expect(res.status).toBe(202);
      }
    }
    expect(lastStatus).toBe(429);
    const body = await lastRes!.json();
    expect(body.error.code).toBe("rate_limited");
    const retryAfter = lastRes!.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    // Exactly one atomic check per request: 121 requests → 121 RPC calls.
    // The old pre-check + N-event double charge would show 242 here.
    expect(stub.rpc).toHaveBeenCalledTimes(121);
  });

  it("charges the envelope event count in a single RPC call (no pre-check)", async () => {
    const stub = atomicRpcSupabase();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(stub);

    const events = Array.from({ length: 10 }, (_, i) => ({ ...singleEvent, sequence_number: i + 1 }));
    const res = await POST(ingestRequest({ agent_name: "test-agent", events }));
    expect(res.status).toBe(202);
    expect(stub.rpc).toHaveBeenCalledTimes(1);
    expect(stub.rpc).toHaveBeenCalledWith(
      "check_rate_limit",
      expect.objectContaining({ p_event_count: 10, p_limit: 120 })
    );
  });

  it("charges 1 for an empty batch", async () => {
    const stub = atomicRpcSupabase();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(stub);

    const res = await POST(ingestRequest({ agent_name: "test-agent", events: [] }));
    expect(res.status).toBe(202);
    expect(stub.rpc).toHaveBeenCalledTimes(1);
    expect(stub.rpc).toHaveBeenCalledWith(
      "check_rate_limit",
      expect.objectContaining({ p_event_count: 1 })
    );
  });

  it("rejects an oversized first batch for a configured small budget", async () => {
    const stub = atomicRpcSupabase();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(stub);
    const events = Array.from({ length: 121 }, (_, index) => ({ ...singleEvent, sequence_number: index + 1 }));
    const res = await POST(ingestRequest({ agent_name: "test-agent", events }));
    expect(res.status).toBe(429);
  });

  it("rejects invalid JSON without touching the rate-limit counter", async () => {
    const stub = atomicRpcSupabase();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(stub);

    const res = await POST(
      new NextRequest("http://localhost/api/ingest/event", {
        method: "POST",
        body: "not json {{{",
        headers: {
          Authorization: "Bearer mmr_test_key",
          "Content-Type": "application/json",
        },
      })
    );
    expect(res.status).toBe(400);
    expect(stub.rpc).not.toHaveBeenCalled();
  });

  it("RPC down: returns retryable 503 before ingestion", async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: { message: "db down" } })) } as any;
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase);

    const res = await POST(ingestRequest(payload));
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect((await res.json()).error.code).toBe("rate_limit_unavailable");
    expect(rateLimitMetrics.unavailable).toBe(1);
  });

  it("RPC throws: returns retryable 503", async () => {
    const supabase = {
      rpc: vi.fn(async () => {
        throw new Error("connection reset");
      }),
    } as any;
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase);

    const res = await POST(ingestRequest(payload));
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect((await res.json()).error.code).toBe("rate_limit_unavailable");
    expect(rateLimitMetrics.unavailable).toBe(1);
  });
});
