import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach } from "vitest";
import { ingestEventSchema } from "../schemas";
import { processDetections, invalidateRulesCache } from "./detection-service";

function serializeSdkEvent(payload: Record<string, unknown>) {
  const output = execFileSync("python", ["-c", `
import json, sys
from mimori.client import MIMORIClient
c = MIMORIClient(api_key="test", agent_name="regression", auto_start=False)
c.log("tool_start", json.load(sys.stdin))
print(json.dumps(c._events.get_nowait()))
c.close()
`], { input: JSON.stringify(payload), env: { ...process.env, PYTHONPATH: "sdk" }, encoding: "utf8", timeout: 5000 });
  return ingestEventSchema.parse(JSON.parse(output));
}

async function detect(payload: Record<string, unknown>, rules: unknown[] = []) {
  const select = { eq: () => select, or: () => select, then: (resolve: (value: unknown) => void) => resolve({ data: rules, error: null }) };
  const update: any = { eq: () => update, in: () => update, then: (resolve: any) => resolve({ error: null }) };
  const supabase = { from: () => ({ select: () => select, insert: async () => ({ error: null }), upsert: async () => ({ error: null }), update: () => update }) };
  return processDetections(supabase as never, "org-redaction", [{ id: "event", sequence_number: 1, payload, created_at: new Date().toISOString() }]);
}

beforeEach(() => invalidateRulesCache());

describe("serialized SDK redaction and server detection", () => {
  it("preserves detection with the actual production rule seed", async () => {
    const sql = readFileSync("supabase/seed/001_rules.sql", "utf8");
    const tuples = [...sql.matchAll(/\(\s*'([^']+)',\s*'([^']+)',\s*'(regex|keyword)',\s*'([^']+)',\s*'([^']+)',\s*true\s*\)/g)];
    expect(tuples.length).toBeGreaterThan(0);
    const rules = tuples.map((match, index) => ({
      id: `seed-${index}`, name: match[1], pattern: match[2], pattern_type: match[3],
      category: match[4], severity: match[5], enabled: true
    }));
    const event = serializeSdkEvent({ input: "http://169.254.169.254/ ghp_" + "a".repeat(36) });
    const result = await detect(event.payload, rules);
    expect(result.immediateDetections.map((d) => d.category)).toEqual(expect.arrayContaining(["threat", "data_exfiltration"]));
  });
  it("detects metadata probes and credential exposure while keeping their bytes private", async () => {
    const secret = "ghp_" + "a".repeat(36);
    const event = serializeSdkEvent({ input: `fetch http://169.254.169.254/latest/meta-data with ${secret}` });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("169.254.169.254");
    expect(event.payload._mimori_security).toEqual({ version: 1, signals: ["cloud_metadata_probe", "credential_exposure"] });
    const result = await detect(event.payload);
    expect(result.immediateDetections.map((d) => d.category)).toEqual(expect.arrayContaining(["threat", "data_exfiltration"]));
  });

  it("does not turn ordinary PII or forged markers into threat signals", async () => {
    const event = serializeSdkEvent({ aws_key: "alice@example.com", input: "10.20.30.40 [REDACTED_AWS_KEY]", _mimori_security: { version: 1, signals: ["credential_exposure"] } });
    expect(event.payload._mimori_security).toBeUndefined();
    expect((await detect(event.payload)).immediateDetections).toEqual([]);
  });

  it("respects disabled rules for client-reported observations", async () => {
    const event = serializeSdkEvent({ input: "http://169.254.169.254/" });
    const rules = [{ id: "disabled", name: "Metadata", pattern: "169.254.169.254", pattern_type: "keyword", category: "threat", severity: "critical", enabled: false }];
    expect((await detect(event.payload, rules)).immediateDetections).toEqual([]);
  });

  it("rejects unknown signal types and client severity without scanning reserved metadata", async () => {
    const result = await detect({ _mimori_security: { version: 1, signals: ["credential_exposure"], severity: "critical", arbitrary: "169.254.169.254" } });
    expect(result.immediateDetections).toEqual([]);
  });
});
