import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();
vi.mock("../../lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { exchangeCodeForSession, verifyOtp } }))
}));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  exchangeCodeForSession.mockResolvedValue({ error: null });
  verifyOtp.mockResolvedValue({ error: null });
});

describe("authentication callbacks", () => {
  it("exchanges OAuth codes and preserves a local return path", async () => {
    const response = await GET(new Request("https://mimori.example/auth/callback?code=test&next=%2Fevents"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("test");
    expect(response.headers.get("location")).toBe("https://mimori.example/events");
  });
  it("verifies email hashes without following external return paths", async () => {
    const response = await GET(new Request("https://mimori.example/auth/callback?token_hash=test&type=signup&next=%2F%5Cexternal.example"));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "test", type: "signup" });
    expect(response.headers.get("location")).toBe("https://mimori.example/");
  });
  it("does not verify unsupported token types", async () => {
    const response = await GET(new Request("https://mimori.example/auth/callback?token_hash=test&type=sms"));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/login?message=");
  });
  it("returns failed exchanges to login", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: { message: "expired" } });
    const response = await GET(new Request("https://mimori.example/auth/callback?code=expired"));
    expect(response.headers.get("location")).toContain("/login?message=");
  });
});
