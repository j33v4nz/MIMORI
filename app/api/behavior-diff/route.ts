import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateApiKey,
  extractBearerToken,
  requireDashboardUser
} from "../../lib/api/auth";
import { apiError } from "../../lib/api/errors";
import {
  getBehaviorDiff,
  getBehaviorDiffSessions
} from "../../lib/dashboard/queries";
import { diffBehavior, type BehaviorEvent } from "../../lib/behavior/diff";
import { logger } from "../../lib/logger";

export const runtime = "nodejs";

type RequestAuth =
  | { mode: "api_key"; orgId: string }
  | { mode: "session" };

/**
 * Two auth modes:
 * 1. `Authorization: Bearer <api-key>` — machine/CLI callers (e.g. the
 *    `mimori diff` CI gate). The key is validated fail-closed against the
 *    service client and scopes the request to the key's organization.
 * 2. Dashboard session — the existing cookie-based user path (RLS applies).
 *
 * Returns null when neither authenticates, so callers respond 401.
 */
async function resolveRequestAuth(request: NextRequest): Promise<RequestAuth | null> {
  const token = extractBearerToken(request.headers.get("authorization"));

  if (token) {
    const { createSupabaseServiceClient } = await import("../../lib/db/service");
    const authenticatedKey = await authenticateApiKey(createSupabaseServiceClient(), token);

    if (authenticatedKey) {
      return { mode: "api_key", orgId: authenticatedKey.orgId };
    }
    // An explicitly supplied invalid key must not inherit cookie privileges.
    return null;
  }

  const user = await requireDashboardUser();
  return user ? { mode: "session" } : null;
}

/**
 * API-key path: fetch one session's events through the service client,
 * explicitly scoped to the key's org (service role bypasses RLS, so the
 * org filter is the isolation boundary). Mirrors getSessionEvents().
 */
async function getOrgSessionEvents(
  supabase: Awaited<ReturnType<typeof import("../../lib/db/service").createSupabaseServiceClient>>,
  orgId: string,
  sessionId: string
): Promise<BehaviorEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select(
      "event_type, payload, detections!detections_event_id_fkey(category, severity, verdict)"
    )
    .eq("session_id", sessionId)
    .eq("org_id", orgId)
    .order("sequence_number", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{
    event_type: string;
    payload: Record<string, unknown>;
    detections?: Array<{ category: string; severity: string; verdict?: string }> | null;
  }>).map((event) => ({
    event_type: event.event_type,
    payload: event.payload ?? {},
    detections: event.detections ?? []
  }));
}

export async function GET(request: NextRequest) {
  const auth = await resolveRequestAuth(request);
  if (!auth) {
    return apiError(401, "unauthorized", "Authentication required.");
  }

  const baseline = request.nextUrl.searchParams.get("baseline");
  const candidate = request.nextUrl.searchParams.get("candidate");

  if (!baseline || !candidate) {
    return apiError(400, "missing_sessions", "baseline and candidate session IDs are required.");
  }

  try {
    if (auth.mode === "api_key") {
      const { createSupabaseServiceClient } = await import("../../lib/db/service");
      const supabase = createSupabaseServiceClient();

      const { data, error } = await supabase
        .from("sessions")
        .select("id")
        .in("id", [baseline, candidate])
        .eq("org_id", auth.orgId);

      if (error || !data || data.length !== new Set([baseline, candidate]).size) {
        return apiError(404, "session_not_found", "One or both sessions are not available.");
      }

      const [baselineEvents, candidateEvents] = await Promise.all([
        getOrgSessionEvents(supabase, auth.orgId, baseline),
        getOrgSessionEvents(supabase, auth.orgId, candidate)
      ]);

      return NextResponse.json({
        baseline,
        candidate,
        diff: diffBehavior(baselineEvents, candidateEvents)
      });
    }

    const { createSupabaseServerClient } = await import("../../lib/db/server");
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("sessions")
      .select("id")
      .in("id", [baseline, candidate]);

    if (error || !data || data.length !== new Set([baseline, candidate]).size) {
      return apiError(404, "session_not_found", "One or both sessions are not available.");
    }

    return NextResponse.json({
      baseline,
      candidate,
      diff: await getBehaviorDiff(baseline, candidate)
    });
  } catch (error) {
    const message = "Could not compare sessions.";
    logger.error({ err: error }, "Failed to compute behavior diff");
    return apiError(500, "behavior_diff_failed", message);
  }
}
