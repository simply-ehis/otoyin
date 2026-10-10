"""Speech / capture / profile MCP tools and their local helpers."""

from __future__ import annotations

import asyncio
import base64 as b64
import logging
import tempfile
from pathlib import Path
from typing import Any

from fastmcp import FastMCP

from ...database import get_db
from ...services import captures as captures_service, profiles as profiles_service
from .. import events as mcp_events
from ..context import current_client_id
from ..resolve import resolve_profile
from ._common import MAX_TRANSCRIBE_BYTES, _rest

logger = logging.getLogger(__name__)


def register_speech_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.speak",
        description=(
            "Speak text in a otoyin voice profile. Returns a generation id "
            "the caller can poll at /generate/{id}/status. Audio plays on the "
            "user's speakers and is saved to the Captures / History tab. "
            "engine: TTS engine name (e.g. 'kokoro', 'fish_speech') or None for profile default. "
            "personality: true to apply persona-based text rewrite before synthesis. "
            "language: ISO 639-1 code (e.g. 'en', 'es') or None for profile default."
        ),
    )
    async def twentylabs_speak(
        text: str,
        profile: str | None = None,
        engine: str | None = None,
        personality: bool | None = None,
        language: str | None = None,
    ) -> dict[str, Any]:
        from ...database.models import MCPClientBinding

        db = next(get_db())
        try:
            client_id = current_client_id.get()
            vp = resolve_profile(profile, client_id, db)
            if vp is None:
                raise ValueError(
                    "No voice profile resolved. Pass `profile=` with a "
                    "voice profile name or id, or set a default voice in "
                    "otoyin → Settings → MCP."
                )

            binding = None
            if client_id:
                binding = db.query(MCPClientBinding).filter(MCPClientBinding.client_id == client_id).first()

            resolved_personality = personality
            if resolved_personality is None and binding is not None:
                resolved_personality = bool(binding.default_personality)

            resolved_engine = engine
            if resolved_engine is None and binding is not None:
                resolved_engine = binding.default_engine

            use_persona = bool(resolved_personality) and bool(vp.personality)
            return await _speak(
                profile_id=vp.id,
                profile_name=vp.name,
                text=text,
                engine=resolved_engine,
                language=language,
                personality=use_persona,
                db=db,
            )
        finally:
            db.close()

    @mcp.tool(
        name="21labs.transcribe",
        description=(
            "Transcribe an audio clip to text using otoyin's local Whisper. "
            "Pass exactly one of `audio_base64` (bytes as base64) or "
            "`audio_path` (absolute local file path — loopback callers only). "
            "model: Whisper model size (e.g. 'tiny', 'base', 'small', 'medium') or None for default."
        ),
    )
    async def twentylabs_transcribe(
        audio_base64: str | None = None,
        audio_path: str | None = None,
        language: str | None = None,
        model: str | None = None,
    ) -> dict[str, Any]:
        from ..context import request_is_loopback

        if bool(audio_base64) == bool(audio_path):
            raise ValueError("Pass exactly one of `audio_base64` or `audio_path`.")

        if audio_path is not None:
            if not request_is_loopback():
                raise ValueError(
                    "`audio_path` is only available to loopback callers — remote callers must use `audio_base64`."
                )
            path = Path(audio_path)
            if not path.is_absolute():
                raise ValueError("`audio_path` must be absolute.")
            if not path.is_file():
                raise ValueError(f"File not found: {audio_path}")
            if path.stat().st_size > MAX_TRANSCRIBE_BYTES:
                raise ValueError(f"File exceeds {MAX_TRANSCRIBE_BYTES // (1024 * 1024)} MB limit.")
            return await _transcribe_file(path, language, model)

        try:
            raw = b64.b64decode(audio_base64, validate=True)
        except Exception as exc:
            raise ValueError(f"Invalid audio_base64: {exc}") from exc
        if len(raw) > MAX_TRANSCRIBE_BYTES:
            raise ValueError(f"Audio exceeds {MAX_TRANSCRIBE_BYTES // (1024 * 1024)} MB limit.")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(raw)
            tmp_path = Path(tmp.name)
        try:
            return await _transcribe_file(tmp_path, language, model)
        finally:
            tmp_path.unlink(missing_ok=True)

    @mcp.tool(
        name="21labs.diarize",
        description=(
            "Transcribe an audio clip AND tag each segment with a speaker "
            "('SPEAKER_00', 'SPEAKER_01', ...) using offline speaker "
            "diarization (Silero VAD + Resemblyzer + SpectralClustering — "
            "torch-free, ~7MB). Pass exactly one of `audio_base64` (bytes as "
            "base64) or `audio_path` (absolute local file path — loopback "
            "callers only). num_speakers: known speaker count (2-6) or None to "
            "auto-detect. model: Whisper model size (e.g. 'tiny', 'base') or "
            "None for default."
        ),
    )
    async def twentylabs_diarize(
        audio_base64: str | None = None,
        audio_path: str | None = None,
        language: str | None = None,
        model: str | None = None,
        num_speakers: int | None = None,
    ) -> dict[str, Any]:
        from ..context import request_is_loopback

        if bool(audio_base64) == bool(audio_path):
            raise ValueError("Pass exactly one of `audio_base64` or `audio_path`.")

        if num_speakers is not None and not (2 <= num_speakers <= 6):
            raise ValueError("`num_speakers` must be between 2 and 6, or None to auto-detect.")

        if audio_path is not None:
            if not request_is_loopback():
                raise ValueError(
                    "`audio_path` is only available to loopback callers — remote callers must use `audio_base64`."
                )
            path = Path(audio_path)
            if not path.is_absolute():
                raise ValueError("`audio_path` must be absolute.")
            if not path.is_file():
                raise ValueError(f"File not found: {audio_path}")
            if path.stat().st_size > MAX_TRANSCRIBE_BYTES:
                raise ValueError(f"File exceeds {MAX_TRANSCRIBE_BYTES // (1024 * 1024)} MB limit.")
            return await _diarize_file(path, language, model, num_speakers)

        try:
            raw = b64.b64decode(audio_base64, validate=True)
        except Exception as exc:
            raise ValueError(f"Invalid audio_base64: {exc}") from exc
        if len(raw) > MAX_TRANSCRIBE_BYTES:
            raise ValueError(f"Audio exceeds {MAX_TRANSCRIBE_BYTES // (1024 * 1024)} MB limit.")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(raw)
            tmp_path = Path(tmp.name)
        try:
            return await _diarize_file(tmp_path, language, model, num_speakers)
        finally:
            tmp_path.unlink(missing_ok=True)

    @mcp.tool(
        name="21labs.list_captures",
        description=(
            "List recent voice captures (dictations, recordings, uploads) with their transcripts. Most-recent first."
        ),
    )
    async def twentylabs_list_captures(limit: int = 20, offset: int = 0) -> dict[str, Any]:
        if not (1 <= limit <= 200):
            raise ValueError("`limit` must be between 1 and 200.")
        if offset < 0:
            raise ValueError("`offset` must be >= 0.")
        db = next(get_db())
        try:
            items, total = captures_service.list_captures(db, limit=limit, offset=offset)
            return {
                "captures": [item.model_dump(mode="json") for item in items],
                "total": total,
            }
        finally:
            db.close()

    @mcp.tool(
        name="21labs.list_profiles",
        description=(
            "List available voice profiles (both cloned voices and presets). "
            "Use the returned `name` with 21labs.speak(profile=...)."
        ),
    )
    async def twentylabs_list_profiles() -> dict[str, Any]:
        db = next(get_db())
        try:
            profiles = await profiles_service.list_profiles(db)
            return {
                "profiles": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "voice_type": p.voice_type,
                        "language": p.language,
                        "has_personality": bool(getattr(p, "personality", None)),
                    }
                    for p in profiles
                ]
            }
        finally:
            db.close()

    @mcp.tool(
        name="21labs.list_preset_voices",
        description="List all available preset voices (Kokoro, KittenTTS) with their engine, language, and gender.",
    )
    async def twentylabs_list_preset_voices(engine: str | None = None) -> dict[str, Any]:
        return await _rest(
            "GET",
            "/profiles/preset-voices",
            params={"engine": engine} if engine else None,
        )

    @mcp.tool(
        name="21labs.create_profile",
        description="Create a new voice profile. voice_type: 'cloned' (requires reference audio), 'preset' (built-in voice), or 'designed' (text description via Parler-TTS). For designed voices, provide design_prompt or voice_attributes (dict with gender/age/accent/tone/style/pacing). For preset, provide preset_engine and preset_voice_id. For cloned, provide sample_path and reference_text.",
    )
    async def twentylabs_create_profile(
        name: str,
        voice_type: str = "cloned",
        language: str = "en",
        description: str | None = None,
        design_prompt: str | None = None,
        voice_attributes: dict | None = None,
        preset_engine: str | None = None,
        preset_voice_id: str | None = None,
        sample_path: str | None = None,
        reference_text: str | None = None,
        personality: str | None = None,
        default_engine: str | None = None,
    ) -> dict[str, Any]:
        from ... import models
        from ...database import get_db
        from ...services import profiles as profiles_service

        db = next(get_db())
        try:
            if voice_type == "designed":
                if not design_prompt and not voice_attributes:
                    raise ValueError("design_prompt or voice_attributes is required for voice_type='designed'")
                from ...services.profiles import DESIGN_CAPABLE_ENGINES

                engine_for_design = default_engine or "parler_tts_gguf"
                if engine_for_design not in DESIGN_CAPABLE_ENGINES:
                    raise ValueError(
                        f"Engine '{engine_for_design}' does not support voice design. "
                        f"Available: {', '.join(DESIGN_CAPABLE_ENGINES.keys())}"
                    )
                profile_data = models.VoiceProfileCreate(
                    name=name,
                    description=description,
                    language=language,
                    voice_type="designed",
                    design_prompt=design_prompt,
                    voice_attributes=voice_attributes,
                    default_engine=engine_for_design,
                    personality=personality,
                )
            elif voice_type == "preset":
                if not preset_engine or not preset_voice_id:
                    raise ValueError("preset_engine and preset_voice_id are required for voice_type='preset'")
                profile_data = models.VoiceProfileCreate(
                    name=name,
                    description=description,
                    language=language,
                    voice_type="preset",
                    preset_engine=preset_engine,
                    preset_voice_id=preset_voice_id,
                    default_engine=preset_engine,
                    personality=personality,
                )
            elif voice_type == "cloned":
                if not sample_path or not reference_text:
                    raise ValueError("sample_path and reference_text are required for voice_type='cloned'")
                profile_data = models.VoiceProfileCreate(
                    name=name,
                    description=description,
                    language=language,
                    voice_type="cloned",
                    default_engine=default_engine,
                    personality=personality,
                )
            else:
                raise ValueError("voice_type must be 'cloned', 'preset', or 'designed'")

            profile = await profiles_service.create_profile(data=profile_data, db=db)

            if voice_type == "cloned" and sample_path:
                await profiles_service.add_sample(db, profile.id, sample_path, reference_text)

            return {
                "id": profile.id,
                "name": profile.name,
                "voice_type": profile.voice_type,
                "language": profile.language,
            }
        finally:
            db.close()

    @mcp.tool(
        name="21labs.delete_profile",
        description="Delete a voice profile by ID.",
    )
    async def twentylabs_delete_profile(profile_id: str) -> dict[str, Any]:
        from ...database import get_db
        from ...services import profiles as profiles_service

        db = next(get_db())
        try:
            await profiles_service.delete_profile(db, profile_id)
            return {"deleted": True, "profile_id": profile_id}
        finally:
            db.close()

    @mcp.tool(
        name="21labs.get_profile",
        description="Get a voice profile by ID.",
    )
    async def twentylabs_get_profile(profile_id: str) -> dict[str, Any]:
        from ...database import get_db
        from ...services import profiles as profiles_service

        db = next(get_db())
        try:
            profile = await profiles_service.get_profile(db, profile_id)
            if not profile:
                raise ValueError(f"Profile not found: {profile_id}")
            return {
                "id": profile.id,
                "name": profile.name,
                "voice_type": profile.voice_type,
                "language": profile.language,
                "description": profile.description,
                "personality": getattr(profile, "personality", None),
                "design_prompt": getattr(profile, "design_prompt", None),
                "voice_attributes": getattr(profile, "voice_attributes", None),
                "preset_engine": getattr(profile, "preset_engine", None),
                "preset_voice_id": getattr(profile, "preset_voice_id", None),
                "default_engine": getattr(profile, "default_engine", None),
                "avatar_path": getattr(profile, "avatar_path", None),
            }
        finally:
            db.close()

    @mcp.tool(
        name="21labs.update_profile",
        description="Update a voice profile. Can update name, description, language, personality, default_engine.",
    )
    async def twentylabs_update_profile(
        profile_id: str,
        name: str | None = None,
        description: str | None = None,
        language: str | None = None,
        personality: str | None = None,
        default_engine: str | None = None,
    ) -> dict[str, Any]:
        from ...database import get_db
        from ...services import profiles as profiles_service

        db = next(get_db())
        try:
            update_data = {}
            if name is not None:
                update_data["name"] = name
            if description is not None:
                update_data["description"] = description
            if language is not None:
                update_data["language"] = language
            if personality is not None:
                update_data["personality"] = personality
            if default_engine is not None:
                update_data["default_engine"] = default_engine

            profile = await profiles_service.update_profile(db, profile_id, **update_data)
            return {
                "id": profile.id,
                "name": profile.name,
                "voice_type": profile.voice_type,
                "language": profile.language,
            }
        finally:
            db.close()

    @mcp.tool(
        name="21labs.add_profile_sample",
        description="Add a reference audio sample to a cloned voice profile. For voice_type='cloned' profiles only.",
    )
    async def twentylabs_add_profile_sample(
        profile_id: str,
        sample_path: str,
        reference_text: str,
    ) -> dict[str, Any]:
        from ...database import get_db
        from ...services import profiles as profiles_service

        db = next(get_db())
        try:
            sample = await profiles_service.add_sample(db, profile_id, sample_path, reference_text)
            return {
                "sample_id": sample.id,
                "profile_id": profile_id,
                "reference_text": sample.reference_text,
            }
        finally:
            db.close()

    @mcp.tool(
        name="21labs.list_profile_samples",
        description="List reference audio samples for a voice profile.",
    )
    async def twentylabs_list_profile_samples(profile_id: str) -> dict[str, Any]:
        from ...database import get_db
        from ...services import profiles as profiles_service

        db = next(get_db())
        try:
            samples = await profiles_service.list_samples(db, profile_id)
            return {
                "samples": [
                    {
                        "id": s.id,
                        "reference_text": s.reference_text,
                        "audio_path": s.audio_path,
                        "duration": s.duration,
                    }
                    for s in samples
                ]
            }
        finally:
            db.close()

    @mcp.tool(
        name="21labs.clone_voice",
        description="Clone a voice from reference audio. Creates a new voice profile from the provided audio file and reference text. Returns the new profile_id.",
    )
    async def twentylabs_clone_voice(
        name: str,
        sample_path: str,
        reference_text: str,
        language: str = "en",
        description: str | None = None,
        default_engine: str | None = None,
    ) -> dict[str, Any]:
        from ... import models
        from ...database import get_db
        from ...services import profiles as profiles_service

        db = next(get_db())
        try:
            profile_data = models.VoiceProfileCreate(
                name=name,
                description=description,
                language=language,
                voice_type="cloned",
                default_engine=default_engine,
            )
            profile = await profiles_service.create_profile(data=profile_data, db=db)
            sample = await profiles_service.add_sample(db, profile.id, sample_path, reference_text)
            return {
                "profile_id": profile.id,
                "name": profile.name,
                "voice_type": profile.voice_type,
                "sample_id": sample.id,
            }
        finally:
            db.close()

    @mcp.tool(
        name="21labs.voice_changer_status",
        description="Get the real-time voice changer status and available effects ranges.",
    )
    async def twentylabs_voice_changer_status() -> dict[str, Any]:
        return await _rest("GET", "/voice-changer/status")

    @mcp.tool(
        name="21labs.voice_changer_effects",
        description="Get available voice changer effects with their parameter ranges.",
    )
    async def twentylabs_voice_changer_effects() -> dict[str, Any]:
        return await _rest("GET", "/voice-changer/effects")

    @mcp.tool(
        name="21labs.voice_changer_enable",
        description="Enable or disable the real-time Voice Changer (lower-risk store setter; the agent does not mutate the live audio graph).",
    )
    async def twentylabs_voice_changer_enable(enabled: bool = True) -> dict[str, Any]:
        return await _rest("POST", "/voice-changer/enable", json={"enabled": enabled})

    @mcp.tool(
        name="21labs.voice_changer_set_profile",
        description="Set the active Voice Changer profile by id (lower-risk store setter).",
    )
    async def twentylabs_voice_changer_set_profile(profile: str) -> dict[str, Any]:
        return await _rest("POST", "/voice-changer/set-profile", json={"profile": profile})

    @mcp.tool(
        name="21labs.voice_changer_set_preset",
        description="Apply a Voice Changer preset (telephone/deep/chipmunk) or clear it with null (lower-risk store setter).",
    )
    async def twentylabs_voice_changer_set_preset(preset: str | None = None) -> dict[str, Any]:
        return await _rest("POST", "/voice-changer/set-preset", json={"preset": preset})


async def _speak(
    *,
    profile_id: str,
    profile_name: str,
    text: str,
    engine: str | None,
    language: str | None,
    personality: bool,
    db,
) -> dict[str, Any]:
    """Delegate to POST /generate — the route handles personality-rewrite
    internally when ``personality=true`` and the profile has a prompt.

    Goes through REST (like every other MCP tool) instead of calling the
    route function in-process: the generation task queue lives in the
    backend process, so direct calls fail outside the in-process /mcp
    mount (stdio shim, external hosts)."""
    from ._common import _rest

    generation = await _rest(
        "POST",
        "/generate",
        json={
            "profile_id": profile_id,
            "text": text,
            "language": language or "en",
            "engine": engine,
            "personality": personality,
        },
    )
    return _speak_response(generation, profile_name, source="mcp")


def _speak_response(generation, profile_name: str, *, source: str) -> dict[str, Any]:
    """Normalize a GenerationResponse into the MCP tool's return shape.

    Also fires a speak-start event so the DictateWindow pill surfaces
    the agent's speech. Speak-end is fired from run_generation's
    completion hook.
    """
    payload = generation.model_dump(mode="json") if hasattr(generation, "model_dump") else dict(generation)
    generation_id = payload.get("id")
    mcp_events.publish(
        "speak-start",
        {
            "generation_id": generation_id,
            "profile_name": profile_name,
            "source": source,
            "client_id": current_client_id.get(),
        },
    )
    return {
        "generation_id": generation_id,
        "status": payload.get("status"),
        "profile": profile_name,
        "source": source,
        "poll_url": f"/generate/{generation_id}/status" if generation_id else None,
    }


async def _transcribe_file(path: Path, language: str | None, model: str | None) -> dict[str, Any]:
    from ...backends.whisper_cpp_backend import WHISPER_CPP_FILES
    from ...services import transcribe as transcribe_service
    from ...utils.audio import load_audio

    whisper = transcribe_service.get_whisper_model()
    model_size = model or whisper.model_size
    valid = list(WHISPER_CPP_FILES.keys())
    if model_size not in valid:
        raise ValueError(f"Invalid STT model '{model_size}'. Must be one of: {', '.join(valid)}")

    audio, sr = await asyncio.to_thread(load_audio, str(path))
    duration = len(audio) / sr

    if (not whisper.is_loaded() or whisper.model_size != model_size) and not whisper._is_model_cached(model_size):
        raise ValueError(
            f"Whisper model '{model_size}' is not yet downloaded. Open otoyin → Settings → Models to download it first."
        )

    text = await whisper.transcribe(str(path), language, model_size)
    return {
        "text": text,
        "duration": duration,
        "language": language,
        "model": model_size,
    }


async def _diarize_file(
    path: Path,
    language: str | None,
    model: str | None,
    num_speakers: int | None,
) -> dict[str, Any]:
    """Transcribe + diarize a local audio file and return speaker-tagged segments."""
    from ...backends.whisper_cpp_backend import WHISPER_CPP_FILES
    from ...services import diarization as diarization_service, transcribe as transcribe_service

    whisper = transcribe_service.get_whisper_model()
    model_size = model or whisper.model_size
    valid = list(WHISPER_CPP_FILES.keys())
    if model_size not in valid:
        raise ValueError(f"Invalid STT model '{model_size}'. Must be one of: {', '.join(valid)}")

    if (not whisper.is_loaded() or whisper.model_size != model_size) and not whisper._is_model_cached(model_size):
        raise ValueError(
            f"Whisper model '{model_size}' is not yet downloaded. Open otoyin → Settings → Models to download it first."
        )

    result = await whisper.transcribe_with_segments(str(path), language, model_size)
    segments = [
        {
            "start": seg.get("start", 0.0),
            "end": seg.get("end", 0.0),
            "text": seg.get("text", "").strip(),
        }
        for seg in result.get("segments", [])
        if seg.get("text", "").strip()
    ]

    turns = await asyncio.to_thread(diarization_service.diarize_turns, str(path), num_speakers)
    if turns:
        from types import SimpleNamespace

        aligned = [SimpleNamespace(**seg) for seg in segments]
        diarization_service.align_speakers(aligned, turns)
        segments = [{"start": s.start, "end": s.end, "text": s.text, "speaker": s.speaker} for s in aligned]

    speakers = sorted({s["speaker"] for s in segments})
    return {
        "text": result.get("text", "").strip(),
        "duration": await asyncio.to_thread(_audio_duration, str(path)),
        "segments": segments,
        "speakers": speakers,
        "diarized": len({s["speaker"] for s in segments}) > 1,
        "language": language,
        "model": model_size,
    }


def _audio_duration(path: str) -> float:
    """Read audio duration without loading the whole waveform."""
    import soundfile as sf

    return float(sf.info(path).duration)
