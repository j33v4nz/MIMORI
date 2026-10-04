import { randomUUID } from "crypto";
import { createSupabaseServiceClient } from "../db/service";
import { processDetections, type PersistedEvent } from "./detection-service";
import type { IngestResponse } from "../types";
import { logger } from "../logger";

interface AgentRow {
  id: string;
}

interface SessionRow {
  id: string;
}

export async function processIngestion(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  orgId: string,
  envelopeData: {
    agent_name: string;
    session_id?: string;
    framework?: string;
  },
  validEvents: Array<{
    event_type: string;
    sequence_number: number;
    payload: Record<string, unknown>;
    timestamp?: string;
  }>,
  apiKeyId?: string
): Promise<{ error?: string; response?: Omit<IngestResponse, "skipped"> }> {
  const sessionExternalId = envelopeData.session_id ?? `sess_${randomUUID()}`;

  const agent = await upsertAgent(supabase, orgId, envelopeData.agent_name, envelopeData.framework);
  if (!agent) {
    return { error: "agent_upsert_failed" };
  }

  const session = await upsertSession(supabase, agent.id, sessionExternalId, orgId);
  if (!session) {
    return { error: "session_upsert_failed" };
  }

  const persistedEvents = validEvents.length > 0
    ? await persistEvents(
        supabase,
        session.id,
        orgId,
        validEvents.map((event) => ({
          event_type: event.event_type,
          sequence_number: event.sequence_number,
          payload: event.payload,
          created_at: event.timestamp
        })),
        apiKeyId
      )
    : [];

  if (persistedEvents === null) {
    return { error: "event_insert_failed" };
  }

  const { immediateDetections, error } = await processDetections(supabase, orgId, persistedEvents);

  if (error) {
    return { error };
  }

  return {
    response: {
      accepted: persistedEvents.length,
      session_id: sessionExternalId,
      session_record_id: session.id,
      immediate_detections: immediateDetections
    }
  };
}

async function upsertAgent(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  orgId: string,
  name: string,
  framework?: string
): Promise<AgentRow | null> {
  const { data, error } = await supabase
    .from("agents")
    .upsert(
      {
        org_id: orgId,
        name,
        framework: framework ?? "unknown",
        last_seen_at: new Date().toISOString()
      },
      { onConflict: "org_id,name" }
    )
    .select("id")
    .single();

  if (error || !data) {
    logger.error({ err: error?.message }, "[upsertAgent] failed");
    return null;
  }

  return data as AgentRow;
}

async function upsertSession(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  agentId: string,
  externalSessionId: string,
  orgId: string
): Promise<SessionRow | null> {
  const { data, error } = await supabase
    .from("sessions")
    .upsert(
      {
        org_id: orgId,
        agent_id: agentId,
        external_session_id: externalSessionId
      },
      { onConflict: "agent_id,external_session_id" }
    )
    .select("id")
    .single();

  if (error || !data) {
    logger.error({ err: error?.message }, "[upsertSession] failed");
    return null;
  }

  return data as SessionRow;
}

async function persistEvents(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  sessionId: string,
  orgId: string,
  events: Array<{
    event_type: string;
    sequence_number: number;
    payload: Record<string, unknown>;
    created_at?: string;
  }>,
  apiKeyId?: string
): Promise<PersistedEvent[] | null> {
  const now = Date.now();
  const { data, error } = await supabase
    .from("events")
    .upsert(
      events.map((event) => {
        // Clamp client timestamps: future dates would skew rate windows and
        // ordering, past dates beyond 24h are treated as now.
        let createdAt = new Date().toISOString();
        if (event.created_at) {
          const parsed = new Date(event.created_at).getTime();
          if (Number.isFinite(parsed) && parsed <= now && parsed >= now - 24 * 3600 * 1000) {
            createdAt = new Date(parsed).toISOString();
          }
        }
        return {
          org_id: orgId,
          session_id: sessionId,
          event_type: event.event_type,
          sequence_number: event.sequence_number,
          payload: event.payload,
          created_at: createdAt,
          api_key_id: apiKeyId ?? null
        };
      }),
      { onConflict: "session_id,sequence_number", ignoreDuplicates: true }
    )
    .select("id, sequence_number, payload, created_at");

  if (error || !data) {
    logger.error({ err: error?.message }, "[persistEvents] failed");
    return null;
  }

  return data as PersistedEvent[];
}
