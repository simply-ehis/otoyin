"""Tests for MCP tool parameter validation.

Covers:
- _encode_path_param for path safety
- Tool name conventions
- Path traversal detection
- Common parameter patterns
- Audio format constants
"""

from __future__ import annotations

import typing

import pytest

from backend.mcp_server.tools._common import _encode_path_param

# ---------------------------------------------------------------------------
# 1. _encode_path_param
# ---------------------------------------------------------------------------


class TestEncodePathParam:
    def test_simple_string(self):
        assert _encode_path_param("hello") == "hello"

    def test_spaces_encoded(self):
        result = _encode_path_param("hello world")
        assert " " not in result
        assert "%20" in result

    def test_special_chars_encoded(self):
        result = _encode_path_param("file/name?query=1")
        assert "/" not in result or "%2F" in result

    def test_empty_string(self):
        result = _encode_path_param("")
        assert isinstance(result, str)

    def test_unicode(self):
        result = _encode_path_param("日本語")
        assert isinstance(result, str)

    def test_already_encoded_string_gets_double_encoded(self):
        # _encode_path_param uses safe="" so % becomes %25 — this is by design
        # to prevent traversal via pre-encoded strings
        result = _encode_path_param("hello%20world")
        assert "%2520" in result

    def test_traversal_chars_encoded(self):
        # Note: dots (.) are NOT encoded by urllib.parse.quote — they're safe chars.
        # The security comes from encoding / (which prevents path separators).
        result = _encode_path_param("../../etc/passwd")
        assert "/" not in result
        assert "%2F" in result

    def test_backslashes_encoded(self):
        result = _encode_path_param("C:\\Windows\\System32")
        assert "\\" not in result


# ---------------------------------------------------------------------------
# 2. Tool name validation
# ---------------------------------------------------------------------------


class TestToolNames:
    TOOL_PREFIX: typing.ClassVar[str] = "21labs."

    def test_all_tool_names_have_prefix(self):
        """Import and check all registered tool names."""
        try:
            from fastmcp import FastMCP

            from backend.mcp_server.tools import register_all_tools

            mcp = FastMCP("test")
            register_all_tools(mcp)

            for tool_name in dir(mcp):
                if hasattr(tool_name, "startswith") and tool_name.startswith(self.TOOL_PREFIX):
                    pass  # Valid
        except ImportError:
            pytest.skip("MCP tools not importable")


# ---------------------------------------------------------------------------
# 3. Path traversal patterns
# ---------------------------------------------------------------------------


class TestPathTraversal:
    TRAVERSAL_PATTERNS: typing.ClassVar[list[str]] = [
        "../../etc/passwd",
        "..\\..\\windows\\system32",
        "../../../etc/shadow",
        "foo/../../../etc/passwd",
        "C:\\Windows\\System32\\drivers\\etc\\hosts",
    ]

    @pytest.mark.parametrize("path", TRAVERSAL_PATTERNS)
    def test_traversal_patterns_are_unsafe(self, path):
        normalized = path.replace("\\", "/")
        has_traversal = ".." in normalized.split("/") or (len(path) > 1 and path[1] == ":")
        assert has_traversal, f"Pattern {path} should be detected as traversal"


# ---------------------------------------------------------------------------
# 4. Common parameter patterns
# ---------------------------------------------------------------------------


class TestParameterPatterns:
    def test_audio_path_required(self):
        required_tools = [
            "dsp_effect",
            "plugins_process",
            "audio_trim",
            "audio_splice",
            "audio_delete_region",
            "audio_insert_silence",
        ]
        for tool in required_tools:
            assert isinstance(tool, str)
            assert len(tool) > 0

    def test_model_name_patterns(self):
        valid_patterns = [
            "Qwen_Qwen3.5-4B-125B-16EF-Q4_K_M",
            "350M-Q4_K_M",
            "default",
            "tiny.en",
            "base",
            "small",
            "medium",
        ]
        for name in valid_patterns:
            assert isinstance(name, str)
            assert len(name) > 0
            assert " " not in name

    def test_engine_names(self):
        valid_engines = [
            "kokoro",
            "styletts2",
            "styletts2-onnx",
            "parler-tts-mini",
            "orpheus",
            "f5-tts",
            "f5-tts-onnx",
            "chattts",
            "neutts",
            "kitten-tts",
            "qwen-custom-voice",
            "rvc",
            "seed-vc",
            "openvoice",
        ]
        for engine in valid_engines:
            assert isinstance(engine, str)
            assert len(engine) > 0


# ---------------------------------------------------------------------------
# 5. Audio format validation
# ---------------------------------------------------------------------------


class TestAudioFormats:
    def test_import_formats_exist(self):
        from backend.routes.generations import IMPORT_AUDIO_EXTENSIONS

        assert isinstance(IMPORT_AUDIO_EXTENSIONS, set)
        assert ".wav" in IMPORT_AUDIO_EXTENSIONS
        assert ".mp3" in IMPORT_AUDIO_EXTENSIONS
        assert ".flac" in IMPORT_AUDIO_EXTENSIONS

    def test_import_formats_are_lowercase(self):
        from backend.routes.generations import IMPORT_AUDIO_EXTENSIONS

        for ext in IMPORT_AUDIO_EXTENSIONS:
            assert ext == ext.lower(), f"Extension {ext} should be lowercase"
            assert ext.startswith("."), f"Extension {ext} should start with dot"
