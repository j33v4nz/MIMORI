import { NextResponse } from "next/server";
import { apiError } from "../../../lib/api/errors";
import { createSupabaseServiceClient } from "../../../lib/db/service";
import { createSupabaseServerClient } from "../../../lib/db/server";

export const runtime = "nodejs";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return apiError(404, "not_found", "Not found.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(401, "not_authenticated", "Sign in first.");
  }

  const service = createSupabaseServiceClient();
  const { data: devOrg, error: orgError } = await service
    .from("organizations")
    .select("id")
    .eq("name", "MIMORI Dev")
    .maybeSingle();

  if (orgError || !devOrg) {
    return apiError(404, "dev_org_missing", "MIMORI Dev org was not found.");
  }

  const { error } = await service.from("org_members").upsert(
    {
      org_id: devOrg.id,
      user_id: user.id,
      role: "owner"
    },
    { onConflict: "org_id,user_id" }
  );

  if (error) {
    return apiError(500, "membership_failed", "Failed to attach user to development organization.");
  }

  return NextResponse.json({ ok: true, org_id: devOrg.id });
}


