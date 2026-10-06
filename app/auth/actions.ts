"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServiceClient } from "../lib/db/service";
import { createSupabaseServerClient } from "../lib/db/server";
import { getAuthOrigin, safeRedirectPath } from "../lib/auth-origin";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error("SignIn error:", error);
    const safeNext = safeRedirectPath(next);
    const nextQuery = safeNext !== "/" ? `&next=${encodeURIComponent(safeNext)}` : "";
    redirect(`/login?message=${encodeURIComponent(error.message)}${nextQuery}&email=${encodeURIComponent(email)}`);
  }

  const safeNext = safeRedirectPath(next);
  redirect(safeNext);
}

export async function signInDevOperative(formData?: FormData) {
  // The story/demo button starts ordinary signup; shared identities must not
  // authenticate visitors to a real organization.
  const next = safeRedirectPath(String(formData?.get("next") ?? "/"));
  redirect(`/login?tab=signup&next=${encodeURIComponent(next)}`);
}

export async function signUp(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getAuthOrigin(await headers())}/auth/callback?next=${encodeURIComponent(safeRedirectPath(next))}`,
      data: {
        name
      }
    }
  });

  if (error) {
    console.error("SignUp error:", error);
    const safeNext = safeRedirectPath(next);
    const nextQuery = safeNext !== "/" ? `&next=${encodeURIComponent(safeNext)}` : "";
    redirect(`/login?tab=signup&message=${encodeURIComponent(error.message)}${nextQuery}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
  }

  if (data?.session) {
    const safeNext = safeRedirectPath(next);
    redirect(safeNext);
  }

  redirect("/login?message=signed-up");
}

export async function signInWithGithub(formData?: FormData) {
  const next = String(formData?.get("next") ?? "/");
  const supabase = await createSupabaseServerClient();
  const headerList = await headers();
  const origin = getAuthOrigin(headerList);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeRedirectPath(next))}`
    }
  });

  if (error) {
    console.error("GitHub auth error:", error);
    redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  if (data?.url) {
    redirect(data.url);
  }
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function attachDevOrg() {
  if (process.env.NODE_ENV === "production") {
    redirect("/");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const service = createSupabaseServiceClient();
  const { data: devOrg } = await service
    .from("organizations")
    .select("id")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .maybeSingle();

  if (devOrg) {
    await service.from("org_members").upsert(
      {
        org_id: devOrg.id,
        user_id: user.id,
        role: "owner"
      },
      { onConflict: "org_id,user_id" }
    );
  } else {
    const { data: fallback } = await service.from("organizations").select("id, name").eq("name", "MIMORI Dev").maybeSingle();
    if (fallback) {
      await service.from("org_members").upsert({ org_id: fallback.id, user_id: user.id, role: "owner" }, { onConflict: "org_id,user_id" });
    }
  }

  redirect("/");
}
