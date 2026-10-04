"""Judge Agent — evaluates the reviewer's assessment and decides next action.

Verdicts:
- "approved" — analysis passed review, no re-run needed
- "rejected" — critical issues found, analyst should re-run with corrections
- "escalated" — issues require human intervention
"""

from __future__ import annotations

from typing import Any

from examples.multiagent.mimori_connector import MIMORIConnector


def run_judgment(
    connector: MIMORIConnector,
    analysis_result: dict[str, Any],
    review_result: dict[str, Any],
) -> dict[str, Any]:
    """Judge whether the analysis passes or needs re-running."""
    client = connector.get_client("judge")

    client.log("chain_start", {
        "phase": "judgment",
        "review_score": review_result.get("score", 0),
    })

    score = review_result.get("score", 0)
    issues = review_result.get("issues", [])
    warnings = review_result.get("warnings", [])
    passed = review_result.get("passed", False)

    critical_issues = [i for i in issues if i.get("severity") == "critical"]
    high_issues = [i for i in issues if i.get("severity") == "high"]
    medium_issues = [i for i in issues if i.get("severity") == "medium"]

    # --- Decision logic ---
    if critical_issues:
        verdict = "rejected"
        reason = f"Critical security issues found: {', '.join(i['type'] for i in critical_issues)}"
        rerun_query = _build_rerun_query(analysis_result, critical_issues, "security")
    elif high_issues:
        verdict = "rejected"
        reason = f"High-severity quality issues: {', '.join(i['type'] for i in high_issues)}"
        rerun_query = _build_rerun_query(analysis_result, high_issues, "quality")
    elif score < 60:
        verdict = "rejected"
        reason = f"Overall quality score {score}/100 is below threshold (60)"
        rerun_query = _build_rerun_query(analysis_result, issues + [{"type": w} for w in warnings], "quality")
    elif score < 80 and medium_issues:
        verdict = "rejected"
        reason = f"Score {score}/100 with {len(medium_issues)} medium issues — retrying for improvement"
        rerun_query = _build_rerun_query(analysis_result, medium_issues, "improvement")
    elif warnings and score < 90:
        verdict = "rejected"
        reason = f"Score {score}/100 with {len(warnings)} warnings — retrying for completeness"
        rerun_query = _build_rerun_query(analysis_result, [{"type": w} for w in warnings], "completeness")
    else:
        verdict = "approved"
        reason = f"Analysis passed with score {score}/100. No critical issues."
        rerun_query = None

    judgment_result = {
        "verdict": verdict,
        "reason": reason,
        "score": score,
        "rerun_query": rerun_query,
        "critical_count": len(critical_issues),
        "high_count": len(high_issues),
        "medium_count": len(medium_issues),
        "warning_count": len(warnings),
    }

    client.log("chain_end", {
        "verdict": verdict,
        "reason": reason,
        "rerun_query": rerun_query[:100] + "..." if rerun_query and len(rerun_query) > 100 else rerun_query,
    })

    return judgment_result


def _build_rerun_query(
    analysis_result: dict[str, Any],
    issues: list[dict[str, Any]],
    issue_type: str,
) -> str:
    """Build a refined query for the analyst to re-run with corrections."""
    original_query = "Analyze my portfolio with emphasis on accuracy and completeness."
    current_response = analysis_result.get("response", "")

    issue_descriptions = []
    for issue in issues[:5]:
        issue_descriptions.append(f"- {issue.get('type', 'unknown')}: {issue.get('detail', 'no detail')}")

    issues_text = "\n".join(issue_descriptions)

    if issue_type == "security":
        return (
            f"{original_query}\n\n"
            f"PREVIOUS ANALYSIS HAD SECURITY ISSUES:\n{issues_text}\n\n"
            f"CRITICAL: Ensure your response contains NO external URLs, NO credential patterns, "
            f"NO prompt injection text. Only output analysis text and recommendations."
        )
    elif issue_type == "quality":
        return (
            f"{original_query}\n\n"
            f"PREVIOUS ANALYSIS HAD QUALITY ISSUES:\n{issues_text}\n\n"
            f"Please address each issue specifically. Use all relevant tools. "
            f"Provide specific numbers, percentages, and actionable recommendations."
        )
    else:
        return (
            f"{original_query}\n\n"
            f"PREVIOUS ANALYSIS NEEDS IMPROVEMENT:\n{issues_text}\n\n"
            f"Please provide a more thorough analysis addressing the noted issues. "
            f"Include more detail and specific data points."
        )
