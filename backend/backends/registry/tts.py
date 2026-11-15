"""
Declarative TTS engine registry and backend resolver.

The ``ENGINE_REGISTRY`` table is the single source of truth for every TTS
engine.  ``_resolve_tts_backend()`` handles the instantiation patterns
(ONNX-preferred, ONNX-only, singleton import) generically
from one table row - adding a new engine = one row, no code changes.
"""

import logging
from dataclasses import dataclass
from importlib import import_module

from ...utils.model_lifecycle import lifecycle_manager
from ..protocols import TTSBackend

logger = logging.getLogger(__name__)

# Cache of instances created by resolve_tts_backend(). Note: the
# process-wide singleton dict used by get_tts_backend_for_engine /
# the single-resident offload loop lives in registry.__init__ — that
# function mirrors instances here after resolve. This dict exists so
# resolve can self-register for lifecycle without a circular import.
_tts_backends: dict[str, TTSBackend] = {}


@dataclass(frozen=True)
class _TTSBackendEntry:
    """Declarative descriptor for one TTS engine."""

    engine: str
    # ONNX-preferred path (optional)
    onnx_module: str = ""
    onnx_class: str = ""
    onnx_check: str = "is_onnx_available"
    # Singleton import -- module-level instance (neutts, orpheus)
    # Mutually exclusive with onnx_* fields.
    singleton_module: str = ""
    singleton_attr: str = ""
    # If True, no fallback exists - raise ValueError when ONNX unavailable
    onnx_only: bool = False


# fmt: off
ENGINE_REGISTRY: list[_TTSBackendEntry] = [
    # --- Subprocess one-shot (audio.cpp audiocpp_cli, no resident model) ---
    _TTSBackendEntry(
        engine="kokoro",
        singleton_module=".kokoro_tts_backend", singleton_attr="kokoro_backend",
    ),
    # --- Subprocess one-shot (audio.cpp audiocpp_cli, no resident model) ---
    _TTSBackendEntry(
        engine="pocket_tts",
        singleton_module=".pocket_tts_backend", singleton_attr="pocket_tts_backend",
    ),
    # --- Subprocess one-shot (audio.cpp audiocpp_cli, no resident model) ---
    _TTSBackendEntry(
        engine="moss_tts_nano",
        singleton_module=".moss_tts_nano_backend", singleton_attr="moss_tts_nano_backend",
    ),
    # --- Subprocess one-shot (audio.cpp audiocpp_cli, no resident model) ---
    _TTSBackendEntry(
        engine="kitten_tts",
        singleton_module=".kitten_tts_backend", singleton_attr="kitten_tts_backend",
    ),
    _TTSBackendEntry(engine="neutts", singleton_module=".neutts_backend", singleton_attr="neutts_backend"),
    _TTSBackendEntry(engine="neutts_2e", singleton_module=".neutts_2e_backend", singleton_attr="neutts_2e_backend"),
    _TTSBackendEntry(engine="orpheus", singleton_module=".orpheus_backend", singleton_attr="orpheus_backend"),
    # --- Subprocess one-shot (audio.cpp audiocpp_cli, no resident model) ---
    _TTSBackendEntry(engine="qwen3_tts", singleton_module=".qwen3_tts_backend", singleton_attr="qwen3_tts_backend"),
    # --- Subprocess one-shot (audio.cpp — new additions 2026-11) ---
    _TTSBackendEntry(engine="phonon", singleton_module=".oneshot_audiocpp", singleton_attr="phonon_backend"),
    _TTSBackendEntry(engine="inflect_v2", singleton_module=".oneshot_audiocpp", singleton_attr="inflect_v2_backend"),
    _TTSBackendEntry(engine="supertonic", singleton_module=".oneshot_audiocpp", singleton_attr="supertonic_backend"),
    _TTSBackendEntry(engine="piper_tts", singleton_module=".oneshot_audiocpp", singleton_attr="piper_tts_backend"),
    _TTSBackendEntry(engine="chatterbox_turbo", singleton_module=".oneshot_audiocpp", singleton_attr="chatterbox_turbo_backend"),
    _TTSBackendEntry(engine="audio8_tts", singleton_module=".oneshot_audiocpp", singleton_attr="audio8_tts_backend"),
    _TTSBackendEntry(engine="cosyvoice3", singleton_module=".oneshot_audiocpp", singleton_attr="cosyvoice3_backend"),
    _TTSBackendEntry(engine="magpie_tts", singleton_module=".oneshot_audiocpp", singleton_attr="magpie_tts_backend"),
    _TTSBackendEntry(engine="omnivoice", singleton_module=".oneshot_audiocpp", singleton_attr="omnivoice_backend"),
    _TTSBackendEntry(engine="yue2", singleton_module=".oneshot_audiocpp", singleton_attr="yue2_backend"),
    _TTSBackendEntry(engine="zonos3", singleton_module=".oneshot_audiocpp", singleton_attr="zonos3_backend"),
    _TTSBackendEntry(engine="fish_drama3", singleton_module=".oneshot_audiocpp", singleton_attr="drama3_backend"),
    _TTSBackendEntry(engine="moss_soundeffect", singleton_module=".oneshot_audiocpp", singleton_attr="moss_soundeffect_backend"),
    _TTSBackendEntry(engine="sa3_music", singleton_module=".oneshot_audiocpp", singleton_attr="sa3_music_backend"),
    # --- Subprocess one-shot (CrispASR bark CLI, no resident model) ---
    _TTSBackendEntry(engine="bark_small", singleton_module=".bark_backend", singleton_attr="bark_backend"),
    # --- Subprocess one-shot (CrispASR parler-tts GGUF, no torch) ---
    _TTSBackendEntry(engine="parler_tts_gguf", singleton_module=".parler_tts_gguf_backend", singleton_attr="parler_tts_gguf_backend"),
    # --- Subprocess one-shot (audio.cpp audiocpp_cli, no resident model) ---
    _TTSBackendEntry(engine="fish_speech_s2", singleton_module=".fish_speech_s2_backend", singleton_attr="fish_speech_s2_backend"),
    # --- Subprocess one-shot (audio.cpp audiocpp_cli, no resident model) ---
    _TTSBackendEntry(engine="voxcpm2", singleton_module=".voxcpm2_backend", singleton_attr="voxcpm2_backend"),
    # --- Subprocess one-shot (steertts CLI, no resident model) ---
    _TTSBackendEntry(engine="steer_tts", singleton_module=".steer_tts_backend", singleton_attr="steer_tts_backend"),
]
# fmt: on

# Fast lookup by engine name (built once at import time).
_REGISTRY_BY_ENGINE: dict[str, _TTSBackendEntry] = {e.engine: e for e in ENGINE_REGISTRY}


def resolve_tts_backend(entry: _TTSBackendEntry) -> TTSBackend:
    """Resolve a registry entry to a live TTSBackend instance.

    Handles the patterns:
    1. ONNX-preferred (kokoro, pocket_tts) - not used by any current entry
    2. Singleton one-shot backends (kokoro, pocket_tts, moss_tts_nano, kitten_tts)
    3. Singleton import (neutts, neutts_2e, orpheus)

    Lifecycle registration happens exactly once at the end of every path.
    """
    engine = entry.engine

    # --- Pattern 2 & 3: Singleton import ---
    if entry.singleton_module:
        mod = import_module(entry.singleton_module, package="backend.backends")
        backend = getattr(mod, entry.singleton_attr)
        lifecycle_manager.register(engine, backend.is_loaded, backend.unload_model)
        return backend

    # --- Pattern 1: ONNX-preferred path ---
    if entry.onnx_module:
        onnx_mod = import_module(entry.onnx_module, package="backend.backends")
        onnx_check_fn = getattr(onnx_mod, entry.onnx_check)
        onnx_cls = getattr(onnx_mod, entry.onnx_class)

        if onnx_check_fn():
            try:
                backend = onnx_cls()
                if backend._is_model_cached():
                    _tts_backends[engine] = backend
                    lifecycle_manager.register(engine, backend.is_loaded, backend.unload_model)
                    return backend
            except (ImportError, RuntimeError, OSError) as exc:
                logger.debug(
                    "%s ONNX unavailable (%s); %s",
                    engine,
                    exc,
                    "no alternative backend" if entry.onnx_only else "incomplete ONNX assets",
                )

        if entry.onnx_only:
            raise ValueError(f"{entry.engine} requires the ONNX assets. No alternative backend exists for this engine.")

    # Should not reach here if the registry is complete.
    raise ValueError(f"Engine '{engine}' has no resolvable backend in ENGINE_REGISTRY")
