import { describe, it, expect } from "vitest";
import { providers } from "./index";

describe("providers registry", () => {
  it("exports all 5 providers", () => {
    expect(Object.keys(providers)).toEqual(
      expect.arrayContaining(["gemini", "deepseek", "openai", "anthropic", "ollama"])
    );
    expect(Object.keys(providers)).toHaveLength(5);
  });

  it("each provider is a function", () => {
    for (const [name, fn] of Object.entries(providers)) {
      expect(typeof fn).toBe("function");
    }
  });
});
