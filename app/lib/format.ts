export function formatInternal(str: string): string {
  if (!str) return str;
  return str.replace(/_/g, ' ');
}

export function formatCategoryName(category: string): string {
  if (!category) return "General Threat";
  const map: Record<string, string> = {
    prompt_injection: "Prompt Injection",
    instruction_override: "Prompt Injection / Override",
    jailbreak_persona: "Jailbreak Persona Bypass",
    system_prompt_extraction: "Prompt & Secret Extraction",
    data_exfiltration: "Credential & Data Exfiltration",
    excessive_agency: "Unauthorized Tool Action",
    encoding_evasion: "Encoding / Obfuscation Evasion",
    threat_intel: "Threat Intelligence",
    threat: "Exploit & Security Threat",
    other: "Behavioral Anomaly"
  };
  return map[category.toLowerCase()] || formatInternal(category);
}

export function formatLayerName(layer: string): string {
  if (!layer) return "Detection Layer";
  const map: Record<string, string> = {
    rule: "Signature Engine",
    laya: "Laya Classifier",
    llm_judge: "Autonomous LLM Judge"
  };
  return map[layer.toLowerCase()] || formatInternal(layer);
}

export function formatEventTypeName(eventType: string): string {
  if (!eventType) return "Event";
  const map: Record<string, string> = {
    llm_start: "Model Prompt",
    llm_end: "Model Response",
    tool_start: "Tool Invocation",
    tool_end: "Tool Result",
    agent_action: "Agent Decision",
    chain_start: "Workflow Start",
    chain_end: "Workflow Completed",
    manual: "Telemetry Log"
  };
  return map[eventType.toLowerCase()] || formatInternal(eventType);
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (isNaN(date.getTime())) return "—";
  return date.toISOString().replace("T", " ").substring(0, 19) + " UTC";
}

export function formatDateShort(value: string): string {
  const date = new Date(value);
  if (isNaN(date.getTime())) return "—";
  return date.toISOString().replace("T", " ").substring(0, 16) + " UTC";
}

export function formatDateOnly(value: string): string {
  return value.split('T')[0];
}

export function formatTimeHHMMSS(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
