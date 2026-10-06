import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "../../../lib/api/errors";
import { patchRuleSchema } from "../../../lib/schemas";
import { updateRuleEnabled } from "../../../lib/dashboard/queries";
import { requireAdmin } from "../../../lib/db/server";
import { invalidateRulesCache } from "../../../lib/services/detection-service";
import { logger } from "../../../lib/logger";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;

  try {
    await requireAdmin();
  } catch {
    return apiError(403, "forbidden", "Administrative privileges required.");
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = patchRuleSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  try {
    await updateRuleEnabled(params.id, parsed.data.enabled);
    invalidateRulesCache();
    return NextResponse.json({ id: params.id, enabled: parsed.data.enabled });
  } catch (error) {
    const message = "Could not update rule.";
    logger.error({ err: error, ruleId: params.id }, "Failed to update rule");
    return apiError(500, "rule_update_failed", message);
  }
}

