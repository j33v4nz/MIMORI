import { payloadToSearchText } from "./rules";

export const TRIGGER_TERMS = [
  // instruction override
  "ignore",
  "forget",
  "override",
  "disregard",
  "new instructions",
  "supersede",
  "from now on",
  "reprogrammed",
  // system prompt extraction
  "system prompt",
  "developer message",
  "your prompt",
  "verbatim",
  "word for word",
  "configuration",
  "beginning of conversation",
  "repeat everything above",
  "hidden instructions",
  "initial prompt",
  "chain of thought",
  "scratchpad",
  // jailbreak
  "jailbreak",
  "developer mode",
  "do anything now",
  "unrestricted",
  "unfiltered",
  "god mode",
  "simulation",
  "roleplay",
  "opposite mode",
  "bedtime story",
  // encoding evasion
  "base64",
  "decode",
  "binary code",
  "hex decode",
  "morse code",
  "rot13",
  "caesar cipher",
  "leet speak",
  "reverse this text",
  "punycode",
  "unicode",
  // data exfiltration
  "token",
  "api key",
  "api_key",
  "password",
  "credential",
  "webhook",
  "ngrok",
  "requestbin",
  "pastebin",
  // excessive agency
  "delete",
  "transfer",
  "deploy",
  "without asking",
  "without approval",
  "without permission",
  "drop database",
  "rm -rf",
  "mass email",
  // threat / exploit
  "union select",
  "drop table",
  "<script",
  "javascript:",
  "file://",
  "gopher://",
  "/etc/passwd",
  "/proc/self",
  "169.254.169.254",
  "reverse shell",
  "metasploit",
  "nmap",
  "sqlmap",
  // keys & secrets
  "akia",
  "sk_live_",
  "sk_test_",
  "ghp_",
  "glpat-",
  "aiza",
  "xox",
  "bearer",
  "eyj",
  "begin private key",
  "postgres://",
  "mongodb://",
  // harmful
  "bomb",
  "weapon",
  "kill myself",
  "suicide",
  "hack",
  "counterfeit"
];

/** Tool results cross a trust boundary even when no attack keywords occur. */
export function isToolResponse(payload: Record<string, unknown>, eventType?: string): boolean {
  if (eventType === "tool_end" || eventType === "tool_result") return true;
  return Object.hasOwn(payload, "tool_response") ||
    (Object.hasOwn(payload, "output") && (Object.hasOwn(payload, "tool") || payload.source === "tool"));
}

export function shouldQueueForLlmJudge(payload: Record<string, unknown>, searchText?: string, eventType?: string) {
  if (isToolResponse(payload, eventType)) return true;
  const text = searchText ?? payloadToSearchText(payload);

  return TRIGGER_TERMS.some((term) => text.includes(term));
}
