import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/api/auth", () => ({
  requireDashboardUser: vi.fn(async () => ({ id: "user-1", email: "test@test.com" })),
}));

vi.mock("../../lib/dashboard/queries", () => ({
  getAgents: vi.fn(async () => [
    { id: "agent-1", name: "test-agent" },
  ]),
}));

vi.mock("../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/agents", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns 200 with agents array", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agents).toBeDefined();
    expect(Array.isArray(body.agents)).toBe(true);
  });

  it("returns 401 when no user", async () => {
    const auth = await import("../../lib/api/auth");
    vi.spyOn(auth, "requireDashboardUser").mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 500 on query error", async () => {
    const queries = await import("../../lib/dashboard/queries");
    vi.spyOn(queries, "getAgents").mockRejectedValueOnce(new Error("db error"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
