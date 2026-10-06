"""Application-granted exact tool calls; external content cannot add grants."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Iterable

from mimori.guardrail import _bounded_content_text


def _arguments_key(arguments: dict[str, Any]) -> str:
    if type(arguments) is not dict or any(type(key) is not str for key in arguments):
        raise ValueError("Tool arguments must be an object with string keys")
    _bounded_content_text(arguments)
    def validate(value: Any) -> None:
        if type(value) is dict:
            if any(type(key) is not str for key in value):
                raise ValueError("Nested argument keys must be strings")
            for child in value.values():
                validate(child)
        elif type(value) is list:
            for child in value:
                validate(child)
        elif type(value) not in (str, int, float, bool, type(None)):
            raise ValueError("Tool arguments must use JSON value types")
    validate(arguments)
    return json.dumps(arguments, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


@dataclass(frozen=True, slots=True, init=False)
class ToolCapabilityPolicy:
    """Immutable snapshot of exact tool calls approved by the application.

    Construct once per task from authenticated user intent or explicit approval.
    Do not build or extend grants from tool responses or model suggestions.
    Fields, destinations, amounts, and resource scope all participate in the
    match. More permissive application policies can use an authorization
    callback, but must validate all consequential arguments themselves.
    """

    _approved_calls: frozenset[tuple[str, str]]

    def __init__(self, approved_calls: Iterable[tuple[str, dict[str, Any]]]):
        calls = set()
        for name, arguments in approved_calls:
            if not isinstance(name, str) or not name.strip():
                raise ValueError("Approved tool name must be nonempty")
            calls.add((name, _arguments_key(arguments)))
        object.__setattr__(self, "_approved_calls", frozenset(calls))

    def allows(self, tool_name: str, arguments: dict[str, Any]) -> bool:
        try:
            return (tool_name, _arguments_key(arguments)) in self._approved_calls
        except (ValueError, TypeError, RecursionError):
            return False

    def allows_tool(self, tool_name: str) -> bool:
        """Name-only prefilter; never a replacement for allows on actual arguments."""
        return any(name == tool_name for name, _ in self._approved_calls)
