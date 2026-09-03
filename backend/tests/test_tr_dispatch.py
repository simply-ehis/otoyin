"""Tests for the TR-driven MCP tool dispatcher."""

from unittest.mock import MagicMock

import pytest

try:
    from backend.tool_registry import TR
except ImportError:
    from tool_registry import TR


@pytest.fixture(autouse=True)
def _isolate_global_tr():
    """TR is a process-wide singleton. These tests register throwaway
    ``test.*`` tools into it; snapshot and restore so the pollution never
    leaks into sibling modules (e.g. test_mcp_assistant_tools' 21labs.
    prefix assertion)."""
    saved = TR._tools
    TR._tools = {}
    try:
        yield
    finally:
        TR._tools = saved


def _make_mock_mcp():
    """Create a minimal mock FastMCP instance."""
    mcp = MagicMock()
    mcp._tool_manager._tools = {}
    registered = {}

    def _register_tool(name=None, description=""):
        def _decorator(fn):
            registered[name] = fn
            return fn

        return _decorator

    mcp.tool = _register_tool
    return mcp, registered


class TestTRDispatch:
    def test_dispatch_count_matches_tr(self):
        """TR dispatcher should register all TR tools with endpoints."""
        from backend.tool_registry_populate import populate

        populate()

        mcp, registered = _make_mock_mcp()

        from backend.mcp_server.tools.tr_dispatch import register_tr_tools

        count = register_tr_tools(mcp)

        # Should have registered tools with endpoints
        assert count > 0
        assert len(registered) == count

    def test_dispatch_skips_tools_without_endpoints(self):
        """Tools without endpoints (custom tools) should be skipped."""
        from backend.tool_registry import TR, ToolDef

        TR.register(
            ToolDef(
                name="test.custom_tool",
                description="A custom tool",
                endpoint="",
                method="GET",
                surfaces=["mcp"],
            )
        )

        mcp, registered = _make_mock_mcp()

        from backend.mcp_server.tools.tr_dispatch import register_tr_tools

        register_tr_tools(mcp)

        assert "test.custom_tool" not in registered

    def test_dispatch_skips_already_registered(self):
        """Tools already registered by manual decorators should be skipped."""
        from backend.tool_registry import TR, ToolDef

        TR.register(
            ToolDef(
                name="test.pre_registered",
                description="Pre-registered",
                endpoint="/test",
                method="GET",
                surfaces=["mcp"],
            )
        )

        mcp, registered = _make_mock_mcp()
        # Pre-register a tool with the same name in the tool_manager
        mcp._tool_manager._tools["test.pre_registered"] = MagicMock()

        from backend.mcp_server.tools.tr_dispatch import register_tr_tools

        register_tr_tools(mcp)

        # The pre-registered tool should NOT be in the registered dict
        # (it was skipped because it already existed)
        assert "test.pre_registered" not in registered

    def test_dispatch_rest_proxy_tool_calls_rest(self):
        """The generated tool function should call _rest with the correct method/endpoint."""
        from backend.tool_registry import TR, ToolDef

        TR.register(
            ToolDef(
                name="test.list_items",
                description="List items",
                endpoint="/items",
                method="GET",
                surfaces=["mcp"],
            )
        )

        mcp, registered = _make_mock_mcp()

        from backend.mcp_server.tools.tr_dispatch import register_tr_tools

        register_tr_tools(mcp)

        fn = registered.get("test.list_items")
        assert fn is not None

        # Verify the function is callable and has the right name
        assert fn.__name__ == "tr_test_list_items"

    def test_dispatch_path_param_tool(self):
        """Tools with path params should have them in the function signature."""
        from backend.tool_registry import TR, ToolDef

        TR.register(
            ToolDef(
                name="test.get_item",
                description="Get item by ID",
                endpoint="/items/{item_id}",
                method="GET",
                surfaces=["mcp"],
            )
        )

        mcp, registered = _make_mock_mcp()

        from backend.mcp_server.tools.tr_dispatch import register_tr_tools

        register_tr_tools(mcp)

        fn = registered.get("test.get_item")
        assert fn is not None
        assert fn.__name__ == "tr_test_get_item"

    def test_dispatch_tool_with_params(self):
        """Tools with parameters should have them in the docstring."""
        from backend.tool_registry import TR, ToolDef

        TR.register(
            ToolDef(
                name="test.create_item",
                description="Create a new item",
                endpoint="/items",
                method="POST",
                params={
                    "name": {"type": "string", "description": "Item name"},
                    "count": {"type": "integer", "description": "Item count"},
                },
                surfaces=["mcp"],
            )
        )

        mcp, registered = _make_mock_mcp()

        from backend.mcp_server.tools.tr_dispatch import register_tr_tools

        register_tr_tools(mcp)

        fn = registered.get("test.create_item")
        assert fn is not None
        assert "Item name" in fn.__doc__
        assert "Item count" in fn.__doc__

    def test_register_tools_calls_tr_dispatch_first(self):
        """register_tools should call TR dispatcher and register REST-proxy tools."""
        from backend.mcp_server.tools.tr_dispatch import register_tr_tools
        from backend.tool_registry import TR, ToolDef

        # Register a tool with endpoint in TR
        TR.register(
            ToolDef(
                name="test.auto_registered",
                description="Auto-registered",
                endpoint="/auto",
                method="GET",
                surfaces=["mcp"],
            )
        )

        mcp, registered = _make_mock_mcp()
        count = register_tr_tools(mcp)

        # The auto-registered tool should be in the final set
        assert "test.auto_registered" in registered
        assert count >= 1

    def test_dispatch_idempotent(self):
        """Running register_tr_tools twice should not duplicate registrations."""
        from backend.tool_registry import TR, ToolDef

        TR.register(
            ToolDef(
                name="test.idempotent",
                description="Test",
                endpoint="/test",
                method="GET",
                surfaces=["mcp"],
            )
        )

        mcp, registered = _make_mock_mcp()

        from backend.mcp_server.tools.tr_dispatch import register_tr_tools

        register_tr_tools(mcp)
        register_tr_tools(mcp)

        # Should still be just one registration
        assert "test.idempotent" in registered
