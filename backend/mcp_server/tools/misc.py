"""Transcription, captures, model-management and system REST MCP tools."""

from __future__ import annotations

from typing import Any

from fastmcp import FastMCP

from ._common import _encode_path_param, _rest


def register_transcription_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.export_subtitles",
        description="Transcribe a stored clip locally (Whisper) and export SRT/VTT subtitles. Returns the subtitle file path. fmt: 'srt' or 'vtt'. model: Whisper model size or None for default.",
    )
    async def twentylabs_export_subtitles(
        audio_path: str,
        fmt: str = "srt",
        model: str | None = None,
        language: str | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/transcription/export-subtitles",
            json={"audio_path": audio_path, "fmt": fmt, "model": model, "language": language},
        )

    @mcp.tool(
        name="21labs.export_reaper_project",
        description="Export an Audio Studio session as a Reaper project (.RPP) for DAW interchange. Returns the RPP text.",
    )
    async def twentylabs_export_reaper_project(session_id: str) -> dict[str, Any]:
        return await _rest("POST", f"/audio-studio/sessions/{_encode_path_param(session_id)}/export-reaper")

    @mcp.tool(
        name="21labs.generation_version_audio",
        description="Fetch the audio for a specific generation version by id. Returns base64 WAV.",
    )
    async def twentylabs_generation_version_audio(version_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/audio/version/{_encode_path_param(version_id)}")


def register_capture_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.captures_refine",
        description="Refine (clean up) a recorded capture.",
    )
    async def twentylabs_captures_refine(capture_id: str) -> dict[str, Any]:
        return await _rest("POST", f"/captures/{_encode_path_param(capture_id)}/refine")

    @mcp.tool(
        name="21labs.captures_retranscribe",
        description="Re-run speech-to-text on a capture.",
    )
    async def twentylabs_captures_retranscribe(capture_id: str) -> dict[str, Any]:
        return await _rest("POST", f"/captures/{_encode_path_param(capture_id)}/retranscribe")


def register_model_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.models_list",
        description=(
            "List all available models with their download/load status. Shows "
            "which models are installed, which are loaded in memory, and which "
            "can be downloaded. Use this to discover what's available before "
            "calling models_download or models_load."
        ),
    )
    async def twentylabs_models_list() -> dict[str, Any]:
        return await _rest("GET", "/models/status")

    @mcp.tool(
        name="21labs.model_cache_dir",
        description="Get the local model cache directory.",
    )
    async def twentylabs_model_cache_dir() -> dict[str, Any]:
        return await _rest("GET", "/models/cache-dir")

    @mcp.tool(
        name="21labs.model_progress",
        description="Get download progress for a model by name.",
    )
    async def twentylabs_model_progress(model_name: str) -> dict[str, Any]:
        return await _rest("GET", f"/models/progress/{_encode_path_param(model_name)}")

    @mcp.tool(
        name="21labs.models_download",
        description="Download a model by name. Returns download status.",
    )
    async def twentylabs_models_download(model_name: str) -> dict[str, Any]:
        return await _rest("POST", "/models/download", json={"model_name": model_name})

    @mcp.tool(
        name="21labs.models_load",
        description="Load the default TTS model. model_size: model size to load (e.g. 'tiny', 'base', 'small', 'medium', 'large') or 'default' for the app's default.",
    )
    async def twentylabs_models_load(model_size: str = "default") -> dict[str, Any]:
        return await _rest("POST", "/models/load", params={"model_size": model_size})

    @mcp.tool(
        name="21labs.models_unload",
        description="Unload the currently loaded TTS model.",
    )
    async def twentylabs_models_unload() -> dict[str, Any]:
        return await _rest("POST", "/models/unload")


def register_system_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.session_save",
        description="Save the current workspace session. name: session identifier (reserved, currently unused by backend). session_data: JSON string of session state.",
    )
    async def twentylabs_session_save(name: str, session_data: str) -> dict[str, Any]:
        return await _rest("POST", "/session/save", json={"name": name, "session_data": session_data})

    @mcp.tool(
        name="21labs.session_load",
        description="Load a saved workspace session. name: session identifier (reserved, currently unused by backend). session_data: JSON string of session state.",
    )
    async def twentylabs_session_load(name: str, session_data: str) -> dict[str, Any]:
        return await _rest("POST", "/session/load", json={"name": name, "session_data": session_data})

    @mcp.tool(
        name="21labs.telemetry_status",
        description="Get telemetry enablement status.",
    )
    async def twentylabs_telemetry_status() -> dict[str, Any]:
        return await _rest("GET", "/telemetry/status")

    @mcp.tool(
        name="21labs.telemetry_toggle",
        description="Enable or disable telemetry.",
    )
    async def twentylabs_telemetry_toggle(enabled: bool) -> dict[str, Any]:
        return await _rest("POST", "/telemetry/toggle", json={"enabled": enabled})

    @mcp.tool(
        name="21labs.cuda_status",
        description="Get CUDA/GPU backend status.",
    )
    async def twentylabs_cuda_status() -> dict[str, Any]:
        return await _rest("GET", "/backend/cuda-status")

    @mcp.tool(
        name="21labs.cuda_download",
        description="Download the CUDA/GPU backend.",
    )
    async def twentylabs_cuda_download() -> dict[str, Any]:
        return await _rest("POST", "/backend/download-cuda")

    @mcp.tool(
        name="21labs.list_import_formats",
        description="List supported import audio/video formats.",
    )
    async def twentylabs_list_import_formats() -> dict[str, Any]:
        return await _rest("GET", "/import/formats")

    @mcp.tool(
        name="21labs.app_help",
        description="Search the in-app feature catalog for tools, shortcuts, and capabilities. Returns top matches with location and tool names.",
    )
    async def twentylabs_app_help(query: str) -> dict[str, Any]:
        """Search the feature catalog for relevant tools and features."""
        return await _rest("GET", "/help/search", params={"q": query})

    @mcp.tool(
        name="21labs.import_info",
        description="Get import capability info (ffmpeg availability, etc.).",
    )
    async def twentylabs_import_info() -> dict[str, Any]:
        return await _rest("GET", "/import/info")

    @mcp.tool(
        name="21labs.acquire_search",
        description="Search for assets from external sources (Freesound, etc.). query: search query. source: source name (e.g. 'freesound'). max_results: maximum number of results.",
    )
    async def twentylabs_acquire_search(
        query: str,
        source: str = "freesound",
        max_results: int = 10,
    ) -> dict[str, Any]:
        return await _rest(
            "POST", "/acquire/search", json={"query": query, "source": source, "max_results": max_results}
        )

    @mcp.tool(
        name="21labs.acquire_download",
        description="Download an asset from an external source. asset_id: the asset ID from search. source: source name (e.g. 'freesound').",
    )
    async def twentylabs_acquire_download(
        asset_id: str,
        source: str = "freesound",
    ) -> dict[str, Any]:
        return await _rest("POST", "/acquire/download", json={"asset_id": asset_id, "source": source})
