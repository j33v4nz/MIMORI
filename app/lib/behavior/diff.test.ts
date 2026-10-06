import { describe, expect, it } from "vitest";
import { diffBehavior, profileBehavior } from "./diff";

describe("profileBehavior", () => {
  it("extracts stable tool and model signatures from telemetry", () => {
    const profile = profileBehavior([
      {
        event_type: "tool_start",
        payload: { tool: { name: "Calculator" } }
      },
      {
        event_type: "llm_start",
        payload: { serialized: { name: "MockLLM" } }
      }
    ]);

    expect(profile.eventCount).toBe(2);
    expect(profile.signatures).toEqual([
      { label: "llm_start:mockllm", count: 1 },
      { label: "tool_start:calculator", count: 1 }
    ]);
  });
});

describe("diffBehavior", () => {
  it("marks a new tool as review and reports the added signature", () => {
    const diff = diffBehavior(
      [{ event_type: "tool_start", payload: { tool: { name: "calculator" } } }],
      [
        { event_type: "tool_start", payload: { tool: { name: "calculator" } } },
        { event_type: "tool_start", payload: { tool: { name: "web_search" } } }
      ]
    );

    expect(diff.status).toBe("review");
    expect(diff.added).toEqual([{ label: "tool_start:web_search", count: 1 }]);
  });

  it("marks critical candidate detections as high risk", () => {
    const diff = diffBehavior(
      [{ event_type: "llm_start", payload: { prompt: "normal" } }],
      [
        {
          event_type: "llm_start",
          payload: { prompt: "new" },
          detections: [
            { category: "data_exfiltration", severity: "critical" }
          ]
        }
      ]
    );

    expect(diff.status).toBe("high_risk");
    expect(diff.detectionChanges).toEqual([
      { label: "critical:data_exfiltration", count: 1 }
    ]);
  });

  it("stays clear when the candidate has the same behavior", () => {
    const events = [
      { event_type: "llm_start", payload: { serialized: { name: "agent" } } }
    ];

    expect(diffBehavior(events, events).status).toBe("clear");
  });

  it("reports removed behavior as a change", () => {
    const diff = diffBehavior(
      [
        { event_type: "tool_start", payload: { tool: { name: "calculator" } } },
        { event_type: "tool_start", payload: { tool: { name: "web_search" } } }
      ],
      [{ event_type: "tool_start", payload: { tool: { name: "calculator" } } }]
    );

    expect(diff.status).toBe("review");
    expect(diff.removed).toEqual([{ label: "tool_start:web_search", count: 1 }]);
  });

  it("reviews changed destinations without putting URLs or secrets in labels", () => {
    const event = (url: string) => ({ event_type: "tool_start", payload: {
      tool: { name: "http_fetch" }, input: { url, token: "secret-do-not-display" }
    } });
    const diff = diffBehavior([event("https://example.com")], [event("https://collector.example/upload")]);
    expect(diff.status).toBe("review");
    expect(diff.added).toHaveLength(1);
    expect(JSON.stringify(diff)).not.toContain("secret-do-not-display");
    expect(JSON.stringify(diff)).not.toContain("https://");
  });

  it("compares nested arguments stably regardless of object key order", () => {
    const event = (args: Record<string, unknown>) => ({ event_type: "tool_start", payload: {
      tool: { name: "database", arguments: args }
    } });
    expect(diffBehavior([event({ query: "SELECT 1", limit: 1 })], [event({ limit: 1, query: "SELECT 1" })]).status).toBe("clear");
    expect(diffBehavior([event({ query: "SELECT 1" })], [event({ query: "DELETE FROM users" })]).status).toBe("review");
  });

  it("reviews reordered actions even when their counts match", () => {
    const events = ["approve", "send"].map((name) => ({ event_type: "tool_start", payload: { tool: { name } } }));
    const diff = diffBehavior(events, [...events].reverse());
    expect(diff.status).toBe("review");
    expect(diff.orderChanged).toBe(true);
    expect(diff.added).toEqual([]);
    expect(diff.summary).toContain("order");
  });

  it("does not use action arguments as a displayed tool name", () => {
    const diff = diffBehavior([], [{ event_type: "agent_action", payload: { action: { tool_input: "private-secret" } } }]);
    expect(diff.added[0].label).not.toContain("private-secret");
  });

  it("groups a changed argument by tool without disclosing its value", () => {
    const event = (value: string) => ({ event_type: "tool_start", payload: { tool: { name: "fetch" }, input: value } });
    const diff = diffBehavior([event("private-first")], [event("private-second")]);
    expect(diff.inputChanges).toEqual([{ behavior: "tool_start:fetch", baselineFingerprints: [expect.stringMatching(/^[a-f0-9]{64}$/)], candidateFingerprints: [expect.stringMatching(/^[a-f0-9]{64}$/)] }]);
    expect(JSON.stringify(diff)).not.toContain("private-");
  });

  it("reports removed findings as review without asserting they are resolved", () => {
    const event = { event_type: "tool_start", payload: { tool: { name: "fetch" } } };
    const diff = diffBehavior([{ ...event, detections: [{ category: "threat", severity: "high" }] }], [event]);
    expect(diff.status).toBe("review");
    expect(diff.removedDetections).toEqual([{ label: "high:threat", count: 1 }]);
  });

  it("reports common action reordering even when another action was added", () => {
    const event = (name: string) => ({ event_type: "tool_start", payload: { tool: { name } } });
    const diff = diffBehavior([event("approve"), event("send")], [event("send"), event("log"), event("approve")]);
    expect(diff.orderChanged).toBe(true);
    expect(diff.added).toEqual([{ label: "tool_start:log", count: 1 }]);
  });

  it("compares real adapter prompts and string action payloads", () => {
    for (const key of ["prompts", "action"]) {
      const event = (value: string) => ({ event_type: "agent_action", payload: { [key]: key === "prompts" ? [value] : value } });
      expect(diffBehavior([event("first")], [event("second")]).status).toBe("review");
    }
  });

  it.each([
    { tool: { name: "fetch" }, input: "first" },
    { action: { tool: "fetch", tool_input: "first" } },
    { tool_call: { function: { name: "fetch", arguments: "first" } } },
    { function: { name: "fetch", arguments: "first" } },
  ])("inspects supported tool argument shapes: %j", (payload) => {
    const changed = JSON.parse(JSON.stringify(payload).replace("first", "second"));
    const diff = diffBehavior([{ event_type: "tool_start", payload }], [{ event_type: "tool_start", payload: changed }]);
    expect(diff.status).toBe("review");
    expect(diff.inputChanges[0].behavior).toBe("tool_start:fetch");
  });

  it("does not expose LlamaIndex query text embedded in a chain name", () => {
    const profile = profileBehavior([{ event_type: "chain_start", payload: { chain: { name: "query:private-token" } } }]);
    expect(profile.signatures[0].label).toMatch(/^chain_start:query#[a-f0-9]{64}$/);
    expect(JSON.stringify(profile)).not.toContain("private-token");
  });

  it("ignores callback run IDs but retains actual business kwargs", () => {
    const event = (runId: string, amount: number) => ({ event_type: "tool_start", payload: { tool: { name: "transfer" }, kwargs: { run_id: runId, parent_run_id: runId, amount } } });
    expect(diffBehavior([event("r1", 1)], [event("r2", 1)]).status).toBe("clear");
    expect(diffBehavior([event("r1", 1)], [event("r2", 2)]).status).toBe("review");
  });

  it("does not declare empty recordings clear and explains redacted evidence", () => {
    expect(diffBehavior([], []).status).toBe("review");
    const event = { event_type: "tool_start", payload: { input: "http://[REDACTED_IP]/" } };
    const diff = diffBehavior([event], [event]);
    expect(diff.comparisonWarnings.join(" ")).toContain("hide different arguments");
    expect(diff.summary).toContain("outside this comparison");
  });

  it("ignores generated LangChain message IDs while comparing content and business IDs", () => {
    const event = (run: string, account: string, content = "review account") => ({
      event_type: "chain_start", payload: { inputs: { messages: [
        { type: "human", content, id: run },
        { type: "ai", content: "", id: run, response_metadata: { request_id: run },
          tool_calls: [{ type: "tool_call", name: "balance", id: run, args: { id: account } }] },
        { type: "tool", content: "1250", name: "balance", id: run, tool_call_id: run }
      ] } }
    });
    expect(diffBehavior([event("run-a", "account-1")], [event("run-b", "account-1")]).status).toBe("clear");
    expect(diffBehavior([event("run-a", "account-1")], [event("run-b", "account-2")]).status).toBe("review");
    expect(diffBehavior([event("run-a", "account-1")], [event("run-b", "account-1", "export account")]).status).toBe("review");
  });

  it("ignores scheduling interleaving of parallel LangGraph tool branches", () => {
    const start = (run: string, branch: number, name: string) => ({ event_type: "tool_start", payload: {
      tool: { name }, kwargs: { run_id: run, parent_run_id: "graph", tool_call_id: run,
        metadata: { langgraph_step: 2, langgraph_node: "tools", langgraph_path: ["__pregel_push", branch, false] } }
    } });
    const end = (run: string, name: string) => ({ event_type: "tool_end", payload: {
      kwargs: { run_id: run, name }
    } });
    const a = start("a", 0, "balance"), b = start("b", 1, "review");
    const ae = end("a", "balance"), be = end("b", "review");
    expect(diffBehavior([a, ae, b, be], [b, a, be, ae]).status).toBe("clear");
    // Order inside an individual branch remains meaningful.
    const c = start("c", 0, "send");
    expect(diffBehavior([a, c, b], [c, a, b]).status).toBe("review");
  });

  it("rejects cyclic and deeply nested inputs rather than comparing incomplete fingerprints", () => {
    const input: Record<string, unknown> = {};
    input.self = input;
    expect(() => profileBehavior([{ event_type: "tool_start", payload: { input } }])).toThrow("cycle");
    let nested: unknown = "secret";
    for (let i = 0; i < 40; i++) nested = { child: nested };
    expect(() => profileBehavior([{ event_type: "tool_start", payload: { input: nested } }])).toThrow("complexity limits");
  });
});
