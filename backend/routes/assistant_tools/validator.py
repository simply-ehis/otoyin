"""Tool argument validation.

Validates required arguments, scans for path injection, and suggests
similar tool names when a tool is not found. Extracted from execution.py
for testability and separation of concerns.
"""

from __future__ import annotations

from .mappings import ENDPOINT_MAP
from .schemas import TOOLS
from .url_builder import check_unresolved_params, validate_paths

# Build a name -> required-args lookup from the canonical tool schemas.
_TOOL_REQUIRED: dict[str, list[str]] = {}
for _t in TOOLS:
    _fn = _t.get("function", {})
    _name = _fn.get("name")
    _req = (_fn.get("parameters", {}) or {}).get("required", [])
    if _name:
        _TOOL_REQUIRED[_name] = list(_req)


def validate_args(tool_name: str, args: dict) -> str | None:
    """Validate tool arguments. Returns an error string if validation fails, else None.

    Checks:
    1. Required arguments are present and non-empty
    2. Path-like arguments are safe (no traversal, no schemes, no absolutes)
    3. No unresolved {placeholders} remain in the endpoint
    """
    # 1. Required arguments
    for key in _TOOL_REQUIRED.get(tool_name, []):
        value = args.get(key)
        if value is None or value == "":
            similar = find_similar_tool(tool_name)
            hint = f" Similar tools: {', '.join(similar)}" if similar else ""
            return f"Missing required argument: {key}{hint}"

    # 2. Path sanitization
    path_err = validate_paths(args)
    if path_err:
        return path_err

    # 3. Unresolved placeholders
    endpoint = ENDPOINT_MAP.get(tool_name, "")
    unresolved_err = check_unresolved_params(endpoint, args)
    if unresolved_err:
        return unresolved_err

    return None


def find_similar_tool(name: str, max_results: int = 3) -> list[str]:
    """Find similar tool names for error suggestions using SequenceMatcher."""
    from difflib import SequenceMatcher

    candidates = []
    for tool in TOOLS:
        fn = tool.get("function", {})
        tname = fn.get("name", "")
        if tname:
            ratio = SequenceMatcher(None, name, tname).ratio()
            if ratio > 0.6:
                candidates.append((ratio, tname))
    candidates.sort(key=lambda x: -x[0])
    return [t[1] for t in candidates[:max_results]]
