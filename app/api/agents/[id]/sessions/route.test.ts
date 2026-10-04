import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../../../lib/api/auth", () => ({
  requireDashboardUser: vi.fn(async () => ({ id: "user-1", email: "test@test.com" })),
}));

vi.mock("../../../../lib/dashboard/queries", () => ({
  getSessionsForAgent: vi.fn(async () => [
    { id: "s1", external_session_id: "sess-123", event_count: 10, detection_count: 0 },
  ]),
}));

vi.mock("../../../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/agents/:id/sessions", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns 200 with sessions for agent", async () => {
    const req = new NextRequest("http://localhost/api/agents/agent-1/sessions");
    const res = await GET(req, { params: Promise.resolve({ id: "agent-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toBeDefined();
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  it("returns 401 when no user", async () => {
    const auth = await import("../../../../lib/api/auth");
    vi.spyOn(auth, "requireDashboardUser").mockResolvedValueOnce(null as any);
    const req = new NextRequest("http://localhost/api/agents/agent-1/sessions");
    const res = await GET(req, { params: Promise.resolve({ id: "agent-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 500 on query error", async () => {
    const queries = await import("../../../../lib/dashboard/queries");
    vi.spyOn(queries, "getSessionsForAgent").mockRejectedValueOnce(new Error("db fail"));
    const req = new NextRequest("http://localhost/api/agents/agent-1/sessions");
    const res = await GET(req, { params: Promise.resolve({ id: "agent-1" }) });
    expect(res.status).toBe(500);
  });
});
