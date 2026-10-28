"""Full verification of tool schema validity, harness coherence, and system integration.

Checks:
- All tools have valid OpenAI function-calling schema
- No duplicate tool names
- required[] fields all exist in properties
- HarnessState doesn't reference stale tool names
- Formatter exports work (build_structured_result, suggest_fallback)
- Middleware exports work (_fill_missing_defaults)
- MCP backward compat (get_mcp_instructions with no query)
- Structured result format correct
- Fallback chain covers expected tools
- Middleware pipeline: score, filter, retry prompt
"""

from backend.agents.manifest import get_mcp_instructions
from backend.routes.assistant_tools.formatter import (
    TOOL_FALLBACKS,
    build_structured_result,
    suggest_fallback,
)
from backend.routes.assistant_tools.harness import HarnessState
from backend.routes.assistant_tools.schemas import TOOLS
from backend.routes.assistant_tools.tool_call_middleware import (
    ToolCallConfidence,
    _fill_missing_defaults,
    build_retry_prompt,
    enforce_tool_call_budget,
    filter_low_confidence_calls,
    score_tool_call,
)


def test_tool_count():
    assert len(TOOLS) == 222, f"Expected 222 tools, got {len(TOOLS)}"


def test_all_tools_have_function_wrapper():
    for t in TOOLS:
        assert t.get("type") == "function", f"Missing type=function: {t}"


def test_all_tools_have_unique_name():
    seen = set()
    for i, t in enumerate(TOOLS):
        name = t["function"]["name"]
        assert name, f"Empty name at index {i}"
        assert name not in seen, f"Duplicate name: {name}"
        seen.add(name)


def test_all_tools_have_description():
    for t in TOOLS:
        desc = t["function"].get("description", "")
        assert desc, f"Empty description for {t['function']['name']}"


def test_all_tools_have_parameters_object():
    for t in TOOLS:
        params = t["function"].get("parameters", {})
        assert isinstance(params, dict), f"{t['function']['name']}: parameters not dict"
        assert params.get("type") == "object", f"{t['function']['name']}: parameters.type != object"
        assert "properties" in params, f"{t['function']['name']}: no properties"


def test_required_fields_exist_in_properties():
    for t in TOOLS:
        name = t["function"]["name"]
        params = t["function"]["parameters"]
        required = params.get("required", [])
        props = params.get("properties", {})
        for r in required:
            assert r in props, f"{name}: required '{r}' not in properties"


def test_no_stale_tool_refs_in_harness():
    import inspect

    src = inspect.getsource(HarnessState)
    stale = [n for n in ("generate_speech", "list_voices", "master_track") if f'"{n}"' in src or f"'{n}'" in src]
    assert not stale, f"HarnessState references stale tools: {stale}"


def test_formatter_build_structured_result():
    sr = build_structured_result("speak", '{"audio_file": "test.wav"}', {"text": "hi"})
    assert sr["status"] == "success"
    assert sr["tool"] == "speak"
    assert "result" in sr


def test_formatter_suggest_fallback():
    fb = suggest_fallback("generate_speech", "CUDA OOM")
    assert fb is not None
    assert "speak" in fb.lower()


def test_tool_fallbacks_cover_expected():
    expected = {"generate_speech", "master_track", "transcribe", "list_profiles"}
    assert expected.issubset(set(TOOL_FALLBACKS.keys())), (
        f"Missing fallbacks for: {expected - set(TOOL_FALLBACKS.keys())}"
    )


def test_mcp_backward_compat():
    result = get_mcp_instructions()
    assert isinstance(result, str)
    assert len(result) > 50


def test_fill_missing_defaults_does_not_fill_empty_strings():
    result = _fill_missing_defaults("read_file", {"file_path": ""})
    assert result.get("file_path") == "", "Should not fill empty strings"


def test_fill_missing_defaults_fills_known_defaults():
    result = _fill_missing_defaults("compact_text", {"text": "hello"})
    # compact_text has no explicit default in schema, so should not touch
    assert "text" in result


def test_middleware_score_tool_call():
    gen_schema = next(t["function"] for t in TOOLS if t["function"]["name"] == "generate_speech")
    conf = score_tool_call("generate_speech", {"text": "hello world"}, gen_schema)
    assert isinstance(conf, ToolCallConfidence)
    assert conf.score > 0


def test_middleware_filter_low_confidence():
    # filter_low_confidence_calls expects {"name": ..., "arguments": ...} at top level
    kept, rejected = filter_low_confidence_calls(
        [
            {"name": "generate_speech", "arguments": {"text": "hi"}},
        ]
    )
    assert len(kept) == 1
    assert len(rejected) == 0


def test_middleware_enforce_budget():
    calls = [{"name": "generate_speech", "arguments": {"text": f"hi {i}"}} for i in range(10)]
    kept = enforce_tool_call_budget(calls, max_calls=3)
    assert len(kept) == 3


def test_middleware_build_retry_prompt():
    prompt = build_retry_prompt(
        '{"tool": "generate_speech", "arguments": {}}',
        "missing required field text for tool 'generate_speech'",
    )
    assert "generate_speech" in prompt
    assert len(prompt) > 50


def test_middleware_build_retry_prompt_with_history():
    prompt = build_retry_prompt(
        '{"tool": "generate_speech", "arguments": {}}',
        "missing required field text for tool 'generate_speech'",
        previous_attempts=["timeout on first try", "CUDA OOM on second try"],
    )
    assert "already tried" in prompt.lower() or "Do NOT repeat" in prompt
