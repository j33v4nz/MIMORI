export const EVENT_TYPES = [
  "llm_start",
  "llm_end",
  "tool_start",
  "tool_end",
  "chain_start",
  "chain_end",
  "agent_action",
  "manual"
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type Severity = "low" | "medium" | "high" | "critical";

export type DetectionCategory =
  | "instruction_override"
  | "jailbreak_persona"
  | "system_prompt_extraction"
  | "encoding_evasion"
  | "excessive_agency"
  | "data_exfiltration"
  | "threat"
  | "exfiltration"
  | "other";

export type DetectionVerdict = "benign" | "suspicious" | "malicious";

export type DetectionLayer = "rule" | "laya" | "llm_judge";

export interface ImmediateDetection {
  event_sequence_number: number;
  category: DetectionCategory;
  severity: Severity;
  verdict: DetectionVerdict;
}

export interface IngestResponse {
  accepted: number;
  session_id: string;
  session_record_id?: string;
  immediate_detections: ImmediateDetection[];
  skipped?: Array<{ index: number; reason: string }>;
}
