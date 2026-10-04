"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../lib/db/server";
import { createSupabaseServiceClient } from "../lib/db/service";
import { invalidateRulesCache } from "../lib/services/detection-service";
import { getUserOrgId } from "../lib/dashboard/queries";

export async function createRule(formData: FormData) {
  try {
    await requireAdmin();
    const orgId = await getUserOrgId();
    if (!orgId) throw new Error("Organization membership required.");
    // Owner authorization and membership scope are checked before inserting.
    const supabase = createSupabaseServiceClient();

    const name = formData.get("name") as string;
    const category = formData.get("category") as string;
    const severity = formData.get("severity") as string;
    const pattern = formData.get("pattern") as string;
    const description = formData.get("description") as string;

    if (!name || !category || !severity || !pattern) {
      throw new Error("Missing required fields");
    }

    const { error } = await supabase.from("rules").insert({
      org_id: orgId,
      name,
      category,
      severity,
      pattern,
      pattern_type: "regex", // default matching engine type
      description: description || null,
      enabled: true
    });

    if (error) {
      throw new Error(error.message);
    }

    invalidateRulesCache();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create rule";
    console.error("Failed to create rule:", err);
    throw new Error(message);
  }

  revalidatePath("/rules");
}
