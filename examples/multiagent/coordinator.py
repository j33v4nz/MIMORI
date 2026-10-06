"""Coordinator Agent — orchestrates the multi-agent workflow.

Manages the sequence: Stock Analyst -> Reviewer -> Judge -> (loop or finish).
"""

from __future__ import annotations

import datetime
from typing import Any

from examples.multiagent.mimori_connector import MIMORIConnector
from examples.multiagent.stock_analyst import run_stock_analysis
from examples.multiagent.reviewer import run_review
from examples.multiagent.judge import run_judgment
from examples.multiagent.config import MAX_JUDGE_LOOPS


def run_coordinator(query: str | None = None) -> dict[str, Any]:
    """Execute the full multi-agent workflow with review/judge loop.

    Flow:
        1. Stock Analyst produces an analysis
        2. Reviewer checks for errors, quality, security issues
        3. Judge decides if the review passed
        4. If rejected, the Stock Analyst re-runs (up to MAX_JUDGE_LOOPS times)
        5. Returns final result with full trace
    """
    from examples.multiagent.config import new_session_id

    session_id = new_session_id()
    trace: list[dict[str, Any]] = []

    with MIMORIConnector(session_id) as connector:
        coordinator_client = connector.get_client("coordinator")
        coordinator_client.log("chain_start", {
            "query": query or "default portfolio analysis",
            "max_loops": MAX_JUDGE_LOOPS,
        })

        current_query = query or (
            "Analyze my current portfolio holdings. Check live prices for AAPL, NVDA, and MSFT. "
            "Assess concentration risk across sectors. Provide specific rebalancing recommendations "
            "with target allocation percentages."
        )

        analysis_result = None
        review_result = None
        judgment_result = None
        loop_count = 0

        for loop_idx in range(MAX_JUDGE_LOOPS):
            loop_count = loop_idx + 1

            # --- Step 1: Stock Analyst ---
            coordinator_client.log("manual", {
                "phase": "stock_analyst",
                "loop": loop_idx + 1,
                "query": current_query,
            })

            analysis_result = run_stock_analysis(connector, query=current_query)
            trace.append({
                "loop": loop_idx + 1,
                "phase": "analysis",
                "agent": "stock-analyst",
                "result": analysis_result,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })

            # --- Step 2: Reviewer ---
            coordinator_client.log("manual", {
                "phase": "reviewer",
                "loop": loop_idx + 1,
            })

            review_result = run_review(connector, analysis_result)
            trace.append({
                "loop": loop_idx + 1,
                "phase": "review",
                "agent": "reviewer",
                "result": review_result,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })

            # --- Step 3: Judge ---
            coordinator_client.log("manual", {
                "phase": "judge",
                "loop": loop_idx + 1,
            })

            judgment_result = run_judgment(connector, analysis_result, review_result)
            trace.append({
                "loop": loop_idx + 1,
                "phase": "judgment",
                "agent": "judge",
                "result": judgment_result,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })

            coordinator_client.log("manual", {
                "phase": "judge_result",
                "loop": loop_idx + 1,
                "verdict": judgment_result.get("verdict"),
                "reason": judgment_result.get("reason"),
            })

            if judgment_result.get("verdict") == "approved":
                break

            # If rejected and we have a rerun query, use it
            if judgment_result.get("rerun_query"):
                current_query = judgment_result["rerun_query"]

        coordinator_client.log("chain_end", {
            "total_loops": loop_count,
            "final_verdict": judgment_result.get("verdict") if judgment_result else "unknown",
            "analysis_summary": (analysis_result.get("response", "")[:200] + "...")
                if analysis_result else "no analysis",
        })

    return {
        "session_id": session_id,
        "total_loops": loop_count,
        "final_analysis": analysis_result,
        "final_review": review_result,
        "final_judgment": judgment_result,
        "trace": trace,
        "status": "completed",
    }
