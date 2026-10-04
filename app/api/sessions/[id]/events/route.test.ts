import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../../../lib/api/auth", () => ({
  requireDashboardUser: vi.fn(async () => ({ id: "user-1", email: "test@test.com" })),
}));

vi.mock("../../../../lib/dashboard/queries", () => ({
  getSessionEvents: vi.fn(async () => [
    { id: "e1", event_type: "llm_start", sequence_number: 1, payload: {} },
  ]),
}));

vi.mock("../../../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/sessions/:id/events", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns 200 with events for session", async () => {
    const req = new NextRequest("http://localhost/api/sessions/sess-1/events");
    const res = await GET(req, { params: Promise.resolve({ id: "sess-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session_id).toBe("sess-1");
    expect(body.events).toBeDefined();
    expect(Array.isArray(body.events)).toBe(true);
  });

  it("returns 401 when no user", async () => {
    const auth = await import("../../../../lib/api/auth");
    vi.spyOn(auth, "requireDashboardUser").mockResolvedValueOnce(null as any);
    const req = new NextRequest("http://localhost/api/sessions/sess-1/events");
    const res = await GET(req, { params: Promise.resolve({ id: "sess-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 500 on query error", async () => {
    const queries = await import("../../../../lib/dashboard/queries");
    vi.spyOn(queries, "getSessionEvents").mockRejectedValueOnce(new Error("db fail"));
    const req = new NextRequest("http://localhost/api/sessions/sess-1/events");
    const res = await GET(req, { params: Promise.resolve({ id: "sess-1" }) });
    expect(res.status).toBe(500);
  });
});
