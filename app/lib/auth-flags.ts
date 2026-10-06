// Single source of truth for the local-auth-bypass flag.
//
// Sandbox UX: when running locally (NODE_ENV !== "production") with
// DISABLE_AUTH=true, dashboard routes use a mock developer session.
// Ingest (API-key) auth NEVER honors this flag: invalid key → null always.
//
// Fail-closed boot assertion: importing this module in production with
// DISABLE_AUTH=true throws, so a misconfigured deploy crashes at boot
// instead of silently disabling auth.
//
// NOTE: NEXT_PUBLIC_DISABLE_AUTH is intentionally NOT honored anywhere.
// Only the server-side DISABLE_AUTH env var is read, so a client-exposed
// variable can never disable auth.

// Fail-closed boot assertion: importing this module with DISABLE_AUTH=true
// outside development/test (production, staging, unset NODE_ENV, …) throws,
// so a misconfigured deploy crashes at boot instead of silently disabling auth.
// development + test are allowed: local sandbox UX and CI/playwright e2e.
const AUTH_DISABLED_ALLOWED_ENVS = new Set(["development", "test"]);

if (
  process.env.DISABLE_AUTH === "true" &&
  !AUTH_DISABLED_ALLOWED_ENVS.has(process.env.NODE_ENV ?? "")
) {
  throw new Error(
    `FATAL: DISABLE_AUTH=true is set while NODE_ENV=${process.env.NODE_ENV ?? "(unset)"}. Refusing to start (fail-closed).`
  );
}

export function isAuthDisabled(): boolean {
  return (
    process.env.DISABLE_AUTH === "true" &&
    AUTH_DISABLED_ALLOWED_ENVS.has(process.env.NODE_ENV ?? "")
  );
}
