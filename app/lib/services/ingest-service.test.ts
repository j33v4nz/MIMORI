import { describe, it, expect, vi, beforeEach } from "vitest";

const mockProcessDetections = vi.fn(async () => ({ immediateDetections: [], error: undefined }));

vi.mock("../db/service", () => ({
  createSupabaseServiceClient: vi.fn(() => ({})),
}));

vi.mock("./detection-service", () => ({
  processDetections: (..._args: any[]) => mockProcessDetections(),
}));

vi.mock("../logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { processIngestion } from "./ingest-service";

function createRow(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnValue({
      single: vi.fn(async () => ({ data, error })),
      then: (resolve: any) => resolve({ data, error }),
    }),
  };
}

function createMultiRow(data: unknown[], error: unknown = null) {
  return {
    select: vi.fn().mockReturnValue({
      single: vi.fn(async () => ({ data: data[0], error })),
      then: (resolve: any) => resolve({ data, error }),
    }),
  };
}

function createOkSupabase() {
  const fromFn = vi.fn((table: string) => {
    const upsertFn = vi.fn().mockImplementation((_rows: unknown, _opts?: unknown) => {
      if (table === "agents") return createRow({ id: "agent-1" });
      if (table === "sessions") return createRow({ id: "session-1" });
      if (table === "events") return createMultiRow([{ id: "e1", sequence_number: 1, payload: {}, created_at: "" }]);
      return createRow(null, { message: "unknown table" });
    });
    return { upsert: upsertFn };
  });
  return { from: fromFn };
}

describe("processIngestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessDetections.mockResolvedValue({ immediateDetections: [], error: undefined });
  });

  it("upserts agent, session, and events in correct order", async () => {
    const supabase = createOkSupabase();

    const result = await processIngestion(supabase as any, "org-1", {
      agent_name: "test-agent",
    }, [{
      event_type: "llm_start",
      sequence_number: 1,
      payload: { prompt: "hello" },
    }]);

    expect(result.response).toBeDefined();
    expect(result.response?.accepted).toBe(1);
    expect(supabase.from).toHaveBeenCalledWith("agents");
    expect(supabase.from).toHaveBeenCalledWith("sessions");
    expect(supabase.from).toHaveBeenCalledWith("events");
  });

  it("generates a random session_id when session_id is omitted", async () => {
    const supabase = createOkSupabase();

    const result = await processIngestion(supabase as any, "org-1", {
      agent_name: "test-agent",
    }, [{
      event_type: "llm_start",
      sequence_number: 1,
      payload: { prompt: "hello" },
    }]);

    expect(result.response?.session_id).toMatch(/^sess_/);
  });

  it("returns error 'agent_upsert_failed' when agent upsert fails", async () => {
    const supabase = {
      from: vi.fn(() => ({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn(async () => ({ data: null, error: { message: "fail" } })),
          }),
        }),
      })),
    };

    const result = await processIngestion(supabase as any, "org-1", {
      agent_name: "test-agent",
    }, []);

    expect(result.error).toBe("agent_upsert_failed");
  });

  it("returns error 'session_upsert_failed' when session upsert fails", async () => {
    const supabase = {
      from: vi.fn((table: string) => ({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn(async () => {
              if (table === "agents") return { data: { id: "agent-1" }, error: null };
              return { data: null, error: { message: "fail" } };
            }),
          }),
        }),
      })),
    };

    const result = await processIngestion(supabase as any, "org-1", {
      agent_name: "test-agent",
    }, []);

    expect(result.error).toBe("session_upsert_failed");
  });

  it("returns error 'event_insert_failed' when event insert fails", async () => {
    const supabase = {
      from: vi.fn((table: string) => ({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn(async () => {
              if (table === "agents") return { data: { id: "agent-1" }, error: null };
              if (table === "sessions") return { data: { id: "session-1" }, error: null };
              return { data: null, error: { message: "fail" } };
            }),
          }),
        }),
      })),
    };

    const result = await processIngestion(supabase as any, "org-1", {
      agent_name: "test-agent",
    }, [{
      event_type: "llm_start",
      sequence_number: 1,
      payload: {},
    }]);

    expect(result.error).toBe("event_insert_failed");
  });

  it("handles empty validEvents array (skips persistEvents)", async () => {
    const supabase = {
      from: vi.fn((table: string) => ({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn(async () => {
              if (table === "agents") return { data: { id: "agent-1" }, error: null };
              if (table === "sessions") return { data: { id: "session-1" }, error: null };
              return { data: null, error: null };
            }),
          }),
        }),
      })),
    };

    const result = await processIngestion(supabase as any, "org-1", {
      agent_name: "test-agent",
    }, []);

    expect(result.response).toBeDefined();
    expect(result.response?.accepted).toBe(0);
  });
});
