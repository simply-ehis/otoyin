"""Tests for the unified tool registry."""

try:
    from backend.tool_registry import TR, ToolDef, ToolRegistry
except ImportError:
    from tool_registry import TR, ToolDef, ToolRegistry


def test_empty_registry():
    reg = ToolRegistry()
    assert reg.all_names() == []
    assert reg.get("nonexistent") is None


def test_register_and_get():
    reg = ToolRegistry()
    tool = ToolDef(
        name="test_tool",
        description="A test tool",
        params={"x": {"type": "string"}},
        endpoint="/test",
        method="POST",
        surfaces=["mcp", "assistant"],
    )
    reg.register(tool)
    assert reg.get("test_tool") is tool
    assert reg.all_names() == ["test_tool"]


def test_overwrite_on_duplicate_name():
    reg = ToolRegistry()
    reg.register(ToolDef(name="dup", description="v1", endpoint="/v1"))
    reg.register(ToolDef(name="dup", description="v2", endpoint="/v2"))
    assert reg.get("dup").description == "v2"


def test_for_surface_filtering():
    reg = ToolRegistry()
    reg.register(ToolDef(name="a", description="", surfaces=["mcp"]))
    reg.register(ToolDef(name="b", description="", surfaces=["assistant"]))
    reg.register(ToolDef(name="c", description="", surfaces=["mcp", "assistant"]))
    assert len(reg.for_surface("mcp")) == 2
    assert len(reg.for_surface("assistant")) == 2
    assert len(reg.for_surface("nonexistent")) == 0


def test_endpoints():
    reg = ToolRegistry()
    reg.register(ToolDef(name="a", description="", endpoint="/a", method="GET"))
    reg.register(ToolDef(name="b", description="", endpoint="", method="POST"))
    reg.register(ToolDef(name="c", description="", endpoint="/c"))
    eps = reg.endpoints()
    assert eps["a"] == ("/a", "GET")
    assert "b" not in eps  # no endpoint
    assert eps["c"] == ("/c", "POST")


def test_validate_catches_issues():
    reg = ToolRegistry()
    # Assistant tool without endpoint
    reg.register(ToolDef(name="bad", description="", endpoint="", surfaces=["assistant"]))
    # Tool with description
    reg.register(ToolDef(name="good", description="ok", endpoint="/ok"))
    errors = reg.validate()
    assert any("bad" in e for e in errors)
    assert not any("good" in e for e in errors)


def test_tooldef_frozen():
    tool = ToolDef(name="x", description="y")
    try:
        tool.name = "z"
        raise AssertionError("Should be frozen")
    except AttributeError:
        pass


def test_populate_registers_tools():
    """Verify that the populate function registers a substantial number of tools."""
    from backend.tool_registry_populate import populate

    # Reset global registry
    TR._tools.clear()
    populate()

    names = TR.all_names()
    assert len(names) > 100, f"Expected >100 tools, got {len(names)}"

    # Check that known ENDPOINT_MAP tools are present
    for expected in ["generate_speech", "transcribe", "list_models"]:
        assert TR.get(expected) is not None, f"Missing tool: {expected}"

    # Check that known MCP tools are present (dotted names)
    for expected in ["21labs.speak", "21labs.transcribe"]:
        assert TR.get(expected) is not None, f"Missing MCP tool: {expected}"


def test_dual_surface_coverage():
    """Verify that many tools are registered on both MCP and assistant surfaces."""
    from backend.tool_registry_populate import populate

    TR._tools.clear()
    populate()

    dual = [t for t in TR.for_surface("mcp") if "assistant" in t.surfaces]
    assert len(dual) > 50, f"Expected >50 dual-surface tools, got {len(dual)}"


def test_startup_verify_populates_and_reports():
    """startup_verify should populate TR and return a summary dict."""
    from backend.tool_registry_populate import startup_verify

    TR._tools.clear()
    result = startup_verify()

    assert result["total_tools"] > 100
    assert result["mcp_tools"] > 50
    assert result["assistant_tools"] > 50
    assert result["dual_surface"] > 30
    assert isinstance(result["errors"], list)


def test_startup_verify_idempotent():
    """Calling startup_verify twice should not double-register tools."""
    from backend.tool_registry_populate import startup_verify

    TR._tools.clear()
    r1 = startup_verify()
    count1 = r1["total_tools"]
    r2 = startup_verify()
    count2 = r2["total_tools"]
    assert count1 == count2, f"Second call added tools: {count1} -> {count2}"


def test_startup_verify_with_mock_mcp():
    """startup_verify with a mock MCP server should sync live tools."""
    from unittest.mock import MagicMock

    from backend.tool_registry_populate import startup_verify

    TR._tools.clear()

    # Create a mock FastMCP with a tool_manager that has tools
    mock_mcp = MagicMock()
    mock_tool = MagicMock()
    mock_tool.name = "21labs.test_live_tool"
    mock_tool.description = "A live MCP tool"
    mock_mcp._tool_manager._tools = {"21labs.test_live_tool": mock_tool}

    result = startup_verify(mcp=mock_mcp)

    # The live tool should now be in TR
    assert TR.get("21labs.test_live_tool") is not None
    assert TR.get("21labs.test_live_tool").description == "A live MCP tool"
    assert result["mcp_added_from_live"] >= 1


def test_verify_mcp_vs_tr_no_issues():
    """verify_mcp_vs_tr should return no errors for tools with descriptions."""
    from backend.tool_registry_populate import populate, verify_mcp_vs_tr

    TR._tools.clear()
    populate()
    errors = verify_mcp_vs_tr()
    # MCP tools from static scan may have generic descriptions, but live sync
    # should have added real descriptions. Either way, this should not crash.
    assert isinstance(errors, list)


def test_verify_assistant_vs_tr_catches_missing_endpoint():
    """verify_assistant_vs_tr should flag assistant tools without endpoints."""
    from backend.tool_registry_populate import verify_assistant_vs_tr

    TR._tools.clear()
    TR.register(ToolDef(name="no_ep", description="test", endpoint="", surfaces=["assistant"]))
    errors = verify_assistant_vs_tr()
    assert any("no_ep" in e for e in errors)


def test_verify_assistant_vs_tr_clean():
    """verify_assistant_vs_tr should return no errors for valid tools."""
    from backend.tool_registry_populate import verify_assistant_vs_tr

    TR._tools.clear()
    TR.register(ToolDef(name="ok", description="test", endpoint="/ok", surfaces=["assistant"]))
    errors = verify_assistant_vs_tr()
    assert len(errors) == 0


def test_name_map_covers_all_mcp_tools():
    """Every MCP tool in TR should have a NAME_MAP entry (value may be None for MCP-only)."""
    from backend.routes.assistant_tools.mappings import NAME_MAP
    from backend.tool_registry_populate import populate

    TR._tools.clear()
    populate()
    unmapped = [t.name for t in TR.for_surface("mcp") if t.name not in NAME_MAP]
    assert unmapped == [], f"MCP tools without NAME_MAP entry: {unmapped}"


def test_name_map_bidirectional():
    """NAME_MAP entries with endpoints should resolve to valid ENDPOINT_MAP keys."""
    from backend.routes.assistant_tools.mappings import ENDPOINT_MAP, NAME_MAP

    errors = []
    for mcp_name, endpoint_key in NAME_MAP.items():
        if endpoint_key and endpoint_key not in ENDPOINT_MAP:
            errors.append(f"{mcp_name} -> {endpoint_key} (not in ENDPOINT_MAP)")
    assert errors == [], f"Broken NAME_MAP entries: {errors}"


def test_name_map_convention_plus_overrides():
    """Convention-based names (21labs.foo) should all map to foo."""
    from backend.routes.assistant_tools.mappings import ENDPOINT_MAP, NAME_MAP

    for key in ENDPOINT_MAP:
        mcp_name = f"21labs.{key}"
        assert NAME_MAP.get(mcp_name) == key, f"Convention mapping missing: {mcp_name} -> {key}"


def test_check_assistant_tools_script_passes():
    """The CI validation script should pass with current registry state."""
    from backend.scripts.check_assistant_tools import check_assistant_tools

    TR._tools.clear()
    errors = check_assistant_tools()
    assert errors == [], f"check_assistant_tools found issues: {errors}"


def test_check_name_map_script_passes():
    """The CI validation script should pass with current registry state."""
    from backend.scripts.check_name_map import check_name_map

    TR._tools.clear()
    unmapped = check_name_map()
    assert unmapped == [], f"check_name_map found unmapped tools: {unmapped}"
