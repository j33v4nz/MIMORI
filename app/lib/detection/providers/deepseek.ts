import { buildJudgePrompt, getSystemMessage, parseJudgeResult, type JudgeResponse } from "../llm-judge";

export async function judgeWithDeepSeek(
  payload: Record<string, unknown>,
  options: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  }
): Promise<JudgeResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl || "https://api.deepseek.com";
  const endpoint = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  try {
    const response = await fetchImpl(endpoint, {
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
          { role: "user", content: buildJudgePrompt(payload) }
        ],
        temperature: 0,
        max_tokens: 256,
        response_format: {
          type: "json_object"
        },
        thinking: {
          type: "disabled"
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`DeepSeek judge request failed with status ${response.status}.`);
    }

    const rawModelOutput = (await response.json()) as Record<string, unknown>;

    const text = (rawModelOutput as any).choices?.[0]?.message?.content?.trim();
    const finishReason = (rawModelOutput as any).choices?.[0]?.finish_reason;

    if (!text) {
      throw new Error(
        `DeepSeek judge returned no text${finishReason ? `; finishReason=${finishReason}` : ""}.`
      );
    }

    return {
      result: parseJudgeResult(text),
      rawModelOutput
    };
  } finally {
    clearTimeout(timeout);
  }
}
