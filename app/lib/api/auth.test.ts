import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn(async () => ({ data: { user: { id: "user-1" } } as { user: { id: string } | null }, error: null as { message: string } | null }));

vi.mock("../db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: (..._args: unknown[]) => mockGetUser() },
  })),
}));

import { extractBearerToken, hashApiKey, authenticateApiKey, requireDashboardUser } from "./auth";

describe("extractBearerToken", () => {
  it("extracts token from 'Bearer <token>' header", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("returns null for null input", () => {
    expect(extractBearerToken(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractBearerToken("")).toBeNull();
  });

  it("returns null for 'Basic' scheme", () => {
    expect(extractBearerToken("Basic dXNlcjpwYXNz")).toBeNull();
  });

  it("handles extra whitespace around token", () => {
    expect(extractBearerToken("Bearer   abc123  ")).toBe("abc123");
  });

  it("returns null for malformed header without space", () => {
    expect(extractBearerToken("Bearerabc123")).toBeNull();
  });

  it("is case-insensitive on 'Bearer' prefix", () => {
    expect(extractBearerToken("bearer abc123")).toBe("abc123");
    expect(extractBearerToken("BEARER abc123")).toBe("abc123");
    expect(extractBearerToken("bEaReR abc123")).toBe("abc123");
  });
});

describe("hashApiKey", () => {
  it("returns a 64-character hex SHA-256 hash", () => {
    const hash = hashApiKey("test-key");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for the same input", () => {
    expect(hashApiKey("test-key")).toBe(hashApiKey("test-key"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashApiKey("key-1")).not.toBe(hashApiKey("key-2"));
  });
});

describe("authenticateApiKey", () => {
  function createMockSupabase(data: unknown, error: unknown = null) {
    return {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data, error })),
      })),
    } as unknown;
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns AuthenticatedApiKey when key found and not revoked", async () => {
    const mockData = {
      id: "key-123",
      org_id: "org-456",
      key_hash: "somehash",
      revoked_at: null,
    };
    const supabase = createMockSupabase(mockData);

    const result = await authenticateApiKey(supabase, "test-key");
    expect(result).toEqual({
      id: "key-123",
      orgId: "org-456",
      keyHash: "somehash",
    });
  });

  it("returns null when key not found in database", async () => {
    const supabase = createMockSupabase(null, null);

    const result = await authenticateApiKey(supabase, "nonexistent-key");
    expect(result).toBeNull();
  });

  it("returns null when there is a database error", async () => {
    const supabase = createMockSupabase(null, { message: "db error" });

    const result = await authenticateApiKey(supabase, "some-key");
    expect(result).toBeNull();
  });

  it("returns null even with DISABLE_AUTH=true (ingest is fail-closed)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DISABLE_AUTH", "true");

    const supabase = createMockSupabase(null, null);
    const result = await authenticateApiKey(supabase, "any-key");

    expect(result).toBeNull();
  });
});

describe("requireDashboardUser", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  it("returns user when Supabase auth succeeds", async () => {
    const result = await requireDashboardUser();
    expect(result).toBeDefined();
    expect(result?.id).toBe("user-1");
  });

  it("returns null when no user", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const result = await requireDashboardUser();
    expect(result).toBeNull();
  });

  it("returns fallback user in non-production with DISABLE_AUTH=true", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DISABLE_AUTH", "true");
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const result = await requireDashboardUser();
    expect(result).toBeDefined();
    expect(result?.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(result?.email).toBe("operative@mimori.local");
  });
});
