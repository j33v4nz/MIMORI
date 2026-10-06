import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/db/server";
import { safeRedirectPath } from "../../lib/auth-origin";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeRedirectPath(next)}`);
    }
  }

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const emailTypes = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);
  if (tokenHash && type && emailTypes.has(type)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    if (!error) return NextResponse.redirect(`${origin}${safeRedirectPath(next)}`);
  }

  return NextResponse.redirect(`${origin}/login?message=Could+not+authenticate+with+provider`);
}
