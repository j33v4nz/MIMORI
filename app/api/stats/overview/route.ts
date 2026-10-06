import { NextResponse } from "next/server";
import { requireDashboardUser } from "../../../lib/api/auth";
import { apiError } from "../../../lib/api/errors";
import { getOverviewStats } from "../../../lib/dashboard/queries";
import { logger } from "../../../lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireDashboardUser();
  if (!user) {
    return apiError(401, "unauthorized", "Authentication required.");
  }

  try {
    const overview = await getOverviewStats();
    return NextResponse.json(overview);
  } catch (error) {
    const message = "Could not load overview.";
    logger.error({ err: error }, "Failed to load overview stats");
    return apiError(500, "overview_load_failed", message);
  }
}
