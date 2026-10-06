import { buildJudgePrompt, getSystemMessage, parseJudgeResult, type JudgeResponse } from "../llm-judge";

export async function judgeWithAnthropic(
  payload: Record<string, unknown>,
  options: { apiKey: string; model: string; baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<JudgeResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const prompt = buildJudgePrompt(payload);

  const baseUrl = options.baseUrl || "https://api.anthropic.com/v1";
  const endpoint = baseUrl.endsWith("/") ? `${baseUrl}messages` : `${baseUrl}/messages`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": options.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: 1024,
        system: getSystemMessage(),
        messages: [{ role: "user", content: prompt }]
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.statusText}`);
    }

    const data = await res.json();
    const rawText = data?.content?.[0]?.text;

    if (!rawText) {
      throw new Error("Empty response from Anthropic API");
    }

    return { result: parseJudgeResult(rawText), rawModelOutput: data };
  } finally {
    clearTimeout(timeout);
  }
}
