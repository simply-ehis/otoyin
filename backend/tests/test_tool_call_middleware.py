"""Unit tests for the assistant tool-call middleware.

Covers the parsing/repair strategies (fenced JSON, trailing commas, single
quotes, args-as-string) and the strict fuzzy name resolution (prefix match
or >=0.8 similarity — bare substring containment must not misroute short
names like ``speak``).
"""

import logging

from backend.routes.assistant_tools.tool_call_middleware import (
    _resolve_tool_name,
    parse_tool_calls,
    validate_tool_call,
)


def _wrap(inner: str) -> str:
    return f'{{"tool_calls": [{{"function": {inner}}}]}}'


def _call(name: str, args: str | dict | None = None) -> str:
    if args is None:
        args_str = "{}"
    elif isinstance(args, str):
        args_str = args
    else:
        import json

        args_str = json.dumps(args)
    return f'{{"name": "{name}", "arguments": {args_str}}}'


# ---------------------------------------------------------------------------
# Parsing strategies
# ---------------------------------------------------------------------------


def test_parses_fenced_json_block():
    raw = "Sure! Here is the call:\n```json\n" + _wrap(_call("list_voices")) + "\n```\nDone."
    calls = parse_tool_calls(raw)
    assert len(calls) == 1
    assert calls[0]["name"] == "list_voices"


def test_repairs_trailing_commas():
    raw = _wrap(_call("generate_speech", '{"text": "hi", "profile_id": "p1",}'))
    calls = parse_tool_calls(raw)
    assert calls[0]["arguments"]["text"] == "hi"


def test_repairs_single_quotes():
    raw = _wrap(_call("list_voices", "{'limit': 5}"))
    calls = parse_tool_calls(raw)
    assert calls[0]["arguments"]["limit"] == 5


def test_accepts_args_as_json_string():
    raw = _wrap(_call("list_voices", '"{\\"limit\\": 3}"'))
    calls = parse_tool_calls(raw)
    assert calls[0]["arguments"] == {"limit": 3}


def test_plain_text_returns_empty():
    assert parse_tool_calls("I can help with that — no tools needed.") == []


# ---------------------------------------------------------------------------
# Name resolution
# ---------------------------------------------------------------------------


def test_alias_typo_dash_resolves():
    assert _resolve_tool_name("generate-speech") == "generate_speech"


def test_spelled_typo_resolves_by_similarity():
    # one-letter typo: ratio >= 0.8
    assert _resolve_tool_name("generate_speach") == "generate_speech"


def test_truncated_prefix_resolves():
    assert _resolve_tool_name("generate_spe") == "generate_speech"


def test_short_substring_does_not_misroute():
    # "speak" is contained-ish in several names but must NOT be rewritten.
    assert _resolve_tool_name("speak") == "speak"
    assert validate_tool_call({"name": "speak", "arguments": {}}) == "Unknown tool: speak"


def test_unresolved_name_is_logged_with_raw_head(caplog):
    raw = _wrap(_call("totally_bogus_tool"))
    with caplog.at_level(logging.WARNING):
        calls = parse_tool_calls(raw)
    assert calls[0]["name"] == "totally_bogus_tool"
    assert any("Unresolved tool name" in r.message for r in caplog.records)
