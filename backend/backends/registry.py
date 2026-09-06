"""
Backend instance registry and factory functions for the backends package.

Holds the process-wide backend singletons (TTS, STT, LLM, Music, voice-conversion)
and the factory functions that lazily instantiate + cache them. Also exposes the
model loading/unloading helpers that bridge ModelConfig descriptors to live
backend instances, plus :func:`reset_backends` for tests.
"""

import contextlib
import logging
import threading
from dataclasses import dataclass
from importlib import import_module

from ..utils.model_lifecycle import lifecycle_manager
from .configs import (
    get_tts_model_configs,
)
from .protocols import (
    LLM_ENGINES,
    MUSIC_ENGINES,
    TTS_ENGINES,
    LLMBackend,
    ModelConfig,
    MusicBackend,
    STTBackend,
    TTSBackend,
)

logger = logging.getLogger(__name__)

# Global backend instances
_tts_backend: TTSBackend | None = None
_tts_backends: dict[str, TTSBackend] = {}
_tts_backends_lock = threading.Lock()
_stt_backend: STTBackend | None = None
_llm_backends: dict[str, LLMBackend] = {}
_llm_backends_lock = threading.Lock()
_music_backends: dict[str, MusicBackend] = {}
_music_backends_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Declarative TTS engine registry
# ---------------------------------------------------------------------------
#
# Each entry describes ONE engine.  The generic resolver
# _resolve_tts_backend() handles the ONNX-preferred -> torch-fallback ->
# lifecycle-register dance exactly once, eliminating the 180-line if/elif
# chain that previously duplicated this pattern for every engine.
#
# Adding a new engine = one table row.  The resolver handles everything.


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
    # --- Simple torch-only ---
    _TTSBackendEntry(engine="zonos", torch_module=".zonos_backend", torch_class="ZonosBackend"),
    _TTSBackendEntry(engine="parler_tts", torch_module=".parler_tts_backend", torch_class="ParlerTTSBackend"),
    # --- Singleton pre-created instances ---
    _TTSBackendEntry(engine="neutts", singleton_module=".neutts_backend", singleton_attr="neutts_backend"),
    _TTSBackendEntry(engine="neutts_2e", singleton_module=".neutts_backend", singleton_attr="neutts_2e_backend"),
    _TTSBackendEntry(engine="orpheus", singleton_module=".orpheus_backend", singleton_attr="orpheus_backend"),
    # --- Subprocess one-shot (llama-tts CLI, no resident model) ---
    _TTSBackendEntry(engine="qwen3_tts", singleton_module=".qwen3_tts_backend", singleton_attr="qwen3_tts_backend"),
    # --- Subprocess one-shot (CrispASR bark CLI, no resident model) ---
    _TTSBackendEntry(engine="bark_small", singleton_module=".bark_backend", singleton_attr="bark_backend"),
    # --- Subprocess one-shot (s2.cpp, Fish Audio S2 Pro GGUF) ---
    _TTSBackendEntry(engine="fish_speech_s2", singleton_module=".fish_speech_s2_backend", singleton_attr="fish_speech_s2_backend"),
]
# fmt: on

# Fast lookup by engine name (built once at import time).
_REGISTRY_BY_ENGINE: dict[str, _TTSBackendEntry] = {e.engine: e for e in ENGINE_REGISTRY}


def _resolve_tts_backend(entry: _TTSBackendEntry) -> TTSBackend:
    """Generic TTS backend resolver driven by a table entry.

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
        mod = import_module(entry.singleton_module, package=__package__)
        backend = getattr(mod, entry.singleton_attr)
        lifecycle_manager.register(engine, backend.is_loaded, backend.unload_model)
        return backend

    # --- Pattern 1 & 2: ONNX-preferred path ---
    if entry.onnx_module:
        onnx_mod = import_module(entry.onnx_module, package=__package__)
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
        torch_mod = import_module(entry.torch_module, package=__package__)
        backend = getattr(torch_mod, entry.torch_class)()
        _tts_backends[engine] = backend
        lifecycle_manager.register(engine, backend.is_loaded, backend.unload_model)
        return backend

    # Should not reach here if the registry is complete.
    raise ValueError(f"Engine '{engine}' has no resolvable backend in ENGINE_REGISTRY")


_load_lock = threading.Lock()  # serialize concurrent model loads so two engines don't both stay resident


async def load_engine_model(engine: str, model_size: str = "default") -> None:
    """Load a model for the given engine, handling engines with multiple model sizes.

    Enforces a single resident TTS engine: any other TTS engine currently loaded
    is offloaded first, so switching providers frees the previous model's memory
    immediately instead of waiting for the idle timeout.

    Before loading, checks GPU VRAM pressure.  If under the threshold,
    attempts to free idle models and waits up to 30s for recovery.
    Raises HTTPException (503) if VRAM is insufficient.

    Concurrency: concurrent calls for different engines are serialized by
    ``_load_lock`` so the offload loop can't race — without it two threads
    could both see the other as loaded, both offload the other, then both
    load and briefly hold two full models in VRAM (the crash we saw).
    """
    # Manifest gate: TTS models may only load if entitled (downloaded via the
    # Models tab, or seeded from the bundle on first launch). This covers every
    # caller of this chokepoint: the /models/load route, the generations
    # pre-load route, and the generation service.
    from ..services.model_registry import MODEL_NOT_DOWNLOADED_MSG, is_downloaded
    from .configs import get_all_model_configs

    cfg = next(
        (c for c in get_all_model_configs() if c.engine == engine and c.model_size == model_size),
        None,
    )
    if cfg is not None and not is_downloaded(cfg.model_name, cfg.model_size):
        from fastapi import HTTPException

        raise HTTPException(
            status_code=400,
            detail=f"{MODEL_NOT_DOWNLOADED_MSG} ({cfg.model_name})",
        )

    # ── Circuit breaker gate ────────────────────────────────────────────
    # A repeatedly failing engine stops retrying for the cooldown window.
    # Surface it as an explicit 503 (with retry delay) instead of letting
    # the failure look like a random connection drop.
    if lifecycle_manager.is_circuit_open(engine):
        from fastapi import HTTPException

        retry_after = int(lifecycle_manager.circuit_retry_after_seconds(engine)) + 1
        raise HTTPException(
            status_code=503,
            detail={
                "message": f"Engine '{engine}' is temporarily unavailable after repeated failures. Retry in about {retry_after}s.",
                "code": "engine_circuit_open",
                "engine": engine,
                "retry_after_seconds": retry_after,
            },
        )

    # ── VRAM pressure gate ──────────────────────────────────────────────
    # Check before offloading so we know the true memory state.
    # Subprocess engines (bark, qwen3) and ONNX-only CPU engines skip this
    # because they don't allocate GPU memory.
    _subprocess_engines = {"qwen3_tts", "bark_small", "fish_speech_s2"}
    estimated_mb = cfg.size_mb if cfg else 0
    skip_vram_check = engine in _subprocess_engines or (cfg is not None and not cfg.gpu_only and estimated_mb < 100)
    if not skip_vram_check and estimated_mb > 0:
        try:
            from ..utils.vram_pressure import VRAMInsufficientError, wait_for_vram

            await wait_for_vram(required_mb=estimated_mb)
        except VRAMInsufficientError as e:
            from fastapi import HTTPException

            logger.error("VRAM pressure blocks load of '%s': %s", engine, e)
            raise HTTPException(
                status_code=503,
                detail=str(e),
            ) from e

    # Serialize loads so two concurrent callers (e.g. planner LLM + Orpheus)
    # don't both think the other is the extra.  The check + offload + load
    # is atomic under the lock's critical section — only the actual heavy
    # load is done outside via await (so we hold the lock only for the
    # offload decision, not the minutes-long download).
    # We use a threading.Lock with a short hold; the heavy await is outside.
    # The lock is only for the offload decision; the backend's own load path
    # has its own internal lock for the model attribute.
    with _load_lock:
        # Single active TTS slot: offload any other currently-loaded TTS engine.
        for other_engine, other_backend in list(_tts_backends.items()):
            if other_engine != engine and other_backend.is_loaded():
                try:
                    other_backend.unload_model()
                except (RuntimeError, OSError, AttributeError) as e:  # never block the new load on a failed offload
                    logger.error(
                        "Failed to offload TTS engine '%s' during switch to '%s': %s",
                        other_engine,
                        engine,
                        e,
                        exc_info=True,
                    )

    backend = get_tts_backend_for_engine(engine)
    # Don't retry VRAM-insufficient errors — they are not transient
    from ..utils.vram_pressure import VRAMInsufficientError as _VRAMErr

    try:
        await backend.load_model(model_size)
    except _VRAMErr:
        raise
    except Exception:
        # Record circuit-breaker failure so repeated 503s don't hammer the same broken engine
        with contextlib.suppress(Exception):
            lifecycle_manager.record_load_failure(engine)
        raise
    else:
        with contextlib.suppress(Exception):
            lifecycle_manager.record_load_success(engine)


async def ensure_model_cached_or_raise(engine: str, model_size: str = "default") -> None:
    """Check if a model is cached, raise HTTPException if not. Used by streaming endpoint."""
    from fastapi import HTTPException

    backend = get_tts_backend_for_engine(engine)
    cfg = None
    for c in get_tts_model_configs():
        if c.engine == engine and c.model_size == model_size:
            cfg = c
            break

    if not backend._is_model_cached():
        display = cfg.display_name if cfg else engine
        raise HTTPException(
            status_code=400,
            detail=f"{display} model is not downloaded yet. Use the Model Downloads page to download it.",
        )


def unload_model_by_config(config: ModelConfig) -> bool:
    """Unload a model given its config. Returns True if it was loaded, False otherwise."""
    from ..services import transcribe

    if config.engine == "whisper":
        whisper_model = transcribe.get_whisper_model()
        if whisper_model.is_loaded():
            try:
                if whisper_model.model_size == config.model_size:
                    transcribe.unload_whisper_model()
                    return True
            except AttributeError:
                transcribe.unload_whisper_model()
                return True
        return False

    if config.engine == "gguf_llm":
        backend = get_llm_backend_for_engine(config.engine)
        loaded_size = getattr(backend, "_current_model_size", None)
        if backend.is_loaded() and loaded_size == config.model_size:
            backend.unload_model()
            return True
        return False

    # All other TTS engines
    backend = get_tts_backend_for_engine(config.engine)
    if backend.is_loaded():
        backend.unload_model()
        return True
    return False


def check_model_loaded(config: ModelConfig) -> bool:
    """Check if a model is currently loaded."""
    from ..services import transcribe

    try:
        if config.engine == "whisper":
            whisper_model = transcribe.get_whisper_model()
            return whisper_model.is_loaded()

        if config.engine == "gguf_llm":
            backend = get_llm_backend_for_engine(config.engine)
            loaded_size = getattr(backend, "_current_model_size", None)
            return backend.is_loaded() and loaded_size == config.model_size

        backend = get_tts_backend_for_engine(config.engine)
        return backend.is_loaded()
    except (AttributeError, ImportError):
        return False


def get_model_load_func(config: ModelConfig):
    """Return a callable that loads/downloads the model."""
    from ..services import transcribe

    if config.engine == "whisper":
        return lambda: transcribe.get_whisper_model().load_model(config.model_size)

    if config.engine == "gguf_llm":
        return lambda: get_llm_backend_for_engine("gguf_llm").load_model(config.model_size)

    if config.engine == "stable_audio":
        return lambda: get_music_backend("stable_audio").load_model()

    if config.engine == "rvc":
        from .configs import get_vc_backend

        voice_name = config.model_name.removeprefix("rvc-")
        return lambda: get_vc_backend("rvc").load_model(voice_name)

    return lambda: get_tts_backend_for_engine(config.engine).load_model()


def get_tts_backend() -> TTSBackend:
    """
    Get or create the default TTS backend instance.

    No hardcoded engine — picks the first downloaded TTS engine, or raises
    if nothing is installed so callers must handle the empty case.
    """
    from ..config import DEFAULT_TTS_ENGINE
    from ..utils.model_status import get_tts_preference_order, is_engine_cached

    if DEFAULT_TTS_ENGINE:
        return get_tts_backend_for_engine(DEFAULT_TTS_ENGINE)
    for eng in get_tts_preference_order():
        if is_engine_cached(eng):
            return get_tts_backend_for_engine(eng)
    raise RuntimeError("No TTS engine is installed — download one from the Store first")


def get_tts_backend_for_engine(engine: str) -> TTSBackend:
    """
    Get or create a TTS backend for the given engine.

    Uses the declarative ENGINE_REGISTRY table.  Adding a new engine
    requires only a new row in the table — no code changes to this function.

    Args:
        engine: Engine name (e.g. "kokoro", "zonos", "fish_speech")

    Returns:
        TTS backend instance
    """
    global _tts_backends

    # Fast path: check without lock
    if engine in _tts_backends:
        return _tts_backends[engine]

    # Slow path: create with lock to avoid duplicate instantiation
    with _tts_backends_lock:
        # Double-check after acquiring lock
        if engine in _tts_backends:
            return _tts_backends[engine]

        entry = _REGISTRY_BY_ENGINE.get(engine)
        if entry is None:
            raise ValueError(f"Unknown TTS engine: {engine}. Supported: {list(TTS_ENGINES.keys())}")

        return _resolve_tts_backend(entry)


_stt_backends: dict[str, STTBackend] = {}


def get_stt_backend(engine: str = "whisper") -> STTBackend:
    """
    Get or create STT backend instance for the given engine.

    Engines: "whisper" (whisper.cpp GGML), "faster-whisper" (CTranslate2 int8),
             "parakeet" (parakeet.cpp native C++), "qwen3_asr" (ONNX Runtime).
    Raises RuntimeError if no STT backend is available for the engine.

    NOTE: no manifest gate here on purpose — backends self-gate on cache
    presence at load, routes enforce entitlement, and tests/tools call this
    factory directly. See docs/reports/2026-09-05-model-download-gating-audit.md.
    """
    global _stt_backends

    if engine not in _stt_backends:
        if engine == "whisper":
            try:
                from .whisper_cpp_backend import WhisperCppSTTBackend

                _stt_backends[engine] = WhisperCppSTTBackend()
            except ImportError:
                raise RuntimeError(
                    "No STT backend available. Install pywhispercpp (pip install pywhispercpp)."
                ) from None
        elif engine == "faster-whisper":
            try:
                from .faster_whisper_backend import FasterWhisperSTTBackend

                _stt_backends[engine] = FasterWhisperSTTBackend()
            except ImportError:
                raise RuntimeError(
                    "faster-whisper backend unavailable. Install faster-whisper (pip install faster-whisper)."
                ) from None
        elif engine == "parakeet":
            try:
                from .parakeet_backend import ParakeetSTTBackend

                _stt_backends[engine] = ParakeetSTTBackend()
            except ImportError:
                raise RuntimeError("parakeet backend unavailable. Install parakeet.cpp binary.") from None
        elif engine == "qwen3_asr":
            try:
                from .qwen3_asr_backend import Qwen3ASRBackend

                _stt_backends[engine] = Qwen3ASRBackend()
            except ImportError:
                raise RuntimeError(
                    "qwen3_asr backend unavailable. Install onnxruntime (pip install onnxruntime)."
                ) from None
        else:
            raise ValueError(f"Unknown STT engine: {engine}. Supported: whisper, faster-whisper, parakeet, qwen3_asr")

    lifecycle_manager.register(engine, _stt_backends[engine].is_loaded, _stt_backends[engine].unload_model)
    return _stt_backends[engine]


def get_llm_backend() -> LLMBackend:
    """Get or create the default LLM backend based on platform."""
    return get_llm_backend_for_engine("gguf_llm")


def get_llm_backend_for_engine(engine: str) -> LLMBackend:
    """Get or create an LLM backend for the given engine.

    NOTE: no manifest gate here on purpose — same reasoning as
    get_stt_backend (see its docstring + the gating audit doc).
    """
    global _llm_backends

    if engine in _llm_backends:
        return _llm_backends[engine]

    with _llm_backends_lock:
        if engine in _llm_backends:
            return _llm_backends[engine]

        if engine == "gguf_llm":
            from .gguf_server_backend import GGUFServerLLMBackend

            backend = GGUFServerLLMBackend()
        else:
            raise ValueError(f"Unknown LLM engine: {engine}. Supported: {list(LLM_ENGINES.keys())}")

        _llm_backends[engine] = backend
        lifecycle_manager.register(engine, backend.is_loaded, backend.unload_model)
        return backend


def get_music_backend(engine: str = "stable_audio") -> MusicBackend:
    """Get or create a music / SFX backend for the given engine.

    Args:
        engine: One of ``MUSIC_ENGINES`` (``stable_audio``, ``acestep``,
        ``heartmula``, ``sa3_sfx``).

    Returns:
        Music backend instance conforming to :class:`MusicBackend`.

    NOTE: no manifest gate here on purpose — backends self-gate on cache
    presence at load; entitlement lives at routes/the TTS chokepoint.
    See docs/reports/2026-09-05-model-download-gating-audit.md.
    """
    global _music_backends

    if engine in _music_backends:
        return _music_backends[engine]

    with _music_backends_lock:
        if engine in _music_backends:
            return _music_backends[engine]

        if engine == "stable_audio":
            from .stable_audio_backend import stable_audio_backend

            backend = stable_audio_backend
        elif engine == "acestep":
            from .acestep_backend import acestep_backend

            backend = acestep_backend
        elif engine == "heartmula":
            from .heartmula_backend import heartmula_backend

            backend = heartmula_backend
        elif engine == "sa3_sfx":
            from .sa3_sfx_backend import sa3_sfx_backend

            backend = sa3_sfx_backend
        elif engine == "minimax_music3":
            from .minimax_music3_backend import minimax_music3_backend

            backend = minimax_music3_backend
        elif engine == "cloud":
            from .cloud_music_backend import cloud_music_backend

            backend = cloud_music_backend
        else:
            raise ValueError(f"Unknown music engine: {engine}. Supported: {list(MUSIC_ENGINES.keys())}")

        _music_backends[engine] = backend
        lifecycle_manager.register(engine, backend.is_loaded, backend.unload_model)
        return backend


def reset_backends():
    """Reset backend instances (useful for testing)."""
    global _tts_backend, _tts_backends, _stt_backend, _llm_backends, _music_backends
    _tts_backend = None
    _tts_backends.clear()
    _stt_backend = None
    _llm_backends.clear()
    _music_backends.clear()
