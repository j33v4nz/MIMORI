import { describe, it, expect, vi } from "vitest";
import { judgeWithDeepSeek } from "./deepseek";

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
      choices: [{ message: { content: JSON.stringify(judgeResult) }, finish_reason: "stop" }],
    })
  );
}

function mockFetchError(status: number) {
  return vi.fn(async () =>
    Response.json({ error: { message: "unauthorized" } }, { status, statusText: "Unauthorized" })
  );
}

function mockFetchEmpty() {
  return vi.fn(async () =>
    Response.json({ choices: [{ message: { content: "" }, finish_reason: "length" }] })
  );
}

const PAYLOAD = { prompt: "hello" };
const OPTIONS = { apiKey: "test-key", model: "deepseek-chat" };

describe("judgeWithDeepSeek", () => {
  describe("successful response", () => {
    it("sends Authorization Bearer header", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithDeepSeek(PAYLOAD, { ...OPTIONS, fetchImpl });

      const [, opts] = (fetchImpl.mock.calls as any)[0];
      expect(opts.headers).toMatchObject({
        Authorization: "Bearer test-key",
      });
    });

    it("includes thinking: { type: 'disabled' } in body", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithDeepSeek(PAYLOAD, { ...OPTIONS, fetchImpl });

      const body = JSON.parse(((fetchImpl.mock.calls as any)[0])[1].body as string);
      expect(body.thinking).toEqual({ type: "disabled" });
      expect(body.temperature).toBe(0);
      expect(body.response_format).toEqual({ type: "json_object" });
    });

    it("parses valid JSON from choices[0].message.content", async () => {
      const fetchImpl = mockFetchOk();
      const response = await judgeWithDeepSeek(PAYLOAD, { ...OPTIONS, fetchImpl });
      expect(response.result.verdict).toBe("benign");
    });

    it("trims whitespace from response text", async () => {
      const fetchImpl = vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: `  ${JSON.stringify(VALID_JUDGE_RESULT)}  ` }, finish_reason: "stop" }],
        })
      );
      const response = await judgeWithDeepSeek(PAYLOAD, { ...OPTIONS, fetchImpl });
      expect(response.result.verdict).toBe("benign");
    });

    it("uses default baseUrl when not provided", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithDeepSeek(PAYLOAD, { ...OPTIONS, fetchImpl });
      const url = (fetchImpl.mock.calls as any)[0][0] as string;
      expect(url).toMatch(/^https:\/\/api\.deepseek\.com\/chat\/completions$/);
    });

    it("handles trailing slash in baseUrl", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithDeepSeek(PAYLOAD, { ...OPTIONS, baseUrl: "https://custom.api.com/", fetchImpl });
      const url = (fetchImpl.mock.calls as any)[0][0] as string;
      expect(url).toBe("https://custom.api.com/chat/completions");
    });
  });

  describe("error handling", () => {
    it("throws on non-ok status with status code in message", async () => {
      const fetchImpl = mockFetchError(401);
      await expect(judgeWithDeepSeek(PAYLOAD, { ...OPTIONS, fetchImpl })).rejects.toThrow("401");
    });

    it("throws when response text is empty with finishReason info", async () => {
      const fetchImpl = mockFetchEmpty();
      await expect(judgeWithDeepSeek(PAYLOAD, { ...OPTIONS, fetchImpl })).rejects.toThrow("finishReason=length");
    });
  });
});
