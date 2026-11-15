"""
Model-config builders and lookup helpers for the backends package.

These are static descriptors of every downloadable model variant the app
knows about (TTS, STT/Whisper, LLM, voice-conversion, spatial audio). They
are pure data + small helpers and contain no backend instantiation logic.
"""

from ...utils.model_lifecycle import lifecycle_manager
from ..protocols import ModelConfig
from .llm import _get_cloud_llm_configs, _get_gguf_llm_configs, get_llm_model_configs
from .music import (
    _get_audio_processing_configs,
    _get_cloud_vc_configs,
    _get_demucs_configs,
    _get_music_configs,
    _get_soundfont_configs,
    _get_steam_audio_configs,
    _get_translation_configs,
)
from .stt import _get_cloud_stt_configs, get_stt_model_configs
from .tts import (
    _get_tts_configs,
    _get_tts_gguf_configs,
)
from .vc import (
    _get_meanvc2_configs,
    _get_neutts_2e_configs,
    _get_neutts_configs,
    _get_orpheus_configs,
    _get_seed_vc_configs,
    _get_tone_color_vc_configs,
)


def engine_needed(engine: str) -> bool:
    """Check if any installed/downloaded model uses the given engine.

    Returns True if at least one model config with the given engine
    has been downloaded/cached. Used to skip loading unused inference
    engines (onnxruntime, native sidecars, etc.) at startup.
    """
    try:
        from ...services.model_registry import is_downloaded

        all_configs = get_tts_model_configs() + get_stt_model_configs() + get_llm_model_configs()
        return any(cfg.engine == engine and is_downloaded(cfg.model_name) for cfg in all_configs)
    except Exception:
        # If we can't determine, assume engine is needed (safe default)
        return True


def get_vc_backend(engine: str):
    """Return the voice-conversion backend for the requested engine.

    Engines:
      - ``meanvc2``      → MeanVC2Backend (zero-shot, Apache-2.0)
      - ``tone_color_vc`` → ToneColorVCBackend (OpenVoice V2 standalone, MIT)
      - ``seed_vc``      → SeedVCBackend (zero-shot clone + optional SVC routes)
      - ``cloud``        → CloudVCBackend (BYOK, no local weights)

    Local engines require no factory-level manifest row: backends
    self-gate on cache presence at load, and ``cloud`` (BYOK, no local
    weights) is exempt by design. See the gating audit doc.
    """
    if engine == "seed_vc":
        from ..seed_vc_backend import seed_vc_backend

        lifecycle_manager.register("seed_vc", seed_vc_backend.is_loaded, seed_vc_backend.unload_model)
        return seed_vc_backend
    if engine == "meanvc2":
        from ..meanvc2_backend import meanvc2_backend

        lifecycle_manager.register("meanvc2", meanvc2_backend.is_loaded, meanvc2_backend.unload_model)
        return meanvc2_backend
    if engine == "tone_color_vc":
        from ..tone_color_vc_backend import tone_color_vc_backend

        lifecycle_manager.register("tone_color_vc", tone_color_vc_backend.is_loaded, tone_color_vc_backend.unload_model)
        return tone_color_vc_backend
    if engine == "cloud":
        from ..cloud_vc_backend import cloud_vc_backend

        lifecycle_manager.register("cloud", cloud_vc_backend.is_loaded, cloud_vc_backend.unload_model)
        return cloud_vc_backend
    raise ValueError(
        f"Unknown voice-conversion engine: {engine!r} (expected meanvc2, tone_color_vc, seed_vc, or cloud)"
    )


def get_all_model_configs() -> list[ModelConfig]:
    """Return the full list of model configs (TTS + STT + LLM + VC + music + spatial)."""
    return (
        _get_tts_configs()
        + _get_tts_gguf_configs()
        + get_stt_model_configs()
        + _get_gguf_llm_configs()
        + _get_cloud_llm_configs()
        + _get_seed_vc_configs()
        + _get_meanvc2_configs()
        + _get_tone_color_vc_configs()
        + _get_neutts_configs()
        + _get_neutts_2e_configs()
        + _get_orpheus_configs()
        + _get_music_configs()
        + _get_demucs_configs()
        + _get_steam_audio_configs()
        + _get_audio_processing_configs()
        + _get_soundfont_configs()
        + _get_translation_configs()
        + _get_cloud_vc_configs()
        + _get_cloud_stt_configs()
    )


def get_tts_model_configs() -> list[ModelConfig]:
    """Return only TTS model configs."""
    return _get_tts_configs() + _get_tts_gguf_configs() + _get_neutts_2e_configs() + _get_orpheus_configs()


# Lookup helpers — these replace the if/elif chains in main.py


def get_model_config(model_name: str) -> ModelConfig | None:
    """Look up a model config by model_name."""
    for cfg in get_all_model_configs():
        if cfg.model_name == model_name:
            return cfg
    return None


def engine_needs_trim(engine: str) -> bool:
    """Whether this engine's output should be run through trim_tts_output."""
    for cfg in get_tts_model_configs():
        if cfg.engine == engine:
            return cfg.needs_trim
    return False


def engine_has_model_sizes(engine: str) -> bool:
    """Whether this engine supports multiple user-selectable model sizes.

    Counts distinct non-default ``model_size`` values — format variants
    (e.g. different ONNX precision variants sharing ``model_size="default"``) do not count
    as separate sizes.
    """
    sizes = {c.model_size for c in get_tts_model_configs() if c.engine == engine and c.model_size != "default"}
    return len(sizes) > 1
