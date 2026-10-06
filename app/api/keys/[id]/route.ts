import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "../../../lib/api/errors";
import { requireDashboardUser } from "../../../lib/api/auth";
import { getUserOrgId } from "../../../lib/dashboard/queries";
import { logger } from "../../../lib/logger";

export const runtime = "nodejs";

export async function PATCH(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const user = await requireDashboardUser();

    if (!user) {
      return apiError(401, "unauthorized", "Authentication required.");
    }

    const orgId = await getUserOrgId();

    const { createSupabaseServiceClient } = await import("../../../lib/db/service");
    const service = createSupabaseServiceClient();

    const { data, error } = await service
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("org_id", orgId)
      .is("revoked_at", null)
      .select("id")
      .single();

    if (error || !data) {
      return apiError(404, "key_not_found", "API key not found or already revoked.");
    }

    return NextResponse.json({ id: data.id, revoked: true });
  } catch (error) {
    const message = "Could not revoke API key.";
    logger.error({ err: error }, "Failed to revoke API key");
    return apiError(500, "key_revoke_failed", message);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const user = await requireDashboardUser();

    if (!user) {
      return apiError(401, "unauthorized", "Authentication required.");
    }

    const orgId = await getUserOrgId();

    const { createSupabaseServiceClient } = await import("../../../lib/db/service");
    const service = createSupabaseServiceClient();

    const { error } = await service
      .from("api_keys")
      .delete()
      .eq("id", params.id)
      .eq("org_id", orgId);

    if (error) {
      return apiError(500, "key_delete_failed", "API key could not be deleted.");
    }

    return NextResponse.json({ id: params.id, deleted: true });
  } catch (error) {
    const message = "Could not delete API key.";
    logger.error({ err: error }, "Failed to delete API key");
    return apiError(500, "key_delete_failed", message);
  }
}
