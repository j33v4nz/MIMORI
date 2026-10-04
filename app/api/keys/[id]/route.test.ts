import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../../lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) },
  })),
}));

vi.mock("../../../lib/db/service", () => ({
  createSupabaseServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({ data: { id: "key-1" }, error: null })),
    })),
  })),
}));

vi.mock("../../../lib/dashboard/queries", () => ({
  getUserOrgId: vi.fn(async () => "org-1"),
}));

vi.mock("../../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("PATCH /api/keys/:id", () => {
  let PATCH: typeof import("./route").PATCH;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    PATCH = mod.PATCH;
  });

  it("returns 200 with revoked: true", async () => {
    const req = new NextRequest("http://localhost/api/keys/key-1", { method: "PATCH" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "key-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revoked).toBe(true);
  });

  it("returns 401 when no user", async () => {
    const auth = await import("../../../lib/db/server");
    (auth.createSupabaseServerClient as any).mockResolvedValueOnce({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    });
    const req = new NextRequest("http://localhost/api/keys/key-1", { method: "PATCH" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "key-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when key not found", async () => {
    const service = await import("../../../lib/db/service");
    (service.createSupabaseServiceClient as any).mockReturnValueOnce({
      from: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({ data: null, error: { message: "not found" } })),
      })),
    });
    const req = new NextRequest("http://localhost/api/keys/key-1", { method: "PATCH" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "key-1" }) });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/keys/:id", () => {
  let DELETE: typeof import("./route").DELETE;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    DELETE = mod.DELETE;
  });

  it("returns 200 with deleted: true", async () => {
    const req = new NextRequest("http://localhost/api/keys/key-1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "key-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  it("returns 401 when no user", async () => {
    const auth = await import("../../../lib/db/server");
    (auth.createSupabaseServerClient as any).mockResolvedValueOnce({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    });
    const req = new NextRequest("http://localhost/api/keys/key-1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "key-1" }) });
    expect(res.status).toBe(401);
  });
});
