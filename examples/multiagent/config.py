"""Shared configuration for the MIMORI multi-agent system."""

import os
import uuid

MIMORI_API_KEY = os.environ.get(
    "MIMORI_DEV_API_KEY", ""
)
MIMORI_API_URL = os.environ.get("MIMORI_API_URL", "http://localhost:3000")

MAX_JUDGE_LOOPS = int(os.environ.get("MAX_JUDGE_LOOPS", "3"))
LLM_MODEL = os.environ.get("STOCK_LLM_MODEL", "gpt-4o-mini")
LLM_TEMPERATURE = 0.1


def new_session_id() -> str:
    return f"agent_{uuid.uuid4().hex[:8]}"
