"""MCP tool count verification.

Ensures the registered MCP tool count never drops below the documented
minimum. This catches accidental regressions when refactoring tool modules.
"""

import asyncio
import importlib

import pytest
from fastmcp import FastMCP


def _count_registered_tools() -> int:
    """Count tools registered by the MCP server without starting the server."""
    mcp = FastMCP(name="test-count")
    mod = importlib.import_module("backend.mcp_server.tools")
    mod.register_tools(mcp)
    tools = asyncio.run(mcp.list_tools())
    return len(tools)


# Minimum tool count — bump this when adding new tools.
# As of 2026-08-20 the count is 111. Set floor 5 below documented minimum
# to allow minor refactors without flaking, but catch real regressions.
_MIN_TOOL_COUNT = 106


@pytest.mark.skipif(
    importlib.util.find_spec("fastmcp") is None,
    reason="fastmcp not installed",
)
def test_mcp_tool_count_floor():
    """Registered tool count must meet the documented minimum."""
    count = _count_registered_tools()
    assert count >= _MIN_TOOL_COUNT, (
        f"MCP tool count dropped to {count} (minimum {_MIN_TOOL_COUNT}). "
        "If you intentionally removed tools, update _MIN_TOOL_COUNT."
    )
