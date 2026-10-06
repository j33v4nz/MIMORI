import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) },
  })),
}));

vi.mock("../../lib/dashboard/queries", () => ({
  getRules: vi.fn(async () => [
    { id: "rule-1", name: "test-rule", enabled: true },
  ]),
}));

vi.mock("../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/rules", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns 200 with rules array", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rules).toBeDefined();
    expect(Array.isArray(body.rules)).toBe(true);
  });

  it("returns 401 when no user", async () => {
    const auth = await import("../../lib/db/server");
    (auth.createSupabaseServerClient as any).mockResolvedValueOnce({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
