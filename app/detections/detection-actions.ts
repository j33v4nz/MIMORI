"use server";

import { getUserOrgId } from "../lib/dashboard/queries";
import { createSupabaseServiceClient } from "../lib/db/service";
import { revalidatePath } from "next/cache";

export async function resolveDetection(id: string) {
  try {
    const orgId = await getUserOrgId();

    const supabase = createSupabaseServiceClient();
    const { error } = await supabase
      .from("detections")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/", "layout");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to resolve detection";
    throw new Error(message);
  }
}
