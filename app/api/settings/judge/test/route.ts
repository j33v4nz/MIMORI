import { NextResponse } from "next/server";
import { requireDashboardUser } from "../../../../lib/api/auth";
import { apiError } from "../../../../lib/api/errors";
import { getLlmJudgeEnv } from "../../../../lib/env";
import { judgeTestSchema } from "../../../../lib/schemas";
import { logger } from "../../../../lib/logger";
import { resolveJudgeApiKey } from "../../../../lib/detection/credentials";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireDashboardUser();
  if (!user) {
    return apiError(401, "unauthorized", "Authentication required.");
  }

  try {
    const json = await request.json();
    const body = judgeTestSchema.parse(json);
    const env = getLlmJudgeEnv();
    const apiKey = resolveJudgeApiKey(body.provider, body.base_url, body.api_key, env);

    if (body.provider !== "ollama" && !apiKey) {
      return NextResponse.json({
        success: false,
        error: `Missing API key for ${body.provider}. Set the environment variable or provide a temporary key for the test.`
      });
    }


    const startTime = Date.now();
    let isSuccess = false;
    let errorMsg = "";

    try {
      if (body.provider === "ollama") {
        const baseUrl = body.base_url || env.ollamaBaseUrl || "http://localhost:11434";
        const endpoint = baseUrl.endsWith("/")
          ? `${baseUrl}v1/chat/completions`
          : `${baseUrl}/v1/chat/completions`;

        const headers: Record<string, string> = {
          "Content-Type": "application/json"
        };
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const res = await fetch(endpoint, {
          method: "POST",
          redirect: "error",
          headers,
          body: JSON.stringify({
            model: body.model,
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 10
          }),
          signal: AbortSignal.timeout(120_000)
        });

        if (!res.ok) {
          throw new Error(`Ollama responded with status ${res.status}`);
        }
        isSuccess = true;
      } else if (body.provider === "deepseek") {
        const headers: Record<string, string> = {
          "Content-Type": "application/json"
        };

        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }

        const baseUrl = body.base_url || "https://api.deepseek.com";
        const endpoint = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
        const res = await fetch(endpoint, {
          method: "POST",
          redirect: "error",
          headers,
          body: JSON.stringify({
            model: body.model,
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 10
          }),
          signal: AbortSignal.timeout(10_000)
        });

        if (!res.ok) {
          throw new Error(`DeepSeek responded with status ${res.status}`);
        }
        isSuccess = true;
      } else if (body.provider === "gemini") {
        const keyParam = apiKey ? `?key=${encodeURIComponent(apiKey)}` : "";

        const baseUrl = body.base_url || "https://generativelanguage.googleapis.com/v1beta";
        const endpoint = baseUrl.endsWith("/")
          ? `${baseUrl}models/${encodeURIComponent(body.model)}:generateContent${keyParam}`
          : `${baseUrl}/models/${encodeURIComponent(body.model)}:generateContent${keyParam}`;

        const res = await fetch(endpoint, {
          method: "POST",
          redirect: "error",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Hi" }] }],
            generationConfig: { maxOutputTokens: 10 }
          }),
          signal: AbortSignal.timeout(10_000)
        });

        if (!res.ok) {
          throw new Error(`Gemini responded with status ${res.status}`);
        }
        isSuccess = true;
      } else if (body.provider === "openai") {
        const headers: Record<string, string> = {
          "Content-Type": "application/json"
        };
        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }
        const baseUrl = body.base_url || "https://api.openai.com/v1";
        const endpoint = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
        const res = await fetch(endpoint, {
          method: "POST",
          redirect: "error",
          headers,
          body: JSON.stringify({
            model: body.model,
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 10
          }),
          signal: AbortSignal.timeout(10_000)
        });

        if (!res.ok) {
          throw new Error(`OpenAI responded with status ${res.status}`);
        }
        isSuccess = true;
      } else if (body.provider === "anthropic") {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01"
        };
        if (apiKey) {
          headers["x-api-key"] = apiKey;
        }
        const baseUrl = body.base_url || "https://api.anthropic.com/v1";
        const endpoint = baseUrl.endsWith("/") ? `${baseUrl}messages` : `${baseUrl}/messages`;
        const res = await fetch(endpoint, {
          method: "POST",
          redirect: "error",
          headers,
          body: JSON.stringify({
            model: body.model,
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 10
          }),
          signal: AbortSignal.timeout(10_000)
        });

        if (!res.ok) {
          throw new Error(`Anthropic responded with status ${res.status}`);
        }
        isSuccess = true;
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : "Unknown error";
    }

    const responseTimeMs = Date.now() - startTime;

    if (isSuccess) {
      return NextResponse.json({ success: true, response_time_ms: responseTimeMs });
    } else {
      return NextResponse.json({ success: false, error: errorMsg });
    }
  } catch (err) {
    logger.error({ err }, "Failed to test judge connection");
    return apiError(400, "invalid_request", "Invalid request payload.");
  }
}
