"""Comping, mixer, and translate MCP tools."""

from __future__ import annotations

from typing import Any

from fastmcp import FastMCP

from ._common import _encode_path_param, _rest


def register_comping_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.comping_list_sessions",
        description="List saved comping sessions.",
    )
    async def twentylabs_comping_list_sessions() -> dict[str, Any]:
        return await _rest("GET", "/comping/sessions")

    @mcp.tool(
        name="21labs.comping_save_session",
        description="Save a comping session snapshot.",
    )
    async def twentylabs_comping_save_session(
        name: str,
        session_data: str,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/comping/sessions",
            json={"name": name, "session_data": session_data},
        )

    @mcp.tool(
        name="21labs.comping_load_session",
        description="Load a comping session by ID.",
    )
    async def twentylabs_comping_load_session(session_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/comping/sessions/{_encode_path_param(session_id)}")


def register_mixer_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.mixer_preview",
        description="Preview a mixer configuration — mix multiple tracks with volume/pan/effects. Returns mixed audio.",
    )
    async def twentylabs_mixer_preview(
        tracks: list[dict[str, Any]],
        sample_rate: int = 44100,
        master_volume: float = 1.0,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/mixer/preview",
            json={
                "tracks": tracks,
                "sample_rate": sample_rate,
                "master_volume": master_volume,
            },
        )


def register_translate_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.translate_text",
        description="Translate text to a target language using the local LLM. Returns translated text.",
    )
    async def twentylabs_translate_text(
        text: str,
        target_language: str,
        source_language: str | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/translate",
            json={
                "text": text,
                "target_language": target_language,
                "source_language": source_language,
            },
        )

    @mcp.tool(
        name="21labs.translate_batch",
        description="Translate multiple text segments to a target language in one call.",
    )
    async def twentylabs_translate_batch(
        texts: list[str],
        target_language: str,
        source_language: str | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/translate/batch",
            json={
                "texts": texts,
                "target_language": target_language,
                "source_language": source_language,
            },
        )

    @mcp.tool(
        name="21labs.translate_languages",
        description="List available translation target languages.",
    )
    async def twentylabs_translate_languages() -> dict[str, Any]:
        return await _rest("GET", "/translate/languages")
