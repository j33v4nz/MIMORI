import { describe, it, expect, vi } from "vitest";
import { judgeWithGemini } from "./gemini";

const VALID_JUDGE_RESULT = {
  verdict: "benign",
  category: "other",
  severity: "low",
  confidence: 0.1,
  reason: "normal behavior",
};

function mockFetchOk(judgeResult: object = VALID_JUDGE_RESULT) {
  return vi.fn(async () =>
    Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify(judgeResult) }] } }],
    })
  );
}

function mockFetchError(status: number) {
  return vi.fn(async () =>
    Response.json({ error: { message: "forbidden" } }, { status, statusText: "Forbidden" })
  );
}

function mockFetchEmpty() {
  return vi.fn(async () =>
    Response.json({ candidates: [] })
  );
}

const PAYLOAD = { prompt: "hello" };
const OPTIONS = { apiKey: "test-key", model: "gemini-2.5-flash" };

describe("judgeWithGemini", () => {
  describe("successful response", () => {
    it("includes API key as URL query parameter", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithGemini(PAYLOAD, { ...OPTIONS, fetchImpl });

      const url = (fetchImpl.mock.calls as any)[0][0] as string;
      expect(url).toContain("key=test-key");
    });

    it("sends systemInstruction in correct format", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithGemini(PAYLOAD, { ...OPTIONS, fetchImpl });

      const body = JSON.parse(((fetchImpl.mock.calls as any)[0])[1].body as string);
      expect(body.systemInstruction).toBeDefined();
      expect(body.systemInstruction.parts).toBeDefined();
      expect(body.systemInstruction.parts[0].text).toContain("MIMORI");
      expect(body.contents).toHaveLength(1);
      expect(body.generationConfig.responseMimeType).toBe("application/json");
    });

    it("parses valid JSON from candidates[0].content.parts[0].text", async () => {
      const fetchImpl = mockFetchOk();
      const response = await judgeWithGemini(PAYLOAD, { ...OPTIONS, fetchImpl });
      expect(response.result.verdict).toBe("benign");
    });

    it("URL-encodes model name in endpoint path", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithGemini(PAYLOAD, { ...OPTIONS, model: "gemini/2.5-flash", fetchImpl });
      const url = (fetchImpl.mock.calls as any)[0][0] as string;
      expect(url).toContain("gemini%2F2.5-flash");
    });

    it("uses default baseUrl when not provided", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithGemini(PAYLOAD, { ...OPTIONS, fetchImpl });
      const url = (fetchImpl.mock.calls as any)[0][0] as string;
      expect(url).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\//);
    });

    it("handles trailing slash in baseUrl", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithGemini(PAYLOAD, { ...OPTIONS, baseUrl: "https://custom.api.com/v1/", fetchImpl });
      const url = (fetchImpl.mock.calls as any)[0][0] as string;
      expect(url).toBe("https://custom.api.com/v1/models/gemini-2.5-flash:generateContent?key=test-key");
    });
  });

  describe("error handling", () => {
    it("throws on non-ok status", async () => {
      const fetchImpl = mockFetchError(403);
      await expect(judgeWithGemini(PAYLOAD, { ...OPTIONS, fetchImpl })).rejects.toThrow("Gemini judge request failed");
    });

    it("throws when candidates array is empty", async () => {
      const fetchImpl = mockFetchEmpty();
      await expect(judgeWithGemini(PAYLOAD, { ...OPTIONS, fetchImpl })).rejects.toThrow("Empty response");
    });
  });
});
