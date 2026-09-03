"""Dubbing MCP tools — video dubbing pipeline via REST."""

from __future__ import annotations

from typing import Any

from fastmcp import FastMCP

from ._common import _encode_path_param, _rest


def register_dubbing_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.dub_video",
        description="Start a video dubbing job: transcribe → translate → re-voice → mux. Returns a job_id for polling. target_lang: language code (e.g. 'es', 'fr', 'de'). profile_id: voice profile to use for dubbing. engine: TTS engine (default 'kokoro').",
    )
    async def twentylabs_dub_video(
        video_path: str,
        target_lang: str,
        profile_id: str,
        engine: str = "kokoro",
        source_lang: str | None = None,
        num_speakers: int | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/dubbing/dub",
            json={
                "video_path": video_path,
                "target_lang": target_lang,
                "profile_id": profile_id,
                "engine": engine,
                "source_lang": source_lang,
                "num_speakers": num_speakers,
            },
        )

    @mcp.tool(
        name="21labs.dub_status",
        description="Check the status and progress of a dubbing job. Returns segments, progress %, and output path when done.",
    )
    async def twentylabs_dub_status(job_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/dubbing/job/{job_id}")

    @mcp.tool(
        name="21labs.dub_cancel",
        description="Cancel a running dubbing job.",
    )
    async def twentylabs_dub_cancel(job_id: str) -> dict[str, Any]:
        return await _rest("POST", f"/dubbing/cancel/{job_id}")

    @mcp.tool(
        name="21labs.dub_download",
        description="Download the dubbed video file when the job is complete.",
    )
    async def twentylabs_dub_download(job_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/dubbing/download/{job_id}")

    @mcp.tool(
        name="21labs.dub_preview",
        description="Preview transcription of a video without translating. Returns speaker-tagged transcript segments.",
    )
    async def twentylabs_dub_preview(
        video_path: str,
        source_lang: str | None = None,
        num_speakers: int | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/dubbing/preview",
            json={
                "video_path": video_path,
                "source_lang": source_lang,
                "num_speakers": num_speakers,
            },
        )

    @mcp.tool(
        name="21labs.dub_languages",
        description="List all available target languages for video dubbing.",
    )
    async def twentylabs_dub_languages() -> dict[str, Any]:
        return await _rest("GET", "/dubbing/languages")

    # ── ADR (Acted Dialogue Replacement) ──────────────────────────────────

    @mcp.tool(
        name="21labs.adr_create_session",
        description="Create an ADR session for a video. Upload a guide track, then record takes for each line.",
    )
    async def twentylabs_adr_create_session(
        video_path: str,
        name: str | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/adr/sessions",
            json={"video_path": video_path, "name": name} if name else {"video_path": video_path},
        )

    @mcp.tool(
        name="21labs.adr_list_sessions",
        description="List all ADR sessions.",
    )
    async def twentylabs_adr_list_sessions() -> dict[str, Any]:
        return await _rest("GET", "/adr/sessions")

    @mcp.tool(
        name="21labs.adr_get_session",
        description="Get an ADR session with its lines and takes.",
    )
    async def twentylabs_adr_get_session(session_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/adr/sessions/{_encode_path_param(session_id)}")

    @mcp.tool(
        name="21labs.adr_upload_guide",
        description="Upload a guide audio track for an ADR session.",
    )
    async def twentylabs_adr_upload_guide(session_id: str, audio_path: str) -> dict[str, Any]:
        return await _rest(
            "POST", f"/adr/sessions/{_encode_path_param(session_id)}/guide", json={"audio_path": audio_path}
        )

    @mcp.tool(
        name="21labs.adr_upload_take",
        description="Upload a take recording for a specific line in an ADR session.",
    )
    async def twentylabs_adr_upload_take(session_id: str, line_id: str, audio_path: str) -> dict[str, Any]:
        return await _rest(
            "POST",
            f"/adr/sessions/{_encode_path_param(session_id)}/lines/{_encode_path_param(line_id)}/takes",
            json={"audio_path": audio_path},
        )

    @mcp.tool(
        name="21labs.adr_select_take",
        description="Select a take for a line in an ADR session.",
    )
    async def twentylabs_adr_select_take(session_id: str, line_id: str, take_id: str) -> dict[str, Any]:
        return await _rest(
            "POST",
            f"/adr/sessions/{_encode_path_param(session_id)}/lines/{_encode_path_param(line_id)}/select/{_encode_path_param(take_id)}",
        )

    @mcp.tool(
        name="21labs.adr_auto_select",
        description="Auto-select the best take for a line based on quality scoring.",
    )
    async def twentylabs_adr_auto_select(line_id: str) -> dict[str, Any]:
        return await _rest("POST", "/adr/auto-select", json={"line_id": line_id})

    @mcp.tool(
        name="21labs.adr_upload_guide_path",
        description="Set the guide track path for an ADR session.",
    )
    async def twentylabs_adr_upload_guide_path(session_id: str, audio_path: str) -> dict[str, Any]:
        return await _rest(
            "POST", f"/adr/sessions/{_encode_path_param(session_id)}/guide-path", json={"audio_path": audio_path}
        )

    @mcp.tool(
        name="21labs.adr_upload_takes_path",
        description="Upload a take via file path for a line in an ADR session.",
    )
    async def twentylabs_adr_upload_takes_path(session_id: str, line_id: str, audio_path: str) -> dict[str, Any]:
        return await _rest(
            "POST",
            f"/adr/sessions/{_encode_path_param(session_id)}/lines/{_encode_path_param(line_id)}/takes-path",
            json={"audio_path": audio_path},
        )

    @mcp.tool(
        name="21labs.adr_align",
        description="Align a take to guide audio. Supply raw audio as base64-encoded float arrays.",
    )
    async def twentylabs_adr_align(
        guide_audio: list[float], take_audio: list[float], sample_rate: int = 24000
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/adr/align",
            json={"guide_audio": guide_audio, "take_audio": take_audio, "sample_rate": sample_rate},
        )

    @mcp.tool(
        name="21labs.adr_score",
        description="Score the quality of a take. Supply audio as a base64-encoded float array.",
    )
    async def twentylabs_adr_score(line_id: str, audio: list[float], sample_rate: int = 24000) -> dict[str, Any]:
        return await _rest("POST", "/adr/score", json={"line_id": line_id, "audio": audio, "sample_rate": sample_rate})

    @mcp.tool(
        name="21labs.adr_guide_audio",
        description="Get the guide audio for an ADR session.",
    )
    async def twentylabs_adr_guide_audio(session_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/adr/guide-audio/{_encode_path_param(session_id)}")

    @mcp.tool(
        name="21labs.adr_take_audio",
        description="Get the audio for a specific take.",
    )
    async def twentylabs_adr_take_audio(take_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/adr/audio/{_encode_path_param(take_id)}")

    @mcp.tool(
        name="21labs.adr_waveform",
        description="Get waveform data for a take.",
    )
    async def twentylabs_adr_waveform(take_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/adr/waveform/{_encode_path_param(take_id)}")

    @mcp.tool(
        name="21labs.adr_guide_waveform",
        description="Get waveform data for the guide track.",
    )
    async def twentylabs_adr_guide_waveform(session_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/adr/sessions/{_encode_path_param(session_id)}/guide-waveform")
