"""Run a synthetic custom Python tool loop without an agent framework or model."""

from __future__ import annotations

import json
import os
from uuid import uuid4

from mimori import MIMORIClient


def account_balance(account_id: str) -> dict:
    """Return an inert fixture, never a bank connection."""
    return {"account_id": account_id, "balance": 1250, "currency": "USD"}


def main() -> None:
    key = os.environ.get("MIMORI_API_KEY") or os.environ.get("MIMORI_DEV_API_KEY")
    if not key:
        raise SystemExit("Set MIMORI_API_KEY to a key generated in your dashboard.")
    session = os.environ.get("MIMORI_SESSION_ID") or str(uuid4())
    with MIMORIClient(
        api_key=key,
        api_url=os.environ.get("MIMORI_API_URL", "http://localhost:3000"),
        agent_name="custom-python-agent",
        framework="custom-python",
        session_id=session,
        auto_start=False,
        timeout=30,
    ) as client:
        client.log("chain_start", {"name": "account_review", "input": "demo-account"})
        client.log(
            "tool_start",
            {
                "tool": {"name": "account_balance"},
                "input": {"account_id": "demo-account"},
            },
        )
        result = account_balance("demo-account")
        client.log("tool_end", {"tool": {"name": "account_balance"}, "output": result})
        client.log(
            "chain_end",
            {"name": "account_review", "output": "Synthetic account reviewed"},
        )
    # Telemetry is fail-open; inspect the dashboard to confirm delivery.
    print(
        json.dumps(
            {
                "session_id": session,
                "agent_name": "custom-python-agent",
                "tools": ["account_balance"],
            }
        )
    )


if __name__ == "__main__":
    main()
