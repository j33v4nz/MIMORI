import { describe, it, expect, vi } from "vitest";
import { judgeWithOpenAI } from "./openai";

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
      choices: [{ message: { content: JSON.stringify(judgeResult) } }],
    })
  );
}

function mockFetchError(status: number, statusText = "Error") {
  return vi.fn(async () =>
    Response.json({ error: { message: statusText } }, { status, statusText })
  );
}

function mockFetchEmpty() {
  return vi.fn(async () =>
    Response.json({ choices: [{ message: { content: null } }] })
  );
}

const PAYLOAD = { prompt: "hello" };
const OPTIONS = { apiKey: "test-key", model: "gpt-4" };

describe("judgeWithOpenAI", () => {
  describe("successful response", () => {
    it("sends correct request structure", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithOpenAI(PAYLOAD, { ...OPTIONS, fetchImpl });

      expect(fetchImpl).toHaveBeenCalledOnce();
      const [url, opts] = (fetchImpl.mock.calls as any)[0];
      expect(url).toContain("chat/completions");
      expect(opts.method).toBe("POST");
      expect(opts.headers).toMatchObject({
        "Content-Type": "application/json",
        Authorization: "Bearer test-key",
      });

      const body = JSON.parse(opts.body as string);
      expect(body.model).toBe("gpt-4");
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].role).toBe("user");
      expect(body.response_format).toEqual({ type: "json_object" });
    });

    it("returns rawModelOutput alongside parsed result", async () => {
      const fullResponse = { choices: [{ message: { content: JSON.stringify(VALID_JUDGE_RESULT) } }] };
      const fetchImpl = vi.fn(async () => Response.json(fullResponse));

      const response = await judgeWithOpenAI(PAYLOAD, { ...OPTIONS, fetchImpl });
      expect(response.result.verdict).toBe("benign");
      expect(response.rawModelOutput).toEqual(fullResponse);
    });

    it("uses default baseUrl when not provided", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithOpenAI(PAYLOAD, { ...OPTIONS, fetchImpl });
      const url = (fetchImpl.mock.calls as any)[0][0] as string;
      expect(url).toMatch(/^https:\/\/api\.openai\.com\/v1\/chat\/completions$/);
    });

    it("uses custom baseUrl when provided", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithOpenAI(PAYLOAD, { ...OPTIONS, baseUrl: "https://custom.api.com/v1", fetchImpl });
      const url = (fetchImpl.mock.calls as any)[0][0] as string;
      expect(url).toBe("https://custom.api.com/v1/chat/completions");
    });

    it("handles trailing slash in baseUrl", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithOpenAI(PAYLOAD, { ...OPTIONS, baseUrl: "https://custom.api.com/v1/", fetchImpl });
      const url = (fetchImpl.mock.calls as any)[0][0] as string;
      expect(url).toBe("https://custom.api.com/v1/chat/completions");
    });
  });

  describe("error handling", () => {
    it("throws on non-ok HTTP status", async () => {
      const fetchImpl = mockFetchError(401);
      await expect(judgeWithOpenAI(PAYLOAD, { ...OPTIONS, fetchImpl })).rejects.toThrow("OpenAI API error");
    });

    it("throws when response text is empty/null", async () => {
      const fetchImpl = mockFetchEmpty();
      await expect(judgeWithOpenAI(PAYLOAD, { ...OPTIONS, fetchImpl })).rejects.toThrow("Empty response");
    });
  });
});
