"""MIMORI Multi-Agent System — Entry point.

Runs the 5-agent workflow:
  1. Stock Analyst (LangChain) — produces financial analysis
  2. MIMORI Connector — sends all telemetry to MIMORI dashboard
  3. Reviewer — checks for errors, quality, security issues
  4. Judge — decides if approved or needs re-run
  5. Coordinator — orchestrates the loop

Usage:
    python -m examples.multiagent.main
    python -m examples.multiagent.main --query "Analyze NVDA risk exposure"
    MAX_JUDGE_LOOPS=5 python -m examples.multiagent.main
"""

from __future__ import annotations

import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from examples.multiagent.coordinator import run_coordinator


def main() -> None:
    parser = argparse.ArgumentParser(description="MIMORI Multi-Agent Stock Analysis System")
    parser.add_argument(
        "--query", "-q",
        type=str,
        default=None,
        help="Custom analysis query for the stock analyst agent",
    )
    parser.add_argument(
        "--json", "-j",
        action="store_true",
        help="Output full result as JSON",
    )
    args = parser.parse_args()

    print("=" * 70)
    print("  MIMORI MULTI-AGENT SYSTEM")
    print("  Stock Analysis -> Review -> Judge -> Loop")
    print("=" * 70)
    print()

    result = run_coordinator(query=args.query)

    if args.json:
        print(json.dumps(result, indent=2, default=str))
        return

    # --- Pretty print results ---
    print(f"Session:      {result['session_id']}")
    print(f"Total Loops:  {result['total_loops']}")
    print(f"Status:       {result['status']}")
    print()

    # Final analysis
    if result.get("final_analysis"):
        analysis = result["final_analysis"]
        print("--- STOCK ANALYSIS ---")
        print(analysis.get("response", "(no response)"))
        print()
        if analysis.get("tool_trace"):
            print(f"Tools Used: {len(analysis['tool_trace'])}")
            for t in analysis["tool_trace"]:
                print(f"  [{t['tool']}] {json.dumps(t['args'], default=str)[:80]}")
            print()

    # Final review
    if result.get("final_review"):
        review = result["final_review"]
        print(f"--- REVIEW (Score: {review['score']}/100) ---")
        print(f"Passed: {review['passed']}")
        if review.get("issues"):
            print(f"Issues ({len(review['issues'])}):")
            for issue in review["issues"]:
                print(f"  [{issue['severity'].upper()}] {issue['type']}: {issue['detail']}")
        if review.get("warnings"):
            print(f"Warnings ({len(review['warnings'])}):")
            for w in review["warnings"]:
                print(f"  - {w}")
        print()

    # Final judgment
    if result.get("final_judgment"):
        judgment = result["final_judgment"]
        print(f"--- JUDGMENT: {judgment['verdict'].upper()} ---")
        print(f"Reason: {judgment['reason']}")
        print()

    # Trace summary
    if result.get("trace"):
        print(f"--- TRACE ({len(result['trace'])} events) ---")
        for entry in result["trace"]:
            print(f"  Loop {entry['loop']} | {entry['phase']:12} | {entry['agent']:16} | {entry['timestamp']}")

    print()
    print("=" * 70)
    print(f"  Dashboard: http://localhost:3000/events")
    print("=" * 70)


if __name__ == "__main__":
    main()
