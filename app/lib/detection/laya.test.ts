import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getLayaConfig,
  classifyWithLaya,
  shouldAutoDetect,
  shouldQueueForJudge,
  type LayaClassification,
} from "./laya";
import { logger } from "../logger";

// Mock logger
vi.mock("../logger", () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("laya module", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe("getLayaConfig", () => {
    it("returns defaults when no env vars set (enabled=false)", () => {
      const result = getLayaConfig();
      expect(result.enabled).toBe(false);
      expect(result.config.baseUrl).toBe("http://localhost:5050");
      expect(result.config.timeoutMs).toBe(5000);
      expect(result.config.confidenceThreshold).toBe(0.7);
      expect(result.config.autoDetectThreshold).toBe(0.9);
      expect(result.config.apiKey).toBeUndefined();
    });

    it("reads from env vars correctly", () => {
      vi.stubEnv("LAYA_ENABLED", "true");
      vi.stubEnv("LAYA_BASE_URL", "https://api.laya.ai");
      vi.stubEnv("LAYA_TIMEOUT_MS", "3000");
      vi.stubEnv("LAYA_CONFIDENCE_THRESHOLD", "0.8");
      vi.stubEnv("LAYA_AUTO_DETECT_THRESHOLD", "0.95");
      vi.stubEnv("LAYA_API_KEY", "secret123");

      const result = getLayaConfig();
      expect(result.enabled).toBe(true);
      expect(result.config.baseUrl).toBe("https://api.laya.ai");
      expect(result.config.timeoutMs).toBe(3000);
      expect(result.config.confidenceThreshold).toBe(0.8);
      expect(result.config.autoDetectThreshold).toBe(0.95);
      expect(result.config.apiKey).toBe("secret123");
    });
  });

  describe("classifyWithLaya", () => {
    const mockSuccessResponse = {
      choice: "malicious",
      scores: { malicious: 0.95, suspicious: 0.04, benign: 0.01 },
      metadata: { category: "prompt_injection" },
    };

    const mockFetch = vi.fn();

    beforeEach(() => {
      mockFetch.mockReset();
    });

    it("makes correct HTTP request (URL, headers, body)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      } as Response);

      await classifyWithLaya("test input", { baseUrl: "http://test" }, mockFetch as unknown as typeof fetch);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe("http://test/v1/classify");
      
      const options = callArgs[1];
      expect(options.method).toBe("POST");
      expect(options.headers).toEqual({ "Content-Type": "application/json" });
      
      const body = JSON.parse(options.body as string);
      expect(body.input).toBe("test input");
      expect(body.options).toEqual(["benign", "suspicious", "malicious"]);
      expect(body.context.domain).toBe("ai_agent_security");
    });

    it("includes Authorization header when apiKey provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      } as Response);

      await classifyWithLaya("test input", { apiKey: "test-key" }, mockFetch as unknown as typeof fetch);

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers).toHaveProperty("Authorization", "Bearer test-key");
    });

    it("parses valid response correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccessResponse,
      } as Response);

      const result = await classifyWithLaya("test input", {}, mockFetch as unknown as typeof fetch);

      expect(result).not.toBeNull();
      expect(result?.verdict).toBe("malicious");
      expect(result?.confidence).toBe(0.95);
      expect(result?.category).toBe("prompt_injection");
      expect(result?.severity).toBe("critical");
    });

    it("maps severity correctly", async () => {
      const cases = [
        { choice: "malicious", score: 0.95, expectedSeverity: "critical" },
        { choice: "malicious", score: 0.85, expectedSeverity: "high" },
        { choice: "suspicious", score: 0.85, expectedSeverity: "medium" },
        { choice: "suspicious", score: 0.75, expectedSeverity: "low" },
        { choice: "benign", score: 0.99, expectedSeverity: "low" },
      ];

      for (const tc of cases) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choice: tc.choice,
            scores: { [tc.choice]: tc.score },
          }),
        } as Response);

        const result = await classifyWithLaya("test", {}, mockFetch as unknown as typeof fetch);
        expect(result?.severity).toBe(tc.expectedSeverity);
      }
    });

    it("returns null on network error (fail-open)", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network Error"));
      const result = await classifyWithLaya("test input", {}, mockFetch as unknown as typeof fetch);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Laya classification failed: Network Error"));
    });

    it("returns null on timeout", async () => {
      // Simulate AbortError
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValueOnce(abortError);
      
      const result = await classifyWithLaya("test input", {}, mockFetch as unknown as typeof fetch);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Laya classification failed"));
    });

    it("returns null on malformed response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: "data" }),
      } as Response);

      const result = await classifyWithLaya("test input", {}, mockFetch as unknown as typeof fetch);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Laya classification failed: Malformed Laya response"));
    });
  });

  describe("shouldAutoDetect", () => {
    const config = getLayaConfig().config;

    it("returns true for malicious + high confidence", () => {
      const classification = { verdict: "malicious", confidence: 0.95 } as LayaClassification;
      expect(shouldAutoDetect(classification, config)).toBe(true);
    });

    it("returns false for malicious + low confidence", () => {
      const classification = { verdict: "malicious", confidence: 0.8 } as LayaClassification;
      expect(shouldAutoDetect(classification, config)).toBe(false);
    });

    it("returns false for suspicious even with high confidence", () => {
      const classification = { verdict: "suspicious", confidence: 0.95 } as LayaClassification;
      expect(shouldAutoDetect(classification, config)).toBe(false);
    });
  });

  describe("shouldQueueForJudge", () => {
    const config = getLayaConfig().config;

    it("returns true for suspicious above threshold", () => {
      const classification = { verdict: "suspicious", confidence: 0.8 } as LayaClassification;
      expect(shouldQueueForJudge(classification, config)).toBe(true);
    });

    it("returns false for suspicious below threshold", () => {
      const classification = { verdict: "suspicious", confidence: 0.6 } as LayaClassification;
      expect(shouldQueueForJudge(classification, config)).toBe(false);
    });

    it("returns false for benign", () => {
      const classification = { verdict: "benign", confidence: 0.9 } as LayaClassification;
      expect(shouldQueueForJudge(classification, config)).toBe(false);
    });
  });
});
