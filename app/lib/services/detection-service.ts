import { createSupabaseServiceClient } from "../db/service";
import { getTelemetryEnv } from "../env";
import { detectWithRules, compileRules, payloadToSearchText, type Rule, type CompiledRule } from "../detection/rules";
import { shouldQueueForLlmJudge } from "../detection/trigger";
import { dispatchThreatAlert } from "../alerts";
import type { ImmediateDetection } from "../types";
import { getLayaConfig, classifyWithLaya, shouldAutoDetect, shouldQueueForJudge } from "../detection/laya";
import { z } from "zod";

const securitySignalsSchema = z.object({
  version: z.literal(1),
  signals: z.array(z.enum(["cloud_metadata_probe", "credential_exposure"])).max(2)
}).strict();

// SDK observations are untrusted telemetry, not evidence an action executed.
// Synthetic examples preserve rule configuration without restoring private data.
const SIGNAL_EXAMPLES = {
  cloud_metadata_probe: "169.254.169.254",
  credential_exposure: "mimori_credential_exposure"
} as const;

export interface PersistedEvent {
  id: string;
  sequence_number: number;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface DetectionInsert {
  event_id: string;
  org_id: string;
  layer: "rule" | "laya";
  rule_id: string | null;
  category: string;
  severity: string;
  confidence: number;
  verdict: string;
}

export interface LlmJudgeJobInsert {
  event_id: string;
  org_id: string;
  status: "pending";
}

const FALLBACK_DEFAULT_RULES: Rule[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Database Destruction & SQL Injection",
    pattern: "(?i)\\b(UNION\\s+SELECT|DROP\\s+TABLE|TRUNCATE\\s+TABLE|ALTER\\s+TABLE|OR\\s+1=1|--;\\s*EXEC|WAITFOR\\s+DELAY|BENCHMARK\\s*\\(|SLEEP\\s*\\()\\b",
    pattern_type: "regex",
    category: "threat",
    severity: "critical",
    enabled: true
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Prompt Injection & Instruction Override",
    pattern: "(?i)(ignore|disregard|forget|bypass)\\s+(all\\s+)?(previous|prior|above|system)\\s+(instructions|prompts|rules|guidelines)",
    pattern_type: "regex",
    category: "instruction_override",
    severity: "high",
    enabled: true
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    name: "SSRF & Internal Network Probe",
    pattern: "(?i)\\b(169\\.254\\.169\\.254|metadata\\.google\\.internal|localhost:2375|127\\.0\\.0\\.1:2375)\\b",
    pattern_type: "regex",
    category: "threat",
    severity: "critical",
    enabled: true
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    name: "Excessive Agency & Remote Command Execution",
    pattern: "(?i)\\b(rm\\s+-rf\\s+[/~]|mkfs\\.[a-z0-9]+|chmod\\s+-R\\s+777|dd\\s+if=/dev/(zero|urandom)|nc\\s+-e\\s+/bin/sh|/bin/(bash|sh)\\s+-i)\\b",
    pattern_type: "regex",
    category: "excessive_agency",
    severity: "critical",
    enabled: true
  },
  {
    id: "00000000-0000-0000-0000-000000000005",
    name: "Credential & Private Key Exfiltration",
    pattern: "(?i)(-----BEGIN\\s+[A-Z ]*PRIVATE\\s+KEY-----|\\bAKIA[0-9A-Z]{16}\\b|\\bghp_[A-Za-z0-9]{36}\\b|\\bsk-proj-[A-Za-z0-9_\\-]{20,}\\b)",
    pattern_type: "regex",
    category: "data_exfiltration",
    severity: "critical",
    enabled: true
  },
  {
    id: "00000000-0000-0000-0000-000000000006",
    name: "System Prompt Extraction",
    pattern: "(?i)(repeat|print|reveal|output|dump)\\s+(the\\s+)?(full\\s+|exact\\s+|complete\\s+)?(system\\s+prompt|initial\\s+instructions|instructions\\s+verbatim)",
    pattern_type: "regex",
    category: "system_prompt_extraction",
    severity: "high",
    enabled: true
  },
  {
    id: "00000000-0000-0000-0000-000000000007",
    name: "SDK Reported Credential Exposure",
    pattern: "MIMORI_CREDENTIAL_EXPOSURE",
    pattern_type: "keyword",
    category: "data_exfiltration",
    severity: "critical",
    enabled: true
  }
];

interface CacheEntry {
  rules: CompiledRule[];
  lastFetch: number;
}

const cachedRulesByOrg = new Map<string, CacheEntry>();
const inflightPromisesByOrg = new Map<string, Promise<CompiledRule[] | null>>();

export function invalidateRulesCache(orgId?: string): void {
  if (orgId) {
    cachedRulesByOrg.delete(orgId);
    inflightPromisesByOrg.delete(orgId);
  } else {
    cachedRulesByOrg.clear();
    inflightPromisesByOrg.clear();
  }
}

export async function loadEnabledRules(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  orgId?: string
): Promise<CompiledRule[] | null> {
  const cacheKey = orgId || "global";
  const now = Date.now();
  const cached = cachedRulesByOrg.get(cacheKey);
  if (cached && cached.rules.length > 0 && now - cached.lastFetch < 60_000) {
    return cached.rules;
  }

  const inflight = inflightPromisesByOrg.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const promise = fetchRulesFromDb(supabase, orgId, now);
  inflightPromisesByOrg.set(cacheKey, promise);
  const result = await promise;
  inflightPromisesByOrg.delete(cacheKey);
  return result;
}

async function fetchRulesFromDb(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  orgId: string | undefined,
  now: number
): Promise<CompiledRule[] | null> {
  const cacheKey = orgId || "global";
  let query = supabase
    .from("rules")
    .select("id, name, pattern, pattern_type, category, severity, enabled");

  if (orgId && typeof (query as any).or === "function") {
    query = (query as any).or(`org_id.eq.${orgId},org_id.is.null`);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    const compiled = compileRules(FALLBACK_DEFAULT_RULES);
    cachedRulesByOrg.set(cacheKey, { rules: compiled, lastFetch: now });
    return compiled;
  }

  const compiled = compileRules(data as Rule[]);
  cachedRulesByOrg.set(cacheKey, { rules: compiled, lastFetch: now });
  return compiled;
}

export async function processDetections(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  orgId: string,
  persistedEvents: PersistedEvent[]
): Promise<{ immediateDetections: ImmediateDetection[]; error?: string }> {
  const rules = await loadEnabledRules(supabase, orgId);
  if (rules === null) {
    return { immediateDetections: [], error: "rule_load_failed" };
  }

  const immediateDetections: ImmediateDetection[] = [];
  const detectionRows: DetectionInsert[] = [];
  const llmJudgeRows: LlmJudgeJobInsert[] = [];

  for (const event of persistedEvents) {
    const { _mimori_security: reportedSignals, ...payload } = event.payload;
    const text = payloadToSearchText(payload);
    const detections = detectWithRules(payload, rules, text);
    const parsedSignals = securitySignalsSchema.safeParse(reportedSignals);
    if (parsedSignals.success) {
      for (const signal of new Set(parsedSignals.data.signals)) {
        const example = SIGNAL_EXAMPLES[signal];
        for (const detection of detectWithRules({}, rules, example)) {
          if (!detections.some((existing) => existing.ruleId === detection.ruleId)) {
            detections.push(detection);
          }
        }
      }
    }

    for (const detection of detections) {
      detectionRows.push({
        event_id: event.id,
        org_id: orgId,
        layer: "rule",
        rule_id: detection.ruleId,
        category: detection.category,
        severity: detection.severity,
        confidence: detection.confidence,
        verdict: detection.verdict
      });

      immediateDetections.push({
        event_sequence_number: event.sequence_number,
        category: detection.category,
        severity: detection.severity,
        verdict: detection.verdict
      });
    }

    // Layer 1.5: Laya classifier (when enabled, replaces trigger terms + random sampling)
    if (detections.length === 0) {
      const { enabled: layaEnabled, config: layaConfig } = getLayaConfig();

      if (layaEnabled) {
        const classification = await classifyWithLaya(text, layaConfig);

        if (classification) {
          if (shouldAutoDetect(classification, layaConfig)) {
            // High-confidence malicious: save detection directly (skip LLM judge).
            // rule_id stays NULL: laya detections reference no row in rules
            // (required by detections_layer_rule_coherence_check).
            detectionRows.push({
              event_id: event.id,
              org_id: orgId,
              layer: "laya",
              rule_id: null,
              category: classification.category,
              severity: classification.severity,
              confidence: classification.confidence,
              verdict: classification.verdict
            });

            immediateDetections.push({
              event_sequence_number: event.sequence_number,
              category: classification.category,
              severity: classification.severity,
              verdict: classification.verdict
            });
          } else if (shouldQueueForJudge(classification, layaConfig)) {
            // Suspicious / lower-confidence malicious: queue for LLM judge review
            llmJudgeRows.push({
              event_id: event.id,
              org_id: orgId,
              status: "pending"
            });
          } else if (classification.verdict !== "benign" || classification.confidence < layaConfig.confidenceThreshold) {
            // Uncertain model output must not suppress the regular review path.
            const matchesTrigger = shouldQueueForLlmJudge(event.payload, text);
            const { llmJudgeSamplingRate } = getTelemetryEnv();
            if (matchesTrigger || Math.random() < llmJudgeSamplingRate) {
              llmJudgeRows.push({ event_id: event.id, org_id: orgId, status: "pending" });
            }
          }
          // Confident benign output can skip judge review at the configured threshold.
        } else {
          // Laya unavailable — fall back to trigger terms + sampling
          const matchesTrigger = shouldQueueForLlmJudge(event.payload, text);
          const { llmJudgeSamplingRate } = getTelemetryEnv();
          if (matchesTrigger || Math.random() < llmJudgeSamplingRate) {
            llmJudgeRows.push({
              event_id: event.id,
              org_id: orgId,
              status: "pending"
            });
          }
        }
      } else {
        // Laya disabled — use original trigger terms + sampling logic
        const matchesTrigger = shouldQueueForLlmJudge(event.payload, text);
        const { llmJudgeSamplingRate } = getTelemetryEnv();
        if (matchesTrigger || Math.random() < llmJudgeSamplingRate) {
          llmJudgeRows.push({
            event_id: event.id,
            org_id: orgId,
            status: "pending"
          });
        }
      }
    }
  }

  if (detectionRows.length > 0) {
    const { error } = await supabase.from("detections").upsert(detectionRows, {
      onConflict: "event_id,layer,rule_id", ignoreDuplicates: true
    });
    if (error) {
      return { immediateDetections, error: "detection_insert_failed" };
    }

    // Asynchronously dispatch real-time alert for critical/high threats
    for (const d of detectionRows) {
      if (d.severity === "critical" || d.severity === "high") {
        void dispatchThreatAlert({
          severity: d.severity,
          category: d.category,
          layer: d.layer,
          ruleId: d.rule_id ?? undefined,
          verdict: d.verdict
        });
      }
    }
  }

  if (llmJudgeRows.length > 0) {
    const { error } = await supabase.from("llm_judge_jobs").upsert(llmJudgeRows, {
      onConflict: "event_id",
      ignoreDuplicates: true
    });
    if (error) return { immediateDetections, error: "judge_queue_insert_failed" };
  }

  if (persistedEvents.length > 0) {
    const { error } = await supabase.from("events")
      .update({ detection_processed_at: new Date().toISOString() })
      .eq("org_id", orgId).in("id", persistedEvents.map(event => event.id));
    if (error) return { immediateDetections, error: "detection_completion_failed" };
  }

  return { immediateDetections };
}
