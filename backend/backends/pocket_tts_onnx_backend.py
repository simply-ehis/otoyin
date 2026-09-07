"""
Pocket-TTS ONNX backend — torch-free.

Wraps the vendored upstream inference engine in
``_pocket_tts_onnx.PocketTTSOnnx`` (Apache-2.0/MIT, kept verbatim). This file
only adapts the otoyin backend contract (voice-prompt dict in, (audio, sr)
out) and resolves the ONNX bundle from the HuggingFace cache; no inference
logic is reimplemented here.

Requires ``sentencepiece`` (lazy import — see ``is_onnx_available``).
"""

import asyncio
import logging
import threading

import numpy as np

from .base import (
    BackendBase,
    combine_voice_prompts as _combine_voice_prompts,
    is_model_cached,
    model_load_progress,
)

logger = logging.getLogger(__name__)

ONNX_REPO = "KevinAHM/pocket-tts-onnx"
SAMPLE_RATE = 24000

# The vendored engine expects a per-language bundle dir containing bundle.json,
# tokenizer.model, the .onnx files, and (optionally) voices.bin. We point it at
# the HF snapshot that holds the english_2026-04 bundle by default.
DEFAULT_LANGUAGE = "english_2026-04"


def is_onnx_available() -> bool:
    """True if onnxruntime + sentencepiece are importable."""
    try:
        import onnxruntime
        import sentencepiece

        return True
    except ImportError:
        return False


def _resolve_bundle_dir() -> str:
    """Return the local path to the Pocket-TTS ONNX bundle snapshot.

    Pathlib-based (not string rsplit): hf_hub_download returns backslash
    paths on Windows, so `rsplit("/onnx/")` never matched there and this
    returned `.../bundle.json/onnx` — a guaranteed FileNotFoundError at
    model load (prompt 19 path-handling audit).
    """
    from pathlib import Path

    from huggingface_hub import hf_hub_download

    # marker = <snapshot>/onnx/<language>/bundle.json → bundle root is its
    # grandparent (<snapshot>/onnx).
    marker = hf_hub_download(ONNX_REPO, f"onnx/{DEFAULT_LANGUAGE}/bundle.json")
    return str(Path(marker).parent.parent)


class PocketTTSOnnxBackend(BackendBase):
    _model_attr = "_engine"
    """Pocket-TTS via ONNX Runtime — no torch, delegates to upstream engine."""

    def __init__(self):
        self._engine = None
        self._lock = threading.Lock()

    def is_loaded(self) -> bool:
        return self._engine is not None

    def _get_model_path(self, model_size: str) -> str:
        return ONNX_REPO

    def _is_model_cached(self, model_size: str = "default") -> bool:
        return is_model_cached(
            ONNX_REPO,
            required_files=[f"onnx/{DEFAULT_LANGUAGE}/bundle.json"],
        )

    async def load_model(self, model_size: str = "default") -> None:
        if self._engine is not None:
            return
        await asyncio.to_thread(self._load_sync)

    def _load_sync(self) -> None:
        with self._lock:
            if self._engine is not None:
                return
            is_cached = self._is_model_cached()
            with model_load_progress("pocket-tts-onnx", is_cached):
                from ._pocket_tts_onnx import PocketTTSOnnx

                bundle_dir = _resolve_bundle_dir()
                self._engine = PocketTTSOnnx(
                    models_dir=bundle_dir,
                    language=DEFAULT_LANGUAGE,
                    precision="int8",
                )
            logger.info("Pocket-TTS ONNX loaded")

    # unload_model() inherited from BackendBase

    async def create_voice_prompt(self, audio_path, reference_text, use_cache=True):
        # Pocket-TTS clones from a reference audio clip (no transcript needed).
        ref = str(audio_path) if audio_path else "alba"
        return {"voice_type": "clone", "ref": ref}, False

    async def combine_voice_prompts(self, audio_paths, reference_texts):
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=SAMPLE_RATE)

    async def generate(self, text, voice_prompt, language="en", seed=None, instruct=None, temperature=None):
        await self.load_model()

        ref = voice_prompt.get("ref") or "alba"

        def _gen():
            audio = self._engine.generate(text, voice=ref)
            if audio is None or audio.size == 0:
                return np.zeros(SAMPLE_RATE, dtype=np.float32), SAMPLE_RATE
            return audio.astype(np.float32), SAMPLE_RATE

        return await asyncio.to_thread(_gen)


pocket_tts_onnx_backend = PocketTTSOnnxBackend()
