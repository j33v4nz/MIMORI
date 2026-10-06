import { buildJudgePrompt, getSystemMessage, parseJudgeResult, type JudgeResponse } from "../llm-judge";

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["benign", "suspicious", "malicious"] },
    category: { type: "string", enum: ["instruction_override", "jailbreak_persona", "system_prompt_extraction", "encoding_evasion", "excessive_agency", "data_exfiltration", "threat", "exfiltration", "other"] },
    severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
  },
  required: ["verdict", "category", "severity"],
  additionalProperties: false
};

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

  // Native Ollama exposes an explicit context budget and strict JSON schema.
  // Refuse oversized prompts rather than silently discarding an injected tail.
  const prompt = buildJudgePrompt(payload);
  if (Buffer.byteLength(prompt, "utf8") > 6000) {
    throw new Error("Ollama judge input exceeds 6,000 UTF-8 bytes.");
  }
  const endpoint = `${options.baseUrl.replace(/\/$/, "")}/api/chat`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      redirect: "error",
      headers,
      body: JSON.stringify({
        model: options.model,
        stream: false,
        format: JUDGE_SCHEMA,
        keep_alive: "10m",
        messages: [
          { role: "system", content: getSystemMessage() + '\nLOCAL OUTPUT OVERRIDE: Return only {"verdict":"benign|suspicious|malicious","category":"category from the rubric","severity":"low|medium|high|critical"}. No reason or confidence fields.' },
          { role: "user", content: prompt }
        ],
        options: { temperature: 0, num_ctx: 8192, num_predict: 64 }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama judge request failed with status ${response.status}.`);
    }

    const rawModelOutput = (await response.json()) as Record<string, unknown>;

    const text = (rawModelOutput as any).message?.content?.trim();
    const finishReason = rawModelOutput.done_reason;

    if (finishReason === "length") {
      throw new Error("Ollama judge output was truncated; finishReason=length.");
    }
    if (rawModelOutput.done !== true) {
      throw new Error("Ollama judge review did not complete.");
    }

    if (!text) {
      throw new Error(
        `Ollama judge returned no text${finishReason ? `; finishReason=${finishReason}` : ""}.`
      );
    }

    const classification = JSON.parse(text);
    if (!classification || typeof classification !== "object" || Array.isArray(classification)
        || Object.keys(classification).sort().join(",") !== "category,severity,verdict") {
      throw new Error("Invalid Ollama judge classification.");
    }
    return {
      result: parseJudgeResult(JSON.stringify({ ...classification,
        // This is an uncalibrated local decision, not model-generated evidence.
        confidence: 0.5, reason: "Local model classification; confidence is uncalibrated." })),
      rawModelOutput
    };
  } finally {
    clearTimeout(timeout);
  }
}
