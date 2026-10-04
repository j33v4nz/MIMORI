import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../lib/api/auth", () => ({
  requireDashboardUser: vi.fn(async () => ({ id: "user-1", email: "test@test.com" })),
}));

vi.mock("../../../../lib/env", () => ({
  getLlmJudgeEnv: vi.fn(() => ({
    provider: "ollama",
    model: "llama3.2",
    cronSecret: "test-cron",
    deepseekApiKey: "test-key",
    geminiApiKey: "",
    openaiApiKey: "",
    anthropicApiKey: "",
    ollamaApiKey: "",
    ollamaBaseUrl: "http://localhost:11434",
  })),
}));

vi.mock("../../../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/settings/judge/test", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("MIMORI_JUDGE_ALLOWED_ORIGINS", "https://custom.example");
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("returns 401 when no user", async () => {
    const auth = await import("../../../../lib/api/auth");
    vi.spyOn(auth, "requireDashboardUser").mockResolvedValueOnce(null as any);
    const req = new Request("http://localhost/api/settings/judge/test", {
      method: "POST",
      body: JSON.stringify({ provider: "ollama", model: "llama3.2" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns error when API key is missing for non-ollama provider", async () => {
    const env = await import("../../../../lib/env");
    vi.spyOn(env, "getLlmJudgeEnv").mockReturnValueOnce({
      provider: "deepseek",
      model: "deepseek-chat",
      cronSecret: "test-cron",
      deepseekApiKey: "",
      geminiApiKey: "",
      openaiApiKey: "",
      anthropicApiKey: "",
      ollamaApiKey: "",
      ollamaBaseUrl: "http://localhost:11434",
    } as any);
    const req = new Request("http://localhost/api/settings/judge/test", {
      method: "POST",
      body: JSON.stringify({ provider: "deepseek", model: "deepseek-chat" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Missing API key");
  });

  it("returns 400 for invalid request body", async () => {
    const req = new Request("http://localhost/api/settings/judge/test", {
      method: "POST",
      body: JSON.stringify({ provider: "invalid" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects forwarding a deployment key to a custom endpoint before fetching", async () => {
    const res = await POST(new Request("http://localhost/api/settings/judge/test", {
      method: "POST",
      body: JSON.stringify({ provider: "deepseek", model: "test", base_url: "https://collector.example" }),
      headers: { "Content-Type": "application/json" },
    }));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("permits a custom endpoint with the caller's own key and rejects redirects", async () => {
    const res = await POST(new Request("http://localhost/api/settings/judge/test", {
      method: "POST",
      body: JSON.stringify({ provider: "deepseek", model: "test", base_url: "https://custom.example", api_key: "own-key" }),
      headers: { "Content-Type": "application/json" },
    }));
    expect((await res.json()).success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith("https://custom.example/chat/completions", expect.objectContaining({
      redirect: "error", headers: expect.objectContaining({ Authorization: "Bearer own-key" })
    }));
  });

  it("returns success for ollama connection test", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const req = new Request("http://localhost/api/settings/judge/test", {
      method: "POST",
      body: JSON.stringify({ provider: "ollama", model: "llama3.2" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.response_time_ms).toBeDefined();
  });

  it("returns failure on connection error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const req = new Request("http://localhost/api/settings/judge/test", {
      method: "POST",
      body: JSON.stringify({ provider: "ollama", model: "llama3.2" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("ECONNREFUSED");
  });
});
