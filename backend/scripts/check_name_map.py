"""CI check: validate that every MCP tool in the registry has a NAME_MAP entry.

Run from the project root:
    python -m backend.scripts.check_name_map

Exits 0 if all MCP tools are mapped, 1 if any are missing.
This prevents new MCP tools from being added without a corresponding
NAME_MAP entry (which is needed for the TR dispatcher to resolve endpoints).
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure backend is importable from project root
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


def check_name_map() -> list[str]:
    """Check all MCP tools have NAME_MAP entries. Returns list of unmapped names."""
    from backend.tool_registry import TR
    from backend.tool_registry_populate import populate

    # Reset and populate fresh
    TR._tools.clear()
    populate()

    from backend.routes.assistant_tools.mappings import NAME_MAP

    unmapped = [t.name for t in TR.for_surface("mcp") if t.name not in NAME_MAP]
    return unmapped


def main() -> int:
    unmapped = check_name_map()
    if unmapped:
        print(f"FAIL: {len(unmapped)} MCP tool(s) missing NAME_MAP entry:")
        for name in sorted(unmapped):
            print(f"  - {name}")
        print()
        print("Fix: Add these to NAME_MAP in routes/assistant_tools/mappings.py")
        print("  Convention: 21labs.foo_bar → foo_bar (auto-generated)")
        print('  Override:   "21labs.custom_name": "endpoint_key" (explicit)')
        print('  MCP-only:   "21labs.custom_name": None (no REST endpoint)')
        return 1

    from backend.tool_registry import TR as _TR

    mcp_count = len(_TR.for_surface("mcp"))
    print(f"OK: {mcp_count} MCP tools, all have NAME_MAP entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
