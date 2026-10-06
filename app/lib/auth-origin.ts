export function safeRedirectPath(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") && !/[\\:\r\n]/.test(value) ? value : "/";
}

export function getAuthOrigin(headers: Pick<Headers, "get">): string {
  const configured = process.env.APP_URL;
  const origin = configured || headers.get("origin");
  if (origin) {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Invalid application origin");
    if (parsed.username || parsed.password) throw new Error("Invalid application origin");
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") throw new Error("Production APP_URL must use HTTPS");
    return parsed.origin;
  }
  const host = headers.get("host") || "localhost:3000";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  return new URL(`${protocol}://${host}`).origin;
}
