"""Import / plugin REST MCP tools."""

from __future__ import annotations

from typing import Any

from fastmcp import FastMCP

from ._common import _encode_path_param, _rest


def register_import_tools(mcp: FastMCP) -> None:
    # ── Import / Plugins ─────────────────────────────────────────────────

    @mcp.tool(
        name="21labs.preview_plugin_chain",
        description="Preview a plugin chain on an audio file — returns WAV audio bytes without saving. Use for auditioning effects before committing.",
    )
    async def twentylabs_preview_plugin_chain(
        audio_path: str,
        chain: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/plugins/preview",
            json={"audio_path": audio_path, "chain": chain or []},
        )

    @mcp.tool(
        name="21labs.video_preview",
        description="Stream a local video file for in-app preview. Returns the video file directly.",
    )
    async def twentylabs_video_preview(video_path: str) -> dict[str, Any]:
        return await _rest(
            "GET",
            "/import/video-preview",
            params={"file_path": video_path},
        )

    @mcp.tool(
        name="21labs.audio_preview",
        description="Stream a local audio file (e.g. extracted from video) for preview. Returns the audio file directly.",
    )
    async def twentylabs_audio_preview(audio_path: str) -> dict[str, Any]:
        return await _rest(
            "GET",
            "/import/audio-preview",
            params={"file_path": audio_path},
        )

    @mcp.tool(
        name="21labs.extract_audio",
        description="Extract the audio track from a video file. Returns the path to the extracted audio.",
    )
    async def twentylabs_extract_audio(
        video_path: str,
        sample_rate: int = 48000,
        channels: int = 1,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/import/extract-audio",
            json={"video_path": video_path, "sample_rate": sample_rate, "channels": channels},
        )

    @mcp.tool(
        name="21labs.convert_audio",
        description="Convert an audio file to a different format (wav, mp3, etc.). Optionally apply neural noise cleanup.",
    )
    async def twentylabs_convert_audio(
        audio_path: str,
        target_format: str = "wav",
        sample_rate: int = 48000,
        channels: int = 1,
        sanitize: bool = False,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/import/convert",
            json={
                "input_path": audio_path,
                "target_format": target_format,
                "sample_rate": sample_rate,
                "channels": channels,
                "sanitize": sanitize,
            },
        )

    # ── Reference Voices ─────────────────────────────────────────────────

    @mcp.tool(
        name="21labs.list_reference_voices",
        description="List available bundled celebrity/character reference voices for zero-shot cloning. Filter by language (ISO 639-1) and category.",
    )
    async def twentylabs_list_reference_voices(
        language: str | None = None,
        category: str | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "GET",
            "/reference-voices",
            params={"language": language, "category": category} if language or category else None,
        )

    @mcp.tool(
        name="21labs.get_reference_voice",
        description="Get metadata for a specific reference voice by ID.",
    )
    async def twentylabs_get_reference_voice(voice_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/reference-voices/{_encode_path_param(voice_id)}")

    @mcp.tool(
        name="21labs.use_reference_voice",
        description="Create a voice profile from a reference voice clip. The clip is copied as a sample for cloning-compatible TTS engines. Returns the new profile_id.",
    )
    async def twentylabs_use_reference_voice(
        voice_id: str,
        profile_name: str | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            f"/reference-voices/{_encode_path_param(voice_id)}/use",
            json={"profile_name": profile_name} if profile_name else {},
        )

    @mcp.tool(
        name="21labs.reference_voice_audio",
        description="Get the audio file for a reference voice (base64 WAV). Use for preview before using.",
    )
    async def twentylabs_reference_voice_audio(voice_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/reference-voices/{_encode_path_param(voice_id)}/audio")

    @mcp.tool(
        name="21labs.reload_reference_voices",
        description="Reload the reference voice registry from disk.",
    )
    async def twentylabs_reload_reference_voices() -> dict[str, Any]:
        return await _rest("POST", "/reference-voices/reload")

    # ── Audiobook Management ─────────────────────────────────────────────

    @mcp.tool(
        name="21labs.list_audiobooks",
        description="List all audiobooks.",
    )
    async def twentylabs_list_audiobooks() -> dict[str, Any]:
        return await _rest("GET", "/audiobooks")

    @mcp.tool(
        name="21labs.get_audiobook",
        description="Get an audiobook with its chapters and cast.",
    )
    async def twentylabs_get_audiobook(book_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/audiobooks/{_encode_path_param(book_id)}")

    @mcp.tool(
        name="21labs.create_audiobook",
        description="Create a new audiobook. title: book title. author: author name. description: optional description. cover_path: optional path to cover image.",
    )
    async def twentylabs_create_audiobook(
        title: str,
        author: str,
        description: str | None = None,
        cover_path: str | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audiobooks",
            json={"title": title, "author": author, "description": description, "cover_path": cover_path},
        )

    @mcp.tool(
        name="21labs.add_audiobook_chapter",
        description="Add a chapter to an audiobook. text: chapter text content.",
    )
    async def twentylabs_add_audiobook_chapter(
        book_id: str,
        title: str,
        text: str,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            f"/audiobooks/{_encode_path_param(book_id)}/chapters",
            json={"title": title, "text": text},
        )

    @mcp.tool(
        name="21labs.render_audiobook",
        description="Render an entire audiobook to audio using the batch queue. engine: TTS engine name. profile_id: optional voice profile. Returns a batch job ID for polling.",
    )
    async def twentylabs_render_audiobook(
        book_id: str,
        engine: str | None = None,
        profile_id: str | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            f"/audiobooks/{_encode_path_param(book_id)}/render",
            json={"engine": engine, "profile_id": profile_id} if engine or profile_id else {},
        )

    @mcp.tool(
        name="21labs.render_audiobook_chapter",
        description="Render a single chapter of an audiobook. engine: TTS engine name. profile_id: optional voice profile. Returns a batch job ID for polling.",
    )
    async def twentylabs_render_audiobook_chapter(
        book_id: str,
        chapter_id: str,
        engine: str | None = None,
        profile_id: str | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            f"/audiobooks/{_encode_path_param(book_id)}/render",
            json={"engine": engine, "profile_id": profile_id} if engine or profile_id else {},
        )

    @mcp.tool(
        name="21labs.add_audiobook_cast",
        description="Add or update a character voice casting for an audiobook. character: character name. profile_id: voice profile to use for this character.",
    )
    async def twentylabs_add_audiobook_cast(
        book_id: str,
        character: str,
        profile_id: str,
    ) -> dict[str, Any]:
        return await _rest(
            "PUT",
            f"/audiobooks/{_encode_path_param(book_id)}/cast",
            json={"character": character, "profile_id": profile_id},
        )

    @mcp.tool(
        name="21labs.parse_audiobook_script",
        description="Parse a chapter's script into utterances for multi-voice casting.",
    )
    async def twentylabs_parse_audiobook_script(
        book_id: str,
        chapter_id: str,
    ) -> dict[str, Any]:
        return await _rest(
            "POST", f"/audiobooks/{_encode_path_param(book_id)}/chapters/{_encode_path_param(chapter_id)}/parse-script"
        )

    @mcp.tool(
        name="21labs.list_audiobook_utterances",
        description="List utterances for an audiobook chapter.",
    )
    async def twentylabs_list_audiobook_utterances(
        book_id: str,
        chapter_id: str,
    ) -> dict[str, Any]:
        return await _rest(
            "GET", f"/audiobooks/{_encode_path_param(book_id)}/chapters/{_encode_path_param(chapter_id)}/utterances"
        )

    @mcp.tool(
        name="21labs.import_audiobook",
        description="Import an EPUB/PDF book and convert to audiobook format.",
    )
    async def twentylabs_import_audiobook(
        file_path: str,
        title: str | None = None,
        author: str | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audiobooks/import-path",
            json={"file_path": file_path, "title": title, "author": author},
        )
