import type { getLlmJudgeEnv } from "../env";

const PROVIDER_HOSTS: Record<string, string> = {
  openai: "api.openai.com",
  anthropic: "api.anthropic.com",
  gemini: "generativelanguage.googleapis.com",
  deepseek: "api.deepseek.com"
};

/** Deployment secrets may only be sent to the deployment's trusted endpoints. */
export function resolveJudgeApiKey(
  provider: string,
  baseUrl: string | undefined,
  suppliedKey: string | undefined,
  env: ReturnType<typeof getLlmJudgeEnv>
): string | undefined {
  const explicitKey = suppliedKey?.trim();

  const keys: Record<string, string | undefined> = {
    openai: env.openaiApiKey,
    anthropic: env.anthropicApiKey,
    gemini: env.geminiApiKey,
    deepseek: env.deepseekApiKey,
    ollama: env.ollamaApiKey
  };
  const key = keys[provider];
  if (!baseUrl) return explicitKey || key;

  const url = new URL(baseUrl);
  const trusted = provider === "ollama"
    ? url.origin === new URL(env.ollamaBaseUrl ?? "http://localhost:11434").origin
    : url.protocol === "https:" && url.hostname === PROVIDER_HOSTS[provider] && !url.port;

  const customOrigins = (process.env.MIMORI_JUDGE_ALLOWED_ORIGINS ?? "")
    .split(",").map((entry) => entry.trim()).filter(Boolean);
  const allowedCustom = provider !== "ollama" && url.protocol === "https:" && customOrigins.includes(url.origin);
  if ((!trusted && !allowedCustom) || url.username || url.password || url.search || url.hash) {
    throw new Error("Judge endpoint is not approved. Configure MIMORI_JUDGE_ALLOWED_ORIGINS for a custom HTTPS endpoint.");
  }
  if (explicitKey) return explicitKey;
  if (key && !trusted) {
    throw new Error("Deployment API keys cannot be used with this endpoint. Supply your own key for a custom endpoint.");
  }
  return key;
}
