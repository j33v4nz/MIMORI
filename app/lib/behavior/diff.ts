import { createHash } from "node:crypto";

export interface BehaviorEvent {
  event_type: string;
  payload: Record<string, unknown>;
  detections?: Array<{
    category: string;
    severity: string;
    verdict?: string;
  }>;
}

export interface BehaviorSignature {
  label: string;
  count: number;
}

export interface BehaviorProfile {
  eventCount: number;
  eventTypes: Record<string, number>;
  signatures: BehaviorSignature[];
  detections: Record<string, number>;
  detectionCount: number;
  maxSeverity: string | null;
}

export interface BehaviorChange {
  label: string;
  count: number;
}

export interface BehaviorDiff {
  baseline: BehaviorProfile;
  candidate: BehaviorProfile;
  added: BehaviorChange[];
  removed: BehaviorChange[];
  detectionChanges: BehaviorChange[];
  removedDetections: BehaviorChange[];
  inputChanges: Array<{
    behavior: string;
    baselineFingerprints: string[];
    candidateFingerprints: string[];
  }>;
  comparisonWarnings: string[];
  orderChanged: boolean;
  status: "clear" | "review" | "high_risk";
  summary: string;
}

const SEVERITY_ORDER = ["low", "medium", "high", "critical"];

export function profileBehavior(events: BehaviorEvent[]): BehaviorProfile {
  const eventTypes: Record<string, number> = {};
  const signatureCounts = new Map<string, number>();
  const detections: Record<string, number> = {};
  let maxSeverity: string | null = null;

  for (const event of events) {
    eventTypes[event.event_type] = (eventTypes[event.event_type] ?? 0) + 1;

    const signature = getBehaviorSignature(event);
    signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);

    for (const detection of event.detections ?? []) {
      const key = `${detection.severity}:${detection.category}`;
      detections[key] = (detections[key] ?? 0) + 1;

      if (
        maxSeverity === null ||
        severityRank(detection.severity) > severityRank(maxSeverity)
      ) {
        maxSeverity = detection.severity;
      }
    }
  }

  return {
    eventCount: events.length,
    eventTypes,
    signatures: [...signatureCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    detections,
    detectionCount: Object.values(detections).reduce((sum, count) => sum + count, 0),
    maxSeverity
  };
}

export function diffBehavior(
  baselineEvents: BehaviorEvent[],
  candidateEvents: BehaviorEvent[]
): BehaviorDiff {
  const baseline = profileBehavior(baselineEvents);
  const candidate = profileBehavior(candidateEvents);
  const added = subtractCounts(candidate.signatures, baseline.signatures);
  const removed = subtractCounts(baseline.signatures, candidate.signatures);
  const detectionChanges = subtractCounts(
    toChanges(candidate.detections),
    toChanges(baseline.detections)
  );
  const removedDetections = subtractCounts(toChanges(baseline.detections), toChanges(candidate.detections));
  const inputChanges = compareInputs(baselineEvents, candidateEvents);
  const comparisonWarnings: string[] = [];
  const insufficientEvidence = !baselineEvents.length || !candidateEvents.length;
  if (insufficientEvidence) {
    comparisonWarnings.push("One or both recordings contain no events; there is insufficient evidence for a clear comparison.");
  }
  if ([...baselineEvents, ...candidateEvents].some((event) => /\[REDACTED(?:_[A-Z_]+)?\]/.test(stableJson(behaviorInputs(event.payload))))) {
    comparisonWarnings.push("Redacted values cannot be compared; identical markers can hide different arguments or destinations.");
  }

  const highRisk =
    detectionChanges.some((change) => change.label.startsWith("critical:") || change.label.startsWith("high:")) ||
    (candidate.maxSeverity !== null &&
      severityRank(candidate.maxSeverity) > severityRank(baseline.maxSeverity ?? "low") &&
      severityRank(candidate.maxSeverity) >= severityRank("high"));
  const baselineOrder = commonActionOrder(baselineEvents, candidate.signatures);
  const candidateOrder = commonActionOrder(candidateEvents, baseline.signatures);
  const orderChanged = baselineOrder.some((signature, index) => signature !== candidateOrder[index]);
  const changed = added.length > 0 || removed.length > 0 || detectionChanges.length > 0 || removedDetections.length > 0 || orderChanged || insufficientEvidence;
  const status = highRisk ? "high_risk" : changed ? "review" : "clear";

  return {
    baseline,
    candidate,
    added,
    removed,
    detectionChanges,
    removedDetections,
    inputChanges,
    comparisonWarnings,
    orderChanged,
    status,
    summary: insufficientEvidence && !highRisk
      ? "Insufficient recorded events to establish an unchanged candidate. Review recording coverage."
      : buildSummary(status, added.length, removed.length, detectionChanges.length + removedDetections.length, orderChanged)
  };
}

export function getBehaviorSignature(event: BehaviorEvent): string {
  const label = getBehaviorIdentity(event);
  const inputs = behaviorInputs(event.payload);
  if (Object.keys(inputs).length === 0) return label;
  // Fingerprints do not expose plaintext. They are not encryption and can
  // reveal equality or be guessed for low-entropy values.
  const fingerprint = createHash("sha256").update(stableJson(inputs)).digest("hex");
  return `${label}:inputs#${fingerprint}`;
}

function getBehaviorIdentity(event: BehaviorEvent): string {
  const payload = event.payload;
  const names = [
    readPath(payload, ["tool", "name"]),
    readPath(payload, ["tool_call", "function", "name"]),
    readPath(payload, ["tool_call", "name"]),
    readPath(payload, ["function", "name"]),
    readPath(payload, ["serialized", "name"]),
    readPath(payload, ["chain", "name"]),
    readPath(payload, ["name"]),
    readPath(payload, ["action", "tool"])
  ];
  let name = names.find((value) => value.length > 0);
  // The LlamaIndex adapter embeds query text in chain.name. Keep that
  // identity comparable without copying the query into displayed labels.
  if (name?.startsWith("query:")) {
    name = `query#${createHash("sha256").update(name.slice(6)).digest("hex")}`;
  }

  return name ? `${event.event_type}:${name}` : event.event_type;
}

function behaviorInputs(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const inputKeys = ["input", "inputs", "arguments", "args", "kwargs", "parameters", "command", "sql", "url", "uri", "destination", "endpoint", "path", "prompt", "prompts", "messages", "tool_input", "interrupts"];
  const sources: Array<[string, unknown]> = [
    ["", payload], ["tool", payload.tool], ["action", payload.action],
    ["function", payload.function], ["tool_call", payload.tool_call]
  ];
  const toolCall = payload.tool_call;
  if (toolCall && typeof toolCall === "object") {
    sources.push(["tool_call.function", (toolCall as Record<string, unknown>).function]);
  }
  for (const [prefix, source] of sources) {
    if (!source || typeof source !== "object") continue;
    const record = source as Record<string, unknown>;
    for (const key of inputKeys) {
      if (!Object.hasOwn(record, key)) continue;
      let value = record[key];
      // LangChain callback metadata changes on every run even for identical
      // tool arguments. Preserve business kwargs, omit callback bookkeeping.
      if (key === "kwargs" && value && typeof value === "object" && !Array.isArray(value)) {
        value = Object.fromEntries(Object.entries(value).filter(([name]) =>
          !["run_id", "parent_run_id", "tags", "metadata", "callbacks", "run_manager", "tool_call_id"].includes(name)));
        if (!Object.keys(value as object).length) continue;
      }
      result[prefix ? `${prefix}.${key}` : key] = value;
    }
  }
  if (typeof payload.action === "string") result.action = payload.action;
  return result;
}

function stableJson(value: unknown): string {
  const ancestors = new Set<object>();
  let nodes = 0;
  function encode(item: unknown, depth: number): string {
    if (depth > 32 || ++nodes > 20_000) throw new Error("Behavior inputs exceed comparison complexity limits.");
    if (item && typeof item === "object") {
      if (ancestors.has(item)) throw new Error("Behavior inputs contain a cycle and cannot be compared.");
      ancestors.add(item);
      const encoded = Array.isArray(item)
        ? `[${item.map(child => encode(child, depth + 1)).join(",")}]`
        : `{${comparisonKeys(item as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${encode((item as Record<string, unknown>)[key], depth + 1)}`).join(",")}}`;
      ancestors.delete(item);
      return encoded;
    }
    return JSON.stringify(item) ?? "null";
  }
  return encode(value, 0);
}

function comparisonKeys(record: Record<string, unknown>): string[] {
  // LangChain message IDs and provider response metadata identify a run,
  // not its behavior. Only omit them on recognized framework envelopes;
  // business IDs inside arguments remain part of the fingerprint.
  const isMessage = typeof record.type === "string" &&
    ["human", "ai", "system", "tool", "function"].includes(record.type) &&
    Object.hasOwn(record, "content");
  const isToolCall = record.type === "tool_call" &&
    typeof record.name === "string" && Object.hasOwn(record, "args");
  const ignored = isMessage
    ? ["id", "tool_call_id", "response_metadata", "usage_metadata"]
    : isToolCall ? ["id"] : [];
  return Object.keys(record).filter(key => !ignored.includes(key));
}

function commonActionOrder(events: BehaviorEvent[], other: BehaviorSignature[]): string[] {
  const remaining = new Map(other.map(signature => [signature.label, signature.count]));
  return orderedSignatures(events).filter(signature => {
    const count = remaining.get(signature) ?? 0;
    if (!count) return false;
    remaining.set(signature, count - 1);
    return true;
  });
}

function orderedSignatures(events: BehaviorEvent[]): string[] {
  // LangGraph executes pushed tool branches concurrently. Preserve order
  // inside each branch and between graph steps, but canonicalize scheduling
  // interleaving between branches of the same tools step.
  type Branch = { group: string; path: string };
  const runs = new Map<string, Branch>();
  const result: string[] = [];
  let group: string | undefined;
  let pending: Array<{ path: string; signature: string }> = [];
  function flush() {
    pending.sort((a, b) => a.path.localeCompare(b.path));
    result.push(...pending.map(item => item.signature));
    pending = [];
    group = undefined;
  }
  for (const event of events) {
    const kwargs = event.payload.kwargs as Record<string, unknown> | undefined;
    const metadata = kwargs?.metadata as Record<string, unknown> | undefined;
    const path = metadata?.langgraph_path;
    const runId = typeof kwargs?.run_id === "string" ? kwargs.run_id : "";
    const parentId = typeof kwargs?.parent_run_id === "string" ? kwargs.parent_run_id : "";
    let branch = runs.get(runId);
    if (runId && parentId && metadata?.langgraph_node === "tools" &&
      Number.isInteger(metadata.langgraph_step) && Array.isArray(path) && path[0] === "__pregel_push") {
      branch = { group: runs.get(parentId)?.group ?? `${parentId}:${metadata.langgraph_step}`, path: JSON.stringify(path.slice(1)) };
      runs.set(runId, branch);
    }
    const signature = getBehaviorSignature(event);
    if (branch) {
      if (group !== branch.group) flush();
      group = branch.group;
      pending.push({ path: branch.path, signature });
    } else {
      flush();
      result.push(signature);
    }
  }
  flush();
  return result;
}

function compareInputs(baseline: BehaviorEvent[], candidate: BehaviorEvent[]): BehaviorDiff["inputChanges"] {
  function group(events: BehaviorEvent[]) {
    const groups = new Map<string, Set<string>>();
    for (const event of events) {
      const identity = getBehaviorIdentity(event);
      const signature = getBehaviorSignature(event);
      const fingerprint = signature === identity ? "no-inspected-input" : signature.slice(identity.length + ":inputs#".length);
      const values = groups.get(identity) ?? new Set<string>();
      values.add(fingerprint);
      groups.set(identity, values);
    }
    return groups;
  }
  const left = group(baseline), right = group(candidate);
  return [...left.keys()].filter(identity => right.has(identity)).sort().flatMap(behavior => {
    const baselineFingerprints = [...left.get(behavior)!].sort();
    const candidateFingerprints = [...right.get(behavior)!].sort();
    return JSON.stringify(baselineFingerprints) === JSON.stringify(candidateFingerprints) ? []
      : [{ behavior, baselineFingerprints, candidateFingerprints }];
  });
}

function readPath(payload: Record<string, unknown>, path: string[]): string {
  let value: unknown = payload;

  for (const key of path) {
    if (!value || typeof value !== "object" || !(key in value)) {
      return "";
    }
    value = (value as Record<string, unknown>)[key];
  }

  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function toChanges(counts: Record<string, number>): BehaviorChange[] {
  return Object.entries(counts).map(([label, count]) => ({ label, count }));
}

function subtractCounts(
  left: BehaviorChange[],
  right: BehaviorChange[]
): BehaviorChange[] {
  const rightCounts = new Map(right.map((item) => [item.label, item.count]));

  return left
    .map((item) => ({
      label: item.label,
      count: item.count - (rightCounts.get(item.label) ?? 0)
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function severityRank(value: string): number {
  return SEVERITY_ORDER.indexOf(value);
}

function buildSummary(
  status: BehaviorDiff["status"],
  addedCount: number,
  removedCount: number,
  detectionChangeCount: number,
  orderChanged: boolean
): string {
  if (status === "high_risk") {
    return "Candidate behavior contains a high-severity or critical detection. Hold release for review.";
  }

  if (status === "review") {
    if (orderChanged) return "Candidate changes the order of observed actions. Review before release.";
    const totalChanges = addedCount + removedCount + detectionChangeCount;
    return `Candidate introduces ${totalChanges} material behavior change${totalChanges === 1 ? "" : "s"}. Review before release.`;
  }

  return "No differences found in recorded event signatures, inspected inputs, action order, or detection counts. Redacted, truncated, and unrecorded behavior is outside this comparison.";
}
