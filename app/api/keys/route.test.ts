import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) },
  })),
}));

vi.mock("../../lib/db/service", () => ({
  createSupabaseServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({
        data: { id: "key-1", key_prefix: "mmr_dev_abc", name: "test", created_at: "2026-01-01", expires_at: null },
        error: null,
      })),
      then: (resolve: any) => resolve({ count: 5, error: null }),
    })),
  })),
}));

vi.mock("../../lib/dashboard/queries", () => ({
  getApiKeys: vi.fn(async () => [{ id: "key-1", name: "existing" }]),
  getUserOrgId: vi.fn(async () => "org-1"),
}));

vi.mock("../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/keys", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns 200 with keys array when authenticated", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys).toBeDefined();
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

describe("POST /api/keys", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("returns 201 with key details on success", async () => {
    const req = new NextRequest("http://localhost/api/keys", {
      method: "POST",
      body: JSON.stringify({ name: "my-key" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.key).toBeDefined();
    expect(body.key).toMatch(/^mmr_dev_/);
    expect(body.message).toContain("Save this key now");
  });

  it("returns 400 for invalid body (missing name)", async () => {
    const req = new NextRequest("http://localhost/api/keys", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
  });

  it("returns 401 when no user", async () => {
    const auth = await import("../../lib/db/server");
    (auth.createSupabaseServerClient as any).mockResolvedValueOnce({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    });
    const req = new NextRequest("http://localhost/api/keys", {
      method: "POST",
      body: JSON.stringify({ name: "my-key" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
