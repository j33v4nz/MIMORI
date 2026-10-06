"""Enterprise Finance Multi-Agent Simulation & Aggressive End-to-End Stress Test.

Simulates "Apex Financial Technologies" - a 4-agent autonomous wealth management loop:
1. WealthAdvisorAgent (User orchestration & client intent)
2. QuantRiskAgent (Quantitative variance & risk calculations)
3. ComplianceAuditorAgent (Regulatory guardrails, BOLA checks, AML)
4. ExecutionTraderAgent (Broker execution & order routing)
"""

from __future__ import annotations

import json
import pytest
import responses
from unittest.mock import MagicMock

from mimori.client import MIMORIClient
from mimori.guardrail import MIMORIGuardrail, SecurityViolation, GuardrailVerdict
from mimori.manual import log_event


class ApexFinanceMultiAgentSystem:
    """Enterprise multi-agent finance execution loop."""

    def __init__(
        self,
        api_key: str,
        api_url: str = "http://localhost:3000",
        session_id: str = "sess-apex-finance-001",
    ) -> None:
        self.session_id = session_id
        self.guard = MIMORIGuardrail(mode="block")

        # 4 Specialized Agents in the Loop
        self.advisor = MIMORIClient(
            api_key=api_key,
            agent_name="WealthAdvisor",
            api_url=api_url,
            session_id=session_id,
            framework="crewai",
        )
        self.quant = MIMORIClient(
            api_key=api_key,
            agent_name="QuantRiskAnalyst",
            api_url=api_url,
            session_id=session_id,
            framework="langgraph",
        )
        self.compliance = MIMORIClient(
            api_key=api_key,
            agent_name="ComplianceAuditor",
            api_url=api_url,
            session_id=session_id,
            framework="autogen",
        )
        self.trader = MIMORIClient(
            api_key=api_key,
            agent_name="ExecutionTrader",
            api_url=api_url,
            session_id=session_id,
            framework="openai-agents",
        )

    def run_rebalance_workflow(
        self, client_id: str, target_allocation: dict[str, float]
    ) -> dict[str, Any]:
        """Execute a benign multi-agent portfolio rebalance loop."""
        # Turn 1: Advisor ingests client intent
        self.advisor.log(
            "chain_start",
            {"chain": {"name": "PortfolioRebalanceWorkflow"}, "client_id": client_id},
        )
        self.advisor.log(
            "llm_start",
            {
                "prompts": [
                    f"Rebalance portfolio for client {client_id} to {target_allocation}"
                ]
            },
        )
        self.advisor.log(
            "agent_action",
            {
                "action": "handoff: WealthAdvisor -> QuantRiskAnalyst",
                "sender": "WealthAdvisor",
                "recipient": "QuantRiskAnalyst",
            },
        )

        # Turn 2: Quant analyzes variance & risk metrics
        self.quant.log(
            "llm_start",
            {"prompts": [f"Calculate target delta for {target_allocation}"]},
        )
        self.quant.log(
            "tool_start",
            {
                "tool": {"name": "risk_var_calculator"},
                "input": {"portfolio_id": client_id, "confidence": 0.99},
            },
        )
        self.quant.log(
            "tool_end",
            {
                "output": {
                    "variance": 0.042,
                    "var_95": "$1,450",
                    "status": "WITHIN_LIMITS",
                }
            },
        )
        self.quant.log(
            "agent_action",
            {
                "action": "handoff: QuantRiskAnalyst -> ComplianceAuditor",
                "sender": "QuantRiskAnalyst",
                "recipient": "ComplianceAuditor",
            },
        )

        # Turn 3: Compliance evaluates FINRA & BOLA boundaries
        self.compliance.log(
            "llm_start",
            {
                "prompts": [
                    f"Verify account ownership and daily trading limits for {client_id}"
                ]
            },
        )
        self.compliance.log(
            "tool_start",
            {
                "tool": {"name": "verify_kyc_aml_bola"},
                "input": {"client_id": client_id, "daily_notional": "$45,000"},
            },
        )
        self.compliance.log(
            "tool_end",
            {
                "output": {
                    "approved": True,
                    "compliance_ticket": "CMP-99812",
                    "risk_score": 0.12,
                }
            },
        )
        self.compliance.log(
            "agent_action",
            {
                "action": "handoff: ComplianceAuditor -> ExecutionTrader",
                "sender": "ComplianceAuditor",
                "recipient": "ExecutionTrader",
            },
        )

        # Turn 4: Trader executes orders on broker gateway
        self.trader.log(
            "tool_start",
            {
                "tool": {"name": "broker_order_gateway"},
                "input": {"symbol": "VTI", "qty": 150, "side": "BUY"},
            },
        )
        self.trader.log(
            "tool_end",
            {
                "output": {
                    "order_id": "ORD-7712",
                    "status": "FILLED",
                    "fill_price": 268.45,
                }
            },
        )
        self.trader.log(
            "llm_end",
            {
                "response": f"Portfolio rebalanced successfully for client {client_id}. 150 shares VTI filled at $268.45."
            },
        )
        self.advisor.log(
            "chain_end", {"outputs": {"status": "SUCCESS", "order_id": "ORD-7712"}}
        )

        # Flush telemetry across all agents
        self.advisor.flush()
        self.quant.flush()
        self.compliance.flush()
        self.trader.flush()

        return {"status": "COMPLETED", "client_id": client_id, "order_id": "ORD-7712"}

    def close(self) -> None:
        self.advisor.close()
        self.quant.close()
        self.compliance.close()
        self.trader.close()


@responses.activate
def test_enterprise_multiagent_benign_workflow():
    """Test full 4-agent financial collaboration loop."""
    responses.add(
        responses.POST,
        "http://localhost:3000/api/ingest/event",
        json={"accepted": 5, "session_id": "sess-apex-001", "immediate_detections": []},
        status=202,
    )

    system = ApexFinanceMultiAgentSystem(
        api_key="mmr_live_apex_corp_key", session_id="sess-apex-001"
    )
    try:
        result = system.run_rebalance_workflow(
            client_id="ACC-89102",
            target_allocation={"equities": 0.60, "fixed_income": 0.40},
        )
        assert result["status"] == "COMPLETED"
        assert result["order_id"] == "ORD-7712"

        # Verify all 4 agents generated and flushed telemetry
        assert len(responses.calls) == 4
        all_bodies = "".join([c.request.body.decode("utf-8") for c in responses.calls])
        assert "WealthAdvisor" in all_bodies
        assert "QuantRiskAnalyst" in all_bodies
        assert "ComplianceAuditor" in all_bodies
        assert "ExecutionTrader" in all_bodies
        assert "risk_var_calculator" in all_bodies
        assert "handoff: ComplianceAuditor -> ExecutionTrader" in all_bodies
    finally:
        system.close()


def test_enterprise_guardrail_blocks_unauthorized_market_destruction():
    """Aggressive User Test: Malicious prompt attempting destructive multi-table drop & RCE."""
    guard = MIMORIGuardrail(mode="block")

    # 1. SQL Injection / BOLA bypass attempt
    malicious_query = (
        "SELECT * FROM client_accounts WHERE 1=1; DROP TABLE institutional_orders;"
    )
    verdict = guard.evaluate(malicious_query)
    assert verdict.allowed is False
    assert verdict.category == "threat"
    assert "DROP TABLE" in verdict.matched_pattern

    # 2. Destructive OS execution attempt by confused deputy
    malicious_cmd = "rm -rf / --no-preserve-root"
    with pytest.raises(SecurityViolation) as exc_info:
        guard.verify_or_raise(malicious_cmd)
    assert "Destructive operating system command" in str(exc_info.value)


def test_enterprise_guardrail_blocks_ssrf_cloud_credentials():
    """Aggressive User Test: Confused deputy tool attempt to extract AWS IAM credentials."""
    guard = MIMORIGuardrail(mode="block")

    ssrf_probe = "http://169.254.169.254/latest/meta-data/iam/security-credentials/production-role"
    verdict = guard.evaluate(ssrf_probe)
    assert verdict.allowed is False
    assert verdict.category == "threat"
    assert "169.254.169.254" in verdict.matched_pattern


def test_enterprise_guardrail_blocks_apiKey_leak():
    """Aggressive User Test: Model output accidentally exposing financial provider secrets."""
    guard = MIMORIGuardrail(mode="block")

    secret_dump = "Broker session established with AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE and secret token."
    verdict = guard.evaluate(secret_dump)
    assert verdict.allowed is False
    assert verdict.category == "data_exfiltration"
    assert "AKIA" in verdict.matched_pattern


def test_enterprise_protected_trader_tool():
    """Aggressive User Test: Wrapping real broker order execution tool with MIMORIGuardrail."""
    guard = MIMORIGuardrail(mode="block")
    executed_orders = []

    @guard.protect_tool
    def execute_live_order(symbol: str, query_filter: str):
        executed_orders.append((symbol, query_filter))
        return {"status": "SUBMITTED", "symbol": symbol}

    # Benign execution works seamlessly
    res = execute_live_order(symbol="AAPL", query_filter="account_id='ACC-123'")
    assert res["status"] == "SUBMITTED"
    assert len(executed_orders) == 1

    # Malicious SQL injection in tool arguments is blocked BEFORE execution
    with pytest.raises(SecurityViolation):
        execute_live_order(
            symbol="AAPL",
            query_filter="account_id='ACC-123' OR 1=1; DROP TABLE orders;",
        )
    assert len(executed_orders) == 1  # Blocked! Tool was never called!
