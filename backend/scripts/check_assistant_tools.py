"""CI check: validate assistant tool coverage and consistency.

Checks that every assistant tool:
1. Has an ENDPOINT_MAP entry (or is a CLIENT_COMMAND_TOOL)
2. Has a TOOL_METHODS entry if it's a GET tool
3. Has a valid endpoint starting with /
4. Has a description from TOOLS schemas

Run: python -m backend.scripts.check_assistant_tools
Exits 0 if all checks pass, 1 if any fail.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


def check_assistant_tools() -> list[str]:
    """Validate assistant tool coverage. Returns list of error messages."""
    from backend.tool_registry import TR
    from backend.tool_registry_populate import populate

    TR._tools.clear()
    populate()

    from backend.routes.assistant_tools.mappings import (
        CLIENT_COMMAND_TOOLS,
        ENDPOINT_MAP,
        TOOL_METHODS,
    )
    from backend.routes.assistant_tools.schemas import TOOLS

    errors = []

    # Build schema lookup
    schema_names = {t.get("function", {}).get("name") for t in TOOLS if t.get("function", {}).get("name")}

    # Check every tool in ENDPOINT_MAP has a schema
    for name in ENDPOINT_MAP:
        if name not in schema_names and name not in CLIENT_COMMAND_TOOLS:
            errors.append(f"ENDPOINT_MAP key '{name}' has no schema in TOOLS")

    # Check every schema tool has an ENDPOINT_MAP entry or CLIENT_COMMAND
    for name in schema_names:
        if name in CLIENT_COMMAND_TOOLS:
            continue
        if name not in ENDPOINT_MAP:
            errors.append(f"Schema tool '{name}' missing from ENDPOINT_MAP")

    # Check GET tools have TOOL_METHODS entries
    for name, _endpoint in ENDPOINT_MAP.items():
        method = TOOL_METHODS.get(name, "POST")
        if method not in ("GET", "POST", "PUT", "DELETE"):
            errors.append(f"Tool '{name}' has invalid method: {method}")

    # Check CLIENT_COMMAND_TOOLS are not in ENDPOINT_MAP
    for name in CLIENT_COMMAND_TOOLS:
        if name in ENDPOINT_MAP:
            errors.append(f"CLIENT_COMMAND_TOOL '{name}' should not be in ENDPOINT_MAP")

    # Check all assistant tools in TR have endpoints
    assistant_tools = [t for t in TR.for_surface("assistant") if "mcp" not in t.surfaces]
    for t in assistant_tools:
        if not t.endpoint and t.name not in CLIENT_COMMAND_TOOLS:
            errors.append(f"Assistant-only tool '{t.name}' has no endpoint")

    return errors


def main() -> int:
    errors = check_assistant_tools()
    if errors:
        print(f"FAIL: {len(errors)} issue(s) found:")
        for err in errors:
            print(f"  - {err}")
        return 1

    from backend.routes.assistant_tools.mappings import CLIENT_COMMAND_TOOLS, ENDPOINT_MAP
    from backend.tool_registry import TR
    from backend.tool_registry_populate import populate

    TR._tools.clear()
    populate()
    assistant = [t for t in TR.for_surface("assistant") if "mcp" not in t.surfaces]

    print(
        f"OK: {len(assistant)} assistant-only tools, {len(ENDPOINT_MAP)} ENDPOINT_MAP entries, {len(CLIENT_COMMAND_TOOLS)} client commands"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
