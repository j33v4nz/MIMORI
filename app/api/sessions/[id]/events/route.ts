import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "../../../../lib/api/auth";
import { apiError } from "../../../../lib/api/errors";
import { getSessionEvents } from "../../../../lib/dashboard/queries";
import { logger } from "../../../../lib/logger";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireDashboardUser();
  if (!user) {
    return apiError(401, "unauthorized", "Authentication required.");
  }

  try {
    const params = await context.params;
    return NextResponse.json({
      session_id: params.id,
      events: await getSessionEvents(params.id)
    });
  } catch (error) {
    const message = "Could not load events.";
    logger.error({ err: error }, "Failed to load session events");
    return apiError(500, "events_load_failed", message);
  }
}

