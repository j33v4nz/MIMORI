import { describe, expect, it } from "vitest";
import { readBodyWithLimit } from "./body";

describe("bounded ingestion body", () => {
  it("limits UTF-8 bytes rather than character count", async () => {
    expect(await readBodyWithLimit(new Request("http://localhost", { method: "POST", body: "éé" }), 3)).toBeNull();
  });
  it("cancels a chunked body as soon as the budget is exceeded", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(4)); controller.enqueue(new Uint8Array(4)); },
      cancel() { cancelled = true; }
    });
    const request = new Request("http://localhost", { method: "POST", body, duplex: "half" } as RequestInit);
    expect(await readBodyWithLimit(request, 5)).toBeNull();
    expect(cancelled).toBe(true);
  });
  it("preserves UTF-8 across chunk boundaries", async () => {
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array([0xc3])); controller.enqueue(new Uint8Array([0xa9])); controller.close();
    } });
    expect(await readBodyWithLimit(new Request("http://localhost", { method: "POST", body, duplex: "half" } as RequestInit), 2)).toBe("é");
  });
});
