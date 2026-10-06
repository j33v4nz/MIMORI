import { describe, it, expect } from "vitest";
import {
  formatInternal,
  formatCategoryName,
  formatLayerName,
  formatEventTypeName,
  formatDate,
  formatDateShort,
  formatDateOnly,
  formatTimeHHMMSS
} from "./format";

describe("formatInternal", () => {
  it("replaces underscores with spaces", () => {
    expect(formatInternal("hello_world")).toBe("hello world");
  });

  it("returns empty string unchanged", () => {
    expect(formatInternal("")).toBe("");
  });

  it("handles multiple consecutive underscores", () => {
    expect(formatInternal("a__b___c")).toBe("a  b   c");
  });

  it("returns string without underscores unchanged", () => {
    expect(formatInternal("hello")).toBe("hello");
  });
});

describe("formatCategoryName", () => {
  it("formats standard threat categories into human labels", () => {
    expect(formatCategoryName("instruction_override")).toBe("Prompt Injection / Override");
    expect(formatCategoryName("jailbreak_persona")).toBe("Jailbreak Persona Bypass");
    expect(formatCategoryName("data_exfiltration")).toBe("Credential & Data Exfiltration");
  });

  it("falls back gracefully for unknown categories", () => {
    expect(formatCategoryName("custom_exploit")).toBe("custom exploit");
    expect(formatCategoryName("")).toBe("General Threat");
  });
});

describe("formatLayerName", () => {
  it("formats detection layers into clean names", () => {
    expect(formatLayerName("rule")).toBe("Signature Engine");
    expect(formatLayerName("llm_judge")).toBe("Autonomous LLM Judge");
  });

  it("falls back gracefully for custom layers", () => {
    expect(formatLayerName("heuristics_layer")).toBe("heuristics layer");
    expect(formatLayerName("")).toBe("Detection Layer");
  });
});

describe("formatEventTypeName", () => {
  it("formats raw event types into clear labels", () => {
    expect(formatEventTypeName("llm_start")).toBe("Model Prompt");
    expect(formatEventTypeName("llm_end")).toBe("Model Response");
    expect(formatEventTypeName("tool_start")).toBe("Tool Invocation");
    expect(formatEventTypeName("tool_end")).toBe("Tool Result");
  });

  it("falls back gracefully for custom events", () => {
    expect(formatEventTypeName("custom_step")).toBe("custom step");
    expect(formatEventTypeName("")).toBe("Event");
  });
});

describe("formatDate", () => {
  it("formats ISO date to 'YYYY-MM-DD HH:MM:SS UTC'", () => {
    expect(formatDate("2026-07-30T12:34:56.000Z")).toBe("2026-07-30 12:34:56 UTC");
  });
});

describe("formatDateShort", () => {
  it("formats ISO date to 'YYYY-MM-DD HH:MM UTC'", () => {
    expect(formatDateShort("2026-07-30T12:34:56.000Z")).toBe("2026-07-30 12:34 UTC");
  });
});

describe("formatDateOnly", () => {
  it("extracts date portion from ISO string", () => {
    expect(formatDateOnly("2026-07-30T12:34:56.000Z")).toBe("2026-07-30");
  });

  it("returns date as-is if no T separator", () => {
    expect(formatDateOnly("2026-07-30")).toBe("2026-07-30");
  });
});

describe("formatTimeHHMMSS", () => {
  it("formats date to HH:MM:SS", () => {
    const d = new Date("2026-07-30T12:34:56.000Z");
    expect(formatTimeHHMMSS(d)).toBeTruthy();
  });
});
