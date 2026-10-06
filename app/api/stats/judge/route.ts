import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "../../../lib/api/auth";
import { apiError } from "../../../lib/api/errors";
import { createSupabaseServerClient } from "../../../lib/db/server";
import { logger } from "../../../lib/logger";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await requireDashboardUser();
  if (!user) {
    return apiError(401, "unauthorized", "Authentication required.");
  }

  try {
    const supabase = await createSupabaseServerClient();

    const [pending, completed, failed, retrying] = await Promise.all([
      supabase.from("llm_judge_jobs").select("*", { count: 'exact', head: true }).eq("status", "pending").eq("attempts", 0),
      supabase.from("llm_judge_jobs").select("*", { count: 'exact', head: true }).eq("status", "completed"),
      supabase.from("llm_judge_jobs").select("*", { count: 'exact', head: true }).eq("status", "failed"),
      supabase.from("llm_judge_jobs").select("*", { count: 'exact', head: true }).eq("status", "pending").gt("attempts", 0)
    ]);

    if (pending.error || completed.error || failed.error || retrying.error) {
      logger.error({ err: pending.error || completed.error || failed.error || retrying.error }, "Failed to query judge queue metrics");
      return apiError(500, "database_error", "Failed to query judge queue metrics.");
    }

    return NextResponse.json({
      metrics: {
        pending: pending.count || 0,
        completed: completed.count || 0,
        failed: failed.count || 0,
        retrying: retrying.count || 0,
        total_in_queue: (pending.count || 0) + (retrying.count || 0)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ error }, "Failed to fetch judge stats");
    return apiError(500, "internal_error", "Failed to fetch judge stats.");
  }
}
