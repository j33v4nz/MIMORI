import { logger } from "../logger";
import type { DetectionCategory, DetectionVerdict, Severity } from "../types";

export interface LayaClassification {
  verdict: DetectionVerdict;
  category: DetectionCategory;
  severity: Severity;
  confidence: number;
}

export interface LayaConfig {
  /** Base URL for the Laya service (default: http://localhost:5050) */
  baseUrl: string;
  /** Optional API key for authenticated Laya instances */
  apiKey?: string;
  /** Timeout in ms for Laya requests (default: 5000) */
  timeoutMs: number;
  /** Minimum confidence threshold to treat as a detection (default: 0.7) */
  confidenceThreshold: number;
  /** Minimum confidence to auto-detect without LLM judge review (default: 0.9) */
  autoDetectThreshold: number;
}

const DEFAULT_CONFIG: LayaConfig = {
  baseUrl: "http://localhost:5050",
  timeoutMs: 5000,
  confidenceThreshold: 0.7,
  autoDetectThreshold: 0.9,
};

export const getLayaConfig = (): { enabled: boolean; config: LayaConfig } => {
  const enabled = process.env.LAYA_ENABLED === "true";
  
  const config: LayaConfig = {
    baseUrl: process.env.LAYA_BASE_URL || DEFAULT_CONFIG.baseUrl,
    apiKey: process.env.LAYA_API_KEY,
    timeoutMs: process.env.LAYA_TIMEOUT_MS 
      ? parseInt(process.env.LAYA_TIMEOUT_MS, 10) 
      : DEFAULT_CONFIG.timeoutMs,
    confidenceThreshold: process.env.LAYA_CONFIDENCE_THRESHOLD
      ? parseFloat(process.env.LAYA_CONFIDENCE_THRESHOLD)
      : DEFAULT_CONFIG.confidenceThreshold,
    autoDetectThreshold: process.env.LAYA_AUTO_DETECT_THRESHOLD
      ? parseFloat(process.env.LAYA_AUTO_DETECT_THRESHOLD)
      : DEFAULT_CONFIG.autoDetectThreshold,
  };

  return { enabled, config };
};

const mapSeverity = (verdict: string, confidence: number): Severity => {
  if (verdict === "malicious") {
    return confidence >= 0.9 ? "critical" : "high";
  }
  if (verdict === "suspicious") {
    return confidence >= 0.8 ? "medium" : "low";
  }
  return "low";
};

export const classifyWithLaya = async (
  text: string,
  config: Partial<LayaConfig> = {},
  fetchImpl: typeof fetch = fetch
): Promise<LayaClassification | null> => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), finalConfig.timeoutMs);
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (finalConfig.apiKey) {
      headers["Authorization"] = `Bearer ${finalConfig.apiKey}`;
    }
    
    const categories: DetectionCategory[] = [
      "instruction_override",
      "jailbreak_persona",
      "system_prompt_extraction",
      "encoding_evasion",
      "excessive_agency",
      "data_exfiltration",
      "threat",
      "other",
    ];

    const body = {
      input: text,
      options: ["benign", "suspicious", "malicious"],
      context: {
        domain: "ai_agent_security",
        categories,
      }
    };
    
    logger.debug({ baseUrl: finalConfig.baseUrl }, "Calling Laya service");
    
    const response = await fetchImpl(`${finalConfig.baseUrl}/v1/classify`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.choice || !data.scores || typeof data.scores[data.choice] !== "number") {
      throw new Error("Malformed Laya response");
    }
    
    const verdict = data.choice as DetectionVerdict;
    const confidence = data.scores[data.choice];
    const category = data.metadata?.category
      ? (data.metadata.category as DetectionCategory)
      : ("other" as DetectionCategory);
      
    const severity = mapSeverity(verdict, confidence);
    
    return {
      verdict,
      category,
      severity,
      confidence,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn(`Laya classification failed: ${message}`);
    return null; // fail-open
  }
};

export const shouldAutoDetect = (
  classification: LayaClassification,
  config: LayaConfig
): boolean => {
  return (
    classification.verdict === "malicious" &&
    classification.confidence >= config.autoDetectThreshold
  );
};

export const shouldQueueForJudge = (
  classification: LayaClassification,
  config: LayaConfig
): boolean => {
  return (
    classification.verdict !== "benign" &&
    classification.confidence >= config.confidenceThreshold
  );
};
