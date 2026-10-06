import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockInvalidateRulesCache = vi.fn();
vi.mock("../../../lib/services/detection-service", () => ({
  invalidateRulesCache: (...args: unknown[]) => mockInvalidateRulesCache(...args),
}));

vi.mock("../../../lib/db/server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
}));

vi.mock("../../../lib/dashboard/queries", () => ({
  updateRuleEnabled: vi.fn(async () => ({ id: "rule-1", enabled: true })),
}));

vi.mock("../../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("PATCH /api/rules/:id", () => {
  let PATCH: typeof import("./route").PATCH;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    PATCH = mod.PATCH;
  });

  it("returns 200 with updated rule", async () => {
    const req = new NextRequest("http://localhost/api/rules/rule-1", {
      method: "PATCH",
      body: JSON.stringify({ enabled: true }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "rule-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
  });

  it("returns 403 when not admin", async () => {
    const db = await import("../../../lib/db/server");
    vi.spyOn(db, "requireAdmin").mockRejectedValueOnce(new Error("not admin"));
    const req = new NextRequest("http://localhost/api/rules/rule-1", {
      method: "PATCH",
      body: JSON.stringify({ enabled: true }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "rule-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/rules/rule-1", {
      method: "PATCH",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "rule-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid request schema", async () => {
    const req = new NextRequest("http://localhost/api/rules/rule-1", {
      method: "PATCH",
      body: JSON.stringify({ enabled: "not-a-bool" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "rule-1" }) });
    expect(res.status).toBe(400);
  });

  it("calls invalidateRulesCache after update", async () => {
    const req = new NextRequest("http://localhost/api/rules/rule-1", {
      method: "PATCH",
      body: JSON.stringify({ enabled: false }),
      headers: { "Content-Type": "application/json" },
    });
    await PATCH(req, { params: Promise.resolve({ id: "rule-1" }) });
    expect(mockInvalidateRulesCache).toHaveBeenCalledOnce();
  });
});
