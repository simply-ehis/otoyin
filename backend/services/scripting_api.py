"""Scripting / automation API — exposes app functionality for batch operations."""

from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np

_api_registry: dict[str, dict[str, Any]] = {}


def register_api(name: str, description: str, params: dict | None = None):
    def decorator(func: Callable):
        _api_registry[name] = {
            "name": name,
            "description": description,
            "params": params or {},
            "function": func,
        }
        return func

    return decorator


def list_api_functions() -> list[dict]:
    return [{"name": v["name"], "description": v["description"], "params": v["params"]} for v in _api_registry.values()]


def execute_api(name: str, args: dict | None = None) -> dict:
    if name not in _api_registry:
        return {"error": f"Unknown API function: {name}"}
    entry = _api_registry[name]
    try:
        result = entry["function"](**(args or {}))
        return {"result": result}
    except Exception:
        return {"error": "Script execution failed"}


def _load_audio(audio_path: str) -> tuple[np.ndarray, int]:
    from .. import config
    from ..utils.audio import load_audio

    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    audio, sr = load_audio(str(resolved))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    return audio, sr


@register_api(
    "tts_generate",
    "Generate speech from text",
    {
        "text": "string (required) — text to synthesize",
        "voice_profile_id": "string (required) — profile ID to use for voice",
        "engine": "string (optional, no default — must be installed) — TTS engine",
        "language": "string (optional, default 'en')",
    },
)
def api_tts_generate(text: str, voice_profile_id: str, engine: str = "", language: str = "en"):
    import uuid

    from .. import config
    from ..backends import get_tts_backend_for_engine
    from ..backends.configs import get_all_model_configs
    from ..database import Generation as DBGeneration, get_db
    from ..services.model_registry import is_downloaded
    from ..utils.audio import save_audio

    # Manifest gate: TTS engine must be downloaded via the Store.
    cfg = next((c for c in get_all_model_configs() if c.engine == engine), None)
    if cfg is not None and not is_downloaded(cfg.model_name, cfg.model_size):
        return {"error": f"Download this model from the Store first ({cfg.model_name})"}

    backend = get_tts_backend_for_engine(engine)
    if backend is None:
        return {"error": f"Unknown engine: {engine}"}

    gen_id = str(uuid.uuid4())
    audio_data = backend.generate(text, voice_profile_id)

    gen_dir = config.get_generations_dir()
    gen_dir.mkdir(parents=True, exist_ok=True)
    audio_path = gen_dir / f"{gen_id}.wav"
    save_audio(audio_data, str(audio_path), 24000)

    db = next(get_db())
    try:
        gen = DBGeneration(
            id=gen_id,
            profile_id=voice_profile_id,
            text=text,
            language=language,
            audio_path=str(audio_path),
            duration=float(len(audio_data)) / 24000.0,
            status="completed",
        )
        db.add(gen)
        db.commit()
    finally:
        db.close()

    return {
        "status": "completed",
        "text": text,
        "engine": engine,
        "generation_id": gen_id,
        "audio_path": str(audio_path),
    }


@register_api(
    "apply_effects",
    "Apply effects chain to audio file",
    {
        "audio_path": "string (required) — path to audio file",
        "effects_chain": "array (required) — list of {type, enabled, params}",
    },
)
def api_apply_effects(audio_path: str, effects_chain: list):
    from .. import config
    from .effects_chain import apply_effects_chain

    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        return {"error": f"Audio file not found: {audio_path}"}

    result_path = apply_effects_chain(str(resolved), effects_chain)
    return {"status": "processed", "input_path": audio_path, "output_path": result_path or audio_path}


@register_api(
    "export_audio",
    "Export audio to file",
    {
        "audio_path": "string (required) — path to audio file",
        "output_path": "string (required) — destination path",
        "sample_rate": "int (optional, default 44100)",
    },
)
def api_export_audio(audio_path: str, output_path: str, sample_rate: int = 44100):
    import soundfile as sf

    from .. import config
    from ..utils.audio import load_audio

    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        return {"error": f"Audio file not found: {audio_path}"}

    audio, sr = load_audio(str(resolved))
    if sr != sample_rate:
        import librosa

        audio = librosa.resample(audio, orig_sr=sr, target_sr=sample_rate)

    # Constrain output_path to the data directory to prevent arbitrary file writes
    # Resolve against data_dir for relative paths and enforce containment for all
    data_dir = config.get_data_dir().resolve()
    out = (data_dir / output_path).resolve() if not Path(output_path).is_absolute() else Path(output_path).resolve()
    if not out.is_relative_to(data_dir):
        return {"error": "output_path must be within the data directory"}
    out.parent.mkdir(parents=True, exist_ok=True)

    sf.write(str(out), audio, sample_rate)
    return {"status": "exported", "path": str(out), "sample_rate": sample_rate}


@register_api(
    "batch_generate",
    "Generate TTS for multiple lines",
    {
        "lines": "array of {text, voice_profile_id, engine, language}",
    },
)
def api_batch_generate(lines: list):
    results = []
    for i, line in enumerate(lines):
        try:
            result = api_tts_generate(
                text=line.get("text", ""),
                voice_profile_id=line.get("voice_profile_id"),
                engine=line.get("engine", "kokoro"),
                language=line.get("language", "en"),
            )
            if "error" in result:
                results.append({"index": i, "status": "failed", "error": result["error"]})
            else:
                results.append({"index": i, "status": "completed", "generation_id": result.get("generation_id")})
        except Exception as e:
            results.append({"index": i, "status": "failed", "error": str(e)})

    return {"status": "completed", "total": len(lines), "results": results}


@register_api(
    "noise_reduce",
    "Apply noise reduction to audio",
    {
        "audio_path": "string (required) — path to audio file",
        "threshold": "float (0.0-1.0, default 0.5) — VAD threshold",
    },
)
def api_noise_reduce(audio_path: str, threshold: float = 0.5):
    from .. import config
    from ..utils.audio import save_audio
    from .noise_reduction import reduce_noise_rnnoise

    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        return {"error": f"Audio file not found: {audio_path}"}

    audio, sr = _load_audio(audio_path)
    cleaned = reduce_noise_rnnoise(audio, sr, vad_threshold=threshold)

    output_path = resolved.parent / f"{resolved.stem}_cleaned{resolved.suffix}"
    save_audio(cleaned, str(output_path), sr)
    return {"status": "processed", "input_path": audio_path, "output_path": str(output_path)}


@register_api(
    "measure_loudness",
    "Measure audio loudness (LUFS, peak)",
    {
        "audio_path": "string (required) — path to audio file",
    },
)
def api_measure_loudness(audio_path: str):
    from .loudness import measure_loudness

    audio, sr = _load_audio(audio_path)
    result = measure_loudness(audio, sr)
    return {"lufs": result.get("integrated_lufs", -70.0), "peak_dbtp": result.get("true_peak_dbtp", -70.0)}


@register_api(
    "audiobook_render",
    "Render all draft chapters of an audiobook via TTS",
    {
        "audiobook_id": "string (required)",
        "profile_id": "string (optional) — default voice",
        "engine": "string (optional, no default — must be installed)",
    },
)
def api_audiobook_render(audiobook_id: str, profile_id: str | None = None, engine: str | None = None):
    import asyncio

    from .audiobook_render import render_audiobook

    try:
        result = asyncio.run(render_audiobook(audiobook_id, profile_id=profile_id, engine=engine))
        return result
    except RuntimeError:
        # already in event loop (batch worker) — run via new loop in thread
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor() as pool:
            fut = pool.submit(asyncio.run, render_audiobook(audiobook_id, profile_id=profile_id, engine=engine))
            return fut.result(timeout=3600)
