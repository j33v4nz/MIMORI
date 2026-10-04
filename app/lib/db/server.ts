import { createServerClient } from "@supabase/ssr";
import { createClient, isAuthSessionMissingError } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabasePublicEnv, getSupabaseServiceEnv } from "../env";
import { isAuthDisabled } from "../auth-flags";
import { cache } from "react";

interface CookieToSet {
  name: string;
  value: string;
  options?: {
    domain?: string;
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: boolean | "lax" | "strict" | "none";
    secure?: boolean;
  };
}

export async function createSupabaseServerClient() {
  const { url, anonKey } = getSupabasePublicEnv();
  
  const isLocalSandbox = isAuthDisabled();
  if (isLocalSandbox) {
    try {
      const { serviceRoleKey } = getSupabaseServiceEnv();
      return createClient(url, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
    } catch (err) {
      console.warn("DISABLE_AUTH is true but failed to load service role key:", err);
    }
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
              path: "/",
            });
          });
        } catch {
          // Server Components cannot set cookies; Server Actions and Route Handlers can.
        }
      }
    }
  });
}

export const getCachedUser = cache(async () => {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error
    } = await supabase.auth.getUser();

    if (error || !user) {
      // Signed-out browsers and the local sandbox have no auth session.
      // Keep genuine auth failures visible without logging that normal state.
      if (error && !isAuthSessionMissingError(error) && process.env.NODE_ENV !== "production") {
        console.warn("Supabase auth error in getCachedUser:", error.message);
      }

      // Auto-login mock developer session if auth is explicitly disabled (non-production only)
      if (isAuthDisabled()) {
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

    return user;
  } catch {
    if (isAuthDisabled()) {
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
});

export async function requireUser() {
  const user = await getCachedUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireUser();

  // Bypass admin role check if auth is explicitly disabled (non-production only)
  if (isAuthDisabled()) {
    return user;
  }

  // Full administrative role checks
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("org_members")
    .select("role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (error || !data || data.role !== "owner") {
    throw new Error("Unauthorized: Administrative privileges required.");
  }

  return user;
}
