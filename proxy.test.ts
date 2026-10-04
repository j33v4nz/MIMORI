import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ user: null as null | { id: string }, refresh: false }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url, _key, options) => ({
    auth: { getUser: async () => {
      if (state.refresh) options.cookies.setAll([
        { name: "session.0", value: "first", options: { httpOnly: true } },
        { name: "session.1", value: "second", options: { httpOnly: true } }
      ]);
      return { data: { user: state.user } };
    } }
  }))
}));
vi.mock("./app/lib/auth-flags", () => ({ isAuthDisabled: () => false }));
import { proxy } from "./proxy";

beforeEach(() => {
  state.user = null;
  state.refresh = false;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("authentication routing", () => {
  it.each(["/auth/callback?code=test", "/api/behavior-diff", "/api/workers/redteam", "/api/agents"])(
    "lets %s reach its own authentication handler", async (path) => {
      const response = await proxy(new NextRequest(`https://mimori.example${path}`));
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  );
  it("requires a session for dashboard pages", async () => {
    const response = await proxy(new NextRequest("https://mimori.example/events"));
    expect(response.headers.get("location")).toBe("https://mimori.example/login?next=%2Fevents");
  });
  it("preserves every chunk of refreshed session cookies", async () => {
    state.user = { id: "test-user" };
    state.refresh = true;
    const response = await proxy(new NextRequest("https://mimori.example/events"));
    expect(response.cookies.get("session.0")?.value).toBe("first");
    expect(response.cookies.get("session.1")?.value).toBe("second");
    expect(response.headers.get("x-middleware-request-cookie")).toContain("session.0=first");
    expect(response.headers.get("x-middleware-request-cookie")).toContain("session.1=second");
  });
});
