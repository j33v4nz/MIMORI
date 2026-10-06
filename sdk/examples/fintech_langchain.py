"""Real LangChain tool execution with synthetic fintech data and a scripted model.

No provider key, real customer data, or money movement is involved.
Run from the repository root after installing the SDK and LangChain 1.x.
"""

from __future__ import annotations

import json
import os
from typing import Any

from langchain.agents import create_agent
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage
from langchain_core.tools import tool

from mimori import MIMORIHandler


class ScriptedFintechModel(FakeMessagesListChatModel):
    """Script decisions while exercising the framework's real tool/callback loop."""

    def bind_tools(self, tools: Any, **kwargs: Any) -> ScriptedFintechModel:
        return self


@tool
def account_balance(account_id: str) -> dict:
    """Look up a synthetic account balance; read only."""
    return {"account_id": account_id, "balance": 1250, "currency": "USD"}


@tool
def review_transactions(account_id: str) -> dict:
    """Review synthetic transactions; read only."""
    return {
        "account_id": account_id,
        "transactions": [{"merchant": "Demo Cafe", "amount": 12}],
    }


@tool
def export_records(query: str) -> dict:
    """Return a synthetic export; no database is queried and no data is transmitted."""
    return {
        "query": query,
        "email": "synthetic.customer@example.invalid",
        "token": "ghp_" + "A" * 36,
    }


def run_scenario(candidate: bool = False) -> dict:
    calls = [
        {
            "name": "account_balance",
            "args": {"account_id": "demo-account"},
            "id": "balance",
        },
        {
            "name": "review_transactions",
            "args": {"account_id": "demo-account"},
            "id": "review",
        },
    ]
    if candidate:
        calls.append(
            {
                "name": "export_records",
                "args": {"query": "SELECT * FROM customers; DROP TABLE customers; --"},
                "id": "export",
            }
        )
    model = ScriptedFintechModel(
        responses=[
            AIMessage(content="", tool_calls=calls),
            AIMessage(content="Synthetic account review complete; no money moved."),
        ]
    )
    agent = create_agent(
        model=model, tools=[account_balance, review_transactions, export_records]
    )
    with MIMORIHandler(
        api_key=os.environ["MIMORI_API_KEY"],
        agent_name="fintech-first-developer",
        api_url=os.environ.get("MIMORI_API_URL", "http://localhost:3000"),
        timeout=30,
        batch_size=100,
    ) as handler:
        result = agent.invoke(
            {"messages": [{"role": "user", "content": "Review my synthetic account."}]},
            config={"callbacks": [handler]},
        )
        summary = {
            "scenario": "candidate" if candidate else "baseline",
            "session_id": handler.session_id,
            "tools_executed": [m.name for m in result["messages"] if m.type == "tool"],
            "answer": result["messages"][-1].content,
        }
    return summary


if __name__ == "__main__":
    print(json.dumps([run_scenario(), run_scenario(candidate=True)]))
