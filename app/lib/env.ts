const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const DEFAULT_LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const PLACEHOLDER = "REPLACE_ME";

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";

  if (!value || value.trim().length === 0) {
    if (fallback !== undefined) {
      if (fallback === PLACEHOLDER && process.env.NODE_ENV === "production" && !isBuildPhase) {
        throw new Error(
          `Environment variable ${name} is set to the placeholder value "${PLACEHOLDER}". ` +
          `Configure a real value in production.`
        );
      }
      return fallback;
    }
    if (isBuildPhase) {
      return "dummy-build-value";
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (value === PLACEHOLDER && process.env.NODE_ENV === "production" && !isBuildPhase) {
    throw new Error(
      `Environment variable ${name} is set to the placeholder value "${PLACEHOLDER}". ` +
      `Configure a real value in production.`
    );
  }

  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

export function getSupabaseServiceEnv() {
  const fallback = process.env.NODE_ENV === "production" ? PLACEHOLDER : DEFAULT_LOCAL_SERVICE_KEY;
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL", DEFAULT_SUPABASE_URL),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY", fallback)
  };
}

export function getSupabasePublicEnv() {
  const fallback = process.env.NODE_ENV === "production" ? PLACEHOLDER : DEFAULT_LOCAL_ANON_KEY;
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL", DEFAULT_SUPABASE_URL),
    anonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", fallback)
  };
}

export function getLlmJudgeEnv() {
  return {
    provider: optionalEnv("LLM_JUDGE_PROVIDER") ?? "deepseek",
    model: optionalEnv("LLM_JUDGE_MODEL") ?? "deepseek-v4-flash",
    geminiApiKey: optionalEnv("GEMINI_API_KEY"),
    deepseekApiKey: optionalEnv("DEEPSEEK_API_KEY"),
    openaiApiKey: optionalEnv("OPENAI_API_KEY"),
    anthropicApiKey: optionalEnv("ANTHROPIC_API_KEY"),
    ollamaBaseUrl: optionalEnv("OLLAMA_BASE_URL") ?? "http://localhost:11434",
    ollamaApiKey: optionalEnv("OLLAMA_API_KEY"),
    cronSecret: optionalEnv("CRON_SECRET")
  };
}

export function getTelemetryEnv() {
  const rateStr = optionalEnv("LLM_JUDGE_SAMPLING_RATE");
  const parsedRate = rateStr ? parseFloat(rateStr) : 0.1;
  return {
    llmJudgeSamplingRate: isNaN(parsedRate) ? 0.1 : Math.max(0, Math.min(1, parsedRate))
  };
}
