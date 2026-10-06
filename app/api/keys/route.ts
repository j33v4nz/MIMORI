import { randomBytes, createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "../../lib/api/errors";
import { requireDashboardUser } from "../../lib/api/auth";
import { createSupabaseServiceClient } from "../../lib/db/service";
import { getApiKeys, getUserOrgId } from "../../lib/dashboard/queries";
import { createKeySchema } from "../../lib/schemas";
import { logger } from "../../lib/logger";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireDashboardUser();

    if (!user) {
      return apiError(401, "unauthorized", "Authentication required.");
    }

    return NextResponse.json({ keys: await getApiKeys() });
  } catch (error) {
    const message = "Could not load API keys.";
    logger.error({ err: error }, "Failed to load API keys");
    return apiError(500, "keys_load_failed", message);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireDashboardUser();

    if (!user) {
      return apiError(401, "unauthorized", "Authentication required.");
    }

    let body: unknown = {};

    try {
      body = await request.json();
    } catch {
      // Empty body if parsing failed
    }

    const parsed = createKeySchema.safeParse(body);

    if (!parsed.success) {
      return apiError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Invalid request.");
    }

    const orgId = await getUserOrgId();
    const service = createSupabaseServiceClient();

    const { count } = await service
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("revoked_at", null);

    if ((count ?? 0) >= 20) {
      return apiError(400, "key_limit_reached", "Maximum of 20 active API keys per organization.");
    }

    const rawKey = `mmr_dev_${randomBytes(16).toString("hex")}`;
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const expiresAt = parsed.data.expires_in_days
      ? new Date(Date.now() + parsed.data.expires_in_days * 86_400_000).toISOString()
      : null;

    const { data, error } = await service
      .from("api_keys")
      .insert({
        org_id: orgId,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        name: parsed.data.name ?? null,
        expires_at: expiresAt
      })
      .select("id, key_prefix, name, created_at, expires_at")
      .single();

    if (error || !data) {
      logger.error({ error, orgId, keyPrefix }, "Supabase insert failed for api_keys");
      return apiError(500, "key_create_failed", error?.message ?? "Could not create API key.");
    }

    return NextResponse.json({
      id: data.id,
      key: rawKey,
      key_prefix: data.key_prefix,
      name: data.name,
      created_at: data.created_at,
      message: "Save this key now. It will not be shown again."
    }, { status: 201 });
  } catch (error) {
    const message = "Could not create API key.";
    logger.error({ err: error }, "Failed to create API key");
    return apiError(500, "key_create_failed", message);
  }
}

