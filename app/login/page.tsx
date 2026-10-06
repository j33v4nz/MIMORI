import { redirect } from "next/navigation";
import { getCachedUser } from "../lib/db/server";
import { LoginForm } from "./login-form";
import { safeRedirectPath } from "../lib/auth-origin";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string; next?: string; tab?: string; email?: string; name?: string }>;
}) {
  const user = await getCachedUser();
  const resolved = await searchParams;

  if (user) {
    redirect(safeRedirectPath(resolved.next ?? "/"));
  }

  return (
    <LoginForm
      message={resolved.message}
      next={resolved.next ?? "/"}
      initialTab={resolved.tab === "signup" ? "signup" : "login"}
      initialEmail={resolved.email ?? ""}
      initialName={resolved.name ?? ""}
    />
  );
}
