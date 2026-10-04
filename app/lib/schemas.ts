import { z } from "zod";
import { EVENT_TYPES } from "./types";

const PRIVATE_IP_PATTERNS = [
  /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}/i,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}/i,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}/i,
  /^https?:\/\/127\.\d{1,3}\.\d{1,3}\.\d{1,3}/i,
  /^https?:\/\/0\.0\.0\.0/i,
  /^https?:\/\/\[::1\]/i,
  /^https?:\/\/localhost/i,
  /^https?:\/\/169\.254\.\d{1,3}\.\d{1,3}/i,
  /^https?:\/\/metadata\.google\.internal/i,
  /^https?:\/\/\[fc00:/i,
  /^https?:\/\/\[fe80:/i
];

function isPrivateOrReservedUrl(urlString: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(urlString));
}

export function validateJudgeUrl(urlString: string, provider?: string): boolean {
  if (!urlString || urlString === "") return true;

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;

  const isOllama = provider === "ollama";

  if (isOllama) {
    const host = parsed.hostname;
    return parsed.protocol === "http:" && (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1");
  }

  if (parsed.protocol !== "https:") return false;
  // Check the canonical URL too: WHATWG normalizes integer/hex IPv4 hosts.
  if (isPrivateOrReservedUrl(parsed.href)) return false;
  const host = parsed.hostname.toLowerCase();
  if (host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
  // Custom cloud endpoints use DNS hostnames; reject IPv6 literals, including
  // mapped IPv4, rather than relying on incomplete textual private ranges.
  if (host.startsWith("[")) return false;

  return true;
}

export const MAX_BODY_BYTES = 1_000_000;
export const MAX_EVENTS = 500;

export const ingestEnvelopeSchema = z.object({
  agent_name: z.string().trim().min(1).max(200),
  session_id: z.string().trim().min(1).max(500).optional(),
  framework: z.string().trim().min(1).max(100).optional(),
  events: z.array(z.unknown()).max(MAX_EVENTS)
});

export const ingestEventSchema = z.object({
  event_type: z.enum(EVENT_TYPES),
  sequence_number: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()),
  timestamp: z.string().datetime({ offset: true }).optional()
});

export const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  expires_in_days: z.number().int().min(1).max(365).optional()
});

export const patchRuleSchema = z.object({
  enabled: z.boolean()
});

export const judgeSettingsPutSchema = z.object({
  provider: z.enum(["ollama", "gemini", "deepseek", "openai", "anthropic"]),
  model: z.string().min(1).max(200),
  base_url: z.string().max(500).optional().or(z.literal(""))
}).refine(
  (data) => {
    if (!data.base_url || data.base_url === "") return true;
    return validateJudgeUrl(data.base_url, data.provider);
  },
  { message: "URL must use HTTPS and cannot point to private/internal networks. Ollama only allows http://localhost.", path: ["base_url"] }
);

export const judgeTestSchema = z.object({
  provider: z.enum(["ollama", "gemini", "deepseek", "openai", "anthropic"]),
  model: z.string().min(1).max(200),
  base_url: z.string().max(500).optional().or(z.literal("")),
  api_key: z.string().max(1000).optional().or(z.literal(""))
}).refine(
  (data) => {
    if (!data.base_url || data.base_url === "") return true;
    return validateJudgeUrl(data.base_url, data.provider);
  },
  { message: "URL must use HTTPS and cannot point to private/internal networks. Ollama only allows http://localhost.", path: ["base_url"] }
);

export const verdictSchema = z.enum(["benign", "suspicious", "malicious"]);
export const categorySchema = z.enum([
  "instruction_override",
  "jailbreak_persona",
  "system_prompt_extraction",
  "encoding_evasion",
  "excessive_agency",
  "data_exfiltration",
  "threat",
  "exfiltration",
  "other"
]);
export const severitySchema = z.enum(["low", "medium", "high", "critical"]);

export const judgeResultSchema = z.object({
  verdict: verdictSchema,
  category: categorySchema,
  severity: severitySchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(1000)
});

export type JudgeResult = z.infer<typeof judgeResultSchema>;
