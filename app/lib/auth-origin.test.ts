import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthOrigin, safeRedirectPath } from "./auth-origin";

afterEach(() => vi.unstubAllEnvs());

describe("OAuth application origin", () => {
  it("preserves HTTPS origins", () => {
    vi.stubEnv("APP_URL", "");
    expect(getAuthOrigin(new Headers({ origin: "https://mimori.example", host: "mimori.example" }))).toBe("https://mimori.example");
  });
  it("prefers the configured application URL", () => {
    vi.stubEnv("APP_URL", "https://mimori.example");
    expect(getAuthOrigin(new Headers({ origin: "https://other.example" }))).toBe("https://mimori.example");
  });
  it("uses HTTPS for production host fallback", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(getAuthOrigin(new Headers({ host: "mimori.example" }))).toBe("https://mimori.example");
  });
  it("rejects a production HTTP configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "http://mimori.example");
    expect(() => getAuthOrigin(new Headers())).toThrow("HTTPS");
  });
});

describe("login return paths", () => {
  it.each(["//other.example", "/\\other.example", "https://other.example", "/path\r\n"]) ("rejects %s", (value) => {
    expect(safeRedirectPath(value)).toBe("/");
  });
  it("accepts local dashboard paths", () => {
    expect(safeRedirectPath("/events?agentId=123")).toBe("/events?agentId=123");
  });
});
