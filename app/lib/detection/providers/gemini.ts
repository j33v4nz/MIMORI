// NOTE: Google's Gemini API requires the API key as a URL query parameter
// (?key=...). The key travels in the URL rather than a header and may appear
// in server logs. Ensure logging middleware suppresses URLs matching /key=/.
// This is an upstream API design constraint; a proxy layer would be needed
// to rewrite the key into a header.
import { buildJudgePrompt, getSystemMessage, parseJudgeResult, type JudgeResponse } from "../llm-judge";

export async function judgeWithGemini(
  payload: Record<string, unknown>,
  options: { apiKey: string; model: string; baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<JudgeResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const prompt = buildJudgePrompt(payload);
  const systemMsg = getSystemMessage();

  const baseUrl = options.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  const endpoint = baseUrl.endsWith("/")
    ? `${baseUrl}models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`
    : `${baseUrl}/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemMsg }]
        },
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`Gemini judge request failed with status ${res.status}.`);
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error("Empty response from Gemini API");
    }

    return { result: parseJudgeResult(rawText), rawModelOutput: data };
  } finally {
    clearTimeout(timeout);
  }
}
