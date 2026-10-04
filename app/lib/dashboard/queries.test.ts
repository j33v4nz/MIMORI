import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({ get: () => undefined }) }));

const mockUser = { id: "user-123", email: "test@example.com" };

function createQueryBuilder() {
  const result: any = { data: null, error: null, count: 0 };
  const builder: any = {
    _filters: {} as Record<string, any>,
    select: vi.fn(() => builder),
    eq: vi.fn((k: string, v: any) => { builder._filters[k] = v; return builder; }),
    neq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    is: vi.fn(() => builder),
    in: vi.fn(() => builder),
    update: vi.fn(() => builder),
    then: (resolve: any) => resolve(result),
  };
  return { builder, result };
}

describe("app/lib/dashboard/queries", () => {
  let builder: any;
  let result: any;
  let getAgents: typeof import("./queries").getAgents;
  let getSessionsForAgent: typeof import("./queries").getSessionsForAgent;
  let getSessionEvents: typeof import("./queries").getSessionEvents;
  let getBehaviorDiffSessions: typeof import("./queries").getBehaviorDiffSessions;
  let getBehaviorDiff: typeof import("./queries").getBehaviorDiff;
  let getDetections: typeof import("./queries").getDetections;
  let getRules: typeof import("./queries").getRules;
  let updateRuleEnabled: typeof import("./queries").updateRuleEnabled;
  let getUserOrgId: typeof import("./queries").getUserOrgId;
  let getApiKeys: typeof import("./queries").getApiKeys;
  let getOverviewStats: typeof import("./queries").getOverviewStats;
  let getEvents: typeof import("./queries").getEvents;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ builder, result } = createQueryBuilder());
    vi.doMock("../db/server", () => ({
      requireUser: vi.fn(() => Promise.resolve(mockUser)),
      createSupabaseServerClient: vi.fn(() =>
        Promise.resolve({
          rpc: vi.fn(() => builder),
          from: vi.fn(() => builder),
        })
      ),
    }));
    vi.doMock("../db/service", () => ({
      createSupabaseServiceClient: vi.fn(() =>
        Promise.resolve({
          from: vi.fn(() => builder),
          rpc: vi.fn(() => builder),
        })
      ),
    }));
    vi.doMock("../behavior/diff", () => ({
      diffBehavior: vi.fn(() => ({
        baseline: { eventTypes: {}, signatureCounts: {}, detections: {}, maxSeverity: null },
        candidate: { eventTypes: {}, signatureCounts: {}, detections: {}, maxSeverity: null },
        added: [],
        removed: [],
        detectionChanges: [],
        status: "review",
        summary: "test diff",
      })),
    }));
    ({
      getAgents,
      getSessionsForAgent,
      getSessionEvents,
      getBehaviorDiffSessions,
      getBehaviorDiff,
      getDetections,
      getRules,
      updateRuleEnabled,
      getUserOrgId,
      getApiKeys,
      getOverviewStats,
      getEvents,
    } = await import("./queries"));
  });

  describe("getAgents", () => {
    it("maps RPC data to DashboardAgent[]", async () => {
      result.data = [
        { id: "a1", name: "Agent 1", framework: "langchain", last_seen_at: "2026-01-01T00:00:00Z", session_count: 5, event_count: 100 },
        { id: "a2", name: "Agent 2", framework: "openai", last_seen_at: "2026-01-02T00:00:00Z", session_count: 2, event_count: 30 },
      ];
      const agents = await getAgents();
      expect(agents).toHaveLength(2);
      expect(agents[0]).toEqual({
        id: "a1",
        name: "Agent 1",
        framework: "langchain",
        last_seen_at: "2026-01-01T00:00:00Z",
        session_count: 5,
        event_count: 100,
      });
    });

    it("returns empty array when RPC returns null", async () => {
      result.data = null;
      const agents = await getAgents();
      expect(agents).toEqual([]);
    });

    it("converts string counts to numbers", async () => {
      result.data = [{ id: "a1", name: "A", framework: "f", last_seen_at: "2026-01-01T00:00:00Z", session_count: "5", event_count: "100" }];
      const agents = await getAgents();
      expect(typeof agents[0].session_count).toBe("number");
      expect(typeof agents[0].event_count).toBe("number");
    });
  });

  describe("getSessionsForAgent", () => {
    it("queries sessions for agent_id", async () => {
      result.data = [
        {
          id: "s1",
          external_session_id: "ext-1",
          started_at: "2026-01-01T00:00:00Z",
          ended_at: "2026-01-02T00:00:00Z",
          events: [{ count: 10 }],
          event_detections: [
            { detections: [{ count: 2 }] },
            { detections: [{ count: 3 }] },
          ],
        },
      ];
      const sessions = await getSessionsForAgent("agent-1");
      expect(builder.eq).toHaveBeenCalledWith("agent_id", "agent-1");
      expect(sessions[0].event_count).toBe(10);
      expect(sessions[0].detection_count).toBe(5);
    });

    it("handles sessions with no events", async () => {
      result.data = [
        {
          id: "s1",
          external_session_id: null,
          started_at: "2026-01-01T00:00:00Z",
          ended_at: null,
          events: [],
          event_detections: [],
        },
      ];
      const sessions = await getSessionsForAgent("agent-1");
      expect(sessions[0].event_count).toBe(0);
      expect(sessions[0].detection_count).toBe(0);
      expect(sessions[0].external_session_id).toBeNull();
    });

    it("handles null events array", async () => {
      result.data = [
        {
          id: "s1",
          external_session_id: null,
          started_at: "2026-01-01T00:00:00Z",
          ended_at: null,
          events: null,
          event_detections: null,
        },
      ];
      const sessions = await getSessionsForAgent("agent-1");
      expect(sessions[0].event_count).toBe(0);
      expect(sessions[0].detection_count).toBe(0);
    });
  });

  describe("getSessionEvents", () => {
    it("queries events with detections", async () => {
      result.data = [
        {
          id: "e1",
          event_type: "llm_call",
          sequence_number: 1,
          payload: { prompt: "hello" },
          created_at: "2026-01-01T00:00:00Z",
          detections: [
            { id: "d1", layer: "rule", category: "test", severity: "low", verdict: "benign", confidence: 0.9, resolved_at: null },
          ],
        },
      ];
      const events = await getSessionEvents("session-1");
      expect(builder.eq).toHaveBeenCalledWith("session_id", "session-1");
      expect(builder.order).toHaveBeenCalledWith("sequence_number", { ascending: true });
      expect(events[0].detections).toHaveLength(1);
    });

    it("returns empty detections when none exist", async () => {
      result.data = [
        {
          id: "e1",
          event_type: "llm_call",
          sequence_number: 1,
          payload: {},
          created_at: "2026-01-01T00:00:00Z",
          detections: null,
        },
      ];
      const events = await getSessionEvents("session-1");
      expect(events[0].detections).toEqual([]);
    });

    it("returns empty array when no events exist", async () => {
      result.data = [];
      const events = await getSessionEvents("session-1");
      expect(events).toEqual([]);
    });
  });

  describe("getBehaviorDiffSessions", () => {
    it("retrieves explicitly requested older sessions with RLS still applied", async () => {
      result.data = [];
      await getBehaviorDiffSessions(["older-session", "older-session"]);
      expect(builder.in).toHaveBeenCalledWith("id", ["older-session"]);
    });
    it("queries sessions with agents, limited to 100", async () => {
      result.data = [
        {
          id: "s1",
          external_session_id: "ext-1",
          started_at: "2026-01-01T00:00:00Z",
          agents: { id: "a1", name: "Agent 1" },
          events: [{ count: 5 }],
        },
      ];
      const sessions = await getBehaviorDiffSessions();
      expect(builder.limit).toHaveBeenCalledWith(100);
      expect(sessions[0].agent).toEqual({ id: "a1", name: "Agent 1" });
      expect(sessions[0].event_count).toBe(5);
    });

    it("handles missing events in session", async () => {
      result.data = [
        {
          id: "s1",
          external_session_id: null,
          started_at: "2026-01-01T00:00:00Z",
          agents: { id: "a1", name: "Agent 1" },
          events: null,
        },
      ];
      const sessions = await getBehaviorDiffSessions();
      expect(sessions[0].event_count).toBe(0);
    });
  });

  describe("getBehaviorDiff", () => {
    it("calls getSessionEvents for both sessions and diffBehavior", async () => {
      result.data = [
        {
          id: "e1",
          event_type: "llm_call",
          sequence_number: 1,
          payload: {},
          created_at: "2026-01-01T00:00:00Z",
          detections: [],
        },
      ];
      const diff = await getBehaviorDiff("baseline", "candidate");
      expect(diff.status).toBe("review");
      expect(diff.summary).toBe("test diff");
    });
  });

  describe("getDetections", () => {
    it("queries detections with nested event/session/agent", async () => {
      result.data = [
        {
          id: "d1",
          layer: "rule",
          category: "jailbreak",
          severity: "high",
          verdict: "malicious",
          confidence: 0.8,
          created_at: "2026-01-01T00:00:00Z",
          resolved_at: null,
          events: {
            id: "e1",
            event_type: "llm_call",
            sequence_number: 1,
            payload: { prompt: "test" },
            sessions: {
              id: "s1",
              external_session_id: "ext-1",
              agents: { id: "a1", name: "Agent 1" },
            },
          },
        },
      ];
      const detections = await getDetections();
      expect(detections[0].event.session.agent.name).toBe("Agent 1");
      expect(builder.limit).toHaveBeenCalledWith(50);
    });

    it("applies severity filter", async () => {
      result.data = [];
      await getDetections({ severity: "critical" });
      expect(builder.eq).toHaveBeenCalledWith("severity", "critical");
    });

    it("applies category filter", async () => {
      result.data = [];
      await getDetections({ category: "jailbreak" });
      expect(builder.eq).toHaveBeenCalledWith("category", "jailbreak");
    });

    it("applies custom limit", async () => {
      result.data = [];
      await getDetections({ limit: 10 });
      expect(builder.limit).toHaveBeenCalledWith(10);
    });

    it("excludes payload when excludePayload is true", async () => {
      result.data = [];
      await getDetections({ excludePayload: true });
      expect(builder.select).toHaveBeenCalled();
    });

    it("returns empty array when no detections", async () => {
      result.data = [];
      const detections = await getDetections();
      expect(detections).toEqual([]);
    });
  });

  describe("getRules", () => {
    it("queries rules ordered by created_at", async () => {
      result.data = [
        { id: "r1", name: "Rule 1", description: "desc", pattern: "test", pattern_type: "regex", category: "jailbreak", severity: "high", enabled: true, created_at: "2026-01-01T00:00:00Z" },
      ];
      const rules = await getRules();
      expect(rules).toHaveLength(1);
      expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: true });
    });

    it("returns empty array when no rules", async () => {
      result.data = [];
      const rules = await getRules();
      expect(rules).toEqual([]);
    });
  });

  describe("updateRuleEnabled", () => {
    it("updates rule enabled status", async () => {
      result.data = null;
      result.error = null;
      await updateRuleEnabled("rule-1", false);
      expect(builder.update).toHaveBeenCalledWith({ enabled: false });
      expect(builder.eq).toHaveBeenCalledWith("id", "rule-1");
    });

    it("throws on database error", async () => {
      result.error = { message: "update failed" };
      await expect(updateRuleEnabled("rule-1", true)).rejects.toThrow("update failed");
    });
  });

  describe("getUserOrgId", () => {
    it("returns org_id from database", async () => {
      result.data = { org_id: "org-abc" };
      result.error = null;
      const orgId = await getUserOrgId();
      expect(orgId).toBe("org-abc");
    });

    it("throws on error", async () => {
      result.data = null;
      result.error = { message: "not found" };
      await expect(getUserOrgId()).rejects.toThrow("User is not a member of any organization.");
    });

    it("queries org_members table for user_id", async () => {
      result.data = { org_id: "org-xyz" };
      result.error = null;
      await getUserOrgId();
      expect(builder.eq).toHaveBeenCalledWith("user_id", mockUser.id);
    });
  });

  describe("getApiKeys", () => {
    it("queries api_keys ordered by created_at desc", async () => {
      result.data = [
        { id: "k1", key_prefix: "sk-1234", name: "Test Key", created_at: "2026-01-01T00:00:00Z", last_used_at: null, revoked_at: null },
      ];
      const keys = await getApiKeys();
      expect(keys).toHaveLength(1);
      expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    });

    it("returns empty array when no keys", async () => {
      result.data = [];
      const keys = await getApiKeys();
      expect(keys).toEqual([]);
    });
  });

  describe("getOverviewStats", () => {
    let mockRpc: ReturnType<typeof vi.fn>;
    let tables: Record<string, Array<Record<string, any>>>;

    beforeEach(async () => {
      vi.resetModules();
      const now = Date.now();
      const recent = new Date(now - 60_000).toISOString();
      const old = new Date(now - 48 * 60 * 60 * 1000).toISOString();
      tables = {
        events: Array.from({ length: 100 }, (_, id) => ({ id, created_at: recent })),
        detections: [
          { severity: "critical", layer: "rule", created_at: recent, resolved_at: null },
          { severity: "critical", layer: "rule", created_at: old, resolved_at: null },
          { severity: "critical", layer: "rule", created_at: recent, resolved_at: recent },
          { severity: "medium", layer: "llm_judge", created_at: recent, resolved_at: null },
          { severity: "medium", layer: "llm_judge", created_at: recent, resolved_at: null },
        ],
      };
      const agents = Array.from({ length: 7 }, (_, id) => ({
        id: `a${id}`, name: `Agent ${id}`, framework: "manual", last_seen_at: recent,
        session_count: 1, event_count: id + 1,
      }));
      mockRpc = vi.fn(async () => ({ data: agents, error: null }));
      const mockSupabase = {
        rpc: mockRpc,
        from: vi.fn((table: string) => {
          let rows = tables[table] ?? [];
          const query: any = {
            select: vi.fn(() => query),
            eq: vi.fn((key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; }),
            gte: vi.fn((key: string, value: string) => { rows = rows.filter(row => row[key] >= value); return query; }),
            is: vi.fn((key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; }),
            then: (resolve: any) => resolve({ data: null, count: rows.length, error: null }),
          };
          return query;
        }),
      };
      vi.doMock("../db/server", () => ({
        requireUser: vi.fn(async () => mockUser),
        createSupabaseServerClient: vi.fn(async () => mockSupabase),
      }));
      ({ getOverviewStats } = await import("./queries"));
    });

    it("counts all seven observed agents while showing only five top agents", async () => {
      const stats = await getOverviewStats();
      expect(mockRpc).toHaveBeenCalledWith("get_agents_with_stats");
      expect(stats.observed_agents).toBe(7);
      expect(stats.top_agents_by_volume).toHaveLength(5);
      expect(stats.top_agents_by_volume.map(agent => agent.event_count)).toEqual([7, 6, 5, 4, 3]);
    });

    it("counts only unresolved detections created in the last 24 hours", async () => {
      const stats = await getOverviewStats();
      expect(stats.total_events_24h).toBe(100);
      expect(stats.detections_by_severity_24h).toEqual({ low: 0, medium: 2, high: 0, critical: 1 });
    });

  });

  describe("getEvents", () => {
    it("queries events with default limit 50", async () => {
      result.data = [];
      const events = await getEvents();
      expect(builder.limit).toHaveBeenCalledWith(50);
    });

    it("applies agentId filter when provided", async () => {
      result.data = [];
      await getEvents(10, "agent-1");
      expect(builder.eq).toHaveBeenCalledWith("sessions.agent_id", "agent-1");
    });

    it("maps nested session/agent data", async () => {
      result.data = [
        {
          id: "e1",
          event_type: "llm_call",
          sequence_number: 1,
          payload: { prompt: "hello" },
          created_at: "2026-01-01T00:00:00Z",
          sessions: {
            id: "s1",
            external_session_id: "ext-1",
            agents: { id: "a1", name: "Agent 1" },
          },
          detections: [
            { id: "d1", layer: "rule", category: "test", severity: "low", resolved_at: null },
          ],
        },
      ];
      const events = await getEvents();
      expect(events[0].session.agent.name).toBe("Agent 1");
      expect(events[0].detections).toHaveLength(1);
    });

    it("handles null detections", async () => {
      result.data = [
        {
          id: "e1",
          event_type: "llm_call",
          sequence_number: 1,
          payload: {},
          created_at: "2026-01-01T00:00:00Z",
          sessions: {
            id: "s1",
            external_session_id: null,
            agents: { id: "a1", name: "Agent 1" },
          },
          detections: null,
        },
      ];
      const events = await getEvents();
      expect(events[0].detections).toEqual([]);
    });

    it("applies from date filter", async () => {
      result.data = [];
      await getEvents(50, undefined, "2026-07-30T00:00:00");
      expect(builder.gte).toHaveBeenCalledWith("created_at", "2026-07-30T00:00:00");
    });

    it("applies to date filter", async () => {
      result.data = [];
      await getEvents(50, undefined, undefined, "2026-08-01T23:59:59");
      expect(builder.lte).toHaveBeenCalledWith("created_at", "2026-08-01T23:59:59");
    });

    it("applies both from and to date filters", async () => {
      result.data = [];
      await getEvents(50, undefined, "2026-07-30T00:00:00", "2026-08-01T23:59:59");
      expect(builder.gte).toHaveBeenCalledWith("created_at", "2026-07-30T00:00:00");
      expect(builder.lte).toHaveBeenCalledWith("created_at", "2026-08-01T23:59:59");
    });

    it("applies agentId, from, and to filters together", async () => {
      result.data = [];
      await getEvents(50, "agent-1", "2026-07-30T00:00:00", "2026-08-01T23:59:59");
      expect(builder.eq).toHaveBeenCalledWith("sessions.agent_id", "agent-1");
      expect(builder.gte).toHaveBeenCalledWith("created_at", "2026-07-30T00:00:00");
      expect(builder.lte).toHaveBeenCalledWith("created_at", "2026-08-01T23:59:59");
    });

    it("does not apply date filters when from/to are undefined", async () => {
      result.data = [];
      await getEvents(50);
      expect(builder.gte).not.toHaveBeenCalled();
      expect(builder.lte).not.toHaveBeenCalled();
    });
  });
});
