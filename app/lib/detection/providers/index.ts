import { judgeWithGemini } from "./gemini";
import { judgeWithDeepSeek } from "./deepseek";
import { judgeWithOpenAI } from "./openai";
import { judgeWithAnthropic } from "./anthropic";
import { judgeWithOllama } from "./ollama";
import type { JudgeResponse } from "../llm-judge";

export interface ProviderOptions {
  apiKey?: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type ProviderJudgeFunction = (
  payload: Record<string, unknown>,
  options: ProviderOptions
) => Promise<JudgeResponse>;

export const providers: Record<string, ProviderJudgeFunction> = {
  gemini: judgeWithGemini as ProviderJudgeFunction,
  deepseek: judgeWithDeepSeek as ProviderJudgeFunction,
  openai: judgeWithOpenAI as ProviderJudgeFunction,
  anthropic: judgeWithAnthropic as ProviderJudgeFunction,
  ollama: judgeWithOllama as ProviderJudgeFunction,
};
