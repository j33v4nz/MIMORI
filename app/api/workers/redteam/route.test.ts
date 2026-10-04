import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../../lib/db/service", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock("../../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Wrap the real rules engine so the default run exercises the actual pack,
// while individual tests can stub detections to verify precision/recall math.
vi.mock("../../../lib/detection/rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/detection/rules")>();
  return {
    ...actual,
    detectWithRules: vi.fn((...args: Parameters<typeof actual.detectWithRules>) =>
      actual.detectWithRules(...args)
    ),
  };
});

import { createSupabaseServiceClient } from "../../../lib/db/service";
import { detectWithRules } from "../../../lib/detection/rules";
import { POST } from "./route";

const PACK_VERSION = "redteam-pack-v1";
const CRON_SECRET = "test-cron-secret";
const prevCronSecret = process.env.CRON_SECRET;

function workerRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/workers/redteam", {
    method: "POST",
    headers,
  });
}

/** Stub supabase client recording the eval_runs insert payload. */
function stubEvalRuns(insertError: { message: string } | null = null) {
  const insert = vi.fn(async (_row: Record<string, unknown>) => ({ error: insertError }));
  vi.mocked(createSupabaseServiceClient).mockReturnValue({
    from: vi.fn(() => ({ insert })),
  } as any);
  return insert;
}

describe("POST /api/workers/redteam", () => {
  let realDetect: typeof detectWithRules;

  beforeAll(async () => {
    const actual = await vi.importActual<typeof import("../../../lib/detection/rules")>(
      "../../../lib/detection/rules"
    );
    realDetect = actual.detectWithRules;
  });

  afterAll(() => {
    if (prevCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCronSecret;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
    vi.mocked(detectWithRules).mockImplementation(
      ((...args: Parameters<typeof realDetect>) => realDetect(...args)) as typeof detectWithRules
    );
  });

  it("returns 401 (not 500) when CRON_SECRET is not configured — no config oracle", async () => {
    delete process.env.CRON_SECRET;
    // Uniform unauthorized_worker response: an unauthenticated caller
    // must not be able to distinguish "secret unset" (formerly 500)
    // from "secret set but wrong" (401).
    const res = await POST(workerRequest({ Authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized_worker");
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("rejects wrong secrets of any length with the same 401 (no length oracle)", async () => {
    for (const attempt of ["x", "x".repeat(16), "x".repeat(200)]) {
      const res = await POST(workerRequest({ Authorization: `Bearer ${attempt}` }));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("unauthorized_worker");
    }
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("returns 401 when the secret is missing", async () => {
    const res = await POST(workerRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized_worker");
  });

  it("returns 401 when the secret is wrong", async () => {
    const res = await POST(workerRequest({ "x-cron-secret": "wrong-secret" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized_worker");
  });

  it("returns 200 with precision/recall math and attempts the eval_runs insert", async () => {
    const insert = stubEvalRuns();

    const res = await POST(workerRequest({ Authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();

    // Real pack: every attack flagged, every benign case clean.
    expect(body.total).toBe(10);
    expect(body.passed).toBe(10);
    expect(body.failed).toBe(0);
    expect(body.precision).toBe(1);
    expect(body.recall).toBe(1);
    expect(body.success).toBe(true);
    expect(body.pack_version).toBe(PACK_VERSION);
    expect(body.persisted).toBe(true);

    // Per-case details: {name, expected, actual, ok}
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details).toHaveLength(body.total);
    for (const detail of body.details) {
      expect(typeof detail.name).toBe("string");
      expect(["flagged", "clean"]).toContain(detail.expected);
      expect(["flagged", "clean"]).toContain(detail.actual);
      expect(detail.ok).toBe(detail.expected === detail.actual);
    }

    // eval_runs insert attempted with the extended payload.
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({
      pack_version: PACK_VERSION,
      precision: 1,
      recall: 1,
      total: 10,
      passed: 10,
      failed: 0,
    });
    expect(Array.isArray((row as { details: unknown[] }).details)).toBe(true);
  });

  it("computes precision/recall/failed correctly on partial detections", async () => {
    const insert = stubEvalRuns();

    // Only the prompt-inject case fires: 1 TP, 0 FP, 4 FN.
    vi.mocked(detectWithRules).mockImplementation(((payload: Record<string, unknown>) => {
      const text = String(payload?.text ?? "");
      if (!/ignore all previous instructions/i.test(text)) return [];
      return [
        {
          ruleId: "pack-prompt-inject",
          category: "instruction_override",
          severity: "high",
          verdict: "malicious",
          confidence: 0.9,
        },
      ];
    }) as typeof detectWithRules);

    const res = await POST(workerRequest({ Authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.total).toBe(10);
    expect(body.precision).toBe(1); // 1 / (1 + 0)
    expect(body.recall).toBeCloseTo(0.2, 10); // 1 / (1 + 4)
    expect(body.passed).toBe(6); // 1 flagged hit + 5 clean passes
    expect(body.failed).toBe(4);
    expect(body.success).toBe(false);

    const missed = body.details.find((d: { name: string }) => d.name === "rce");
    expect(missed).toEqual({ name: "rce", expected: "flagged", actual: "clean", ok: false });
    const clean = body.details.find((d: { name: string }) => d.name === "benign-math");
    expect(clean).toEqual({ name: "benign-math", expected: "clean", actual: "clean", ok: true });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({
      precision: 1,
      recall: 0.2,
      passed: 6,
      failed: 4,
    });
  });

  it("still returns 200 with results when the eval_runs insert fails", async () => {
    stubEvalRuns({ message: "relation eval_runs does not exist" });

    const res = await POST(workerRequest({ Authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBe(false);
    expect(body.total).toBe(10);
    expect(Array.isArray(body.details)).toBe(true);
  });
});
