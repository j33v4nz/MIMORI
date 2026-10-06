import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../lib/db/service", () => ({
  createSupabaseServiceClient: vi.fn(() => createMockSupabase()),
}));

vi.mock("../lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => createMockSupabase()),
}));

vi.mock("../lib/env", () => ({
  getLlmJudgeEnv: vi.fn(() => ({
    provider: "deepseek",
    model: "deepseek-chat",
    cronSecret: "test-cron-secret",
    deepseekApiKey: "test-key",
  })),
  getSupabaseServiceEnv: vi.fn(() => ({
    url: "http://localhost:54321",
    serviceRoleKey: "test-key",
  })),
}));

vi.mock("../lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../lib/services/ingest-service", () => ({
  processIngestion: vi.fn(async () => ({
    response: {
      accepted: 1,
      session_id: "sess_test",
      session_record_id: "00000000-0000-0000-0000-000000000010",
      immediate_detections: [],
    },
  })),
}));

vi.mock("../lib/dashboard/queries", () => ({
  getOverviewStats: vi.fn(async () => ({
    total_agents: 3,
    total_sessions: 15,
    total_events: 200,
    total_detections: 5,
  })),
}));

const mockCheckRateLimit = vi.fn(async () => ({ allowed: true, resetAt: Date.now() + 60000 })) as any;
vi.mock("../lib/api/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  // Constants the ingest route imports for its single rate check.
  INGEST_RATE_LIMIT: 120,
  getIngestRateLimit: () => 120,
  INGEST_RATE_WINDOW_SECONDS: 60,
}));

const mockAuthenticateApiKey = vi.fn(async () => ({
  id: "key-1",
  orgId: "org-1",
  keyHash: "hash",
})) as any;
vi.mock("../lib/api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api/auth")>();
  return {
    ...actual,
    authenticateApiKey: (...args: unknown[]) => mockAuthenticateApiKey(...args),
    requireDashboardUser: vi.fn(async () => ({ id: "user-1", email: "test@test.com" })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockSupabase() {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    then: (resolve: any) => resolve({ data: [], error: null }),
    maybeSingle: vi.fn(async () => ({
      data: { id: "key-1", org_id: "org-1", key_hash: "hash", revoked_at: null },
      error: null,
    })),
    single: vi.fn(async () => ({
      data: { id: "key-1", org_id: "org-1", key_hash: "hash", revoked_at: null },
      error: null,
    })),
  };

  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) },
    from: vi.fn(() => ({
      ...chain,
      select: vi.fn((cols?: string, opts?: any) => {
        if (opts?.head) {
          const countChain = {
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ count: 5, error: null }),
          };
          return countChain;
        }
        return chain;
      }),
    })),
    rpc: vi.fn(async () => ({ data: [], error: null })),
  } as any;
}

function ingestRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/ingest/event", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      Authorization: "Bearer mmr_test_key",
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

// ---------------------------------------------------------------------------
// Ingest route tests
// ---------------------------------------------------------------------------

describe("POST /api/ingest/event", () => {
  let POST: typeof import("../api/ingest/event/route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuthenticateApiKey.mockResolvedValue({ id: "key-1", orgId: "org-1", keyHash: "hash" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, resetAt: Date.now() + 60000 });
    const mod = await import("../api/ingest/event/route");
    POST = mod.POST;
  });

  it("returns 401 when no Authorization header", async () => {
    const req = new NextRequest("http://localhost/api/ingest/event", {
      method: "POST",
      body: JSON.stringify({ agent_name: "test", events: [] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("missing_api_key");
  });

  it("returns 401 when API key is invalid", async () => {
    mockAuthenticateApiKey.mockResolvedValueOnce(null);
    const req = ingestRequest({ agent_name: "test", events: [] });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_api_key");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, resetAt: Date.now() });
    const req = ingestRequest({ agent_name: "test", events: [] });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("rate_limited");
    expect(res.headers.get("Retry-After")).not.toBeNull();
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/ingest/event", {
      method: "POST",
      body: "not json {{{",
      headers: {
        Authorization: "Bearer mmr_test_key",
        "Content-Type": "application/json",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_json");
    // Uncharged reject: the rate-limit counter is only touched after the
    // envelope parses successfully.
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid envelope (missing agent_name)", async () => {
    const req = ingestRequest({ events: [] });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid envelope (missing events)", async () => {
    const req = ingestRequest({ agent_name: "test" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 202 with valid payload", async () => {
    const payload = {
      agent_name: "test-agent",
      session_id: "sess-123",
      events: [
        {
          event_type: "llm_start",
          sequence_number: 1,
          payload: { prompt: "hello" },
          timestamp: "2026-07-30T12:00:00.000Z",
        },
      ],
    };

    const req = ingestRequest(payload);
    const res = await POST(req);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.accepted).toBe(1);
    expect(body.session_id).toBe("sess_test");
    // SEV-2 regression guard: exactly ONE rate-limit check per request
    // (the old pre-check + N-event double charge called it twice).
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
  });

  it("returns 202 for empty events array", async () => {
    const req = ingestRequest({ agent_name: "test-agent", events: [] });
    const res = await POST(req);
    expect(res.status).toBe(202);
    // Empty batch still charges exactly 1 unit (min-1 fallback).
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "key-1",
      expect.any(Number),
      expect.any(Number),
      1
    );
  });

  it("rejects events exceeding MAX_EVENTS limit", async () => {
    const events = Array.from({ length: 501 }, (_, i) => ({
      event_type: "llm_start",
      sequence_number: i + 1,
      payload: { prompt: "hello" },
      timestamp: "2026-07-30T12:00:00.000Z",
    }));

    const req = ingestRequest({ agent_name: "test-agent", events });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
  });

  it("skips events with invalid sequence_number (negative)", async () => {
    const req = ingestRequest({
      agent_name: "test-agent",
      events: [
        {
          event_type: "llm_start",
          sequence_number: -1,
          payload: { prompt: "hello" },
        },
      ],
    });
    const res = await POST(req);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.skipped).toBeDefined();
    expect(body.skipped.length).toBe(1);
    expect(body.skipped[0].reason).toContain(">0");
  });

  it("skips events with invalid event_type", async () => {
    const req = ingestRequest({
      agent_name: "test-agent",
      events: [
        {
          event_type: "invalid_type",
          sequence_number: 1,
          payload: { prompt: "hello" },
        },
      ],
    });
    const res = await POST(req);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.skipped).toBeDefined();
    expect(body.skipped.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Stats judge route tests
// ---------------------------------------------------------------------------

describe("GET /api/stats/judge", () => {
  let GET: typeof import("../api/stats/judge/route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../api/stats/judge/route");
    GET = mod.GET;
  });

  it("returns 200 with metrics", async () => {
    const req = new NextRequest("http://localhost/api/stats/judge");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metrics).toBeDefined();
    expect(body.metrics.pending).toBeDefined();
    expect(body.metrics.completed).toBeDefined();
    expect(body.metrics.failed).toBeDefined();
    expect(body.metrics.retrying).toBeDefined();
    expect(body.metrics.total_in_queue).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });

  it("returns 401 when no user", async () => {
    const auth = await import("../lib/api/auth");
    vi.spyOn(auth, "requireDashboardUser").mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/stats/judge");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Stats overview route tests
// ---------------------------------------------------------------------------

describe("GET /api/stats/overview", () => {
  let GET: typeof import("../api/stats/overview/route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../api/stats/overview/route");
    GET = mod.GET;
  });

  it("returns 200 with overview stats", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total_agents).toBe(3);
    expect(body.total_sessions).toBe(15);
    expect(body.total_events).toBe(200);
    expect(body.total_detections).toBe(5);
  });

  it("returns 401 when no user", async () => {
    const auth = await import("../lib/api/auth");
    vi.spyOn(auth, "requireDashboardUser").mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Health route tests
// ---------------------------------------------------------------------------

describe("GET /api/health", () => {
  it("returns 200 with ok status", async () => {
    const { GET } = await import("../api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Workers retention route tests
// ---------------------------------------------------------------------------

describe("POST /api/workers/retention", () => {
  let POST: typeof import("../api/workers/retention/route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../api/workers/retention/route");
    POST = mod.POST;
  });

  it("returns 401 without cron secret", async () => {
    const req = new NextRequest("http://localhost/api/workers/retention", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid cron secret", async () => {
    const req = new NextRequest("http://localhost/api/workers/retention", {
      method: "POST",
      headers: { Authorization: "Bearer test-cron-secret" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Workers LLM judge route tests
// ---------------------------------------------------------------------------

describe("POST /api/workers/llm-judge", () => {
  let POST: typeof import("../api/workers/llm-judge/route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../api/workers/llm-judge/route");
    POST = mod.POST;
  });

  it("returns 401 without cron secret", async () => {
    const req = new NextRequest("http://localhost/api/workers/llm-judge?limit=1", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid cron secret and no pending jobs", async () => {
    const req = new NextRequest("http://localhost/api/workers/llm-judge?limit=1", {
      method: "POST",
      headers: { Authorization: "Bearer test-cron-secret" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(0);
  });
});
