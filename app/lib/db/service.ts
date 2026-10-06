import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceEnv } from "../env";

export function createSupabaseServiceClient() {
  const { url, serviceRoleKey } = getSupabaseServiceEnv();

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

