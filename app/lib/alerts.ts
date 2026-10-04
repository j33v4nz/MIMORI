import { createHmac } from "crypto";
import { logger } from "./logger";

export interface ThreatAlertPayload {
  severity: string;
  category: string;
  agentName?: string;
  sessionId?: string;
  layer: "rule" | "laya" | "llm_judge";
  ruleId?: string;
  verdict?: string;
  timestamp?: string;
  details?: string;
}

export interface AlertDispatchResult {
  /** True when at least one webhook accepted the alert. */
  ok: boolean;
  attempted: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 150;
const FETCH_TIMEOUT_MS = 3000;
const MAX_WEBHOOK_URLS = 5;

const PRIVATE_HOST_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/i,
  /^192\.168\.\d{1,3}\.\d{1,3}$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i,
  /^0\.0\.0\.0$/i,
  /^0x7f\./i,
  /^2130706433$/,
  /^::1$/i,
  /^\[::1\]$/i,
  /^\[fc00:/i,
  /^\[fe80:/i,
  /^169\.254\.\d{1,3}\.\d{1,3}$/i,
  /^metadata\.google\.internal$/i,
  /^instance-data$/i,
  /^localhost$/i,
];

/** Shared SSRF guard for alert webhooks. Env-configured URLs only; no private/internal hosts. */
export function isAllowedWebhookUrl(urlString: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  // Normalize BEFORE matching: strip a trailing FQDN dot so "localhost." (and
  // "metadata.google.internal." etc.) hit the patterns below, and unwrap IPv6
  // brackets so bracketed/unbracketed forms are both matched.
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  const bareHost = host.replace(/^\[/, "").replace(/\]$/, "");
  if (PRIVATE_HOST_PATTERNS.some((p) => p.test(host) || p.test(bareHost))) return false;
  // IPv4-mapped IPv6: the URL parser canonicalizes "[::ffff:127.0.0.1]" to
  // "[::ffff:7f00:1]", so match the "::ffff:" prefix rather than the dotted
  // spelling. Any such address wraps a private/loopback IPv4 underneath.
  if (/^::ffff:/i.test(bareHost)) return false;
  // 0.0.0.0/8 "this network" forms: first octet zero (0.0.0.0, 0.1.2.3, ...).
  if (/^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bareHost)) return false;
  if (parsed.username || parsed.password) return false;
  return true;
}

function redactUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}/[redacted-path]`;
  } catch {
    return "[invalid-url]";
  }
}

export function formatWebhookBody(alert: ThreatAlertPayload): Record<string, unknown> {
  const isCritical = alert.severity === "critical";
  const emoji = isCritical ? "🚨" : "⚠️";
  const color = isCritical ? "#e11d48" : "#f59e0b";
  const title = `${emoji} MIMORI Threat Alert: [${alert.severity.toUpperCase()}] ${alert.category}`;

  return {
    text: title,
    // Slack-compatible attachment
    attachments: [
      {
        color,
        title,
        fields: [
          { title: "Severity", value: alert.severity.toUpperCase(), short: true },
          { title: "Category", value: alert.category, short: true },
          { title: "Layer", value: alert.layer === "rule" ? "Deterministic Rule" : alert.layer === "laya" ? "Laya Classifier" : "Autonomous LLM Judge", short: true },
          { title: "Agent", value: alert.agentName || "Unknown", short: true },
          { title: "Session", value: alert.sessionId || "N/A", short: false },
          ...(alert.details ? [{ title: "Details", value: alert.details.slice(0, 500), short: false }] : [])
        ],
        footer: "MIMORI Agent Security & Observability",
        ts: Math.floor(Date.now() / 1000)
      }
    ],
    // Discord-compatible embed
    embeds: [
      {
        title,
        color: isCritical ? 0xe11d48 : 0xf59e0b,
        fields: [
          { name: "Severity", value: alert.severity.toUpperCase(), inline: true },
          { name: "Category", value: alert.category, inline: true },
          { name: "Layer", value: alert.layer, inline: true },
          { name: "Agent", value: alert.agentName || "Unknown", inline: true },
          { name: "Session", value: alert.sessionId || "N/A", inline: false }
        ],
        timestamp: new Date().toISOString()
      }
    ]
  };
}

/**
 * Resolve all configured webhook URLs. Supports comma-separated
 * ALERT_WEBHOOK_URLS plus the legacy single ALERT_WEBHOOK_URL.
 */
export function getAlertWebhookUrls(explicitUrl?: string): string[] {
  const urls = new Set<string>();
  const add = (raw: string | undefined) => {
    // Hard cap across ALL sources: a full set must stop later sources
    // (env fallbacks) from appending more entries.
    if (urls.size >= MAX_WEBHOOK_URLS) return;
    if (!raw) return;
    for (const part of raw.split(/[,\s;]+/)) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (!isAllowedWebhookUrl(trimmed)) {
        logger.warn({ url: redactUrlForLog(trimmed) }, "Rejected alert webhook URL (SSRF guard)");
        continue;
      }
      urls.add(trimmed);
      if (urls.size >= MAX_WEBHOOK_URLS) break;
    }
  };
  add(explicitUrl);
  add(process.env.ALERT_WEBHOOK_URLS);
  add(process.env.ALERT_WEBHOOK_URL);
  return [...urls];
}

function signatureHeaders(body: string): Record<string, string> {
  const secret = process.env.ALERT_WEBHOOK_SECRET;
  if (!secret) return {};
  const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return { "X-MIMORI-Signature": `sha256=${hex}` };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** POST with exponential-backoff retry. Retries network errors, 429, and 5xx. */
async function postWithRetry(url: string, body: string): Promise<{ ok: boolean; error?: string }> {
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...signatureHeaders(body) },
        body,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "manual",
      });
      if (res.ok) return { ok: true };
      lastError = `HTTP ${res.status}`;
      // Don't retry other 4xx client errors.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  logger.warn({ url: redactUrlForLog(url), error: lastError, attempts: MAX_ATTEMPTS }, "Threat alert webhook failed after retries");
  return { ok: false, error: lastError };
}

export async function dispatchThreatAlertDetailed(
  alert: ThreatAlertPayload,
  webhookUrl?: string
): Promise<AlertDispatchResult> {
  const urls = getAlertWebhookUrls(webhookUrl);
  if (urls.length === 0) {
    return { ok: false, attempted: 0, succeeded: 0, failed: 0, errors: ["no webhook URL configured"] };
  }

  const body = JSON.stringify(formatWebhookBody(alert));
  const outcomes = await Promise.all(urls.map((url) => postWithRetry(url, body)));
  const succeeded = outcomes.filter((o) => o.ok).length;
  const errors = outcomes.filter((o) => !o.ok).map((o) => o.error ?? "unknown error");
  return {
    ok: succeeded > 0,
    attempted: urls.length,
    succeeded,
    failed: urls.length - succeeded,
    errors
  };
}

/**
 * Fire-and-forget friendly: resolves true when at least one webhook
 * accepted the alert. Callers on the ingest hot path must not await this
 * (use `void dispatchThreatAlert(...)`) so alert delivery never blocks ingestion.
 */
export async function dispatchThreatAlert(alert: ThreatAlertPayload, webhookUrl?: string): Promise<boolean> {
  try {
    const result = await dispatchThreatAlertDetailed(alert, webhookUrl);
    return result.ok;
  } catch (err) {
    logger.warn({ err }, "Failed to dispatch threat alert webhook");
    return false;
  }
}
