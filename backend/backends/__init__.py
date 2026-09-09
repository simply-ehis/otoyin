"""
Backend abstraction layer for TTS and STT.

Provides a unified interface for PyTorch and ONNX backends, and a model config
registry that eliminates per-engine dispatch maps.

This module is a thin re-export surface. The implementation lives in:

- :mod:`backend.backends.protocols` — ``ModelConfig``, the ``*Backend``
  protocols, and the supported-engine registries (``TTS_ENGINES`` etc.).
- :mod:`backend.backends.configs` — model-config builders and lookup helpers.
- :mod:`backend.backends.registry` — backend instance singletons + factories.

**Lazy re-exports** — all symbols are deferred to first access so that
``import backend`` does not pull in numpy, configs (499 lines of dataclass
construction), or the registry (which imports configs → protocols → numpy).
This shaves ~3 s off cold-start time.
"""

from __future__ import annotations

import importlib
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    # Type-checkers still see the full API surface.
    from .configs import (
        engine_has_model_sizes,
        engine_needs_trim,
        get_all_model_configs,
        get_llm_model_configs,
        get_model_config,
        get_stt_model_configs,
        get_tts_model_configs,
        get_vc_backend,
    )
    from .protocols import (
        DEFAULT_LLM_TEMPERATURE,
        LANGUAGE_CODE_TO_NAME,
        LLM_ENGINES,
        MUSIC_ENGINES,
        TTS_ENGINES,
        LLMBackend,
        ModelConfig,
        MusicBackend,
        STTBackend,
        TTSBackend,
        VCBackend,
    )
    from .registry import (
        check_model_loaded,
        ensure_model_cached_or_raise,
        get_llm_backend,
        get_llm_backend_for_engine,
        get_model_load_func,
        get_music_backend,
        get_stt_backend,
        get_tts_backend,
        get_tts_backend_for_engine,
        load_engine_model,
        reset_backends,
        resolve_tts_engine_of,
        unload_model_by_config,
    )

logger = logging.getLogger(__name__)

# --- Lazy module lookup tables ------------------------------------------------
# Maps each public name to (module_path, attribute_name).
_LAZY_MAP: dict[str, tuple[str, str]] = {
    # From .protocols
    "DEFAULT_LLM_TEMPERATURE": (".protocols", "DEFAULT_LLM_TEMPERATURE"),
    "LANGUAGE_CODE_TO_NAME": (".protocols", "LANGUAGE_CODE_TO_NAME"),
    "LLM_ENGINES": (".protocols", "LLM_ENGINES"),
    "MUSIC_ENGINES": (".protocols", "MUSIC_ENGINES"),
    "TTS_ENGINES": (".protocols", "TTS_ENGINES"),
    "LLMBackend": (".protocols", "LLMBackend"),
    "ModelConfig": (".protocols", "ModelConfig"),
    "MusicBackend": (".protocols", "MusicBackend"),
    "STTBackend": (".protocols", "STTBackend"),
    "TTSBackend": (".protocols", "TTSBackend"),
    "VCBackend": (".protocols", "VCBackend"),
    # From .configs
    "engine_has_model_sizes": (".configs", "engine_has_model_sizes"),
    "engine_needs_trim": (".configs", "engine_needs_trim"),
    "get_all_model_configs": (".configs", "get_all_model_configs"),
    "get_llm_model_configs": (".configs", "get_llm_model_configs"),
    "get_model_config": (".configs", "get_model_config"),
    "get_stt_model_configs": (".configs", "get_stt_model_configs"),
    "get_tts_model_configs": (".configs", "get_tts_model_configs"),
    "get_vc_backend": (".configs", "get_vc_backend"),
    # From .registry
    "check_model_loaded": (".registry", "check_model_loaded"),
    "ensure_model_cached_or_raise": (".registry", "ensure_model_cached_or_raise"),
    "get_llm_backend": (".registry", "get_llm_backend"),
    "get_llm_backend_for_engine": (".registry", "get_llm_backend_for_engine"),
    "get_model_load_func": (".registry", "get_model_load_func"),
    "get_music_backend": (".registry", "get_music_backend"),
    "get_stt_backend": (".registry", "get_stt_backend"),
    "get_tts_backend": (".registry", "get_tts_backend"),
    "get_tts_backend_for_engine": (".registry", "get_tts_backend_for_engine"),
    "resolve_tts_engine_of": (".registry", "resolve_tts_engine_of"),
    "load_engine_model": (".registry", "load_engine_model"),
    "reset_backends": (".registry", "reset_backends"),
    "unload_model_by_config": (".registry", "unload_model_by_config"),
}


def __getattr__(name: str):
    if name in _LAZY_MAP:
        mod_path, attr = _LAZY_MAP[name]
        mod = importlib.import_module(mod_path, package=__name__)
        value = getattr(mod, attr)
        # Cache on this module so __getattr__ is only called once per name.
        globals()[name] = value
        return value
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__() -> list[str]:
    return list(globals()) + list(_LAZY_MAP)


__all__ = [
    "DEFAULT_LLM_TEMPERATURE",
    "LANGUAGE_CODE_TO_NAME",
    "LLM_ENGINES",
    "MUSIC_ENGINES",
    "TTS_ENGINES",
    "LLMBackend",
    "ModelConfig",
    "MusicBackend",
    "STTBackend",
    "TTSBackend",
    "VCBackend",
    "check_model_loaded",
    "engine_has_model_sizes",
    "engine_needs_trim",
    "ensure_model_cached_or_raise",
    "get_all_model_configs",
    "get_llm_backend",
    "get_llm_backend_for_engine",
    "get_llm_model_configs",
    "get_model_config",
    "get_model_load_func",
    "get_music_backend",
    "get_stt_backend",
    "get_stt_model_configs",
    "get_tts_backend",
    "get_tts_backend_for_engine",
    "get_tts_model_configs",
    "get_vc_backend",
    "load_engine_model",
    "reset_backends",
    "resolve_tts_engine_of",
    "unload_model_by_config",
]
