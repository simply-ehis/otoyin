"""Tests for the planner tool-call GBNF grammar builder."""

from __future__ import annotations

import pytest

from ..routes.assistant_tools.grammar import (
    build_tool_call_grammar,
    planner_grammar_enabled,
)
from ..routes.assistant_tools.schemas import TOOLS


def _tool_names() -> list[str]:
    return [t["function"]["name"] for t in TOOLS if t.get("function", {}).get("name")]


def test_grammar_builds_with_all_tool_names():
    grammar = build_tool_call_grammar(TOOLS)
    names = _tool_names()
    assert names, "TOOLS catalogue must be non-empty"
    for name in names:
        assert f'"{name}"' in grammar, f"tool name {name!r} missing from grammar"


def test_grammar_contains_root_and_json_rules():
    grammar = build_tool_call_grammar(TOOLS)
    assert "root ::=" in grammar
    assert "toolcall ::=" in grammar
    assert "toolname ::=" in grammar
    assert "json ::=" in grammar
    assert "object ::=" in grammar
    assert "array ::=" in grammar


def test_grammar_rejects_empty_tools():
    with pytest.raises(ValueError):
        build_tool_call_grammar([])


def test_grammar_longest_name_first_in_alternation():
    # Prefix-collision tools (e.g. "speak" vs "speak_with_voice") must have the
    # longer name appear first so GBNF alternation doesn't shadow it.
    tools = [
        {"function": {"name": "speak", "description": "x"}},
        {"function": {"name": "speak_with_voice", "description": "y"}},
    ]
    grammar = build_tool_call_grammar(tools)
    speak_idx = grammar.index('"speak"')
    speak_long_idx = grammar.index('"speak_with_voice"')
    assert speak_long_idx < speak_idx


def test_planner_grammar_enabled_defaults_off(monkeypatch):
    monkeypatch.delenv("TWENTYLABS_PLANNER_GRAMMAR", raising=False)
    assert planner_grammar_enabled() is False
    monkeypatch.setenv("TWENTYLABS_PLANNER_GRAMMAR", "1")
    assert planner_grammar_enabled() is True
