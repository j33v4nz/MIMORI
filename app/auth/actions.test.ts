import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("../lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("../lib/db/service", () => ({ createSupabaseServiceClient: vi.fn() }));

import { signInDevOperative, signUp } from "./actions";
import { createSupabaseServerClient } from "../lib/db/server";
import { headers } from "next/headers";

beforeEach(() => vi.clearAllMocks());

describe("demo story entry", () => {
  it("opens signup without authenticating with shared credentials", async () => {
    await expect(signInDevOperative()).rejects.toThrow("redirect:/login?tab=signup&next=%2F");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
  it("rejects an external return URL", async () => {
    const form = new FormData();
    form.set("next", "/\\external.example");
    await expect(signInDevOperative(form)).rejects.toThrow("next=%2F");
  });
});

it("sends confirmation back to this app with a safe return path", async () => {
  const signup = vi.fn(async () => ({ data: { session: null }, error: null }));
  vi.mocked(headers).mockResolvedValueOnce(new Headers({ origin: "https://mimori.example" }) as never);
  vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({ auth: { signUp: signup } } as never);
  const form = new FormData();
  form.set("email", "test@example.invalid"); form.set("password", "test-password"); form.set("next", "/events");
  await expect(signUp(form)).rejects.toThrow("signed-up");
  expect(signup).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({
    emailRedirectTo: "https://mimori.example/auth/callback?next=%2Fevents"
  }) }));
});
