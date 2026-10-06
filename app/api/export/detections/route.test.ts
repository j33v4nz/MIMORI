import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/api/auth", () => ({
  requireDashboardUser: vi.fn(async () => ({ id: "user-1", email: "test@test.com" })),
}));

vi.mock("../../../lib/dashboard/queries", () => ({
  getDetections: vi.fn(async () => [
    {
      id: "d1",
      severity: "high",
      category: "instruction_override",
      layer: "rule",
      verdict: "malicious",
      confidence: 0.9,
      resolved_at: null,
      created_at: "2026-07-30T12:00:00.000Z",
      event: {
        id: "e1",
        event_type: "llm_start",
        sequence_number: 1,
        payload: {},
        session: { id: "s1", external_session_id: "sess-1", agent: { id: "a1", name: "test-agent" } },
      },
    },
  ]),
}));

vi.mock("../../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/export/detections", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns CSV with correct headers", async () => {
    const req = new Request("http://localhost/api/export/detections");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    const headerLine = text.split("\n")[0];
    expect(headerLine).toContain("ID");
    expect(headerLine).toContain("Severity");
    expect(headerLine).toContain("Category");
  });

  it("returns correct Content-Type", async () => {
    const req = new Request("http://localhost/api/export/detections");
    const res = await GET(req);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
  });

  it("returns Content-Disposition with filename", async () => {
    const req = new Request("http://localhost/api/export/detections");
    const res = await GET(req);
    const disposition = res.headers.get("Content-Disposition");
    expect(disposition).toContain("detections_export_");
    expect(disposition).toContain(".csv");
  });

  it("returns 401 when no user", async () => {
    const auth = await import("../../../lib/api/auth");
    vi.spyOn(auth, "requireDashboardUser").mockResolvedValueOnce(null as any);
    const req = new Request("http://localhost/api/export/detections");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("passes severity filter to getDetections", async () => {
    const queries = await import("../../../lib/dashboard/queries");
    const req = new Request("http://localhost/api/export/detections?severity=critical");
    await GET(req);
    expect(queries.getDetections).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "critical" })
    );
  });

  it("sanitizes fields starting with = + - @ tab newline", async () => {
    const queries = await import("../../../lib/dashboard/queries");
    vi.spyOn(queries, "getDetections").mockResolvedValueOnce([
      {
        id: "=SUM(A1:A10)",
        severity: "high",
        category: "instruction_override",
        layer: "rule",
        verdict: "malicious",
        confidence: 0.9,
        resolved_at: null,
        created_at: "2026-07-30T12:00:00.000Z",
        event: { id: "e1", event_type: "llm_start", sequence_number: 1, payload: {}, session: { id: "s1", external_session_id: "sess-1", agent: { id: "a1", name: "test-agent" } } },
      },
    ]);
    const req = new Request("http://localhost/api/export/detections");
    const res = await GET(req);
    const text = await res.text();
    expect(text).toContain("'=SUM(A1:A10)");
  });
});
