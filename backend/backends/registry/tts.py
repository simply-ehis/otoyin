"""
Declarative TTS engine registry and backend resolver.

The ``ENGINE_REGISTRY`` table is the single source of truth for every TTS
engine.  ``_resolve_tts_backend()`` handles the four instantiation patterns
(ONNX-preferred, ONNX-only, torch fallback, singleton import) generically
from one table row — adding a new engine = one row, no code changes.
"""

import logging
from dataclasses import dataclass
from importlib import import_module

from ...utils.model_lifecycle import lifecycle_manager
from ..protocols import TTSBackend

logger = logging.getLogger(__name__)

# Global backend singletons live in registry.__init__; shared ref for lifecycle.
_tts_backends: dict[str, TTSBackend] = {}


@dataclass(frozen=True)
class _TTSBackendEntry:
    """Declarative descriptor for one TTS engine."""

    engine: str
    # ONNX-preferred path (optional)
    onnx_module: str = ""
    onnx_class: str = ""
    onnx_check: str = "is_onnx_available"
    # Torch fallback path (optional)
    torch_module: str = ""
    torch_class: str = ""
    # Singleton import -- module-level instance (neutts, orpheus)
    # Mutually exclusive with onnx/torch.
    singleton_module: str = ""
    singleton_attr: str = ""
    # If True, no torch fallback exists -- raise ValueError when ONNX unavailable
    onnx_only: bool = False


# fmt: off
ENGINE_REGISTRY: list[_TTSBackendEntry] = [
    # --- ONNX-preferred with torch fallback ---
    _TTSBackendEntry(
        engine="kokoro",
        onnx_module=".kokoro_onnx_backend", onnx_class="KokoroONNXBackend",
        torch_module=".kokoro_backend", torch_class="KokoroTTSBackend",
    ),
    _TTSBackendEntry(
        engine="pocket_tts",
        onnx_module=".pocket_tts_onnx_backend", onnx_class="PocketTTSOnnxBackend",
        torch_module=".pocket_tts_backend", torch_class="PocketTTSBackend",
    ),
    # --- ONNX-only (no torch fallback) ---
    _TTSBackendEntry(
        engine="moss_tts_nano",
        onnx_module=".moss_tts_nano_onnx_backend", onnx_class="MossTTSNanoOnnxBackend",
        onnx_only=True,
    ),
    _TTSBackendEntry(
        engine="kitten_tts",
        onnx_module=".kitten_tts_onnx_backend", onnx_class="KittenTTSOnnxBackend",
        onnx_only=True,
    ),
    # --- Singleton pre-created instances (no torch needed) ---
    _TTSBackendEntry(engine="zonos_gguf", singleton_module=".zonos_gguf_backend", singleton_attr="zonos_gguf_backend"),
    _TTSBackendEntry(engine="parler_tts_gguf", singleton_module=".parler_tts_gguf_backend", singleton_attr="parler_tts_gguf_backend"),
    _TTSBackendEntry(engine="neutts", singleton_module=".neutts_backend", singleton_attr="neutts_backend"),
    _TTSBackendEntry(engine="neutts_2e", singleton_module=".neutts_backend", singleton_attr="neutts_2e_backend"),
    _TTSBackendEntry(engine="orpheus", singleton_module=".orpheus_backend", singleton_attr="orpheus_backend"),
    # --- Subprocess one-shot (llama-tts CLI, no resident model) ---
    _TTSBackendEntry(engine="qwen3_tts", singleton_module=".qwen3_tts_backend", singleton_attr="qwen3_tts_backend"),
    # --- Subprocess one-shot (CrispASR bark CLI, no resident model) ---
    _TTSBackendEntry(engine="bark_small", singleton_module=".bark_backend", singleton_attr="bark_backend"),
    # --- Subprocess one-shot (s2.cpp, Fish Audio S2 Pro GGUF) ---
    _TTSBackendEntry(engine="fish_speech_s2", singleton_module=".fish_speech_s2_backend", singleton_attr="fish_speech_s2_backend"),
    # --- Subprocess one-shot (CrispASR zonos-tts GGUF, no torch) ---
    _TTSBackendEntry(engine="zonos_gguf", singleton_module=".zonos_gguf_backend", singleton_attr="zonos_gguf_backend"),
    # --- Subprocess one-shot (CrispASR parler-tts GGUF, no torch) ---
    _TTSBackendEntry(engine="parler_tts_gguf", singleton_module=".parler_tts_gguf_backend", singleton_attr="parler_tts_gguf_backend"),
    # --- Subprocess one-shot (CrispASR voxcpm2-tts GGUF, no torch) ---
    _TTSBackendEntry(engine="voxcpm2", singleton_module=".voxcpm2_backend", singleton_attr="voxcpm2_backend"),
]
# fmt: on

# Fast lookup by engine name (built once at import time).
_REGISTRY_BY_ENGINE: dict[str, _TTSBackendEntry] = {e.engine: e for e in ENGINE_REGISTRY}


def resolve_tts_backend(entry: _TTSBackendEntry) -> TTSBackend:
    """Resolve a registry entry to a live TTSBackend instance.

    Handles the four patterns:
    1. ONNX-preferred with torch fallback (kokoro, pocket_tts)
    2. ONNX-only, no torch fallback (moss_tts_nano, kitten_tts)
    3. Simple torch-only (zonos, parler_tts)
    4. Singleton import (neutts, neutts_2e, orpheus)

    Lifecycle registration happens exactly once at the end of every path.
    """
    engine = entry.engine

    # --- Pattern 4: Singleton import ---
    if entry.singleton_module:
        mod = import_module(entry.singleton_module, package="backend.backends")
        backend = getattr(mod, entry.singleton_attr)
        lifecycle_manager.register(engine, backend.is_loaded, backend.unload_model)
        return backend

    # --- Pattern 1 & 2: ONNX-preferred path ---
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
                    "no torch fallback" if entry.onnx_only else "falling back to torch",
                )

        if entry.onnx_only:
            raise ValueError(f"{entry.engine} requires the ONNX assets. No torch backend exists for this engine.")

    # --- Pattern 2 & 3: Torch fallback / torch-only ---
    if entry.torch_module:
        torch_mod = import_module(entry.torch_module, package="backend.backends")
        backend = getattr(torch_mod, entry.torch_class)()
        _tts_backends[engine] = backend
        lifecycle_manager.register(engine, backend.is_loaded, backend.unload_model)
        return backend

    # Should not reach here if the registry is complete.
    raise ValueError(f"Engine '{engine}' has no resolvable backend in ENGINE_REGISTRY")
