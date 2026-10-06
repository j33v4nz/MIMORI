import { buildJudgePrompt, getSystemMessage, parseJudgeResult, type JudgeResponse } from "../llm-judge";

export async function judgeWithOpenAI(
  payload: Record<string, unknown>,
  options: { apiKey: string; model: string; baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<JudgeResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const prompt = buildJudgePrompt(payload);

  const baseUrl = options.baseUrl || "https://api.openai.com/v1";
  const endpoint = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: "system", content: getSystemMessage() },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.statusText}`);
    }

    const data = await res.json();
    const rawText = data?.choices?.[0]?.message?.content;

    if (!rawText) {
      throw new Error("Empty response from OpenAI API");
    }

    return { result: parseJudgeResult(rawText), rawModelOutput: data };
  } finally {
    clearTimeout(timeout);
  }
}
