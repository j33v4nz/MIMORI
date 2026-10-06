import { createHash } from "crypto";
import { createSupabaseServerClient } from "../db/server";
import { logger } from "../logger";
import { isAuthDisabled } from "../auth-flags";

export interface AuthenticatedApiKey {
  id: string;
  orgId: string;
  keyHash: string;
}

export async function requireDashboardUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) return user;

  if (isAuthDisabled()) {
    logger.warn("DISABLE_AUTH mock dashboard session used (non-production only)");
    return {
      id: "00000000-0000-0000-0000-000000000001",
      email: "operative@mimori.local",
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as any;
  }

  return null;
}

interface SupabaseLike {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        is: (column: string, value: null) => {
          maybeSingle: () => Promise<{
            data: {
              id: string;
              org_id: string;
              key_hash: string;
              revoked_at: string | null;
              expires_at?: string | null;
            } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

export function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export async function authenticateApiKey(
  supabase: unknown,
  apiKey: string
): Promise<AuthenticatedApiKey | null> {
  const client = supabase as SupabaseLike;
  const keyHash = hashApiKey(apiKey);

  const { data, error } = await client
    .from("api_keys")
    .select("id, org_id, key_hash, revoked_at, expires_at")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !data) {
    // Ingest path is fail-closed: an invalid API key is always null,
    // even in local sandbox mode. DISABLE_AUTH never applies here.
    return null;
  }

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return null;
  }

  return {
    id: data.id,
    orgId: data.org_id,
    keyHash: data.key_hash
  };
}
