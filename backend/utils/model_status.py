"""Model availability + recommended-pack helpers.

Implements the no-default-model policy: nothing in the app assumes a
specific model exists. Every TTS consumer (assistant, MCP, STS,
generation) resolves from models the user has already downloaded, or
surfaces the recommended pack so the user can download one — there is no
hardcoded default engine anywhere.

Engine selection is *dynamic*: engines are scored by weight class,
hardware capabilities (ONNX runtime, CUDA GPU), and cache state, then
ranked lightest-first so the auto-selected engine uses the least resources.
"""

import logging
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

# Ordered recommended pack — Kokoro 82M is the default voice (tiny, fast,
# Apache-2.0). Whisper-tiny powers transcription/STT input, the jackrong
# Qwen3.5-2B planner is the on-device assistant brain. DeepFilterNet + LavaSR
# need no download — they ship inside the ``audiosronnx`` dependency.
RECOMMENDED_MODELS: list[dict] = [
    {
        "model_name": "kokoro-onnx",
        "role": "tts",
        "reason": "Recommended voice engine — tiny, fast, Apache-2.0",
    },
    {
        "model_name": "whisper-tiny-en",
        "role": "stt",
        "reason": "Transcription and speech-to-speech input",
    },
    {
        "model_name": "planner-2b",
        "role": "llm",
        "reason": "On-device assistant brain for the in-app agent",
    },
]


# ---------------------------------------------------------------------------
# Hardware detection (cached per process — hardware doesn't change at runtime)
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def _has_cuda_gpu() -> bool:
    """True if a CUDA-capable GPU is available via torch."""
    try:
        import torch

        return torch.cuda.is_available()
    except Exception:
        return False


@lru_cache(maxsize=1)
def _onnxruntime_available() -> bool:
    """True if onnxruntime is importable (CPU or CUDA provider)."""
    try:
        import onnxruntime  # noqa: F401

        return True
    except ImportError:
        return False


# ---------------------------------------------------------------------------
# Engine metadata for dynamic ranking
# ---------------------------------------------------------------------------
#
# Weight classes determine the *base* score — lower is better (lighter).
# Bonuses/penalties are applied on top based on runtime conditions.
#
# Weight classes:
#   10  ONNX-only, tiny model (< 100 MB)  — kitten_tts, moss_tts_nano
#   20  ONNX-preferred, small model        — kokoro (82M)
#   30  Subprocess one-shot, no resident   — qwen3_tts, bark_small
#   40  GGUF singleton (llama.cpp sidecar) — neutts, neutts_2e, orpheus, zonos_gguf, parler_tts_gguf
#   50  Torch-only, small/medium model     — pocket_tts

_ENGINE_WEIGHTS: dict[str, int] = {
    "kitten_tts": 10,
    "moss_tts_nano": 10,
    "kokoro": 20,
    "pocket_tts": 20,
    "qwen3_tts": 30,
    "bark_small": 30,
    "neutts": 40,
    "neutts_2e": 40,
    "orpheus": 40,
    "zonos_gguf": 30,
    "parler_tts_gguf": 30,
    "styletts2": 60,
    "rvc_onnx": 30,
    "openvoice_onnx": 30,
    "acestep_gguf": 30,
}

# Engines whose *preferred* backend is ONNX (even if a torch fallback exists).
_ONNX_PREFERRED_ENGINES = {
    "kokoro",
    "styletts2",
    "pocket_tts",
    "kitten_tts",
    "moss_tts_nano",
}

# Engines that run as subprocesses — no GPU memory, no torch dependency.
_SUBPROCESS_ENGINES = {"qwen3_tts", "bark_small", "zonos_gguf", "parler_tts_gguf", "acestep_gguf", "rvc_onnx", "openvoice_onnx"}


def _score_engine(engine: str, cached: bool) -> float:
    """Return a *lower-is-better* score for engine ranking.

    Scoring formula:
        base = _ENGINE_WEIGHTS[engine]  (10-60)
        +5 if torch-only and no CUDA GPU (penalise heavy engines on CPU)
        -5 if ONNX-preferred and onnxruntime is available (reward native path)
        -10 if cached on disk (instant availability)
        -5 if subprocess (always cheap to start)
    """
    base = _ENGINE_WEIGHTS.get(engine, 50)  # unknown engines default to heavy

    # Penalise torch-heavy engines when there's no GPU
    if engine not in _ONNX_PREFERRED_ENGINES and engine not in _SUBPROCESS_ENGINES and not _has_cuda_gpu():
        base += 5

    # Reward ONNX-preferred engines when onnxruntime is installed
    if engine in _ONNX_PREFERRED_ENGINES and _onnxruntime_available():
        base -= 5

    # Reward cached engines (already downloaded, instant load)
    if cached:
        base -= 10

    # Subprocess engines are always cheap — small reward
    if engine in _SUBPROCESS_ENGINES:
        base -= 5

    return float(base)


def dynamic_tts_preference_order() -> list[str]:
    """Return TTS engines ranked lightest-first for the current hardware.

    The ranking considers:
    1. Engine weight class (ONNX-only < ONNX-preferred < subprocess < GGUF < torch)
    2. Hardware capabilities (CUDA GPU, onnxruntime)
    3. Cache state (downloaded engines are preferred for instant availability)

    Engines not in ``_ENGINE_WEIGHTS`` are appended at the end (unknown = heavy).
    """
    from ..backends.protocols import TTS_ENGINES

    engines = list(TTS_ENGINES.keys())

    # Score each engine (lower = better)
    scored: list[tuple[float, str]] = []
    unscored: list[str] = []

    for engine in engines:
        if engine in _ENGINE_WEIGHTS:
            try:
                cached = is_engine_cached(engine)
            except Exception:
                cached = False
            scored.append((_score_engine(engine, cached), engine))
        else:
            unscored.append(engine)

    # Sort scored engines by score (ascending = lightest first)
    scored.sort(key=lambda t: t[0])

    result = [engine for _, engine in scored] + unscored
    logger.debug("Dynamic TTS preference: %s", result)
    return result


# Legacy alias — kept for backward compatibility with imports.
def _static_preference_order() -> list[str]:
    """Fallback static order when dynamic ranking is unavailable."""
    return ["kitten_tts", "moss_tts_nano", "kokoro", "zonos"]


# Module-level cache: computed once on first access, then stable.
_TTS_PREFERENCE_CACHE: list[str] | None = None


def get_tts_preference_order() -> list[str]:
    """Return the current engine preference order (dynamic, hardware-aware).

    Result is cached after first call — hardware doesn't change at runtime.
    """
    global _TTS_PREFERENCE_CACHE
    if _TTS_PREFERENCE_CACHE is None:
        try:
            _TTS_PREFERENCE_CACHE = dynamic_tts_preference_order()
        except Exception:
            logger.debug("Dynamic ranking failed, using static fallback", exc_info=True)
            _TTS_PREFERENCE_CACHE = _static_preference_order()
    return _TTS_PREFERENCE_CACHE


def _hf_repo_cached(repo_id: str) -> bool:
    """True if the HuggingFace repo has model files in the local cache."""
    if not repo_id:
        return False
    try:
        from huggingface_hub import constants as hf_constants

        repo_cache = Path(hf_constants.HF_HUB_CACHE) / ("models--" + repo_id.replace("/", "--"))
        if not repo_cache.exists():
            return False
        return any(
            repo_cache.rglob(pattern) for pattern in ("*.bin", "*.safetensors", "*.pt", "*.pth", "*.gguf", "*.onnx")
        )
    except Exception:
        logger.debug("HF cache check failed for %s", repo_id, exc_info=True)
        return False


def is_model_downloaded(model_name: str) -> bool:
    """True if the catalog model's files are present on disk (not loaded)."""
    from ..backends import get_model_config

    cfg = get_model_config(model_name)
    if cfg is None:
        return False
    try:
        if cfg.engine == "whisper":
            from .. import config as cfg_mod
            from ..backends.whisper_cpp_backend import WHISPER_CPP_FILES

            filename = WHISPER_CPP_FILES.get(cfg.model_size, f"ggml-{cfg.model_size}.bin")
            return (cfg_mod.get_models_dir() / filename).exists()
        if cfg.engine == "faster-whisper":
            from .. import config as cfg_mod

            return (cfg_mod.get_models_dir() / f"faster-whisper-{cfg.model_size}" / "model.bin").exists()
        if cfg.engine == "argos_translate":
            try:
                import argostranslate.translate

                src, tgt = cfg.model_size.split("-", 1)
                langs = argostranslate.translate.get_installed_languages()
                has_src = any(lang.code == src for lang in langs)
                has_tgt = any(lang.code == tgt for lang in langs)
                if not (has_src and has_tgt):
                    return False
                # Check that a translator can be obtained
                src_lang = next((lang for lang in langs if lang.code == src), None)
                tgt_lang = next((lang for lang in langs if lang.code == tgt), None)
                return src_lang is not None and tgt_lang is not None and src_lang.get_translation(tgt_lang) is not None
            except Exception:
                logger.debug("Argos translate check failed for %s", model_name, exc_info=True)
                return False
        return _hf_repo_cached(cfg.hf_repo_id)
    except Exception:
        logger.debug("Download check failed for %s", model_name, exc_info=True)
        return False


def is_engine_cached(engine: str) -> bool:
    """True if a TTS engine's model files are on disk (backend-level check)."""
    try:
        from ..backends import get_tts_backend_for_engine

        backend = get_tts_backend_for_engine(engine)
        return bool(backend._is_model_cached())
    except Exception:
        logger.debug("Engine cache check failed for %s", engine, exc_info=True)
        return False


def pick_cached_tts_engine(preferred: str | None = None) -> str | None:
    """Resolve a TTS engine from downloaded models only — never a default.

    Returns ``preferred`` when it is cached; otherwise the first cached
    engine in the *dynamic* hardware-aware preference order; otherwise
    ``None`` (caller must surface a missing-model error with the
    recommended pack).

    The dynamic ranking prefers:
    1. ONNX-only tiny engines (kitten_tts, moss_tts_nano) on any hardware
    2. ONNX-preferred engines when onnxruntime is installed
    3. Subprocess engines (qwen3_tts, bark_small) — no resident memory
    4. Cached engines over non-cached ones
    5. Lighter torch engines over heavier ones, especially on CPU-only hosts
    """
    if preferred and is_engine_cached(preferred):
        return preferred
    preference = get_tts_preference_order()
    for engine in preference:
        if is_engine_cached(engine):
            return engine
    return None


def recommended_pack() -> list[dict]:
    """Recommended pack entries annotated with their downloaded state."""
    return [{**entry, "downloaded": is_model_downloaded(entry["model_name"])} for entry in RECOMMENDED_MODELS]


def missing_recommended() -> list[dict]:
    """Recommended pack entries that are not yet downloaded."""
    return [entry for entry in recommended_pack() if not entry["downloaded"]]
