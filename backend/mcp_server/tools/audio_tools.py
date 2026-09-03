"""Audio-processing REST MCP tools (DSP, recipe, bounce preview)."""

from __future__ import annotations

from typing import Any, Literal

from fastmcp import FastMCP

from ._common import _encode_path_param, _rest


def register_audio_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.spectrogram",
        description="Compute spectrogram data for an audio file. Returns JSON data for visualization.",
    )
    async def twentylabs_spectrogram(
        audio_path: str,
        fft_size: int = 2048,
        hop_length: int = 512,
        window: Literal["hann", "hamming", "blackman", "bartlett", "hanning"] = "hann",
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/spectrogram",
            json={"audio_path": audio_path, "fft_size": fft_size, "hop_length": hop_length, "window": window},
        )

    @mcp.tool(
        name="21labs.noise_reduce",
        description="Apply RNNoise / VAD noise reduction to audio. Returns base64 WAV. vad_threshold: 0.0-1.0, higher = more aggressive noise removal.",
    )
    async def twentylabs_noise_reduce(audio_path: str, vad_threshold: float = 0.5) -> dict[str, Any]:
        return await _rest(
            "POST", "/audio/noise-reduce", json={"audio_path": audio_path, "vad_threshold": vad_threshold}
        )

    @mcp.tool(
        name="21labs.normalize_audio",
        description="Normalize audio to a target LUFS/db with peak control. Returns base64 WAV. target_db: target loudness in dB (e.g. -14.0 for podcasts). max_peak_db: maximum peak level in dB.",
    )
    async def twentylabs_normalize_audio(
        audio_path: str, target_db: float = -14.0, max_peak_db: float = -3.0
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/normalize",
            params={"audio_path": audio_path, "target_db": target_db, "max_peak_db": max_peak_db},
        )

    @mcp.tool(
        name="21labs.master_audio",
        description="Master a finished mix to a broadcast-ready target: glue compression, true-peak limiting, LUFS normalization, optional stereo widening. Returns base64 WAV.",
    )
    async def twentylabs_master_audio(
        audio_path: str, target_lufs: float = -14.0, true_peak_db: float = -1.0, width: float = 0.0
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/master",
            params={"audio_path": audio_path, "target_lufs": target_lufs, "true_peak_db": true_peak_db, "width": width},
        )

    @mcp.tool(
        name="21labs.separate_audio",
        description="Separate one stem (vocals/drums/bass/other) from a mix using Demucs. Optional/heavy dependency; returns a clear error if Demucs is not installed.",
    )
    async def twentylabs_separate_audio(
        audio_path: str, stem: Literal["vocals", "drums", "bass", "other"] = "vocals", model_name: str = "htdemucs"
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/separate",
            params={"audio_path": audio_path, "stem": stem, "model_name": model_name},
        )

    @mcp.tool(
        name="21labs.run_recipe",
        description="Run a content recipe end-to-end over generated segments: per-segment cleanup, crossfade concat, optional ducked music bed, then master to the recipe LUFS target. Returns export path + measured LUFS. music_path: storage path to a music bed file, or None for no music bed. recipe: 'podcast', 'audiobook', or 'voiceover'.",
    )
    async def twentylabs_run_recipe(
        segments: list[dict[str, Any]],
        recipe: str = "podcast",
        music_path: str | None = None,
        target_lufs: float | None = None,
        gap_ms: int = 250,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/recipe/run",
            json={
                "segments": segments,
                "recipe": recipe,
                "music_path": music_path,
                "target_lufs": target_lufs,
                "gap_ms": gap_ms,
            },
        )

    @mcp.tool(
        name="21labs.bounce_preview",
        description="Preview-mix multiple tracks (volume/pan/crossfade/effects/MIDI) into one WAV. Returns base64.",
    )
    async def twentylabs_bounce_preview(
        tracks: list[dict[str, Any]],
        sample_rate: int = 44100,
        master_volume: float = 1.0,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/bounce-preview",
            json={"tracks": tracks, "sample_rate": sample_rate, "master_volume": master_volume},
        )

    @mcp.tool(
        name="21labs.compress_audio",
        description="Apply dynamic range compression to audio. Returns base64 WAV. threshold_db: compression threshold in dB. ratio: compression ratio (e.g. 4.0 = 4:1). attack_ms/release_ms: envelope timing. makeup_gain_db: output gain补偿.",
    )
    async def twentylabs_compress_audio(
        audio_path: str,
        threshold_db: float = -20.0,
        ratio: float = 4.0,
        attack_ms: float = 10.0,
        release_ms: float = 100.0,
        makeup_gain_db: float = 0.0,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/compress",
            params={
                "audio_path": audio_path,
                "threshold_db": threshold_db,
                "ratio": ratio,
                "attack_ms": attack_ms,
                "release_ms": release_ms,
                "makeup_gain_db": makeup_gain_db,
            },
        )

    @mcp.tool(
        name="21labs.duck_audio",
        description="Apply sidechain ducking to audio for speech enhancement. Returns base64 WAV.",
    )
    async def twentylabs_duck_audio(
        audio_path: str,
        track_configs: list[dict[str, Any]] | None = None,
        threshold_db: float = -30.0,
        ratio: float = 4.0,
        duck_gain_db: float = -12.0,
        attack_ms: float = 5.0,
        release_ms: float = 50.0,
    ) -> dict[str, Any]:
        track_configs = track_configs or []
        return await _rest(
            "POST",
            "/audio/duck",
            params={
                "audio_path": audio_path,
                "threshold_db": threshold_db,
                "ratio": ratio,
                "duck_gain_db": duck_gain_db,
                "attack_ms": attack_ms,
                "release_ms": release_ms,
            },
            json={"track_configs": track_configs},
        )

    @mcp.tool(
        name="21labs.silence_removal",
        description="Remove silence from audio. Returns base64 WAV.",
    )
    async def twentylabs_silence_removal(
        audio_path: str,
        threshold_db: float = -40.0,
        min_length_ms: int = 100,
        max_silence_ms: int = 5000,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/silence-removal",
            params={
                "audio_path": audio_path,
                "threshold_db": threshold_db,
                "min_length_ms": min_length_ms,
                "max_silence_ms": max_silence_ms,
            },
        )

    @mcp.tool(
        name="21labs.analyze_loudness",
        description="Measure loudness of a stored clip: integrated LUFS, true-peak (dBTP), RMS, crest factor, loudness range, duration. Returns a JSON report.",
    )
    async def twentylabs_analyze_loudness(audio_path: str) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/analyze-loudness",
            params={"audio_path": audio_path},
        )

    # ── Audio Tags ────────────────────────────────────────────────────────

    @mcp.tool(
        name="21labs.apply_audio_tags",
        description="Apply bracketed audio tags ([laughs], [sigh], [pause]) to TTS text and generate the combined audio. Tags are parsed from the text, synthesized via DSP or sample library, and mixed with TTS segments.",
    )
    async def twentylabs_apply_audio_tags(
        text: str,
        engine: str = "kokoro",
        voice: str | None = None,
        language: str = "en",
        sample_rate: int = 24000,
        crossfade_ms: float = 20.0,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/apply-tags",
            json={
                "text": text,
                "engine": engine,
                "voice": voice,
                "language": language,
                "sample_rate": sample_rate,
                "crossfade_ms": crossfade_ms,
            },
        )

    @mcp.tool(
        name="21labs.list_audio_tags",
        description="List all supported audio tags with their categories, modifiers, and whether real human samples are available.",
    )
    async def twentylabs_list_audio_tags() -> dict[str, Any]:
        return await _rest("GET", "/audio/tags")

    @mcp.tool(
        name="21labs.sample_manifest",
        description="Get the vocal sample library manifest: which tags have real human recordings, their variants, and sample counts.",
    )
    async def twentylabs_sample_manifest() -> dict[str, Any]:
        return await _rest("GET", "/audio/sample-manifest")

    # ── Emotion / Tone ───────────────────────────────────────────────────

    @mcp.tool(
        name="21labs.emotion_tone",
        description="Post-process an audio file to shift its emotional tone. Applies warmth, energy, brightness, and formant adjustments. All params range from -1.0 to +1.0 (0 = no change).",
    )
    async def twentylabs_emotion_tone(
        audio_path: str,
        warmth: float = 0.0,
        energy: float = 0.0,
        brightness: float = 0.0,
        formant: float = 0.0,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/emotion-tone",
            json={
                "audio_path": audio_path,
                "warmth": warmth,
                "energy": energy,
                "brightness": brightness,
                "formant": formant,
            },
        )

    # ── Breath / Pause ───────────────────────────────────────────────────

    @mcp.tool(
        name="21labs.breath_pause",
        description="Insert natural breath sounds and scale pause durations. breath_intensity (0-1) controls breath volume; pause_multiplier scales existing pause lengths.",
    )
    async def twentylabs_breath_pause(
        audio_path: str,
        breath_intensity: float = 0.5,
        pause_multiplier: float = 1.0,
        use_prepared: bool = True,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/breath-pause",
            json={
                "audio_path": audio_path,
                "breath_intensity": breath_intensity,
                "pause_multiplier": pause_multiplier,
                "use_prepared": use_prepared,
            },
        )

    @mcp.tool(
        name="21labs.adjust_pauses",
        description="Adjust the duration of existing pauses in audio. min_pause_ms sets the minimum pause threshold; max_pause_ms caps the output; target_pause_ms (optional) normalizes all pauses to a target.",
    )
    async def twentylabs_adjust_pauses(
        audio_path: str,
        min_pause_ms: float = 200.0,
        max_pause_ms: float = 1500.0,
        target_pause_ms: float | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"audio_path": audio_path, "min_pause_ms": min_pause_ms, "max_pause_ms": max_pause_ms}
        if target_pause_ms is not None:
            payload["target_pause_ms"] = target_pause_ms
        return await _rest("POST", "/audio/adjust-pauses", json=payload)

    # ── Editing ──────────────────────────────────────────────────────────

    @mcp.tool(
        name="21labs.fade_in",
        description="Apply a fade-in to the start of an audio file.",
    )
    async def twentylabs_fade_in(audio_path: str, duration_ms: float = 200.0) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/fade-in",
            json={"audio_path": audio_path, "duration_ms": duration_ms},
        )

    @mcp.tool(
        name="21labs.fade_out",
        description="Apply a fade-out to the end of an audio file.",
    )
    async def twentylabs_fade_out(audio_path: str, duration_ms: float = 200.0) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/fade-out",
            json={"audio_path": audio_path, "duration_ms": duration_ms},
        )

    @mcp.tool(
        name="21labs.splice",
        description="Keep only the region between start_ms and end_ms from an audio file.",
    )
    async def twentylabs_splice(
        audio_path: str,
        start_ms: float = 0.0,
        end_ms: float = 0.0,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/splice",
            json={"audio_path": audio_path, "start_ms": start_ms, "end_ms": end_ms},
        )

    @mcp.tool(
        name="21labs.delete_region",
        description="Delete the region between start_ms and end_ms from an audio file.",
    )
    async def twentylabs_delete_region(
        audio_path: str,
        start_ms: float = 0.0,
        end_ms: float = 0.0,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/delete-region",
            json={"audio_path": audio_path, "start_ms": start_ms, "end_ms": end_ms},
        )

    @mcp.tool(
        name="21labs.insert_silence",
        description="Insert silence into an audio file at a given position (in milliseconds).",
    )
    async def twentylabs_insert_silence(
        audio_path: str,
        position_ms: float = 0.0,
        duration_ms: float = 500.0,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/insert-silence",
            json={"audio_path": audio_path, "position_ms": position_ms, "duration_ms": duration_ms},
        )

    @mcp.tool(
        name="21labs.trim_silence",
        description="Trim leading and trailing silence from an audio file. fade_ms applies a fade-out after trimming.",
    )
    async def twentylabs_trim_silence(
        audio_path: str,
        threshold_db: float = -40.0,
        min_silence_ms: float = 200.0,
        fade_ms: float = 30.0,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/trim-silence",
            json={
                "audio_path": audio_path,
                "threshold_db": threshold_db,
                "min_silence_ms": min_silence_ms,
                "fade_ms": fade_ms,
            },
        )

    # ── Platform Export ──────────────────────────────────────────────────

    @mcp.tool(
        name="21labs.list_export_presets",
        description="List all available platform export presets (podcast, audiobook, movie_audio, voiceover, social_media) with their specs.",
    )
    async def twentylabs_list_export_presets() -> dict[str, Any]:
        return await _rest("GET", "/export/presets")

    @mcp.tool(
        name="21labs.apply_export_preset",
        description="Apply a platform export preset to an audio file. Normalizes to target LUFS and encodes to the correct format. Returns base64 audio. cleanup: apply neural noise reduction before export.",
    )
    async def twentylabs_apply_export_preset(
        preset_name: str,
        audio_path: str,
        cleanup: bool = False,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/export/apply-preset",
            json={"preset_name": preset_name, "audio_path": audio_path, "cleanup": cleanup},
        )

    # ── Audio Editing Primitives ───────────────────────────────────────────

    @mcp.tool(
        name="21labs.blend",
        description="Blend two audio files together with crossfade. Returns base64 WAV.",
    )
    async def twentylabs_blend(
        audio_path_a: str,
        audio_path_b: str,
        crossfade_ms: float = 200.0,
        gap_ms: float = 0.0,
        curve: str = "equal_power",
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/blend",
            params={
                "audio_path_a": audio_path_a,
                "audio_path_b": audio_path_b,
                "crossfade_ms": crossfade_ms,
                "gap_ms": gap_ms,
                "curve": curve,
            },
        )

    @mcp.tool(
        name="21labs.copy_segment",
        description="Copy a region from an audio file to the clipboard for pasting.",
    )
    async def twentylabs_copy_segment(
        audio_path: str,
        start_s: float = 0.0,
        end_s: float = 0.0,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/copy",
            params={"audio_path": audio_path, "start_s": start_s, "end_s": end_s},
        )

    @mcp.tool(
        name="21labs.cut_segment",
        description="Cut (remove and copy) a region from an audio file to the clipboard.",
    )
    async def twentylabs_cut_segment(
        audio_path: str,
        start_s: float = 0.0,
        end_s: float = 0.0,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/cut",
            params={"audio_path": audio_path, "start_s": start_s, "end_s": end_s},
        )

    @mcp.tool(
        name="21labs.paste_segment",
        description="Paste clipboard audio at a position in a target audio file.",
    )
    async def twentylabs_paste_segment(
        target_path: str,
        clip_path: str,
        at_s: float = 0.0,
        crossfade_ms: float = 0.0,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/paste",
            params={
                "target_path": target_path,
                "clip_path": clip_path,
                "at_s": at_s,
                "crossfade_ms": crossfade_ms,
            },
        )

    @mcp.tool(
        name="21labs.time_stretch",
        description="Time-stretch an audio file without changing pitch. rate: 0.5 = half speed, 2.0 = double speed.",
    )
    async def twentylabs_time_stretch(
        audio_path: str,
        rate: float,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/time-stretch",
            json={"audio_path": audio_path, "rate": rate},
        )

    @mcp.tool(
        name="21labs.shout_to_whisper",
        description="Convert shouted audio to whisper using DSP (pitch down, formant shift, dynamics). Returns base64 WAV.",
    )
    async def twentylabs_shout_to_whisper(audio_path: str, intensity: float = 0.5) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/shout-to-whisper",
            json={"audio_path": audio_path, "intensity": intensity},
        )

    @mcp.tool(
        name="21labs.analyze_pitch",
        description="Analyze the pitch (note/frequency) of an audio file using YIN. Returns JSON array of pitch segments.",
    )
    async def twentylabs_analyze_pitch(
        audio_path: str,
        sample_rate: int = 48000,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/audio/pitch-analysis",
            json={"audio_path": audio_path, "sample_rate": sample_rate},
        )

    @mcp.tool(
        name="21labs.list_effects",
        description="List all available audio effects with their parameters.",
    )
    async def twentylabs_list_effects() -> dict[str, Any]:
        return await _rest("GET", "/effects/available")

    @mcp.tool(
        name="21labs.apply_effects",
        description="Apply an audio effects chain to a generation's clean audio. generation_id: the generation ID. effects_chain: array of effect dicts.",
    )
    async def twentylabs_apply_effects(
        generation_id: str,
        effects_chain: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            f"/effects/preview/{_encode_path_param(generation_id)}",
            json={"effects_chain": effects_chain},
        )
