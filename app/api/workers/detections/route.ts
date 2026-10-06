import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { apiError } from "../../../lib/api/errors";
import { createSupabaseServiceClient } from "../../../lib/db/service";
import { processDetections, type PersistedEvent } from "../../../lib/services/detection-service";

export const runtime = "nodejs";

/** Recover events committed before a failed or interrupted detection pass. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return apiError(500, "server_configuration_error", "CRON_SECRET is not configured.");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(secret), b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return apiError(401, "unauthorized_worker", "Invalid worker authorization.");
  }
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from("events")
    .select("id,org_id,sequence_number,payload,created_at")
    .is("detection_processed_at", null).order("created_at").limit(100);
  if (error) return apiError(503, "pending_events_unavailable", "Could not load pending events.");
  let processed = 0, failed = 0;
  // Each event is independent: one problematic payload must not prevent other
  // events in this bounded batch from progressing.
  for (const event of data ?? []) {
    try {
      const result = await processDetections(supabase, event.org_id, [event as PersistedEvent]);
      if (result.error) failed++;
      else processed++;
    } catch {
      failed++;
    }
  }
  return NextResponse.json({ processed, failed }, { status: failed ? 503 : 200 });
}
