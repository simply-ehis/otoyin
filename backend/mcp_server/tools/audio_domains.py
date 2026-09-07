"""Conversation / batch / preset / voice-changer / sound REST MCP tools."""

from __future__ import annotations

from typing import Any

from fastmcp import FastMCP

from ._common import _encode_path_param, _rest


def register_conversation_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.list_conversation_presets",
        description="List podcast/conversation presets.",
    )
    async def twentylabs_list_conversation_presets() -> dict[str, Any]:
        return await _rest("GET", "/conversation/presets")

    @mcp.tool(
        name="21labs.conversation_auto_duck",
        description=(
            "Compute an auto-ducking gain envelope so background speakers duck "
            "under the active one. Pass `lines` (list of ConversationLine dicts)."
        ),
    )
    async def twentylabs_conversation_auto_duck(lines: list[dict[str, Any]]) -> dict[str, Any]:
        return await _rest("POST", "/conversation/auto-duck", json={"lines": lines})

    @mcp.tool(
        name="21labs.conversation_auto_level",
        description=(
            "Level-match all speakers to a target LUFS so no voice dominates. "
            "Pass `lines` (list of ConversationLine dicts)."
        ),
    )
    async def twentylabs_conversation_auto_level(lines: list[dict[str, Any]]) -> dict[str, Any]:
        return await _rest("POST", "/conversation/auto-level", json={"lines": lines})


def register_batch_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.list_batch_jobs",
        description="List batch processing jobs with status and progress.",
    )
    async def twentylabs_list_batch_jobs() -> dict[str, Any]:
        return await _rest("GET", "/batch/jobs")

    @mcp.tool(
        name="21labs.get_batch_job",
        description="Get a single batch job by id.",
    )
    async def twentylabs_get_batch_job(job_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/batch/jobs/{_encode_path_param(job_id)}")

    @mcp.tool(
        name="21labs.create_batch_job",
        description="Create a batch job to process many generations without blocking.",
    )
    async def twentylabs_create_batch_job(
        name: str, func_name: str, func_args: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        func_args = func_args or {}
        return await _rest(
            "POST",
            "/batch/jobs",
            json={"name": name, "func_name": func_name, "func_args": func_args},
        )

    @mcp.tool(
        name="21labs.cancel_batch_job",
        description="Cancel a pending/running batch job by id.",
    )
    async def twentylabs_cancel_batch_job(job_id: str) -> dict[str, Any]:
        return await _rest("POST", f"/batch/jobs/{_encode_path_param(job_id)}/cancel")

    @mcp.tool(
        name="21labs.batch_job_progress",
        description="Get detailed progress for a batch job including per-item status.",
    )
    async def twentylabs_batch_job_progress(job_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/batch/jobs/{_encode_path_param(job_id)}/progress")

    @mcp.tool(
        name="21labs.batch_job_retry",
        description="Retry failed items in a batch job.",
    )
    async def twentylabs_batch_job_retry(job_id: str) -> dict[str, Any]:
        return await _rest("POST", f"/batch/jobs/{_encode_path_param(job_id)}/retry")

    @mcp.tool(
        name="21labs.batch_job_items",
        description="List all items in a batch job with their individual status.",
    )
    async def twentylabs_batch_job_items(job_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/batch/jobs/{_encode_path_param(job_id)}/items")

    @mcp.tool(
        name="21labs.batch_create_from_list",
        description="Create multiple batch jobs from a list of function calls. Useful for queuing many TTS generations at once.",
    )
    async def twentylabs_batch_create_from_list(
        jobs: list[dict[str, Any]],
        batch_name: str | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/batch/jobs/bulk",
            json={"jobs": jobs, "batch_name": batch_name},
        )


def register_preset_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.list_community_presets",
        description="Browse community-shared effect presets (optional category/search).",
    )
    async def twentylabs_list_community_presets(
        category: str | None = None, search: str | None = None
    ) -> dict[str, Any]:
        return await _rest("GET", "/community-presets", params={"category": category, "search": search})

    @mcp.tool(
        name="21labs.list_community_preset_categories",
        description="List community preset categories.",
    )
    async def twentylabs_list_community_preset_categories() -> dict[str, Any]:
        return await _rest("GET", "/community-presets/categories")

    @mcp.tool(
        name="21labs.list_builtin_presets",
        description="List built-in effect presets (robotic, radio, echo chamber, etc.).",
    )
    async def twentylabs_list_builtin_presets() -> dict[str, Any]:
        return await _rest("GET", "/presets/builtin")

    @mcp.tool(
        name="21labs.export_preset",
        description="Save an effect chain as a shareable preset. Returns preset metadata.",
    )
    async def twentylabs_export_preset(
        name: str,
        effects_chain: list[dict[str, Any]],
        description: str = "",
        author: str = "User",
        tags: list[str] | None = None,
    ) -> dict[str, Any]:
        tags = tags or []
        return await _rest(
            "POST",
            "/presets/export",
            json={
                "name": name,
                "effects_chain": effects_chain,
                "description": description,
                "author": author,
                "tags": tags,
            },
        )

    @mcp.tool(
        name="21labs.import_preset",
        description="Import a shared effect preset from JSON.",
    )
    async def twentylabs_import_preset(preset_json: str) -> dict[str, Any]:
        return await _rest("POST", "/presets/import", json={"preset_json": preset_json})


def register_voice_changer_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.voice_changer_capabilities",
        description="Probe the real-time voice changer's available capabilities/engines.",
    )
    async def twentylabs_voice_changer_capabilities() -> dict[str, Any]:
        return await _rest("GET", "/voice-changer/capabilities")

    @mcp.tool(
        name="21labs.list_voice_packs",
        description="List available RVC v2 voice packs (installed + downloadable).",
    )
    async def twentylabs_list_voice_packs() -> dict[str, Any]:
        return await _rest("GET", "/voice-packs")

    @mcp.tool(
        name="21labs.convert_voice",
        description=(
            "Convert a stored audio file into a downloaded RVC v2 voice pack. "
            "Returns base64 WAV. Requires the pack to be downloaded first. "
            "consent_given must be true — caller attests rights to use the audio."
        ),
    )
    async def twentylabs_convert_voice(
        audio_path: str,
        engine: str = "rvc",
        consent_given: bool = False,
        voice_pack: str = "",
        reference_audio_path: str = "",
        transpose: int = 0,
        diffusion_steps: int = 10,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/voice-convert",
            json={
                "audio_path": audio_path,
                "engine": engine,
                "consent_given": consent_given,
                "voice_pack": voice_pack,
                "reference_audio_path": reference_audio_path,
                "transpose": transpose,
                "diffusion_steps": diffusion_steps,
            },
        )


def register_sounds_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.search_freesound",
        description=(
            "Search Freesound for sound effects (user-provided API key). "
            "Returns matching sounds with license + preview URLs."
        ),
    )
    async def twentylabs_search_freesound(query: str, page: int = 1) -> dict[str, Any]:
        return await _rest("GET", "/sounds/search", params={"q": query, "page": page})

    @mcp.tool(
        name="21labs.download_freesound",
        description="Download a Freesound sound's preview into local storage.",
    )
    async def twentylabs_download_freesound(sound_id: int, preview_url: str) -> dict[str, Any]:
        return await _rest(
            "POST",
            f"/sounds/download/{_encode_path_param(str(sound_id))}",
            json={"preview_url": preview_url},
        )
