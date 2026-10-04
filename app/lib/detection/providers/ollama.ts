import { buildJudgePrompt, getSystemMessage, parseJudgeResult, type JudgeResponse } from "../llm-judge";

export async function judgeWithOllama(
  payload: Record<string, unknown>,
  options: {
    baseUrl: string;
    apiKey?: string;
    model: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  }
): Promise<JudgeResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (options.apiKey) {
    headers["Authorization"] = `Bearer ${options.apiKey}`;
  }

  const endpoint = options.baseUrl.endsWith("/")
    ? `${options.baseUrl}v1/chat/completions`
    : `${options.baseUrl}/v1/chat/completions`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      redirect: "error",
      headers,
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: "system", content: getSystemMessage() },
          { role: "user", content: buildJudgePrompt(payload) }
        ],
        temperature: 0,
        max_tokens: 256
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama judge request failed with status ${response.status}.`);
    }

    const rawModelOutput = (await response.json()) as Record<string, unknown>;

    const text = (rawModelOutput as any).choices?.[0]?.message?.content?.trim();
    const finishReason = (rawModelOutput as any).choices?.[0]?.finish_reason;

    if (!text) {
      throw new Error(
        `Ollama judge returned no text${finishReason ? `; finishReason=${finishReason}` : ""}.`
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
