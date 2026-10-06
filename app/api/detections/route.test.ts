import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../lib/api/auth", () => ({
  requireDashboardUser: vi.fn(async () => ({ id: "user-1", email: "test@test.com" })),
}));

vi.mock("../../lib/dashboard/queries", () => ({
  getDetections: vi.fn(async () => [
    { id: "d1", severity: "high", category: "instruction_override" },
  ]),
}));

vi.mock("../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/detections", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns 200 with detections", async () => {
    const req = new NextRequest("http://localhost/api/detections");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.detections).toBeDefined();
  });

  it("returns 401 when no user", async () => {
    const auth = await import("../../lib/api/auth");
    vi.spyOn(auth, "requireDashboardUser").mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/detections");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("passes severity and category query params", async () => {
    const queries = await import("../../lib/dashboard/queries");
    const req = new NextRequest("http://localhost/api/detections?severity=critical&category=threat&limit=10");
    await GET(req);
    expect(queries.getDetections).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "critical", category: "threat" })
    );
  });
});
