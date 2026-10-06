import { NextResponse } from "next/server";
import { apiError } from "../../lib/api/errors";
import { requireDashboardUser } from "../../lib/api/auth";
import { getRules } from "../../lib/dashboard/queries";
import { logger } from "../../lib/logger";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireDashboardUser();

    if (!user) {
      return apiError(401, "unauthorized", "Authentication required.");
    }

    return NextResponse.json({ rules: await getRules() });
  } catch (error) {
    const message = "Could not load rules.";
    logger.error({ err: error }, "Failed to load rules");
    return apiError(500, "rules_load_failed", message);
  }
}


