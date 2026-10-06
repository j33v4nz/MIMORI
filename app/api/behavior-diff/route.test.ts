import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mutable API-key fixture so tests can simulate valid / invalid / absent keys.
let mockAuthenticatedKey: { id: string; orgId: string; keyHash: string } | null = null;
const mockAuthenticateApiKey = vi.fn(async (..._args: unknown[]) => mockAuthenticatedKey);
let mockDashboardUser: { id: string; email: string } | null = { id: "user-1", email: "test@test.com" };
const mockRequireDashboardUser = vi.fn(async (..._args: unknown[]) => mockDashboardUser);

vi.mock("../../lib/api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api/auth")>();
  return {
    ...actual,
    authenticateApiKey: (...args: unknown[]) => mockAuthenticateApiKey(...args),
    requireDashboardUser: (...args: unknown[]) => mockRequireDashboardUser(...args),
  };
});

const mockGetBehaviorDiff = vi.fn(async () => ({ added: ["tool-a"], removed: [], unchanged: [] }));

vi.mock("../../lib/dashboard/queries", () => ({
  getBehaviorDiff: (..._args: any[]) => mockGetBehaviorDiff(),
  getBehaviorDiffSessions: vi.fn(async () => []),
}));

vi.mock("../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockFromChain = vi.fn();

vi.mock("../../lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: (...args: unknown[]) => mockFromChain(...args),
  })),
}));

// Service-client fixture for the API-key path: sessions are org-scoped, and
// events come back for each requested session.
let mockServiceSessions: Array<{ id: string }> = [{ id: "s1" }, { id: "s2" }];
let mockServiceEvents: unknown[] = [
  {
    event_type: "tool_start",
    payload: { tool: { name: "web_search" } },
    detections: [],
  },
];
const serviceChains: Array<{ table: string; chain: any }> = [];
const mockServiceFrom = vi.fn((table: string) => {
  const rows = table === "sessions" ? mockServiceSessions : mockServiceEvents;
  const chain: any = {
    select: vi.fn(() => chain),
    in: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    then: (resolve: any) => resolve({ data: rows, error: null }),
  };
  serviceChains.push({ table, chain });
  return chain;
});

vi.mock("../../lib/db/service", () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from: (table: string) => mockServiceFrom(table) })),
}));

describe("GET /api/behavior-diff", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    serviceChains.length = 0;
    mockAuthenticatedKey = null;
    mockDashboardUser = { id: "user-1", email: "test@test.com" };
    mockServiceSessions = [{ id: "s1" }, { id: "s2" }];
    mockServiceEvents = [
      { event_type: "tool_start", payload: { tool: { name: "web_search" } }, detections: [] },
    ];
    mockFromChain.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      in: vi.fn(async () => ({ data: [{ id: "s1" }, { id: "s2" }], error: null })),
    });
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns 200 with diff when both sessions exist", async () => {
    const req = new NextRequest("http://localhost/api/behavior-diff?baseline=s1&candidate=s2");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.diff).toBeDefined();
  });

  it("returns 400 when baseline param missing", async () => {
    const req = new NextRequest("http://localhost/api/behavior-diff?candidate=s2");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("missing_sessions");
  });

  it("returns 400 when candidate param missing", async () => {
    const req = new NextRequest("http://localhost/api/behavior-diff?baseline=s1");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when session not found", async () => {
    mockFromChain.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      in: vi.fn(async () => ({ data: [{ id: "s1" }], error: null })),
    });
    const req = new NextRequest("http://localhost/api/behavior-diff?baseline=s1&candidate=s2");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns 401 when no user", async () => {
    mockDashboardUser = null;
    const req = new NextRequest("http://localhost/api/behavior-diff?baseline=s1&candidate=s2");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  describe("Bearer API key auth", () => {
    function keyRequest(headers: Record<string, string> = {}) {
      return new NextRequest("http://localhost/api/behavior-diff?baseline=s1&candidate=s2", {
        headers: { Authorization: "Bearer mmr_test_key", ...headers },
      });
    }

    it("authenticates via API key without a dashboard session", async () => {
      mockAuthenticatedKey = { id: "key-1", orgId: "org-1", keyHash: "hash" };
      mockDashboardUser = null;

      const res = await GET(keyRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.diff).toBeDefined();
      expect(mockAuthenticateApiKey).toHaveBeenCalledTimes(1);
      expect(mockRequireDashboardUser).not.toHaveBeenCalled();
    });

    it("scopes the session lookup to the API key's org", async () => {
      mockAuthenticatedKey = { id: "key-1", orgId: "org-7", keyHash: "hash" };

      await GET(keyRequest());

      const sessionChain = serviceChains.find((entry) => entry.table === "sessions");
      expect(sessionChain).toBeDefined();
      expect(sessionChain!.chain.eq).toHaveBeenCalledWith("org_id", "org-7");
      for (const eventChain of serviceChains.filter((entry) => entry.table === "events")) {
        expect(eventChain.chain.order).toHaveBeenCalledWith("sequence_number", { ascending: true });
      }
    });

    it("returns 404 when a session is outside the key's org", async () => {
      mockAuthenticatedKey = { id: "key-1", orgId: "org-1", keyHash: "hash" };
      mockServiceSessions = [{ id: "s1" }];

      const res = await GET(keyRequest());
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("session_not_found");
    });

    it("allows an authenticated session to be compared with itself", async () => {
      mockAuthenticatedKey = { id: "key-1", orgId: "org-1", keyHash: "hash" };
      mockServiceSessions = [{ id: "s1" }];
      const response = await GET(new NextRequest("http://localhost/api/behavior-diff?baseline=s1&candidate=s1", {
        headers: { Authorization: "Bearer mmr_test_key" }
      }));
      expect(response.status).toBe(200);
      expect((await response.json()).diff.status).toBe("clear");
    });

    it("rejects invalid bearer credentials even with a dashboard session", async () => {
      mockAuthenticatedKey = null;
      mockDashboardUser = { id: "user-1", email: "test@test.com" };

      const res = await GET(keyRequest());
      expect(res.status).toBe(401);
      expect(mockRequireDashboardUser).not.toHaveBeenCalled();
    });

    it("returns 401 when the key is invalid and there is no session", async () => {
      mockAuthenticatedKey = null;
      mockDashboardUser = null;

      const res = await GET(keyRequest());
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("unauthorized");
    });
  });
});
