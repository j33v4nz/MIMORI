import { NextResponse } from "next/server";
import { requireDashboardUser } from "../../lib/api/auth";
import { apiError } from "../../lib/api/errors";
import { getAgents } from "../../lib/dashboard/queries";
import { logger } from "../../lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireDashboardUser();
  if (!user) {
    return apiError(401, "unauthorized", "Authentication required.");
  }

  try {
    return NextResponse.json({ agents: await getAgents() });
  } catch (error) {
    const message = "Could not load agents.";
    logger.error({ err: error }, "Failed to load agents");
    return apiError(500, "agents_load_failed", message);
  }
}

