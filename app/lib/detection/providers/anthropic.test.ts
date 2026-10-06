import { describe, it, expect, vi } from "vitest";
import { judgeWithAnthropic } from "./anthropic";

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
      content: [{ text: JSON.stringify(judgeResult) }],
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
    Response.json({ content: [] })
  );
}

const PAYLOAD = { prompt: "hello" };
const OPTIONS = { apiKey: "test-key", model: "claude-3" };

describe("judgeWithAnthropic", () => {
  describe("successful response", () => {
    it("sends x-api-key and anthropic-version headers", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithAnthropic(PAYLOAD, { ...OPTIONS, fetchImpl });

      const [, opts] = (fetchImpl.mock.calls as any)[0];
      expect(opts.headers).toMatchObject({
        "Content-Type": "application/json",
        "x-api-key": "test-key",
        "anthropic-version": "2023-06-01",
      });
    });

    it("sends system message in system field (not messages array)", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithAnthropic(PAYLOAD, { ...OPTIONS, fetchImpl });

      const [, opts] = (fetchImpl.mock.calls as any)[0];
      const body = JSON.parse(opts.body as string);
      expect(body.system).toBeDefined();
      expect(body.system).toContain("MIMORI");
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe("user");
    });

    it("parses valid JSON from content[0].text", async () => {
      const fetchImpl = mockFetchOk();
      const response = await judgeWithAnthropic(PAYLOAD, { ...OPTIONS, fetchImpl });
      expect(response.result.verdict).toBe("benign");
    });

    it("returns rawModelOutput alongside parsed result", async () => {
      const fullResponse = { content: [{ text: JSON.stringify(VALID_JUDGE_RESULT) }] };
      const fetchImpl = vi.fn(async () => Response.json(fullResponse));
      const response = await judgeWithAnthropic(PAYLOAD, { ...OPTIONS, fetchImpl });
      expect(response.rawModelOutput).toEqual(fullResponse);
    });

    it("appends /messages to base URL", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithAnthropic(PAYLOAD, { ...OPTIONS, fetchImpl });
      const url = (fetchImpl.mock.calls as any)[0][0] as string;
      expect(url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages$/);
    });

    it("handles trailing slash on base URL", async () => {
      const fetchImpl = mockFetchOk();
      await judgeWithAnthropic(PAYLOAD, { ...OPTIONS, baseUrl: "https://custom.api.com/v1/", fetchImpl });
      const url = (fetchImpl.mock.calls as any)[0][0] as string;
      expect(url).toBe("https://custom.api.com/v1/messages");
    });
  });

  describe("error handling", () => {
    it("throws on non-ok HTTP status", async () => {
      const fetchImpl = mockFetchError(401);
      await expect(judgeWithAnthropic(PAYLOAD, { ...OPTIONS, fetchImpl })).rejects.toThrow("Anthropic API error");
    });

    it("throws when content array is empty", async () => {
      const fetchImpl = mockFetchEmpty();
      await expect(judgeWithAnthropic(PAYLOAD, { ...OPTIONS, fetchImpl })).rejects.toThrow("Empty response");
    });
  });
});
