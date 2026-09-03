"""Tests for MCP tool fixes — verifies route schemas and endpoint mappings.

Tests the underlying data (routes, Pydantic models, mappings) without
triggering the full MCP/FastMCP import chain which is too heavy for tests.
"""


class TestADRRouteModels:
    """Verify ADR route Pydantic models accept the correct params."""

    def test_auto_select_request(self):
        from backend.routes.adr import AutoSelectRequest

        req = AutoSelectRequest(line_id="test-line-1")
        assert req.line_id == "test-line-1"

    def test_align_request(self):
        from backend.routes.adr import AlignRequest

        req = AlignRequest(guide_audio=[0.1, 0.2], take_audio=[0.3, 0.4], sample_rate=24000)
        assert len(req.guide_audio) == 2
        assert len(req.take_audio) == 2
        assert req.sample_rate == 24000

    def test_score_request(self):
        from backend.routes.adr import ScoreRequest

        req = ScoreRequest(line_id="line-1", audio=[0.5, 0.6], sample_rate=24000)
        assert req.line_id == "line-1"
        assert len(req.audio) == 2

    def test_audio_path_request_singular(self):
        from backend.routes.adr import AudioPathRequest

        req = AudioPathRequest(audio_path="/data/take.wav")
        assert req.audio_path == "/data/take.wav"


class TestAudioProcessingRouteParams:
    """Verify audio processing route function signatures match MCP tool params."""

    def test_copy_segment_params(self):
        from backend.routes.audio_pipeline.processing import copy_segment_route

        code = (
            copy_segment_route.__wrapped__.__code__
            if hasattr(copy_segment_route, "__wrapped__")
            else copy_segment_route.__code__
        )
        params = code.co_varnames[: code.co_argcount]
        assert "audio_path" in params
        assert "start_s" in params
        assert "end_s" in params

    def test_cut_segment_params(self):
        from backend.routes.audio_pipeline.processing import cut_segment_route

        code = (
            cut_segment_route.__wrapped__.__code__
            if hasattr(cut_segment_route, "__wrapped__")
            else cut_segment_route.__code__
        )
        params = code.co_varnames[: code.co_argcount]
        assert "audio_path" in params
        assert "start_s" in params
        assert "end_s" in params

    def test_paste_segment_params(self):
        from backend.routes.audio_pipeline.processing import paste_segment_route

        code = (
            paste_segment_route.__wrapped__.__code__
            if hasattr(paste_segment_route, "__wrapped__")
            else paste_segment_route.__code__
        )
        params = code.co_varnames[: code.co_argcount]
        assert "target_path" in params
        assert "clip_path" in params
        assert "at_s" in params
        assert "crossfade_ms" in params

    def test_blend_params(self):
        from backend.routes.audio_pipeline.processing import blend_route

        code = blend_route.__wrapped__.__code__ if hasattr(blend_route, "__wrapped__") else blend_route.__code__
        params = code.co_varnames[: code.co_argcount]
        assert "audio_path_a" in params
        assert "audio_path_b" in params
        assert "crossfade_ms" in params
        assert "gap_ms" in params
        assert "curve" in params

    def test_duck_params(self):
        from backend.routes.audio_pipeline.processing import apply_sidechain_duck

        code = (
            apply_sidechain_duck.__wrapped__.__code__
            if hasattr(apply_sidechain_duck, "__wrapped__")
            else apply_sidechain_duck.__code__
        )
        params = code.co_varnames[: code.co_argcount]
        assert "audio_path" in params
        assert "threshold_db" in params
        assert "ratio" in params


class TestDeadCodeRemoval:
    """Verify dead code was properly removed."""

    def test_populate_no_dead_path_expression(self):
        import inspect

        from backend.tool_registry_populate import populate

        source = inspect.getsource(populate)
        assert 'Path(__file__).parent / "routes" / "assistant_tools" / "schemas.py"' not in source

    def test_verify_mcp_no_dead_comprehension(self):
        import inspect

        from backend.tool_registry_populate import verify_mcp_vs_tr

        source = inspect.getsource(verify_mcp_vs_tr)
        assert "{t.name for t in TR.for_surface" not in source

    def test_verify_assistant_no_dead_comprehension(self):
        import inspect

        from backend.tool_registry_populate import verify_assistant_vs_tr

        source = inspect.getsource(verify_assistant_vs_tr)
        assert "{t.name for t in TR.for_surface" not in source


class TestToolRegistryIntegrity:
    """Verify the tool registry is consistent after all fixes."""

    def test_registry_verify_clean(self):
        from backend.tool_registry_populate import verify_assistant_vs_tr, verify_mcp_vs_tr

        errors_mcp = verify_mcp_vs_tr()
        errors_asst = verify_assistant_vs_tr()
        assert errors_mcp == [], f"MCP verify errors: {errors_mcp}"
        assert errors_asst == [], f"Assistant verify errors: {errors_asst}"

    def test_endpoint_map_well_formed(self):
        from backend.routes.assistant_tools.mappings import ENDPOINT_MAP

        assert len(ENDPOINT_MAP) > 0
        for name, path in ENDPOINT_MAP.items():
            assert path.startswith("/"), f"ENDPOINT_MAP[{name}] path must start with /: {path}"

    def test_name_map_covers_mcp_tools(self):
        from backend.routes.assistant_tools.mappings import NAME_MAP
        from backend.tool_registry import TR

        unmapped = [t.name for t in TR.for_surface("mcp") if t.name not in NAME_MAP]
        assert unmapped == [], f"MCP tools without NAME_MAP: {unmapped}"

    def test_generate_music_has_schema(self):
        """generate_music must have a schema in TOOLS."""
        from backend.routes.assistant_tools.schemas import TOOLS

        names = [t["function"]["name"] for t in TOOLS]
        assert "generate_music" in names, "generate_music missing from TOOLS"

    def test_adr_upload_guide_path_correct(self):
        """adr_upload_guide must map to /guide, not /guide-path."""
        from backend.routes.assistant_tools.mappings import ENDPOINT_MAP

        assert ENDPOINT_MAP["adr_upload_guide"] == "/adr/sessions/{session_id}/guide"

    def test_adr_upload_take_path_correct(self):
        """adr_upload_take must map to /takes, not /takes-path."""
        from backend.routes.assistant_tools.mappings import ENDPOINT_MAP

        assert ENDPOINT_MAP["adr_upload_take"] == "/adr/sessions/{session_id}/lines/{line_id}/takes"

    def test_studio_load_session_method(self):
        """studio_load_session TOOL_METHODS must be GET."""
        from backend.routes.assistant_tools.mappings import TOOL_METHODS

        assert TOOL_METHODS.get("studio_load_session") == "GET"

    def test_studio_import_session_schema_matches_route(self):
        """studio_import_session schema must have name+data, not session_id."""
        from backend.routes.assistant_tools.schemas import TOOLS

        tool = next(t for t in TOOLS if t["function"]["name"] == "studio_import_session")
        params = tool["function"]["parameters"]["properties"]
        assert "name" in params, "studio_import_session missing 'name' param"
        assert "data" in params, "studio_import_session missing 'data' param"
        assert "session_id" not in params, "studio_import_session still has stale 'session_id'"

    def test_render_audiobook_chapter_path(self):
        """render_audiobook_chapter ENDPOINT_MAP must point to book-level render."""
        from backend.routes.assistant_tools.mappings import ENDPOINT_MAP

        assert ENDPOINT_MAP["render_audiobook_chapter"] == "/audiobooks/{book_id}/render"
