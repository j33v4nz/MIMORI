import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/api/auth", () => ({
  requireDashboardUser: vi.fn(async () => ({ id: "user-1", email: "test@test.com" })),
}));

// Mutable membership fixture so tests can simulate owner / member / no-org.
let mockMembership: { org_id: string; role: string } | null = {
  org_id: "org-1",
  role: "owner",
};

const mockSupabaseChain = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(async () => ({ data: mockMembership, error: null })),
}));

const mockJudgeUpsert = vi.fn<() => Promise<{ error: { message: string } | null }>>(async () => ({ error: null }));
const mockJudgeUpsertArgs = vi.fn();

vi.mock("../../../lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === "org_members") {
        return mockSupabaseChain();
      }
      if (table === "judge_settings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({ data: { provider: "ollama", model: "llama3.2", base_url: "http://localhost:11434", budget_monthly: null, kill_switch: false }, error: null })),
          upsert: vi.fn(async (payload: unknown, opts: unknown) => {
            mockJudgeUpsertArgs(payload, opts);
            return mockJudgeUpsert();
          }),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn(async () => ({ data: null, error: null })) };
    }),
  })),
}));

vi.mock("../../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/settings/judge", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockMembership = { org_id: "org-1", role: "owner" };
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns judge settings for the user's org", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe("ollama");
    expect(body.model).toBe("llama3.2");
  });

  it("returns 401 when no user", async () => {
    const auth = await import("../../../lib/api/auth");
    vi.spyOn(auth, "requireDashboardUser").mockResolvedValueOnce(null as any);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 404 when the user has no org (no silent fallback)", async () => {
    mockMembership = null;
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("includes owner-only budget/kill-switch fields for owners", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("budget_monthly");
    expect(body).toHaveProperty("kill_switch");
  });

  it("masks budget_monthly and kill_switch for non-owner members", async () => {
    mockMembership = { org_id: "org-1", role: "member" };
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe("ollama");
    expect(body).not.toHaveProperty("budget_monthly");
    expect(body).not.toHaveProperty("kill_switch");
  });
});

describe("PUT /api/settings/judge", () => {
  let PUT: typeof import("./route").PUT;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockMembership = { org_id: "org-1", role: "owner" };
    const mod = await import("./route");
    PUT = mod.PUT;
  });

  it("upserts settings and returns success", async () => {
    const req = new Request("http://localhost/api/settings/judge", {
      method: "PUT",
      body: JSON.stringify({ provider: "deepseek", model: "deepseek-chat" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("persists owner-only budget_monthly and kill_switch when provided", async () => {
    const req = new Request("http://localhost/api/settings/judge", {
      method: "PUT",
      body: JSON.stringify({ provider: "deepseek", model: "deepseek-chat", budget_monthly: 5000, kill_switch: true }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(mockJudgeUpsertArgs).toHaveBeenCalledWith(
      expect.objectContaining({ budget_monthly: 5000, kill_switch: true }),
      expect.anything()
    );
  });

  it("accepts budget_monthly: 0 as a hard disable and persists it", async () => {
    // 0 is a deliberate value (equivalent to kill_switch): the worker
    // blocks once usage >= budget, and usage >= 0 always holds.
    const req = new Request("http://localhost/api/settings/judge", {
      method: "PUT",
      body: JSON.stringify({ provider: "deepseek", model: "deepseek-chat", budget_monthly: 0 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(mockJudgeUpsertArgs).toHaveBeenCalledWith(
      expect.objectContaining({ budget_monthly: 0 }),
      expect.anything()
    );
  });

  it("returns 401 when no user", async () => {
    const auth = await import("../../../lib/api/auth");
    vi.spyOn(auth, "requireDashboardUser").mockResolvedValueOnce(null as any);
    const req = new Request("http://localhost/api/settings/judge", {
      method: "PUT",
      body: JSON.stringify({ provider: "deepseek", model: "deepseek-chat" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-owner members", async () => {
    mockMembership = { org_id: "org-1", role: "member" };
    const req = new Request("http://localhost/api/settings/judge", {
      method: "PUT",
      body: JSON.stringify({ provider: "deepseek", model: "deepseek-chat" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(403);
    expect(mockJudgeUpsert).not.toHaveBeenCalled();
  });

  it("returns 404 when the user has no org (no silent fallback)", async () => {
    mockMembership = null;
    const req = new Request("http://localhost/api/settings/judge", {
      method: "PUT",
      body: JSON.stringify({ provider: "deepseek", model: "deepseek-chat" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(404);
    expect(mockJudgeUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 on ZodError instead of 500", async () => {
    const req = new Request("http://localhost/api/settings/judge", {
      method: "PUT",
      body: JSON.stringify({ provider: "deepseek", model: "deepseek-chat", budget_monthly: -5 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
    expect(mockJudgeUpsert).not.toHaveBeenCalled();
  });

  it("returns 500 on database failure", async () => {
    mockJudgeUpsert.mockResolvedValueOnce({ error: { message: "db fail" } });
    const req = new Request("http://localhost/api/settings/judge", {
      method: "PUT",
      body: JSON.stringify({ provider: "deepseek", model: "deepseek-chat" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(500);
  });
});
