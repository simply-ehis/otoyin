"""Parity guard: assistant canonical tools vs MCP-registered tools.

Backs ``GET /agents/parity`` (routes/assistant.py). The two surfaces are
intentionally separate today, but divergence must stay bounded and the core
tools must exist on the MCP side.
"""

from backend.agents import manifest


def test_parity_report_shape():
    report = manifest.get_tool_parity_report()
    assert set(report) == {
        "canonical_tool_count",
        "mcp_tool_count",
        "missing_in_mcp",
        "missing_in_assistant",
    }
    assert report["canonical_tool_count"] > 50
    assert report["mcp_tool_count"] > 50


def test_parity_missing_in_mcp_bounded():
    """The MCP gap may exist (studio/ADR/UI tools) but must stay bounded.

    If this fails after splitting/renaming MCP tool modules, the
    ``@mcp.tool`` scanner in manifest.py likely no longer matches the new
    formatting — fix the scanner, not the bound.
    """
    report = manifest.get_tool_parity_report()
    # The assistant surfaces agent-workflow tools (planner / acquire / adr
    # orchestration) that are intentionally internal and have no public MCP
    # equivalent — this is the "MCP gap" the docstring expects. Keep the bound
    # tight enough to flag runaway drift while allowing that category to grow.
    assert len(report["missing_in_mcp"]) <= 45


def test_core_tools_registered_on_mcp_surface():
    """The headline MCP tools must always be discoverable by the scanner."""
    mcp_names = manifest._collect_mcp_tool_names()
    for stem in ("speak", "transcribe", "list_profiles"):
        assert stem in mcp_names, f"{stem} missing from MCP tool scan"


def test_normalize_stem_strips_prefixes():
    assert manifest._normalize_stem("21labs.speak") == "speak"
    assert manifest._normalize_stem("21labs_speak") == "speak"
    assert manifest._normalize_stem("twentylabs_speak") == "speak"
    assert manifest._normalize_stem("speak") == "speak"
    assert manifest.MCP_NAME_PREFIX == "21labs."
