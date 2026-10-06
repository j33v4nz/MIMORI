import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../../lib/db/service", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock("../../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createSupabaseServiceClient } from "../../../lib/db/service";
import { logger } from "../../../lib/logger";
import { POST } from "./route";

const CRON_SECRET = "test-cron-secret";
const prevCronSecret = process.env.CRON_SECRET;

type Filter = { type: "eq" | "lt" | "gte" | "in"; col: string; val: unknown };

interface RecordedUpdate {
  table: string;
  payload: Record<string, unknown>;
  filters: Filter[];
}

interface TableResult {
  data: unknown;
  error: unknown;
  /** Only returned by the budget usage count query (head: true). */
  count?: number;
}

/**
 * Builds a fake supabase client for the judge worker:
 * - judge_settings: one org with kill_switch on (enters the fail-closed path)
 * - events: result supplied by the test (org lookup)
 * - llm_judge_jobs: records every UPDATE with its filters; results are served
 *   from jobUpdateResults by call order (last entry repeats)
 */
function createJudgeClient(opts: {
  claimedJobs: unknown[];
  eventsResult: TableResult;
  jobUpdateResults: TableResult[];
  // Defaults to the kill_switch fixture used by the fail-closed tests.
  judgeSettings?: Array<{
    org_id: string;
    budget_monthly: number | null;
    kill_switch: boolean | null;
  }>;
}) {
  const updates: RecordedUpdate[] = [];
  let jobUpdateIndex = 0;

  const table = (name: string, result: () => TableResult) => {
    const state = { op: "select" as "select" | "update", filters: [] as Filter[], payload: null as Record<string, unknown> | null };
    const api: any = {
      select: () => api,
      update: (payload: Record<string, unknown>) => {
        state.op = "update";
        state.payload = payload;
        return api;
      },
      delete: () => api,
      eq: (col: string, val: unknown) => {
        state.filters.push({ type: "eq", col, val });
        return api;
      },
      lt: (col: string, val: unknown) => {
        state.filters.push({ type: "lt", col, val });
        return api;
      },
      gte: (col: string, val: unknown) => {
        state.filters.push({ type: "gte", col, val });
        return api;
      },
      in: (col: string, val: unknown) => {
        state.filters.push({ type: "in", col, val });
        return api;
      },
      is: (col: string, val: unknown) => {
        state.filters.push({ type: "eq", col, val });
        return api;
      },
      order: () => api,
      limit: () => api,
      maybeSingle: () => api,
      then: (onFulfilled: any, onRejected: any) => {
        if (state.op === "update") {
          updates.push({ table: name, payload: state.payload ?? {}, filters: [...state.filters] });
        }
        return Promise.resolve()
          .then(() => result())
          .then(onFulfilled, onRejected);
      },
    };
    return api;
  };

  const client = {
    from: (name: string) => {
      if (name === "judge_settings") {
        return table(name, () => ({
          data:
            opts.judgeSettings ?? [
              { org_id: "org-1", budget_monthly: null, kill_switch: true },
            ],
          error: null,
        }));
      }
      if (name === "events") {
        return table(name, () => opts.eventsResult);
      }
      if (name === "llm_judge_jobs") {
        return table(name, () => {
          const idx = jobUpdateIndex++;
          const results = opts.jobUpdateResults;
          if (results.length === 0) return { data: null, error: null };
          return results[Math.min(idx, results.length - 1)];
        });
      }
      throw new Error(`Unexpected table in judge worker: ${name}`);
    },
    rpc: vi.fn(async () => ({ data: opts.claimedJobs, error: null })),
  };

  return { client, updates };
}

function workerRequest() {
  return new NextRequest("http://localhost/api/workers/llm-judge?limit=5", {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
}

const claimedJob = { id: "job-1", event_id: "evt-1", attempts: 0 };

describe("POST /api/workers/llm-judge fail-closed reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterAll(() => {
    if (prevCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCronSecret;
  });

  it("resets claimed jobs to pending when the org lookup fails (org_lookup_failed)", async () => {
    const { client, updates } = createJudgeClient({
      claimedJobs: [claimedJob],
      eventsResult: { data: null, error: { message: "events relation is not available" } },
      jobUpdateResults: [
        { data: [{ id: "job-1" }], error: null }, // sweep
        { data: null, error: null }, // fail-closed reset
      ],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(client as any);

    const res = await POST(workerRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    // Fail closed: nothing judged, job reported as skipped.
    expect(body.processed).toBe(0);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0]).toEqual({
      job_id: "job-1",
      event_id: "evt-1",
      reason: "org_lookup_failed",
    });

    const jobUpdates = updates.filter((u) => u.table === "llm_judge_jobs");
    expect(jobUpdates.length).toBeGreaterThanOrEqual(2);

    // [0] stale sweeper: processing + updated_at older than 15 minutes.
    const sweep = jobUpdates[0];
    expect(sweep.payload.status).toBe("pending");
    expect(sweep.filters).toContainEqual({ type: "eq", col: "status", val: "processing" });
    const staleFilter = sweep.filters.find((f) => f.type === "lt" && f.col === "updated_at");
    expect(staleFilter).toBeDefined();
    const threshold = Date.parse(String(staleFilter!.val));
    expect(Date.now() - threshold).toBeGreaterThan(14 * 60 * 1000);
    expect(Date.now() - threshold).toBeLessThan(16 * 60 * 1000);

    // [1] fail-closed reset: claimed job flipped back to pending.
    const reset = jobUpdates.slice(1).find((u) =>
      u.filters.some((f) => f.type === "in" && f.col === "id" && Array.isArray(f.val) && f.val.includes("job-1"))
    );
    expect(reset).toBeDefined();
    expect(reset!.payload.status).toBe("pending");
    expect(typeof reset!.payload.updated_at).toBe("string");
  });

  it("retries the reset when the blocked-job release update fails", async () => {
    const { client, updates } = createJudgeClient({
      claimedJobs: [claimedJob],
      eventsResult: { data: [{ id: "evt-1", org_id: "org-1" }], error: null },
      jobUpdateResults: [
        { data: [{ id: "job-1" }], error: null }, // sweep: ok
        { data: null, error: { message: "update blew up" } }, // release: fails
        { data: null, error: null }, // fail-closed retry: ok
      ],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(client as any);

    const res = await POST(workerRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    // Blocked org (kill_switch): job must not be judged.
    expect(body.processed).toBe(0);
    expect(body.skipped[0].reason).toBe("kill_switch");

    const releaseAttempts = updates.filter(
      (u) =>
        u.table === "llm_judge_jobs" &&
        u.payload.status === "pending" &&
        u.filters.some((f) => f.type === "in" && f.col === "id" && Array.isArray(f.val) && f.val.includes("job-1"))
    );
    // Original release attempt + fail-closed retry.
    expect(releaseAttempts.length).toBeGreaterThanOrEqual(2);
    expect(logger.error).toHaveBeenCalled();
  });

  it("blocks budget_monthly: 0 orgs with reason budget_exceeded (hard disable)", async () => {
    const { client } = createJudgeClient({
      claimedJobs: [claimedJob],
      eventsResult: { data: [{ id: "evt-1", org_id: "org-1" }], error: null },
      jobUpdateResults: [
        { data: [{ id: "job-1" }], error: null }, // sweep: stale check ok
        { data: null, count: 0, error: null }, // month usage count (0 >= 0 blocks)
        { data: null, error: null }, // release back to pending
      ],
      judgeSettings: [
        { org_id: "org-1", budget_monthly: 0, kill_switch: false },
      ],
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(client as any);

    const res = await POST(workerRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    // budget_monthly=0 is a valid owner setting and must behave like a
    // kill switch: nothing judged, job released with the budget reason.
    expect(body.processed).toBe(0);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0]).toEqual({
      job_id: "job-1",
      event_id: "evt-1",
      reason: "budget_exceeded",
    });
  });
});
