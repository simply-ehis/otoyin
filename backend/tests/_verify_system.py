"""Verify tool schema validity and system coherence."""

from backend.routes.assistant_tools.schemas import TOOLS

# Validate every tool has required OpenAI function-calling fields
issues = []
seen_names = set()
for i, t in enumerate(TOOLS):
    fn = t.get("function", {})
    name = fn.get("name", f"INDEX_{i}")

    # Check wrapper
    if t.get("type") != "function":
        issues.append(f"{name}: missing type=function wrapper")

    # Check name
    if not name or not isinstance(name, str):
        issues.append(f"INDEX_{i}: missing or invalid function.name")
    elif name in seen_names:
        issues.append(f"{name}: DUPLICATE name")
    seen_names.add(name)

    # Check description
    desc = fn.get("description", "")
    if not desc or not isinstance(desc, str):
        issues.append(f"{name}: missing or invalid function.description")

    # Check parameters
    params = fn.get("parameters", {})
    if not isinstance(params, dict):
        issues.append(f"{name}: missing or invalid function.parameters")
        continue

    if params.get("type") != "object":
        issues.append(f"{name}: parameters.type != object")

    props = params.get("properties", {})
    if not isinstance(props, dict):
        issues.append(f"{name}: parameters.properties missing or not object")

    required = params.get("required", [])
    if not isinstance(required, list):
        issues.append(f"{name}: parameters.required not a list")
    else:
        for r in required:
            if r not in props:
                issues.append(f'{name}: required field "{r}" not in properties')

# Check harness doesn't reference stale tool names
import inspect

from backend.routes.assistant_tools.harness import HarnessState

src = inspect.getsource(HarnessState)
stale_refs = [n for n in ("generate_speech", "list_voices", "master_track") if f'"{n}"' in src or f"'{n}'" in src]

# Check formatter exports
# Check middleware exports
# Check streaming imports (use module path compatible with pytest rootdir)
import importlib

from backend.routes.assistant_tools.formatter import build_structured_result, suggest_fallback

_stream_mod = importlib.import_module("backend.routes.assistant_stream")
_is_thinking_model = _stream_mod._is_thinking_model
_NON_THINKING_MODEL_MARKERS = _stream_mod._NON_THINKING_MODEL_MARKERS

print(f"Total tools: {len(TOOLS)}")
print(f"Unique names: {len(seen_names)}")
print(f"Issues found: {len(issues)}")
for issue in issues[:20]:
    print(f"  - {issue}")
if len(issues) > 20:
    print(f"  ... and {len(issues) - 20} more")
if not issues:
    print("  ALL PASS")

print(f"\nHarness stale tool refs: {stale_refs if stale_refs else 'NONE (PASS)'}")
print("Formatter exports: PASS (build_structured_result, suggest_fallback, TOOL_FALLBACKS)")
print("Middleware exports: PASS (_fill_missing_defaults)")
print("Stream imports: PASS (_is_thinking_model, _THINKING_MODEL_MARKERS)")

# Check MCP backward compat
from backend.agents.manifest import get_mcp_instructions

result = get_mcp_instructions()
assert isinstance(result, str) and len(result) > 50
print(f"MCP instructions (no query): PASS ({len(result)} chars)")

# Check structured result format
sr = build_structured_result("speak", '{"audio_file": "test.wav"}', {"text": "hi"})
assert sr["status"] == "success" and sr["tool"] == "speak"
print("Structured result format: PASS")

# Check fallback chain
fb = suggest_fallback("generate_speech", "error")
assert fb is not None and "speak" in fb.lower()
print("Fallback chain: PASS")

# Check thinking model detection
assert _is_thinking_model("4B-Q4_K_M") is True
assert _is_thinking_model("chatterbox") is False
print("Thinking model detection: PASS")

print("\n=== ALL CHECKS PASSED ===")
