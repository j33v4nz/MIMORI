import { describe, expect, it } from "vitest";
import {
  validateJudgeUrl,
  judgeSettingsPutSchema,
  judgeTestSchema,
  ingestEnvelopeSchema,
  ingestEventSchema,
  createKeySchema,
  patchRuleSchema,
  judgeResultSchema
} from "./schemas";

describe("validateJudgeUrl", () => {
  describe("cloud providers (require HTTPS)", () => {
    it("allows valid HTTPS URLs", () => {
      expect(validateJudgeUrl("https://api.deepseek.com", "deepseek")).toBe(true);
      expect(validateJudgeUrl("https://api.openai.com/v1", "openai")).toBe(true);
      expect(validateJudgeUrl("https://api.anthropic.com/v1", "anthropic")).toBe(true);
      expect(validateJudgeUrl("https://generativelanguage.googleapis.com/v1beta", "gemini")).toBe(true);
    });

    it("rejects HTTP for cloud providers", () => {
      expect(validateJudgeUrl("http://api.deepseek.com", "deepseek")).toBe(false);
      expect(validateJudgeUrl("http://api.openai.com/v1", "openai")).toBe(false);
    });

    it("blocks RFC 1918 private IPs", () => {
      expect(validateJudgeUrl("https://10.0.0.1/api", "deepseek")).toBe(false);
      expect(validateJudgeUrl("https://10.1.2.3:8080/api", "openai")).toBe(false);
      expect(validateJudgeUrl("https://172.16.0.1/api", "anthropic")).toBe(false);
      expect(validateJudgeUrl("https://172.31.255.255/api", "gemini")).toBe(false);
      expect(validateJudgeUrl("https://192.168.1.100/api", "deepseek")).toBe(false);
    });

    it("blocks 127.x.x.x loopback", () => {
      expect(validateJudgeUrl("https://127.0.0.1:8080/api", "deepseek")).toBe(false);
      expect(validateJudgeUrl("https://127.0.0.1/api", "openai")).toBe(false);
    });

    it("blocks 0.0.0.0", () => {
      expect(validateJudgeUrl("https://0.0.0.0:8080/api", "deepseek")).toBe(false);
    });

    it("blocks localhost", () => {
      expect(validateJudgeUrl("https://localhost:8080/api", "deepseek")).toBe(false);
      expect(validateJudgeUrl("http://localhost:11434", "deepseek")).toBe(false);
    });

    it("blocks link-local 169.254.x.x (metadata endpoint)", () => {
      expect(validateJudgeUrl("https://169.254.169.254/latest/meta-data", "deepseek")).toBe(false);
      expect(validateJudgeUrl("http://169.254.169.254/latest/meta-data", "gemini")).toBe(false);
    });

    it("blocks cloud metadata endpoints", () => {
      expect(validateJudgeUrl("https://metadata.google.internal/computeMetadata/v1", "gemini")).toBe(false);
    });

    it("blocks IPv6 loopback", () => {
      expect(validateJudgeUrl("https://[::1]:8080/api", "deepseek")).toBe(false);
    });

    it("blocks IPv6 ULA (fc00::)", () => {
      expect(validateJudgeUrl("https://[fc00::1]:8080/api", "deepseek")).toBe(false);
    });

    it("blocks IPv6 link-local (fe80::)", () => {
      expect(validateJudgeUrl("https://[fe80::1]:8080/api", "deepseek")).toBe(false);
    });
  });

  describe("ollama (allow http://localhost only)", () => {
    it("allows http://localhost", () => {
      expect(validateJudgeUrl("http://localhost:11434", "ollama")).toBe(true);
    });

    it("allows http://127.0.0.1", () => {
      expect(validateJudgeUrl("http://127.0.0.1:11434", "ollama")).toBe(true);
    });

    it("allows http://[::1]", () => {
      expect(validateJudgeUrl("http://[::1]:11434", "ollama")).toBe(true);
    });

    it("rejects https for ollama", () => {
      expect(validateJudgeUrl("https://localhost:11434", "ollama")).toBe(false);
    });

    it("rejects non-localhost hostnames for ollama", () => {
      expect(validateJudgeUrl("http://10.0.0.1:11434", "ollama")).toBe(false);
      expect(validateJudgeUrl("http://192.168.1.100:11434", "ollama")).toBe(false);
      expect(validateJudgeUrl("http://evil.com:11434", "ollama")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it.each(["https://2130706433", "https://0x7f000001", "https://user@10.0.0.1", "https://[::ffff:127.0.0.1]", "https://service.localhost"]) ("rejects disguised internal URL %s", (url) => {
      expect(validateJudgeUrl(url, "openai")).toBe(false);
    });
    it("allows empty string", () => {
      expect(validateJudgeUrl("", "deepseek")).toBe(true);
    });

    it("allows no provider", () => {
      expect(validateJudgeUrl("https://api.example.com")).toBe(true);
    });

    it("rejects invalid URLs", () => {
      expect(validateJudgeUrl("not-a-url", "deepseek")).toBe(false);
      expect(validateJudgeUrl("://missing-scheme", "deepseek")).toBe(false);
    });

    it("rejects javascript: scheme", () => {
      expect(validateJudgeUrl("javascript:alert(1)", "deepseek")).toBe(false);
    });

    it("rejects file: scheme", () => {
      expect(validateJudgeUrl("file:///etc/passwd", "deepseek")).toBe(false);
    });

    it("rejects data: scheme", () => {
      expect(validateJudgeUrl("data:text/html,<script>alert(1)</script>", "deepseek")).toBe(false);
    });
  });
});

describe("judgeSettingsPutSchema SSRF validation", () => {
  it("accepts valid HTTPS URL", () => {
    const result = judgeSettingsPutSchema.safeParse({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      base_url: "https://api.deepseek.com"
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty base_url", () => {
    const result = judgeSettingsPutSchema.safeParse({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      base_url: ""
    });
    expect(result.success).toBe(true);
  });

  it("accepts missing base_url", () => {
    const result = judgeSettingsPutSchema.safeParse({
      provider: "deepseek",
      model: "deepseek-v4-flash"
    });
    expect(result.success).toBe(true);
  });

  it("accepts ollama http://localhost", () => {
    const result = judgeSettingsPutSchema.safeParse({
      provider: "ollama",
      model: "llama3.2",
      base_url: "http://localhost:11434"
    });
    expect(result.success).toBe(true);
  });

  it("rejects HTTP for cloud providers", () => {
    const result = judgeSettingsPutSchema.safeParse({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      base_url: "http://api.deepseek.com"
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("HTTPS");
    }
  });

  it("rejects private IP ranges", () => {
    const result = judgeSettingsPutSchema.safeParse({
      provider: "openai",
      model: "gpt-4",
      base_url: "https://192.168.1.100:8080/v1"
    });
    expect(result.success).toBe(false);
  });

  it("rejects metadata endpoints", () => {
    const result = judgeSettingsPutSchema.safeParse({
      provider: "gemini",
      model: "gemini-2.5-flash",
      base_url: "https://169.254.169.254/latest/meta-data"
    });
    expect(result.success).toBe(false);
  });
});

describe("judgeTestSchema SSRF validation", () => {
  it("accepts valid HTTPS URL", () => {
    const result = judgeTestSchema.safeParse({
      provider: "openai",
      model: "gpt-4",
      base_url: "https://api.openai.com/v1",
      api_key: "test-key"
    });
    expect(result.success).toBe(true);
  });

  it("rejects HTTP for cloud providers", () => {
    const result = judgeTestSchema.safeParse({
      provider: "anthropic",
      model: "claude-3",
      base_url: "http://api.anthropic.com/v1",
      api_key: "test-key"
    });
    expect(result.success).toBe(false);
  });

  it("rejects SSRF via internal IP", () => {
    const result = judgeTestSchema.safeParse({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      base_url: "https://10.0.0.1:9090/api",
      api_key: "test-key"
    });
    expect(result.success).toBe(false);
  });
});

describe("ingestEnvelopeSchema", () => {
  it("accepts valid envelope with agent_name and events", () => {
    const result = ingestEnvelopeSchema.safeParse({
      agent_name: "test-agent",
      events: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional session_id and framework", () => {
    const result = ingestEnvelopeSchema.safeParse({
      agent_name: "test-agent",
      session_id: "sess-1",
      framework: "langchain",
      events: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing agent_name", () => {
    const result = ingestEnvelopeSchema.safeParse({ events: [] });
    expect(result.success).toBe(false);
  });

  it("rejects empty agent_name", () => {
    const result = ingestEnvelopeSchema.safeParse({ agent_name: "", events: [] });
    expect(result.success).toBe(false);
  });

  it("rejects agent_name > 200 chars", () => {
    const result = ingestEnvelopeSchema.safeParse({ agent_name: "a".repeat(201), events: [] });
    expect(result.success).toBe(false);
  });

  it("accepts events array up to MAX_EVENTS (500)", () => {
    const result = ingestEnvelopeSchema.safeParse({
      agent_name: "test",
      events: Array.from({ length: 500 }, () => ({ type: "test" })),
    });
    expect(result.success).toBe(true);
  });

  it("rejects events array > MAX_EVENTS (500)", () => {
    const result = ingestEnvelopeSchema.safeParse({
      agent_name: "test",
      events: Array.from({ length: 501 }, () => ({ type: "test" })),
    });
    expect(result.success).toBe(false);
  });
});

describe("ingestEventSchema", () => {
  it("accepts valid event with all fields", () => {
    const result = ingestEventSchema.safeParse({
      event_type: "llm_start",
      sequence_number: 1,
      payload: { prompt: "hello" },
      timestamp: "2026-07-30T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts event without optional timestamp", () => {
    const result = ingestEventSchema.safeParse({
      event_type: "tool_start",
      sequence_number: 5,
      payload: { tool: "search" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid event_type", () => {
    const result = ingestEventSchema.safeParse({
      event_type: "invalid_type",
      sequence_number: 1,
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero sequence_number", () => {
    const result = ingestEventSchema.safeParse({
      event_type: "llm_start",
      sequence_number: 0,
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative sequence_number", () => {
    const result = ingestEventSchema.safeParse({
      event_type: "llm_start",
      sequence_number: -1,
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing payload", () => {
    const result = ingestEventSchema.safeParse({
      event_type: "llm_start",
      sequence_number: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("createKeySchema", () => {
  it("accepts valid name only", () => {
    const result = createKeySchema.safeParse({ name: "my-key" });
    expect(result.success).toBe(true);
  });

  it("accepts name with expires_in_days", () => {
    const result = createKeySchema.safeParse({ name: "my-key", expires_in_days: 30 });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createKeySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name > 100 chars", () => {
    const result = createKeySchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("rejects expires_in_days < 1", () => {
    const result = createKeySchema.safeParse({ name: "key", expires_in_days: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects expires_in_days > 365", () => {
    const result = createKeySchema.safeParse({ name: "key", expires_in_days: 366 });
    expect(result.success).toBe(false);
  });
});

describe("patchRuleSchema", () => {
  it("accepts { enabled: true }", () => {
    expect(patchRuleSchema.safeParse({ enabled: true }).success).toBe(true);
  });

  it("accepts { enabled: false }", () => {
    expect(patchRuleSchema.safeParse({ enabled: false }).success).toBe(true);
  });

  it("rejects missing enabled", () => {
    expect(patchRuleSchema.safeParse({}).success).toBe(false);
  });
});

describe("judgeResultSchema", () => {
  it("accepts valid judge result", () => {
    const result = judgeResultSchema.safeParse({
      verdict: "malicious",
      category: "instruction_override",
      severity: "high",
      confidence: 0.85,
      reason: "detected prompt injection",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid verdict", () => {
    const result = judgeResultSchema.safeParse({
      verdict: "unknown",
      category: "other",
      severity: "low",
      confidence: 0.5,
      reason: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence < 0", () => {
    const result = judgeResultSchema.safeParse({
      verdict: "benign",
      category: "other",
      severity: "low",
      confidence: -0.1,
      reason: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence > 1", () => {
    const result = judgeResultSchema.safeParse({
      verdict: "benign",
      category: "other",
      severity: "low",
      confidence: 1.5,
      reason: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing reason", () => {
    const result = judgeResultSchema.safeParse({
      verdict: "benign",
      category: "other",
      severity: "low",
      confidence: 0.5,
    });
    expect(result.success).toBe(false);
  });
});
