import { describe, it, expect } from "vitest";
import { apiError, type ApiErrorBody } from "./errors";

describe("apiError", () => {
  it("returns NextResponse with correct status code", () => {
    const res = apiError(404, "not_found", "Resource not found");
    expect(res.status).toBe(404);
  });

  it("returns JSON body with error.code and error.message", async () => {
    const res = apiError(400, "bad_request", "Invalid input");
    const body: ApiErrorBody = await res.json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("Invalid input");
  });

  it("works with various status codes", () => {
    expect(apiError(400, "e", "m").status).toBe(400);
    expect(apiError(401, "e", "m").status).toBe(401);
    expect(apiError(403, "e", "m").status).toBe(403);
    expect(apiError(404, "e", "m").status).toBe(404);
    expect(apiError(429, "e", "m").status).toBe(429);
    expect(apiError(500, "e", "m").status).toBe(500);
  });

  it("body conforms to ApiErrorBody interface shape", async () => {
    const res = apiError(500, "internal_error", "Something went wrong");
    const body: ApiErrorBody = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
    expect(typeof body.error.code).toBe("string");
    expect(typeof body.error.message).toBe("string");
  });
});
