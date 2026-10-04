import { describe, it, expect, vi } from "vitest";
import { judgeWithOllama } from "./ollama";

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
    Response.json({ error: { message: "connection refused" } }, { status, statusText: "Error" })
  );
}

function mockFetchEmpty() {
  return vi.fn(async () =>
    Response.json({ choices: [{ message: { content: "" }, finish_reason: "length" }] })
  );
}

const PAYLOAD = { prompt: "hello" };
const OPTIONS = { baseUrl: "http://localhost:11434", model: "llama3.2" };

describe("judgeWithOllama", () => {
  describe("successful response", () => {
    it("appends /v1/chat/completions to baseUrl", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithOllama(PAYLOAD, { ...OPTIONS, fetchImpl });

      const url = (fetchImpl.mock.calls as any)[0][0] as string;
      expect(url).toBe("http://localhost:11434/v1/chat/completions");
    });

    it("parses valid JSON from choices[0].message.content", async () => {
      const fetchImpl = mockFetchOk();
      const response = await judgeWithOllama(PAYLOAD, { ...OPTIONS, fetchImpl });
      expect(response.result.verdict).toBe("benign");
    });

    it("includes Authorization header when apiKey is provided", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithOllama(PAYLOAD, { ...OPTIONS, apiKey: "my-key", fetchImpl });

      const [, opts] = (fetchImpl.mock.calls as any)[0];
      expect(opts.headers).toMatchObject({
        Authorization: "Bearer my-key",
      });
    });

    it("omits Authorization header when apiKey is not provided", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithOllama(PAYLOAD, { ...OPTIONS, fetchImpl });

      const [, opts] = (fetchImpl.mock.calls as any)[0];
      expect(opts.headers).not.toHaveProperty("Authorization");
    });

    it("handles trailing slash in baseUrl", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithOllama(PAYLOAD, { ...OPTIONS, baseUrl: "http://localhost:11434/", fetchImpl });
      const url = (fetchImpl.mock.calls as any)[0][0] as string;
      expect(url).toBe("http://localhost:11434/v1/chat/completions");
    });

    it("returns rawModelOutput alongside parsed result", async () => {
      const fullResponse = { choices: [{ message: { content: JSON.stringify(VALID_JUDGE_RESULT) }, finish_reason: "stop" }] };
      const fetchImpl = vi.fn(async () => Response.json(fullResponse));
      const response = await judgeWithOllama(PAYLOAD, { ...OPTIONS, fetchImpl });
      expect(response.rawModelOutput).toEqual(fullResponse);
    });
  });

  describe("error handling", () => {
    it("throws on non-ok status", async () => {
      const fetchImpl = mockFetchError(500);
      await expect(judgeWithOllama(PAYLOAD, { ...OPTIONS, fetchImpl })).rejects.toThrow("Ollama judge request failed");
    });

    it("throws when content is empty with finishReason info", async () => {
      const fetchImpl = mockFetchEmpty();
      await expect(judgeWithOllama(PAYLOAD, { ...OPTIONS, fetchImpl })).rejects.toThrow("finishReason=length");
    });
  });
});
