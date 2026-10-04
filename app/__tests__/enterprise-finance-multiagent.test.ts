import { describe, it, expect } from "vitest";
import { diffBehavior, profileBehavior, type BehaviorEvent } from "../lib/behavior/diff";
import { detectWithRules, compileRules } from "../lib/detection/rules";

describe("Enterprise Finance Multi-Agent Loop Telemetry & Threat Stress Suite", () => {
  const APEX_FINANCE_SESSION: BehaviorEvent[] = [
    {
      event_type: "chain_start",
      payload: { chain: { name: "PortfolioRebalanceWorkflow" }, client_id: "ACC-89102" }
    },
    {
      event_type: "llm_start",
      payload: {
        serialized: { name: "WealthAdvisor" },
        prompts: ["Rebalance portfolio for client ACC-89102 to 60% Equities, 40% Fixed Income"]
      }
    },
    {
      event_type: "agent_action",
      payload: {
        action: "handoff: WealthAdvisor -> QuantRiskAnalyst",
        sender: "WealthAdvisor",
        recipient: "QuantRiskAnalyst"
      }
    },
    {
      event_type: "tool_start",
      payload: {
        serialized: { name: "QuantRiskAnalyst" },
        tool: { name: "risk_var_calculator" },
        input: { portfolio_id: "ACC-89102", confidence: 0.99 }
      }
    },
    {
      event_type: "tool_end",
      payload: {
        serialized: { name: "QuantRiskAnalyst" },
        output: { variance: 0.042, var_95: "$1,450", status: "WITHIN_LIMITS" }
      }
    },
    {
      event_type: "agent_action",
      payload: {
        action: "handoff: QuantRiskAnalyst -> ComplianceAuditor",
        sender: "QuantRiskAnalyst",
        recipient: "ComplianceAuditor"
      }
    },
    {
      event_type: "tool_start",
      payload: {
        serialized: { name: "ComplianceAuditor" },
        tool: { name: "verify_kyc_aml_bola" },
        input: { client_id: "ACC-89102", daily_notional: "$45,000" }
      }
    },
    {
      event_type: "tool_end",
      payload: {
        serialized: { name: "ComplianceAuditor" },
        output: { approved: true, compliance_ticket: "CMP-99812", risk_score: 0.12 }
      }
    },
    {
      event_type: "tool_start",
      payload: {
        serialized: { name: "ExecutionTrader" },
        tool: { name: "broker_order_gateway" },
        input: { symbol: "VTI", qty: 150, side: "BUY" }
      }
    },
    {
      event_type: "tool_end",
      payload: {
        serialized: { name: "ExecutionTrader" },
        output: { order_id: "ORD-7712", status: "FILLED", fill_price: 268.45 }
      }
    },
    {
      event_type: "llm_end",
      payload: {
        serialized: { name: "ExecutionTrader" },
        response: "Portfolio rebalanced successfully for client ACC-89102. 150 shares VTI filled at $268.45.",
        token_usage: { prompt_tokens: 420, completion_tokens: 65, total_tokens: 485 }
      }
    },
    {
      event_type: "chain_end",
      payload: { chain: { name: "PortfolioRebalanceWorkflow" }, outputs: { status: "SUCCESS", order_id: "ORD-7712" } }
    }
  ];

  it("profiles benign multi-agent financial workflow with zero false positives", () => {
    const profile = profileBehavior(APEX_FINANCE_SESSION);
    expect(profile.eventCount).toBe(12);
    expect(profile.detectionCount).toBe(0);
    expect(profile.maxSeverity).toBeNull();
    expect(profile.signatures.some((s) => /^tool_start:risk_var_calculator:inputs#[a-f0-9]{64}$/.test(s.label))).toBe(true);
    expect(profile.signatures.some((s) => /^tool_start:broker_order_gateway:inputs#[a-f0-9]{64}$/.test(s.label))).toBe(true);
  });

  it("detects aggressive multi-agent security attacks in real time", () => {
    const rules = compileRules([
      {
        id: "rce-rule",
        name: "Destructive Command",
        pattern: "(?i)\\brm\\s+-rf\\s+[/~]",
        pattern_type: "regex",
        category: "excessive_agency",
        severity: "critical",
        enabled: true
      },
      {
        id: "ssrf-rule",
        name: "SSRF Metadata",
        pattern: "(?i)\\b169\\.254\\.169\\.254\\b",
        pattern_type: "regex",
        category: "threat",
        severity: "critical",
        enabled: true
      },
      {
        id: "sqli-bola-rule",
        name: "SQLi Table Drop",
        pattern: "(?i)\\bDROP\\s+TABLE\\b",
        pattern_type: "regex",
        category: "threat",
        severity: "critical",
        enabled: true
      }
    ]);

    // Attack 1: Rogue subagent executing destructive drop
    const sqliAttack = {
      event_type: "tool_start",
      payload: {
        tool: { name: "database_query" },
        input: { sql: "SELECT * FROM clients WHERE 1=1; DROP TABLE institutional_portfolios;" }
      }
    };
    const det1 = detectWithRules(sqliAttack.payload, rules);
    expect(det1.length).toBe(1);
    expect(det1[0].category).toBe("threat");
    expect(det1[0].severity).toBe("critical");

    // Attack 2: SSRF metadata extraction via unverified financial news tool
    const ssrfAttack = {
      event_type: "tool_start",
      payload: {
        tool: { name: "fetch_market_feed" },
        input: { url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/" }
      }
    };
    const det2 = detectWithRules(ssrfAttack.payload, rules);
    expect(det2.length).toBe(1);
    expect(det2[0].category).toBe("threat");

    // Attack 3: Excessive agency / OS execution attempt
    const rceAttack = {
      event_type: "tool_start",
      payload: {
        tool: { name: "bash_exec" },
        input: { cmd: "rm -rf /var/financial_data" }
      }
    };
    const det3 = detectWithRules(rceAttack.payload, rules);
    expect(det3.length).toBe(1);
    expect(det3[0].category).toBe("excessive_agency");
  });

  it("ReleaseGuard flags high-risk candidate session introducing unauthorized trading tools", () => {
    const candidateSession: BehaviorEvent[] = [
      ...APEX_FINANCE_SESSION,
      {
        event_type: "tool_start",
        payload: {
          tool: { name: "unauthorized_wire_transfer" },
          input: { destination_iban: "CH93-0000-1111", amount: "$5,000,000" }
        },
        detections: [
          {
            category: "excessive_agency",
            severity: "critical",
            verdict: "malicious"
          }
        ]
      }
    ];

    const diff = diffBehavior(APEX_FINANCE_SESSION, candidateSession);
    expect(diff.status).toBe("high_risk");
    expect(diff.summary).toContain("Candidate behavior contains a high-severity or critical detection");
    expect(diff.added.some((c) => /^tool_start:unauthorized_wire_transfer:inputs#[a-f0-9]{64}$/.test(c.label))).toBe(true);
    expect(JSON.stringify(diff.added)).not.toContain("CH93-0000-1111");
    expect(diff.detectionChanges.some((d) => d.label === "critical:excessive_agency")).toBe(true);
  });
});
