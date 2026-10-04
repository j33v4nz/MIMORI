import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../../lib/db/service", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock("../../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createSupabaseServiceClient } from "../../../lib/db/service";
import { POST } from "./route";

const CRON_SECRET = "test-cron-secret";
const DAY_MS = 24 * 60 * 60 * 1000;
const prevCronSecret = process.env.CRON_SECRET;

interface EventRow {
  id: string;
  org_id: string | null;
  created_at: string;
}

interface SettingsRow {
  org_id: string;
  retention_days: number | null;
}

type Filter = { type: "eq" | "is" | "lt" | "in"; col: string; val: unknown };

let events: EventRow[] = [];
let orgSettings: SettingsRow[] = [];
let organizations: Array<{ id: string }> = [];

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

function matches(row: any, filters: Filter[]): boolean {
  return filters.every((f) => {
    switch (f.type) {
      case "eq":
        return row[f.col] === f.val;
      case "is":
        return f.val === null ? row[f.col] === null : row[f.col] === f.val;
      case "lt":
        return (row[f.col] as number | string) < (f.val as number | string);
      case "in":
        return (f.val as unknown[]).includes(row[f.col]);
      default:
        return true;
    }
  });
}

 
function rowsFor(table: string): any[] {
  if (table === "events") return events;
  if (table === "org_settings") return orgSettings;
  if (table === "organizations") return organizations;
  return [];
}

/** Minimal in-memory supabase query builder covering the retention route. */
function fakeFrom(table: string) {
  const state = {
    op: "select" as "select" | "delete",
    filters: [] as Filter[],
    wantCount: false,
    limitN: Number.POSITIVE_INFINITY,
    orderCol: null as string | null,
    ascending: true,
  };

  const exec = async (): Promise<{ data?: unknown; count?: number; error: unknown }> => {
    if (state.op === "delete") {
      const keep = rowsFor(table).filter((r) => !matches(r, state.filters));
      if (table === "events") events = keep as EventRow[];
      return { data: null, error: null };
    }
    const matched = rowsFor(table).filter((r) => matches(r, state.filters));
    if (state.wantCount) return { count: matched.length, error: null };
    let out = matched;
    if (state.orderCol) {
      const col = state.orderCol;
      const dir = state.ascending ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = a[col] as string;
        const bv = b[col] as string;
        return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
      });
    }    if (Number.isFinite(state.limitN)) out = out.slice(0, state.limitN);
    return { data: out, error: null };
  };

  const api: any = {
    select: (_cols?: string, opts?: { count?: string }) => {
      if (opts?.count === "exact") state.wantCount = true;
      return api;
    },
    delete: () => {
      state.op = "delete";
      return api;
    },
    eq: (col: string, val: unknown) => {
      state.filters.push({ type: "eq", col, val });
      return api;
    },
    is: (col: string, val: unknown) => {
      state.filters.push({ type: "is", col, val });
      return api;
    },
    lt: (col: string, val: unknown) => {
      state.filters.push({ type: "lt", col, val });
      return api;
    },
    in: (col: string, val: unknown) => {
      state.filters.push({ type: "in", col, val });
      return api;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      state.orderCol = col;
      state.ascending = opts?.ascending !== false;
      return api;
    },
    limit: (n: number) => {
      state.limitN = n;
      return api;
    },
    then: (onFulfilled: any, onRejected: any) => exec().then(onFulfilled, onRejected),
  };
  return api;
}

function workerRequest(query = "") {
  return new NextRequest(`http://localhost/api/workers/retention${query}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
}

describe("POST /api/workers/retention per-org policies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;

    organizations = [{ id: "org-a" }, { id: "org-b" }, { id: "org-c" }];
    orgSettings = [
      { org_id: "org-a", retention_days: 7 },
      { org_id: "org-b", retention_days: 365 },
    ];
    // org-c exists but has no org_settings row and no events at all.
    events = [
      { id: "e-a-old", org_id: "org-a", created_at: daysAgo(40) }, // > 7d  -> delete
      { id: "e-a-new", org_id: "org-a", created_at: daysAgo(2) }, //  < 7d  -> keep
      { id: "e-b-old", org_id: "org-b", created_at: daysAgo(40) }, // <365d  -> keep
      { id: "e-null-old", org_id: null, created_at: daysAgo(40) }, // >30d default -> delete
      { id: "e-null-new", org_id: null, created_at: daysAgo(5) }, //  <30d  -> keep
    ];

    vi.mocked(createSupabaseServiceClient).mockReturnValue({
      from: vi.fn((table: string) => fakeFrom(table)),
    } as any);
  });

  afterAll(() => {
    if (prevCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCronSecret;
  });

  it("dry run reports per-org policies including the null-org default and consistent cutoff", async () => {
    const res = await POST(workerRequest("?dryRun=1"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(body.deleted).toBe(0);
    // org-a 40d > 7d + null-org 40d > 30d; org-b 40d < 365d is kept.
    expect(body.wouldDelete).toBe(2);

    const policies: Array<{ orgId: string | null; retentionDays: number; cutoff: string }> =
      body.retentionPolicies;
    expect(policies).toHaveLength(4);
    expect(policies.find((p) => p.orgId === "org-a")?.retentionDays).toBe(7);
    expect(policies.find((p) => p.orgId === "org-b")?.retentionDays).toBe(365);
    // Orgs are enumerated from the organizations table, not an events sample.
    expect(policies.find((p) => p.orgId === "org-c")?.retentionDays).toBe(30);
    // Null-org policy is ALWAYS present so org_id IS NULL events get pruned.
    expect(policies.find((p) => p.orgId === null)?.retentionDays).toBe(30);

    // Cutoff is the default/summary cutoff reported consistently with retentionDays.
    expect(typeof body.cutoff).toBe("string");
    const expectedCutoff = Date.now() - body.retentionDays * DAY_MS;
    expect(Math.abs(Date.parse(body.cutoff) - expectedCutoff)).toBeLessThan(5000);

    // Dry run must not delete anything.
    expect(events).toHaveLength(5);
  });

  it("deletes org A (7d) events, keeps org B (365d), and prunes null-org events", async () => {
    const res = await POST(workerRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.deleted).toBe(2);
    expect(body.wouldDelete).toBe(2);

    const remaining = events.map((e) => e.id).sort();
    expect(remaining).toEqual(["e-a-new", "e-b-old", "e-null-new"]);

    // Same cutoff field as the dry run (backward-compatible response shape).
    const expectedCutoff = Date.now() - body.retentionDays * DAY_MS;
    expect(Math.abs(Date.parse(body.cutoff) - expectedCutoff)).toBeLessThan(5000);
    expect(body.retentionDays).toBe(365);
  });

  it("prunes null-org events even after org-specific policies exist", async () => {
    const res = await POST(workerRequest());
    expect(res.status).toBe(200);
    expect(events.some((e) => e.id === "e-null-old")).toBe(false);
    expect(events.some((e) => e.org_id === null && e.id === "e-null-new")).toBe(true);
  });
});
