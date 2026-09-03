import numpy as np

from .. import config
from ..utils.audio import load_audio, save_audio
from .effects_extended import apply_deesser, apply_spectral_denoise
from .mastering import master_audio

RECIPE_TARGETS = {
    "podcast": -16.0,
    "audiobook": -18.0,
    "film-dialogue-adr": -24.0,
    "voiceover-ad": -12.0,
    "social-short": -14.0,
    "youtube": -14.0,
}


def _load(path: str) -> tuple[np.ndarray, int]:
    resolved = config.resolve_storage_path(path)
    if resolved is None or not resolved.exists():
        raise FileNotFoundError(f"Segment audio not found: {path}")
    return load_audio(str(resolved))


def _crossfade_concat(segments: list[np.ndarray], sr: int, gap_ms: int = 250, fade_ms: int = 120) -> np.ndarray:
    if not segments:
        return np.zeros(0, dtype=np.float32)
    if len(segments) == 1:
        return segments[0]
    gap = int(sr * gap_ms / 1000)
    fade = int(sr * fade_ms / 1000)
    parts: list[np.ndarray] = []
    for i, seg in enumerate(segments):
        if i > 0:
            parts.append(np.zeros(gap, dtype=np.float32))
        if fade > 1 and len(seg) > 2 * fade:
            env = np.ones(len(seg), dtype=np.float32)
            env[:fade] = np.linspace(0.0, 1.0, fade)
            env[-fade:] = np.linspace(1.0, 0.0, fade)
            seg = seg * env
        parts.append(seg)
    return np.concatenate(parts)


def recipe_run(
    segments: list[dict],
    recipe: str = "podcast",
    music_path: str | None = None,
    target_lufs: float | None = None,
    true_peak_db: float = -1.0,
    gap_ms: int = 250,
) -> dict:
    """Build a finished, recipe-tuned mix from generated segments.

    Each segment is ``{"audio_path": str, "effects": [{"type": ..., "params": ...}]}``.
    The pipeline: per-segment cleanup (de-esser / spectral de-noise) -> crossfade
    concat with speaker gaps -> optional music bed ducked under speech -> master to
    the recipe's LUFS target. Non-destructive; returns a new export file path.
    """
    if not segments:
        raise ValueError("recipe_run requires at least one segment")

    target = target_lufs if target_lufs is not None else RECIPE_TARGETS.get(recipe, -14.0)

    processed: list[np.ndarray] = []
    sr = 44100
    for seg in segments:
        audio, seg_sr = _load(seg["audio_path"])
        sr = seg_sr
        audio = audio.astype(np.float32)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        for fx in seg.get("effects", []) or []:
            ftype = fx.get("type")
            params = fx.get("params", {}) or {}
            if ftype == "deesser":
                audio = apply_deesser(audio, sr, params)
            elif ftype == "spectral_denoise":
                audio = apply_spectral_denoise(audio, sr, params)
        processed.append(audio)

    speech = _crossfade_concat(processed, sr, gap_ms=gap_ms)

    if music_path:
        music, music_sr = _load(music_path)
        if music.ndim > 1:
            music = music.mean(axis=1)
        music = music.astype(np.float32)
        if music_sr != sr:
            from scipy.signal import resample

            music = resample(music, int(len(music) * sr / music_sr)).astype(np.float32)
        length = max(len(speech), len(music))
        speech_padded = np.pad(speech, (0, length - len(speech)))
        music_padded = np.pad(music, (0, length - len(music)))
        # Real sidechain duck: build a gain envelope from the SPEECH (the
        # sidechain source) — duck the music bed whenever speech is audible,
        # then release gradually. This mirrors _apply_sidechain_duck so the
        # bed fades under voice instead of hard-gating on every peak.
        threshold_db = -30.0
        duck_gain_db = -12.0
        release_ms = 120
        threshold_val = 10 ** (threshold_db / 20)
        duck_level = 10 ** (duck_gain_db / 20)
        release_samples = max(1, int(release_ms / 1000.0 * sr))
        detect = np.abs(speech_padded)
        env = np.ones(length, dtype=np.float32)
        current = 1.0
        for i in range(length):
            target = duck_level if detect[i] > threshold_val else 1.0
            if target < current:
                current = target
            else:
                current = min(1.0, current + (1.0 - duck_level) / release_samples)
            env[i] = current
        bed = music_padded * env * 0.6
        speech = (speech_padded + bed).astype(np.float32)

    mastered = master_audio(speech, sr, target_lufs=target, true_peak_db=true_peak_db)

    from ..services.loudness import measure_loudness

    lufs = measure_loudness(mastered, sr).get("integrated_lufs")

    prefix = f"recipe_{recipe}"
    output_filename = f"{prefix}_{__import__('uuid').uuid4().hex[:12]}.wav"
    output_path = config.get_exports_dir() / output_filename
    save_audio(mastered, output_path, sr)

    return {
        "output_path": config.to_storage_path(output_path),
        "filename": output_filename,
        "recipe": recipe,
        "target_lufs": target,
        "integrated_lufs": lufs,
        "sample_rate": sr,
        "duration_seconds": float(len(mastered) / sr),
    }
