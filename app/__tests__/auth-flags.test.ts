import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isAuthDisabled } from "../lib/auth-flags";

describe("isAuthDisabled", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true in non-production with DISABLE_AUTH=true", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DISABLE_AUTH", "true");
    expect(isAuthDisabled()).toBe(true);
  });

  it("returns false without the flag", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DISABLE_AUTH", "");
    expect(isAuthDisabled()).toBe(false);
  });

  it("returns false in production even with DISABLE_AUTH=true (fail-closed)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DISABLE_AUTH", "true");
    expect(isAuthDisabled()).toBe(false);
  });

  it("returns false when NODE_ENV is unset/staging with DISABLE_AUTH=true", () => {
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("DISABLE_AUTH", "true");
    expect(isAuthDisabled()).toBe(false);
  });

  it("does not honor NEXT_PUBLIC_DISABLE_AUTH", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DISABLE_AUTH", "");
    vi.stubEnv("NEXT_PUBLIC_DISABLE_AUTH", "true");
    expect(isAuthDisabled()).toBe(false);
  });

  it("throws at import when production + DISABLE_AUTH=true (boot assertion)", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DISABLE_AUTH", "true");
    await expect(import("../lib/auth-flags")).rejects.toThrow(/fail-closed/i);
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("throws at import when NODE_ENV is unset + DISABLE_AUTH=true", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "");
    vi.stubEnv("DISABLE_AUTH", "true");
    await expect(import("../lib/auth-flags")).rejects.toThrow(/fail-closed/i);
    vi.resetModules();
    vi.unstubAllEnvs();
  });
});
