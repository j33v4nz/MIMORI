import { describe, it, expect, vi } from "vitest";
import { judgeWithOllama } from "./ollama";

const VALID_JUDGE_RESULT = {
  verdict: "benign",
  category: "other",
  severity: "low",
};

function mockFetchOk(judgeResult: object = VALID_JUDGE_RESULT) {
  return vi.fn(async () =>
    Response.json({
      message: { content: JSON.stringify(judgeResult) }, done: true, done_reason: "stop",
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
    Response.json({ message: { content: "" }, done: true, done_reason: "length" })
  );
}

const PAYLOAD = { prompt: "hello" };
const OPTIONS = { baseUrl: "http://localhost:11434", model: "llama3.2" };

describe("judgeWithOllama", () => {
  describe("successful response", () => {
    it("appends /api/chat to baseUrl", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithOllama(PAYLOAD, { ...OPTIONS, fetchImpl });

      const url = (fetchImpl.mock.calls as any)[0][0] as string;
      expect(url).toBe("http://localhost:11434/api/chat");
    });

    it("parses valid JSON from message.content", async () => {
      const fetchImpl = mockFetchOk();
      const response = await judgeWithOllama(PAYLOAD, { ...OPTIONS, fetchImpl });
      expect(response.result.verdict).toBe("benign");
      expect(response.result.confidence).toBe(0.5);
      expect(response.result.reason).toContain("uncalibrated");
      const [, options] = (fetchImpl.mock.calls as any)[0];
      expect(JSON.parse(options.body).format.additionalProperties).toBe(false);
      expect(JSON.parse(options.body).options.num_ctx).toBe(8192);
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
      expect(url).toBe("http://localhost:11434/api/chat");
    });

    it("returns rawModelOutput alongside parsed result", async () => {
      const fullResponse = { message: { content: JSON.stringify(VALID_JUDGE_RESULT) }, done: true, done_reason: "stop" };
      const fetchImpl = vi.fn(async () => Response.json(fullResponse));
      const response = await judgeWithOllama(PAYLOAD, { ...OPTIONS, fetchImpl });
      expect(response.rawModelOutput).toEqual(fullResponse);
    });
  });

  describe("error handling", () => {
    it.each([[undefined, 120_000], [50, 50]])("honors local timeout %s", async (timeoutMs, elapsedMs) => {
      vi.useFakeTimers();
      try {
        const fetchImpl = vi.fn((_url: unknown, options: any) => new Promise<Response>((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }));
        const request = judgeWithOllama(PAYLOAD, { ...OPTIONS, fetchImpl: fetchImpl as typeof fetch, timeoutMs });
        const failure = expect(request).rejects.toThrow("aborted");
        await vi.advanceTimersByTimeAsync(elapsedMs! - 1);
        expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await failure;
      } finally {
        vi.useRealTimers();
      }
    });
    it("rejects incomplete responses even if their verdict parses", async () => {
      const fetchImpl = vi.fn(async () => Response.json({ message: { content: JSON.stringify(VALID_JUDGE_RESULT) }, done: false }));
      await expect(judgeWithOllama(PAYLOAD, { ...OPTIONS, fetchImpl })).rejects.toThrow("did not complete");
    });

    it("refuses oversized input without dropping its tail or making a request", async () => {
      const fetchImpl = mockFetchOk();
      await expect(judgeWithOllama({ output: "a".repeat(7000) }, { ...OPTIONS, fetchImpl })).rejects.toThrow("exceeds");
      expect(fetchImpl).not.toHaveBeenCalled();
    });
    it("rejects truncated output even when its JSON parses", async () => {
      const fetchImpl = vi.fn(async () => Response.json({ message: { content: JSON.stringify(VALID_JUDGE_RESULT) }, done: true, done_reason: "length" }));
      await expect(judgeWithOllama(PAYLOAD, { ...OPTIONS, fetchImpl })).rejects.toThrow("truncated");
    });
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
