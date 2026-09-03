"""Tool execution helpers — thin facade over focused sub-modules.

This module re-exports the public API from the sub-modules so existing
imports (``from .execution import execute_tool, sse_event, ...``) keep
working unchanged.

Sub-modules:
  url_builder.py  — URL templating and path validation
  validator.py    — Argument validation and tool similarity
  dispatcher.py   — HTTP dispatch and parallel execution
  formatter.py    — SSE and error formatting
"""

import httpx  # noqa: F401 — re-exported for tests that monkeypatch exe.httpx

# Re-export public API from sub-modules for backward compatibility
from .dispatcher import PARALLEL_SAFE_TOOLS, execute_tool, execute_tools_parallel  # noqa: F401
from .formatter import format_tool_error, sse_event  # noqa: F401
from .mappings import ENDPOINT_MAP, TOOL_METHODS  # noqa: F401
from .schemas import TOOLS
from .url_builder import PATH_ARG_KEYS, build_url  # noqa: F401
from .validator import validate_args

# Backward-compatible aliases for private names used in tests
_validate_args = validate_args
_PARALLEL_SAFE_TOOLS = PARALLEL_SAFE_TOOLS
_TOOL_REQUIRED = {}
for _t in TOOLS:
    _fn = _t.get("function", {})
    _name = _fn.get("name")
    _req = (_fn.get("parameters", {}) or {}).get("required", [])
    if _name:
        _TOOL_REQUIRED[_name] = list(_req)
