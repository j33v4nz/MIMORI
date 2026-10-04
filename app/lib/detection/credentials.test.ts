import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveJudgeApiKey } from "./credentials";

const env = {
  provider: "openai", model: "test", openaiApiKey: "deployment-secret",
  anthropicApiKey: "anthropic-secret", geminiApiKey: "gemini-secret",
  deepseekApiKey: "deepseek-secret", ollamaApiKey: "local-secret",
  ollamaBaseUrl: "http://localhost:11434", cronSecret: undefined
};

afterEach(() => vi.unstubAllEnvs());

describe("deployment judge credentials", () => {
  it.each([
    ["openai", "https://api.openai.com/v1", "deployment-secret"],
    ["anthropic", "https://api.anthropic.com/v1", "anthropic-secret"],
    ["gemini", "https://generativelanguage.googleapis.com/v1beta", "gemini-secret"],
    ["deepseek", "https://api.deepseek.com", "deepseek-secret"],
    ["ollama", "http://localhost:11434", "local-secret"]
  ])("permits %s at its trusted endpoint", (provider, url, key) => {
    expect(resolveJudgeApiKey(provider, url, undefined, env)).toBe(key);
  });

  it.each([
    "https://collector.example/v1", "https://api.openai.com.collector.example/v1",
    "https://collector.example@api.openai.com/v1", "https://api.openai.com:8443/v1",
    "http://api.openai.com/v1", "https://api.openai.com/v1?redirect=collector.example"
  ])("rejects deployment credentials at %s", (url) => {
    expect(() => resolveJudgeApiKey("openai", url, undefined, env)).toThrow("endpoint");
  });

  it("does not leak Ollama credentials to another local service", () => {
    expect(() => resolveJudgeApiKey("ollama", "http://localhost:1234", undefined, env)).toThrow();
  });

  it("blocks user-supplied keys at unapproved endpoints", () => {
    vi.stubEnv("MIMORI_JUDGE_ALLOWED_ORIGINS", "");
    expect(() => resolveJudgeApiKey("openai", "https://custom.example/v1", "own-key", env)).toThrow("not approved");
  });

  it("never forwards a deployment key to an approved custom origin", () => {
    vi.stubEnv("MIMORI_JUDGE_ALLOWED_ORIGINS", "https://custom.example");
    expect(() => resolveJudgeApiKey("openai", "https://custom.example/v1", undefined, env)).toThrow("Deployment API keys");
  });

  it("uses only an explicitly supplied key for a custom endpoint", () => {
    vi.stubEnv("MIMORI_JUDGE_ALLOWED_ORIGINS", "https://custom.example");
    expect(resolveJudgeApiKey("openai", "https://custom.example/v1", "own-key", env)).toBe("own-key");
  });
});
