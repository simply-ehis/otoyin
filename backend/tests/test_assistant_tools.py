"""Tests for assistant tool definitions in routes/assistant_tools.py."""

import uuid

import pytest

from backend.routes.assistant_tools import (
    CLIENT_COMMAND_TOOLS,
    ENDPOINT_MAP,
    TOOL_METHODS,
    TOOLS,
)

# Tools authored as part of the in-app assistant expansion. The full tool set
# is allowed to grow; we assert these are present and that the invariant
# (TOOLS == backend tools + client commands) holds instead of a brittle literal.
CORE_TOOLS = {
    "generate_speech",
    "apply_effects",
    "list_voices",
    "list_effects",
    "export_audio",
    "measure_loudness",
    "transcribe",
    "list_captures",
    "generate_sfx",
    "analyze_pitch",
    "spatial_binaural",
    "spatial_doppler",
    "list_models",
    "adr_create_session",
    "adr_list_sessions",
    "adr_get_session",
    "adr_upload_guide",
    "adr_upload_take",
    "adr_select_take",
    "adr_auto_select",
    "studio_save_session",
    "studio_load_session",
    "studio_list_sessions",
    "ui_navigate",
    "ui_set_voice_profile",
    "studio_add_track",
    "studio_set_master_volume",
    "studio_import_session",
}


class TestToolStructure:
    def test_tool_coverage_is_exhaustive(self):
        # Every tool is either a backend tool (has an endpoint) or a client
        # command, and the two buckets are disjoint. Robust to the tool set
        # growing (or being augmented at import time) without a brittle count.
        names = {t["function"]["name"] for t in TOOLS}
        assert names >= CORE_TOOLS
        for name in names:
            in_endpoint = name in ENDPOINT_MAP
            in_client = name in CLIENT_COMMAND_TOOLS
            assert in_endpoint != in_client, (
                f"tool {name!r} must be in ENDPOINT_MAP XOR CLIENT_COMMAND_TOOLS "
                f"(endpoint={in_endpoint}, client={in_client})"
            )

    @pytest.mark.parametrize("tool", TOOLS, ids=[t["function"]["name"] for t in TOOLS])
    def test_tool_has_required_fields(self, tool):
        assert tool["type"] == "function"
        func = tool["function"]
        assert "name" in func
        assert "description" in func
        assert "parameters" in func
        assert len(func["description"]) > 10

    @pytest.mark.parametrize("tool", TOOLS, ids=[t["function"]["name"] for t in TOOLS])
    def test_tool_parameters_are_object_type(self, tool):
        params = tool["function"]["parameters"]
        assert params.get("type") == "object"
        assert "properties" in params


class TestToolParameterValidation:
    def test_generate_speech_requires_text_and_profile(self):
        tool = next(t for t in TOOLS if t["function"]["name"] == "generate_speech")
        required = tool["function"]["parameters"]["required"]
        assert "text" in required
        assert "profile_id" in required

    def test_apply_effects_requires_generation_id(self):
        tool = next(t for t in TOOLS if t["function"]["name"] == "apply_effects")
        required = tool["function"]["parameters"]["required"]
        assert "generation_id" in required
        assert "effects_chain" in required

    def test_export_audio_requires_path_and_preset(self):
        tool = next(t for t in TOOLS if t["function"]["name"] == "export_audio")
        required = tool["function"]["parameters"]["required"]
        assert "audio_path" in required
        assert "preset" in required

    def test_measure_loudness_requires_audio_path(self):
        tool = next(t for t in TOOLS if t["function"]["name"] == "measure_loudness")
        required = tool["function"]["parameters"]["required"]
        assert "audio_path" in required

    def test_path_tools_require_path_params(self):
        for name in ("adr_get_session", "adr_upload_guide", "adr_upload_take", "adr_select_take"):
            tool = next(t for t in TOOLS if t["function"]["name"] == name)
            assert "session_id" in tool["function"]["parameters"]["required"]


class TestEndpointMap:
    def test_backend_tools_have_endpoints(self):
        names = {t["function"]["name"] for t in TOOLS}
        for name in names:
            if name in CLIENT_COMMAND_TOOLS:
                continue
            assert name in ENDPOINT_MAP
            assert ENDPOINT_MAP[name].startswith("/")

    def test_endpoint_map_matches_backend_tools(self):
        """ENDPOINT_MAP must cover all assistant tools and may also include MCP-only tools."""
        names = {t["function"]["name"] for t in TOOLS}
        assistant_names = names - CLIENT_COMMAND_TOOLS
        # All assistant tools must have an endpoint
        missing = assistant_names - set(ENDPOINT_MAP)
        assert not missing, f"Assistant tools without ENDPOINT_MAP entry: {missing}"

    def test_get_tools_have_get_method(self):
        for name in (
            "list_voices",
            "list_effects",
            "list_captures",
            "list_models",
            "adr_list_sessions",
            "adr_get_session",
            "studio_load_session",
            "studio_list_sessions",
        ):
            assert TOOL_METHODS.get(name) == "GET"


class TestServeExportFile:
    def test_serves_exported_wav(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from backend import config as cfg
        from backend.routes.audio_pipeline.bounce import router as audio_router

        exports_dir = cfg.get_exports_dir()
        exports_dir.mkdir(parents=True, exist_ok=True)
        name = f"test_export_{uuid.uuid4().hex[:8]}.wav"
        (exports_dir / name).write_bytes(b"RIFFfake")
        try:
            app = FastAPI()
            app.include_router(audio_router)
            client = TestClient(app)
            resp = client.get(f"/exports/{name}")
            assert resp.status_code == 200
            assert resp.content == b"RIFFfake"
            assert resp.headers["content-type"] == "audio/wav"
        finally:
            (exports_dir / name).unlink(missing_ok=True)

    def test_missing_file_returns_404(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from backend.routes.audio_pipeline.bounce import router as audio_router

        app = FastAPI()
        app.include_router(audio_router)
        client = TestClient(app)
        resp = client.get(f"/exports/{uuid.uuid4().hex}.wav")
        assert resp.status_code == 404

    def test_path_traversal_is_routed_away(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from backend.routes.audio_pipeline.bounce import router as audio_router

        app = FastAPI()
        app.include_router(audio_router)
        client = TestClient(app)
        # Single-segment param cannot carry a slash, so traversal is blocked.
        resp = client.get("/exports/..%2F..%2Fsecret.txt")
        assert resp.status_code in (400, 404)


class TestExecuteToolValidation:
    """Bug1/Bug2 guards in execution._validate_args."""

    def test_missing_required_arg_is_rejected(self):
        from backend.routes.assistant_tools.execution import _validate_args

        assert _validate_args("noise_reduce", {}) is not None
        assert "audio_path" in _validate_args("noise_reduce", {})

    def test_path_traversal_rejected(self):
        from backend.routes.assistant_tools.execution import _validate_args

        err = _validate_args("noise_reduce", {"audio_path": "../../etc/passwd"})
        assert err is not None and "audio_path" in err

    def test_absolute_path_rejected(self):
        from backend.routes.assistant_tools.execution import _validate_args

        err = _validate_args("noise_reduce", {"audio_path": "/etc/passwd"})
        assert err is not None

    def test_url_scheme_rejected(self):
        from backend.routes.assistant_tools.execution import _validate_args

        err = _validate_args("noise_reduce", {"audio_path": "http://evil/x.wav"})
        assert err is not None

    def test_relative_path_normalized_and_allowed(self):
        from backend.routes.assistant_tools.execution import _validate_args

        args = {"audio_path": "captures/foo.wav", "vad_threshold": 0.3}
        assert _validate_args("noise_reduce", args) is None
        # os.path.normpath uses platform separators: / on Unix, \ on Windows
        import os

        expected = os.path.normpath("captures/foo.wav")
        assert args["audio_path"] == expected

    def test_required_id_arg_rejected_when_missing(self):
        from backend.routes.assistant_tools.execution import _validate_args

        # adr_get_session requires session_id -> building the URL would leave a
        # literal {session_id} placeholder without this guard.
        err = _validate_args("adr_get_session", {})
        assert err is not None and "session_id" in err
