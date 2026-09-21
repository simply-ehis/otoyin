"""
MCP tools for generation (speech, music, SFX, bounce, etc.).
"""

from __future__ import annotations

import logging
from typing import Any

from fastmcp import FastMCP

from ._common import _wav_b64

logger = logging.getLogger(__name__)


def register_generation_tools(mcp: FastMCP) -> None:
    """Register generation tools (music, models, bounce) with the MCP server."""

    @mcp.tool(
        name="21labs.generate_music",
        description=(
            "Generate a music track from a text prompt using otoyin's local "
            "music engines (genre/mood controllable, optional tempo). "
            "engine: acestep_gguf (ACE-Step 1.5 GGUF) or heartmula (HeartMuLa 3B). "
            "mode: generate (default), cover (cover of described style), "
            "or repaint (reimagined version). "
            "Returns the rendered WAV as base64."
        ),
    )
    async def twentylabs_generate_music(
        engine: str = "acestep_gguf",
        prompt: str = "",
        duration_seconds: float = 30.0,
        genre: str = "pop",
        mood: str = "neutral",
        tempo: int | None = None,
        seed: int | None = None,
        mode: str = "generate",
    ) -> dict[str, Any]:
        from ...backends import get_music_backend
        from ...backends.configs import get_all_model_configs
        from ...backends.protocols import MUSIC_ENGINES
        from ...services.model_registry import is_downloaded

        if engine not in MUSIC_ENGINES:
            raise ValueError(f"Unknown music engine '{engine}'. Supported: {', '.join(MUSIC_ENGINES)}")
        # Manifest gate: music engines must be downloaded via the Store.
        cfg = next((c for c in get_all_model_configs() if c.engine == engine), None)
        if cfg is not None and not is_downloaded(cfg.model_name, cfg.model_size):
            raise ValueError(f"Download this model from the Store first ({cfg.model_name})")
        backend = get_music_backend(engine)
        if not backend.is_available():
            raise ValueError(f"Music engine '{engine}' not available.")
        try:
            audio, sr = backend.generate(
                prompt=prompt,
                duration_seconds=duration_seconds,
                genre=genre,
                mood=mood,
                tempo=tempo,
                seed=seed,
                mode=mode,
            )
        except Exception as exc:
            raise ValueError(f"Music generation failed: {exc}") from exc
        return {
            "audio_base64": _wav_b64(audio, sr),
            "sample_rate": sr,
            "duration": float(len(audio)) / sr,
            "engine": engine,
            "prompt": prompt,
        }

    @mcp.tool(
        name="21labs.generate_sfx",
        description=(
            "Generate a sound effect from a text prompt using otoyin's local "
            "SFX engines. Accepts an ``engine`` param (``stable_audio`` "
            "or ``sa3_sfx``). Returns the rendered WAV as base64."
        ),
    )
    async def twentylabs_generate_sfx(
        prompt: str,
        duration_seconds: float = 5.0,
        seed: int | None = None,
        engine: str = "stable_audio",
    ) -> dict[str, Any]:
        from ...backends import get_music_backend
        from ...backends.configs import get_all_model_configs
        from ...backends.protocols import MUSIC_ENGINES
        from ...services.model_registry import is_downloaded

        if engine not in MUSIC_ENGINES:
            raise ValueError(f"Unknown SFX engine '{engine}'. Supported: {', '.join(MUSIC_ENGINES)}")
        # Manifest gate (same remote-only exemption as /generate/sfx).
        cfg = next((c for c in get_all_model_configs() if c.engine == engine), None)
        if cfg is not None and cfg.hf_repo_id and not is_downloaded(cfg.model_name, cfg.model_size):
            raise ValueError(f"Download this model from the Store first ({cfg.model_name})")
        backend = get_music_backend(engine)
        if not backend.is_available():
            raise ValueError(f"SFX engine '{engine}' not available.")
        try:
            audio, sr = backend.generate(prompt=prompt, duration_seconds=duration_seconds, seed=seed)
        except Exception as exc:
            raise ValueError(f"SFX generation failed: {exc}") from exc
        return {
            "audio_base64": _wav_b64(audio, sr),
            "sample_rate": sr,
            "duration": float(len(audio)) / sr,
            "engine": engine,
            "prompt": prompt,
        }

    @mcp.tool(
        name="21labs.list_models",
        description=(
            "List the local model engines otoyin can drive (TTS, STT, music, "
            "SFX, LLM). Use this to discover which `engine=` values are valid for "
            "the generate_* tools."
        ),
    )
    async def twentylabs_list_models() -> dict[str, Any]:
        from ...backends import LLM_ENGINES, MUSIC_ENGINES, TTS_ENGINES

        return {
            "tts_engines": list(TTS_ENGINES.keys()),
            "music_engines": list(MUSIC_ENGINES.keys()),
            "llm_engines": list(LLM_ENGINES.keys()),
            "stt": "whisper.cpp (tiny.en)",
        }

    @mcp.tool(
        name="21labs.bounce",
        description=(
            "Mix multiple audio tracks into one master WAV with volume / pan / "
            "crossfade / effects / MIDI synthesis. Each track's `audio_data` is a "
            "base64 WAV. Returns the mixed WAV as base64 so agents can orchestrate "
            "full productions end-to-end."
        ),
    )
    async def twentylabs_bounce(
        tracks: list[dict[str, Any]],
        sample_rate: int = 44100,
        master_volume: float = 1.0,
    ) -> dict[str, Any]:
        from ...routes.audio_pipeline.bounce import BounceRequest, BounceTrackConfig, _bounce_mix

        try:
            req = BounceRequest(
                tracks=[BounceTrackConfig(**t) for t in tracks],
                sample_rate=sample_rate,
                master_volume=master_volume,
            )
        except Exception as exc:
            raise ValueError(f"Invalid bounce request: {exc}") from exc

        mixed, sr = _bounce_mix(req)
        return {
            "audio_base64": _wav_b64(mixed, sr),
            "sample_rate": sr,
            "duration": float(len(mixed)) / sr,
            "track_count": len(tracks),
        }
