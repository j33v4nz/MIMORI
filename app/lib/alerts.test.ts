import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatWebhookBody,
  dispatchThreatAlert,
  getAlertWebhookUrls,
  isAllowedWebhookUrl,
  type ThreatAlertPayload
} from "./alerts";

describe("Alerts Module", () => {
  const mockAlert: ThreatAlertPayload = {
    severity: "critical",
    category: "Prompt Injection",
    agentName: "finance-advisor",
    sessionId: "sess_test_123",
    layer: "rule",
    ruleId: "rule_sqli_01",
    verdict: "flagged",
    details: "Detected attempt to bypass system prompt"
  };

  it("formats Slack and Discord compatible webhook payloads", () => {
    const payload = formatWebhookBody(mockAlert);
    expect(payload.text).toContain("🚨 MIMORI Threat Alert: [CRITICAL] Prompt Injection");
    expect(payload.attachments).toBeDefined();
    expect(payload.embeds).toBeDefined();
    const attachment = (payload.attachments as any[])[0];
    expect(attachment.color).toBe("#e11d48");
    expect(attachment.fields.some((f: any) => f.title === "Agent" && f.value === "finance-advisor")).toBe(true);
  });

  it("returns false if no webhook URL is configured", async () => {
    const result = await dispatchThreatAlert(mockAlert, undefined);
    expect(result).toBe(false);
  });

  it("dispatches webhook successfully when URL is provided", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = mockFetch;

    try {
      const result = await dispatchThreatAlert(mockAlert, "https://hooks.slack.com/services/mock/url");
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles webhook HTTP failure gracefully without throwing", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    globalThis.fetch = mockFetch;

    try {
      const result = await dispatchThreatAlert(mockAlert, "https://hooks.slack.com/services/mock/url");
      expect(result).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("isAllowedWebhookUrl (SSRF guard)", () => {
  it("rejects trailing-dot localhost (FQDN normalization)", () => {
    expect(isAllowedWebhookUrl("https://localhost./hook")).toBe(false);
    expect(isAllowedWebhookUrl("https://LOCALHOST./hook")).toBe(false);
  });

  it("rejects IPv4-mapped IPv6 loopback", () => {
    // URL parser canonicalizes "[::ffff:127.0.0.1]" → "[::ffff:7f00:1]".
    expect(isAllowedWebhookUrl("https://[::ffff:127.0.0.1]/hook")).toBe(false);
    expect(isAllowedWebhookUrl("https://[::ffff:7f00:1]/hook")).toBe(false);
  });

  it("rejects 0.0.0.0/8 first-octet-zero forms", () => {
    expect(isAllowedWebhookUrl("https://0.0.0.0/hook")).toBe(false);
    expect(isAllowedWebhookUrl("https://0.1.2.3/hook")).toBe(false);
  });

  it("accepts public Slack/Discord HTTPS webhooks", () => {
    expect(isAllowedWebhookUrl("https://hooks.slack.com/services/mock/url")).toBe(true);
    expect(isAllowedWebhookUrl("https://discord.com/api/webhooks/1/abc")).toBe(true);
  });

  it("still rejects plain localhost, http://, and credentials", () => {
    expect(isAllowedWebhookUrl("https://localhost/hook")).toBe(false);
    expect(isAllowedWebhookUrl("http://hooks.slack.com/services/mock/url")).toBe(false);
    expect(isAllowedWebhookUrl("https://user:pass@hooks.slack.com/x")).toBe(false);
  });
});

describe("getAlertWebhookUrls (cap at 5 across all sources)", () => {
  const saved = {
    ALERT_WEBHOOK_URLS: process.env.ALERT_WEBHOOK_URLS,
    ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("never returns more than MAX_WEBHOOK_URLS (5) even with 3 sources", () => {
    process.env.ALERT_WEBHOOK_URLS = Array.from(
      { length: 4 },
      (_, i) => `https://hooks.slack.com/services/url${i}`
    ).join(",");
    process.env.ALERT_WEBHOOK_URL = "https://discord.com/api/webhooks/1/legacy";

    const urls = getAlertWebhookUrls("https://discord.com/api/webhooks/1/explicit");
    expect(urls).toHaveLength(5);
  });
});
