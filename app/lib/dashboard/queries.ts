import { redirect } from "next/navigation";
import { createSupabaseServerClient, requireUser } from "../db/server";
import { isAuthDisabled } from "../auth-flags";
import { diffBehavior, type BehaviorDiff } from "../behavior/diff";

export function handleQueryError(
  error: { message?: string; code?: string; details?: string | null; hint?: string | null; status?: number } | null | unknown,
  fallbackMsg = "Query execution failed"
): never {
  if (!error) {
    throw new Error(fallbackMsg);
  }

  const errObj = error as {
    message?: string;
    code?: string;
    details?: string | null;
    hint?: string | null;
    status?: number;
    digest?: string;
  };

  // Forward Next.js internal redirects
  if (errObj.digest && typeof errObj.digest === "string" && errObj.digest.startsWith("NEXT_REDIRECT")) {
    throw error;
  }

  const rawMsg = errObj.message || errObj.details || "";
  const errString = `${rawMsg} ${errObj.details || ""} ${errObj.hint || ""} ${errObj.code || ""}`.toLowerCase();

  const isAuthOrJwtError =
    errObj.status === 401 ||
    errObj.status === 403 ||
    errObj.code === "PGRST301" ||
    (errObj.message === "" && !errObj.code) ||
    errString.includes("jwt") ||
    errString.includes("token") ||
    errString.includes("claim") ||
    errString.includes("issued at future") ||
    errString.includes("unauthorized") ||
    errString.includes("permission denied") ||
    errString.includes("invalid refresh token");

  if (isAuthOrJwtError) {
    redirect("/login?message=Session+expired.+Please+log+in+again.");
  }

  const msg = rawMsg || (typeof error === "string" ? error : fallbackMsg);
  throw new Error(msg);
}

export interface DashboardAgent {
  id: string;
  name: string;
  framework: string;
  last_seen_at: string;
  event_count: number;
  session_count: number;
}

export interface RpcAgentRow {
  id: string;
  name: string;
  framework: string;
  last_seen_at: string;
  session_count: number | string;
  event_count: number | string;
}

export interface DashboardSession {
  id: string;
  external_session_id: string | null;
  started_at: string;
  ended_at: string | null;
  event_count: number;
  detection_count: number;
}

export interface BehaviorDiffSession {
  id: string;
  external_session_id: string | null;
  started_at: string;
  agent: {
    id: string;
    name: string;
  };
  event_count: number;
}

export interface DashboardDetection {
  id: string;
  layer: "rule" | "laya" | "llm_judge";
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  verdict: "benign" | "suspicious" | "malicious";
  confidence: number | null;
  created_at: string;
  resolved_at: string | null;
  event: {
    id: string;
    event_type: string;
    sequence_number: number;
    payload: Record<string, unknown>;
    session: {
      id: string;
      external_session_id: string | null;
      agent: {
        id: string;
        name: string;
      };
    };
  };
}

export interface TimelineEvent {
  id: string;
  event_type: string;
  sequence_number: number;
  payload: Record<string, unknown>;
  created_at: string;
  detections: Array<{
    id: string;
    layer: "rule" | "laya" | "llm_judge";
    category: string;
    severity: "low" | "medium" | "high" | "critical";
    verdict: "benign" | "suspicious" | "malicious";
    confidence: number | null;
    resolved_at: string | null;
  }>;
}

export interface DashboardRule {
  id: string;
  name: string;
  description: string | null;
  pattern: string;
  pattern_type: "regex" | "keyword";
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  enabled: boolean;
  created_at: string;
}

export interface DashboardEvent {
  id: string;
  event_type: string;
  sequence_number: number;
  payload: Record<string, unknown>;
  created_at: string;
  session: {
    id: string;
    external_session_id: string | null;
    agent: {
      id: string;
      name: string;
    };
  };
  detections: Array<{
    id: string;
    severity: "low" | "medium" | "high" | "critical";
  }>;
}

interface NestedSessionRow {
  id: string;
  external_session_id: string | null;
  started_at: string;
  ended_at: string | null;
  events?: Array<{ count: number }>;
  event_detections?: Array<{
    detections?: Array<{ count: number }>;
  }>;
}

interface TimelineEventRow {
  id: string;
  event_type: string;
  sequence_number: number;
  payload: Record<string, unknown>;
  created_at: string;
  detections?: Array<{
    id: string;
    layer: "rule" | "laya" | "llm_judge";
    category: string;
    severity: "low" | "medium" | "high" | "critical";
    verdict: "benign" | "suspicious" | "malicious";
    confidence: number | null;
    resolved_at: string | null;
  }>;
}

interface DetectionRow {
  id: string;
  layer: "rule" | "laya" | "llm_judge";
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  verdict: "benign" | "suspicious" | "malicious";
  confidence: number | null;
  created_at: string;
  resolved_at: string | null;
  events?: {
    id: string;
    event_type: string;
    sequence_number: number;
    payload: Record<string, unknown>;
    sessions?: {
      id: string;
      external_session_id: string | null;
      agents?: {
        id: string;
        name: string;
      };
    };
  };
}

interface EventRow {
  id: string;
  event_type: string;
  sequence_number: number;
  payload: Record<string, unknown>;
  created_at: string;
  sessions?: {
    id: string;
    external_session_id: string | null;
    agents?: {
      id: string;
      name: string;
    };
  };
  detections?: Array<{
    id: string;
    severity: "low" | "medium" | "high" | "critical";
  }>;
}

export async function getAgents(): Promise<DashboardAgent[]> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_agents_with_stats");

  if (error) {
    handleQueryError(error);
  }

  return (data ?? []).map((agent: RpcAgentRow) => ({
    id: agent.id,
    name: agent.name,
    framework: agent.framework,
    last_seen_at: agent.last_seen_at,
    session_count: Number(agent.session_count),
    event_count: Number(agent.event_count)
  }));
}

export async function getSessionsForAgent(agentId: string): Promise<DashboardSession[]> {
  // Tenant-integrity migrations add a second FK for these relationships.
  // Name the original FK explicitly so PostgREST can resolve each embed.
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("id, external_session_id, started_at, ended_at, events!events_session_id_fkey(count), event_detections:events!events_session_id_fkey(detections!detections_event_id_fkey(count))")
    .eq("agent_id", agentId)
    .order("started_at", { ascending: false });

  if (error) {
    handleQueryError(error);
  }

  return ((data ?? []) as unknown as NestedSessionRow[]).map((session) => {
    const eventCount = session.events?.[0]?.count ?? 0;
    const detectionCount = (session.event_detections ?? []).reduce(
      (total, ev) => total + (ev.detections?.[0]?.count ?? 0),
      0
    );

    return {
      id: session.id,
      external_session_id: session.external_session_id,
      started_at: session.started_at,
      ended_at: session.ended_at,
      event_count: eventCount,
      detection_count: detectionCount
    };
  });
}

export async function getSessionEvents(sessionId: string): Promise<TimelineEvent[]> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, event_type, sequence_number, payload, created_at, detections!detections_event_id_fkey(id, layer, category, severity, verdict, confidence, resolved_at)"
    )
    .eq("session_id", sessionId)
    .order("sequence_number", { ascending: true });

  if (error) {
    handleQueryError(error);
  }

  return ((data ?? []) as unknown as TimelineEventRow[]).map((event) => ({
    id: event.id,
    event_type: event.event_type,
    sequence_number: event.sequence_number,
    payload: event.payload,
    created_at: event.created_at,
    detections: event.detections ?? []
  }));
}

export async function getBehaviorDiffSessions(sessionIds?: string[]): Promise<BehaviorDiffSession[]> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("sessions")
    .select("id, external_session_id, started_at, agents!sessions_agent_id_fkey(id, name), events!events_session_id_fkey(count)")
    .order("started_at", { ascending: false })
    .limit(100);

  if (sessionIds?.length) query = query.in("id", [...new Set(sessionIds)]);
  const { data, error } = await query;

  if (error) {
    handleQueryError(error);
  }

  return ((data ?? []) as unknown as Array<{
    id: string;
    external_session_id: string | null;
    started_at: string;
    agents: { id: string; name: string };
    events?: Array<{ count: number }>;
  }>).map((session) => ({
    id: session.id,
    external_session_id: session.external_session_id,
    started_at: session.started_at,
    agent: session.agents,
    event_count: session.events?.[0]?.count ?? 0
  }));
}

export async function getBehaviorDiff(
  baselineSessionId: string,
  candidateSessionId: string
): Promise<BehaviorDiff> {
  const [baselineEvents, candidateEvents] = await Promise.all([
    getSessionEvents(baselineSessionId),
    getSessionEvents(candidateSessionId)
  ]);

  return diffBehavior(baselineEvents, candidateEvents);
}

export async function getDetections(filters?: {
  severity?: string;
  category?: string;
  layer?: string;
  limit?: number;
  excludePayload?: boolean;
}): Promise<DashboardDetection[]> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const selectFields = filters?.excludePayload
    ? "id, layer, category, severity, verdict, confidence, created_at, resolved_at, events!detections_event_id_fkey(id, event_type, sequence_number, sessions!events_session_id_fkey(id, external_session_id, agents!sessions_agent_id_fkey(id, name)))"
    : "id, layer, category, severity, verdict, confidence, created_at, resolved_at, events!detections_event_id_fkey(id, event_type, sequence_number, payload, sessions!events_session_id_fkey(id, external_session_id, agents!sessions_agent_id_fkey(id, name)))";

  let query = supabase
    .from("detections")
    .select(selectFields)
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 50);

  if (filters?.severity) {
    query = query.eq("severity", filters.severity);
  }

  if (filters?.category) {
    query = query.eq("category", filters.category);
  }

  if (filters?.layer) {
    query = query.eq("layer", filters.layer);
  }

  const { data, error } = await query;

  if (error) {
    handleQueryError(error);
  }

  return ((data ?? []) as unknown as DetectionRow[]).map((detection) => ({
    id: detection.id,
    layer: detection.layer,
    category: detection.category,
    severity: detection.severity,
    verdict: detection.verdict,
    confidence: detection.confidence,
    created_at: detection.created_at,
    resolved_at: detection.resolved_at,
    event: {
      id: detection.events?.id ?? "",
      event_type: detection.events?.event_type ?? "unknown",
      sequence_number: detection.events?.sequence_number ?? 0,
      payload: detection.events?.payload ?? {},
      session: {
        id: detection.events?.sessions?.id ?? "",
        external_session_id: detection.events?.sessions?.external_session_id ?? null,
        agent: {
          id: detection.events?.sessions?.agents?.id ?? "",
          name: detection.events?.sessions?.agents?.name ?? "Unknown Agent"
        }
      }
    }
  }));
}

export async function getRules(): Promise<DashboardRule[]> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("rules")
    .select("id, name, description, pattern, pattern_type, category, severity, enabled, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    handleQueryError(error);
  }

  return (data ?? []) as DashboardRule[];
}

export async function updateRuleEnabled(id: string, enabled: boolean): Promise<void> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("rules").update({ enabled }).eq("id", id);

  if (error) {
    handleQueryError(error);
  }
}

export async function getUserOrgId(): Promise<string> {
  const user = await requireUser();

  if (isAuthDisabled()) {
    return "00000000-0000-0000-0000-000000000001";
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      const msg = error.message || "";
      const lower = msg.toLowerCase();
      if (lower.includes("jwt") || lower.includes("issued at future") || (error as { code?: string }).code === "PGRST301") {
        handleQueryError(error);
      }
    }
    throw new Error("User is not a member of any organization.");
  }

  return data.org_id;
}

export interface DashboardApiKey {
  id: string;
  key_prefix: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export async function getApiKeys(): Promise<DashboardApiKey[]> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, key_prefix, name, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false });

  if (error) {
    handleQueryError(error);
  }

  return (data ?? []) as DashboardApiKey[];
}

export async function getOverviewStats() {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    events24h,
    events7d,
    detectionsLow,
    detectionsMedium,
    detectionsHigh,
    detectionsCritical,
    agents
  ] = await Promise.all([
    supabase.from("events").select("id", { count: "exact", head: true }).gte("created_at", since24h),
    supabase.from("events").select("id", { count: "exact", head: true }).gte("created_at", since7d),
    supabase.from("detections").select("id", { count: "exact", head: true }).eq("severity", "low").gte("created_at", since24h).is("resolved_at", null),
    supabase.from("detections").select("id", { count: "exact", head: true }).eq("severity", "medium").gte("created_at", since24h).is("resolved_at", null),
    supabase.from("detections").select("id", { count: "exact", head: true }).eq("severity", "high").gte("created_at", since24h).is("resolved_at", null),
    supabase.from("detections").select("id", { count: "exact", head: true }).eq("severity", "critical").gte("created_at", since24h).is("resolved_at", null),
    getAgents()
  ]);

  if (events24h.error) {
    handleQueryError(events24h.error, "Failed to fetch 24h events");
  }

  if (events7d.error) {
    handleQueryError(events7d.error, "Failed to fetch 7d events");
  }

  if (detectionsLow.error) {
    handleQueryError(detectionsLow.error, "Failed to fetch low-severity detections");
  }

  if (detectionsMedium.error) {
    handleQueryError(detectionsMedium.error, "Failed to fetch medium-severity detections");
  }

  if (detectionsHigh.error) {
    handleQueryError(detectionsHigh.error, "Failed to fetch high-severity detections");
  }

  if (detectionsCritical.error) {
    handleQueryError(detectionsCritical.error, "Failed to fetch critical-severity detections");
  }

  const detectionsBySeverity = {
    low: detectionsLow.count ?? 0,
    medium: detectionsMedium.count ?? 0,
    high: detectionsHigh.count ?? 0,
    critical: detectionsCritical.count ?? 0
  };

  return {
    total_events_24h: events24h.count ?? 0,
    total_events_7d: events7d.count ?? 0,
    detections_by_severity_24h: detectionsBySeverity,
    observed_agents: agents.length,
    top_agents_by_volume: agents
      .slice()
      .sort((left, right) => right.event_count - left.event_count)
      .slice(0, 5)
      .map((agent) => ({
        agent_id: agent.id,
        agent_name: agent.name,
        event_count: agent.event_count
      }))
  };
}

export async function getEvents(
  limit: number = 50,
  agentId?: string,
  from?: string,
  to?: string
): Promise<DashboardEvent[]> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("events")
    .select(
      "id, event_type, sequence_number, payload, created_at, " +
      "sessions!events_session_id_fkey!inner(id, external_session_id, agent_id, agents!sessions_agent_id_fkey!inner(id, name)), " +
      "detections!detections_event_id_fkey(id, severity)"
    );

  if (agentId) {
    query = query.eq("sessions.agent_id", agentId);
  }

  if (from) {
    query = query.gte("created_at", from);
  }

  if (to) {
    query = query.lte("created_at", to);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    handleQueryError(error);
  }

  return ((data ?? []) as unknown as EventRow[]).map((event) => ({
    id: event.id,
    event_type: event.event_type,
    sequence_number: event.sequence_number,
    payload: event.payload,
    created_at: event.created_at,
    session: {
      id: event.sessions?.id ?? "",
      external_session_id: event.sessions?.external_session_id ?? null,
      agent: {
        id: event.sessions?.agents?.id ?? "",
        name: event.sessions?.agents?.name ?? "Unknown Agent"
      }
    },
    detections: event.detections ?? []
  }));
}

export async function getDetectionById(detectionId: string): Promise<DashboardDetection | null> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("detections")
    .select(
      "id, layer, category, severity, verdict, confidence, created_at, resolved_at, " +
      "events!detections_event_id_fkey(id, event_type, sequence_number, payload, created_at, sessions!events_session_id_fkey(id, external_session_id, agents!sessions_agent_id_fkey(id, name, framework)))"
    )
    .eq("id", detectionId)
    .maybeSingle();

  if (error) {
    handleQueryError(error);
  }

  if (!data) return null;

  const d = data as unknown as DetectionRow;
  return {
    id: d.id,
    layer: d.layer,
    category: d.category,
    severity: d.severity,
    verdict: d.verdict,
    confidence: d.confidence,
    created_at: d.created_at,
    resolved_at: d.resolved_at,
    event: {
      id: d.events?.id ?? "",
      event_type: d.events?.event_type ?? "unknown",
      sequence_number: d.events?.sequence_number ?? 0,
      payload: d.events?.payload ?? {},
      session: {
        id: d.events?.sessions?.id ?? "",
        external_session_id: d.events?.sessions?.external_session_id ?? null,
        agent: {
          id: (d.events?.sessions?.agents as unknown as { id: string; name: string; framework?: string })?.id ?? "",
          name: (d.events?.sessions?.agents as unknown as { id: string; name: string; framework?: string })?.name ?? "Unknown Agent"
        }
      }
    }
  };
}

export interface DetectionStats {
  total: number;
  by_severity: { low: number; medium: number; high: number; critical: number };
  by_category: Array<{ category: string; count: number; latest: string }>;
  by_layer: { rule: number; laya: number; llm_judge: number };
  unresolved_count: number;
}

export async function getDetectionStats(): Promise<DetectionStats> {
  await requireUser();
  const supabase = await createSupabaseServerClient();

  const [total, bySeverityLow, bySeverityMed, bySeverityHigh, bySeverityCrit, byLayerRule, byLayerLaya, byLayerJudge, unresolved] =
    await Promise.all([
      supabase.from("detections").select("id", { count: "exact", head: true }),
      supabase.from("detections").select("id", { count: "exact", head: true }).eq("severity", "low"),
      supabase.from("detections").select("id", { count: "exact", head: true }).eq("severity", "medium"),
      supabase.from("detections").select("id", { count: "exact", head: true }).eq("severity", "high"),
      supabase.from("detections").select("id", { count: "exact", head: true }).eq("severity", "critical"),
      supabase.from("detections").select("id", { count: "exact", head: true }).eq("layer", "rule"),
      supabase.from("detections").select("id", { count: "exact", head: true }).eq("layer", "laya"),
      supabase.from("detections").select("id", { count: "exact", head: true }).eq("layer", "llm_judge"),
      supabase.from("detections").select("id", { count: "exact", head: true }).is("resolved_at", null),
    ]);

  if (total.error) {
    handleQueryError(total.error);
  }

  const { data: categoryData } = await supabase
    .from("detections")
    .select("category, created_at")
    .order("created_at", { ascending: false });

  const categoryMap = new Map<string, { count: number; latest: string }>();
  for (const row of categoryData ?? []) {
    const existing = categoryMap.get(row.category);
    if (existing) {
      existing.count++;
    } else {
      categoryMap.set(row.category, { count: 1, latest: row.created_at });
    }
  }

  return {
    total: total.count ?? 0,
    by_severity: {
      low: bySeverityLow.count ?? 0,
      medium: bySeverityMed.count ?? 0,
      high: bySeverityHigh.count ?? 0,
      critical: bySeverityCrit.count ?? 0,
    },
    by_category: Array.from(categoryMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.count - a.count),
    by_layer: {
      rule: byLayerRule.count ?? 0,
      laya: byLayerLaya.count ?? 0,
      llm_judge: byLayerJudge.count ?? 0,
    },
    unresolved_count: unresolved.count ?? 0,
  };
}
