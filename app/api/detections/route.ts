import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "../../lib/api/auth";
import { apiError } from "../../lib/api/errors";
import { getDetections } from "../../lib/dashboard/queries";
import { logger } from "../../lib/logger";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await requireDashboardUser();
  if (!user) {
    return apiError(401, "unauthorized", "Authentication required.");
  }

  try {
    const rawLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : 50;

    return NextResponse.json({
      detections: await getDetections({
        severity: request.nextUrl.searchParams.get("severity") ?? undefined,
        category: request.nextUrl.searchParams.get("category") ?? undefined,
        limit
      })
    });
  } catch (error) {
    const message = "Could not load detections.";
    logger.error({ err: error }, "Failed to load detections");
    return apiError(500, "detections_load_failed", message);
  }
}

