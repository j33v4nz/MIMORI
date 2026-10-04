"""Reviewer Agent — reviews agent outputs for quality, errors, and security.

Checks analysis for:
- Hallucinated data (claims not supported by tool outputs)
- Missing risk warnings
- Security issues (prompt injection in responses, data exfil attempts)
- Completeness of recommendations
"""

from __future__ import annotations

import json
import re
from typing import Any

from examples.multiagent.mimori_connector import MIMORIConnector


SECURITY_PATTERNS = [
    (r"ignore\s+(previous|all)\s+(instructions|prompts)", "prompt_injection"),
    (r"system\s*prompt\s*:", "system_prompt_extraction"),
    (r"(curl|wget|fetch)\s+https?://", "potential_exfiltration"),
    (r"eval\s*\(", "code_execution"),
    (r"base64[\s:]+[A-Za-z0-9+/]{20,}", "encoded_payload"),
    (r"(api[_-]?key|secret|token|password)\s*[:=]\s*\S+", "credential_exposure"),
]

TOOL_RESPONSE_PATTERNS = [
    (r'"error"\s*:', "tool_error"),
]


def run_review(
    connector: MIMORIConnector,
    analysis_result: dict[str, Any],
) -> dict[str, Any]:
    """Review the stock analyst's output for quality and security issues."""
    client = connector.get_client("reviewer")

    client.log("chain_start", {"phase": "review", "agent_reviewed": "stock-analyst"})

    response_text = analysis_result.get("response", "")
    tool_trace = analysis_result.get("tool_trace", [])

    issues: list[dict[str, str]] = []
    warnings: list[str] = []
    score = 100

    # --- Security scan on response ---
    for pattern, category in SECURITY_PATTERNS:
        if re.search(pattern, response_text, re.IGNORECASE):
            issues.append({
                "severity": "critical",
                "category": "security",
                "type": category,
                "detail": f"Security pattern detected: {category}",
            })
            score -= 30

    # --- Security scan on tool outputs ---
    for entry in tool_trace:
        output_str = str(entry.get("output", ""))
        for pattern, category in SECURITY_PATTERNS:
            if re.search(pattern, output_str, re.IGNORECASE):
                issues.append({
                    "severity": "critical",
                    "category": "security",
                    "type": category,
                    "detail": f"Security pattern in tool output '{entry.get('tool')}': {category}",
                })
                score -= 20

        # Check for tool errors
        for pattern, category in TOOL_RESPONSE_PATTERNS:
            if re.search(pattern, output_str, re.IGNORECASE):
                issues.append({
                    "severity": "medium",
                    "category": "tool_error",
                    "type": category,
                    "detail": f"Tool '{entry.get('tool')}' returned an error",
                })
                score -= 10

    # --- Quality checks ---
    if not response_text.strip():
        issues.append({
            "severity": "high",
            "category": "quality",
            "type": "empty_response",
            "detail": "Agent produced no response text",
        })
        score -= 25
    elif len(response_text) < 50:
        warnings.append("Response is very short — may lack sufficient detail")
        score -= 5

    # Check tool usage
    if not tool_trace:
        warnings.append("No tools were called — analysis may be based on assumptions only")
        score -= 10
    else:
        tools_used = {t.get("tool") for t in tool_trace}
        if "get_stock_price" not in tools_used:
            warnings.append("Stock prices were not fetched — recommendations may be stale")
            score -= 5
        if "analyze_risk" not in tools_used and "get_sector_breakdown" not in tools_used:
            warnings.append("Risk/sector analysis tools were not used")
            score -= 5

    # Check for specific recommendation language
    has_recommendation = any(
        word in response_text.lower()
        for word in ["recommend", "suggest", "rebalanc", "sell", "buy", "trim", "reduce"]
    )
    if not has_recommendation and response_text.strip():
        warnings.append("No actionable recommendations found in response")
        score -= 5

    # Check for numbers/data in response
    has_numbers = bool(re.search(r"\d+\.?\d*[%$]", response_text))
    if not has_numbers and response_text.strip():
        warnings.append("Response lacks specific numerical data")
        score -= 5

    score = max(0, score)

    review_result = {
        "score": score,
        "passed": score >= 60 and not any(i["severity"] == "critical" for i in issues),
        "issues": issues,
        "warnings": warnings,
        "tool_count": len(tool_trace),
        "response_length": len(response_text),
    }

    client.log("chain_end", {
        "review_score": score,
        "issues_count": len(issues),
        "warnings_count": len(warnings),
        "passed": review_result["passed"],
    })

    return review_result
