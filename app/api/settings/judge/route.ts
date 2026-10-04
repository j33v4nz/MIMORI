import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardUser } from "../../../lib/api/auth";
import { apiError } from "../../../lib/api/errors";
import { createSupabaseServerClient } from "../../../lib/db/server";
import { judgeSettingsPutSchema } from "../../../lib/schemas";
import { logger } from "../../../lib/logger";

export const runtime = "nodejs";

// Owner-only fields layered on top of the shared PUT schema. Kept local to
// this route so non-owners never accept (or persist) budget/kill-switch input.
const judgeSettingsOwnerPutSchema = judgeSettingsPutSchema.extend({
  // budget_monthly: 0 is a valid value and acts as a hard disable — the
  // judge worker blocks any org whose month-to-date usage >= budget, and
  // usage >= 0 always holds, so 0 stops every judge job (jobs stay
  // pending with reason "budget_exceeded"), equivalent to kill_switch.
  // NULL/omitted = unlimited budget.
  budget_monthly: z.number().int().min(0).max(100000).nullish(),
  kill_switch: z.boolean().optional(),
});

async function getCallerMembership(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const { data: orgMember } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", userId)
    .single();
  return orgMember as { org_id: string; role: string } | null;
}

export async function GET() {
  const user = await requireDashboardUser();
  if (!user) {
    return apiError(401, "unauthorized", "Authentication required.");
  }

  try {
    const supabase = await createSupabaseServerClient();

    const orgMember = await getCallerMembership(supabase, user.id);

    if (!orgMember?.org_id) {
      return apiError(404, "no_organization", "No organization found for this user.");
    }

    const orgId = orgMember.org_id;
    const isOwner = orgMember.role === "owner";

    const { data: settings } = await supabase
      .from("judge_settings")
      .select("provider, model, base_url, budget_monthly, kill_switch")
      .eq("org_id", orgId)
      .single();

    if (!settings) {
      const defaults = {
        provider: "ollama",
        model: "llama3.2",
        base_url: "http://localhost:11434"
      };
      // Owner-only fields: omitted entirely for non-owners, so the response
      // shape never leaks budget/kill-switch state to plain members.
      return NextResponse.json(
        isOwner ? { ...defaults, budget_monthly: null, kill_switch: false } : defaults
      );
    }

    if (isOwner) {
      return NextResponse.json(settings);
    }

    const row = settings as {
      provider: string;
      model: string;
      base_url: string | null;
    };
    // Owner-only fields (budget_monthly, kill_switch) are omitted for
    // non-owners instead of being returned.
    return NextResponse.json({
      provider: row.provider,
      model: row.model,
      base_url: row.base_url
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(400, "invalid_request", err.issues[0]?.message ?? "Invalid request.");
    }
    logger.error({ err }, "Failed to load judge settings");
    return apiError(500, "judge_settings_load_failed", "Could not load judge settings.");
  }
}

export async function PUT(request: Request) {
  const user = await requireDashboardUser();
  if (!user) {
    return apiError(401, "unauthorized", "Authentication required.");
  }

  try {
    const json = await request.json();
    const body = judgeSettingsOwnerPutSchema.parse(json);

    // User-scoped client: RLS still applies; the explicit check below turns
    // a silent RLS denial into a clear 403 and runs BEFORE any write.
    const supabase = await createSupabaseServerClient();

    const orgMember = await getCallerMembership(supabase, user.id);

    if (!orgMember?.org_id) {
      return apiError(404, "no_organization", "No organization found for this user.");
    }

    if (orgMember.role !== "owner") {
      return apiError(403, "forbidden", "Only organization owners can update judge settings.");
    }

    const orgId = orgMember.org_id;

    const upsertPayload: Record<string, unknown> = {
      org_id: orgId,
      provider: body.provider,
      model: body.model,
      base_url: body.base_url || null,
      updated_at: new Date().toISOString()
    };

    // Owner-only fields: only touch stored values when explicitly provided,
    // so omitting them never clobbers the existing budget/kill-switch.
    if (body.budget_monthly !== undefined) {
      upsertPayload.budget_monthly = body.budget_monthly;
    }
    if (body.kill_switch !== undefined) {
      upsertPayload.kill_switch = body.kill_switch;
    }

    const { error } = await supabase
      .from("judge_settings")
      .upsert(upsertPayload, { onConflict: "org_id" });

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    // Validation failures are client errors: return 400 with the Zod issue
    // instead of a generic 500.
    if (err instanceof z.ZodError) {
      return apiError(400, "invalid_request", err.issues[0]?.message ?? "Invalid request.");
    }
    logger.error({ err }, "Failed to update judge settings");
    return apiError(500, "judge_settings_update_failed", "Could not update judge settings.");
  }
}
