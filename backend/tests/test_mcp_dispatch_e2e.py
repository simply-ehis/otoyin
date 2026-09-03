"""End-to-end tests for the MCP tool dispatch flow.

Covers the full lifecycle:
  1. Populate TR from ENDPOINT_MAP + MCP decorators
  2. Verify dual-surface coverage (200/200 MCP tools)
  3. Register tools via TR dispatcher into mock MCP
  4. Verify tool count matches
  5. Verify NAME_MAP coverage
  6. Verify assistant tools schema coverage
  7. Verify startup verification summary
"""

from backend.tool_registry import TR
from backend.tool_registry_populate import populate, startup_verify


class TestMCPDispatchE2E:
    """Full MCP dispatch lifecycle."""

    def setup_method(self):
        """Reset TR before each test."""
        TR._tools.clear()

    def test_populate_registers_all_tools(self):
        """populate() registers all tools from ENDPOINT_MAP + MCP decorators."""
        populate()

        all_names = TR.all_names()
        assert len(all_names) > 300, f"Expected >300 tools, got {len(all_names)}"

        # Known tools from ENDPOINT_MAP
        for expected in ["generate_speech", "transcribe", "list_models", "bounce_preview"]:
            assert TR.get(expected) is not None, f"Missing tool: {expected}"

        # Known MCP tools
        for expected in ["21labs.speak", "21labs.transcribe", "21labs.bounce"]:
            assert TR.get(expected) is not None, f"Missing MCP tool: {expected}"

    def test_all_mcp_tools_are_dual_surface(self):
        """Every MCP tool should also be on the assistant surface."""
        populate()

        mcp_tools = TR.for_surface("mcp")
        dual = [t for t in mcp_tools if "assistant" in t.surfaces]

        assert len(dual) >= 190, f"Expected >=190 dual-surface, got {len(dual)}"

        # Every MCP tool should have a corresponding assistant tool
        for t in mcp_tools:
            # The tool should exist on both surfaces
            assert "assistant" in t.surfaces, f"MCP tool {t.name} not dual-surface"

    def test_all_tools_have_endpoints(self):
        """All ENDPOINT_MAP tools should have valid endpoints."""
        populate()

        from backend.routes.assistant_tools.mappings import ENDPOINT_MAP

        for name, endpoint in ENDPOINT_MAP.items():
            tool = TR.get(name)
            assert tool is not None, f"ENDPOINT_MAP tool {name} not in TR"
            assert tool.endpoint == endpoint, f"Tool {name} endpoint mismatch: {tool.endpoint} != {endpoint}"
            assert tool.endpoint.startswith("/"), f"Tool {name} endpoint doesn't start with /: {tool.endpoint}"

    def test_name_map_covers_all_mcp_tools(self):
        """NAME_MAP should have entries for every MCP tool."""
        populate()

        from backend.routes.assistant_tools.mappings import NAME_MAP

        mcp_tools = TR.for_surface("mcp")
        unmapped = [t.name for t in mcp_tools if t.name not in NAME_MAP]

        assert unmapped == [], f"MCP tools without NAME_MAP: {unmapped}"

    def test_startup_verify_returns_correct_summary(self):
        """startup_verify() populates TR and returns accurate counts."""
        TR._tools.clear()
        result = startup_verify()

        assert result["total_tools"] > 300
        assert result["mcp_tools"] >= 190
        assert result["assistant_tools"] >= 190
        assert result["dual_surface"] >= 190
        assert isinstance(result["errors"], list)

    def test_startup_verify_idempotent(self):
        """Calling startup_verify twice doesn't double-register tools."""
        TR._tools.clear()
        r1 = startup_verify()
        count1 = r1["total_tools"]

        r2 = startup_verify()
        count2 = r2["total_tools"]

        assert count1 == count2, f"Double registration: {count1} → {count2}"

    def test_mcp_tool_descriptions_are_not_generic(self):
        """MCP tools should have real descriptions, not 'Tool: name' placeholders."""
        populate()

        mcp_tools = TR.for_surface("mcp")
        generic = [t.name for t in mcp_tools if t.description.startswith("Tool:") or len(t.description) < 10]

        assert generic == [], f"Tools with generic descriptions: {generic}"

    def test_tr_dispatch_registers_correct_count(self):
        """TR dispatcher registers the expected number of tools."""
        populate()

        from unittest.mock import MagicMock

        mcp = MagicMock()
        mcp._tool_manager._tools = {}
        registered = {}

        def _register(name=None, description=""):
            def _decorator(fn):
                registered[name] = fn
                return fn

            return _decorator

        mcp.tool = _register

        from backend.mcp_server.tools.tr_dispatch import register_tr_tools

        count = register_tr_tools(mcp)

        # Should register tools that have endpoints
        tools_with_endpoints = [t for t in TR.for_surface("mcp") if t.endpoint]
        assert count == len(tools_with_endpoints), (
            f"Dispatcher registered {count} but {len(tools_with_endpoints)} have endpoints"
        )

    def test_all_tool_categories_present(self):
        """Verify tools from every major category are registered."""
        populate()

        categories = {
            "TTS": ["generate_speech", "list_voices"],
            "STT": ["transcribe"],
            "Effects": ["apply_effects", "list_effects"],
            "Audio": ["bounce_preview", "normalize_audio"],
            "Profiles": ["create_profile", "list_voices"],
            "Studio": ["studio_save_session", "studio_list_sessions"],
            "Batch": ["list_batch_jobs", "create_batch_job"],
            "Dubbing": ["dub_video", "dub_status"],
            "DSP": ["dsp_synth", "dsp_effect"],
            "Models": ["list_models", "models_download"],
        }

        for category, tool_names in categories.items():
            for name in tool_names:
                tool = TR.get(name)
                assert tool is not None, f"Category {category}: missing tool {name}"
