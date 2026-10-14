"""
KittenTTS ONNX backend — lightest-weight TTS engine in 21labs.

Wraps ``_kitten_tts_onnx.KittenTTSOnnx``. This is the user-requested
"lighter than Kokoro" engine: no torch, CPU-only, 40 MB (micro) to 80 MB
(mini). Eight preset voices, no cloning, no voice mixing. Output is native
24 kHz mono — already the project standard, so no resampling is needed.

The checkpoint ``size`` is selectable (mini/micro/nano); default is ``mini``
for quality. ``micro`` (40M) is the lighter-than-Kokoro default most users
want; set ``KITTEN_SIZE`` env to switch.
"""

import asyncio
import logging
import os
import threading

import numpy as np

from ._kitten_tts_onnx import DEFAULT_VOICE, KITTEN_REPOS, KittenTTSOnnx
from .base import BackendBase, model_load_progress

logger = logging.getLogger(__name__)

SAMPLE_RATE = 24000
DEFAULT_SIZE = os.environ.get("KITTEN_SIZE", "mini")

_KITTEN_VOICES = ["Bella", "Jasper", "Luna", "Bruno", "Rosie", "Hugo", "Kiki", "Leo"]


def is_onnx_available() -> bool:
    """True when onnxruntime is importable (no torch needed)."""
    try:
        import onnxruntime  # noqa: F401

        return True
    except ImportError:
        return False


class KittenTTSOnnxBackend(BackendBase):
    _model_attr = "_engine"
    """KittenTTS v0.8 via ONNX Runtime — lightest TTS, CPU-only."""

    def __init__(self, size: str | None = None):
        self._size = size or DEFAULT_SIZE
        if self._size not in KITTEN_REPOS:
            logger.warning("Unknown KITTEN_SIZE %r; falling back to 'mini'", self._size)
            self._size = "mini"
        self._engine: KittenTTSOnnx | None = None
        self._lock = threading.Lock()

    def is_loaded(self) -> bool:
        return self._engine is not None

    def available_voices(self) -> list[str]:
        if self._engine is None:
            return list(_KITTEN_VOICES)
        return self._engine.available_voices

    def _is_model_cached(self, model_size: str = "default") -> bool:
        from ..services.model_files import is_model_installed

        repo = KITTEN_REPOS[self._size]
        return is_model_installed(repo, "config.json") and is_model_installed(repo, "voices.npz")

    async def load_model(self, model_size: str = "default") -> None:
        if self._engine is not None:
            return
        await asyncio.to_thread(self._load_sync)

    def _load_sync(self) -> None:
        if self._engine is not None:
            return
        with self._lock:
            is_cached = self._is_model_cached()
            with model_load_progress(f"kitten-tts-{self._size}", is_cached):
                from ._onnx_precision import resolve_providers

                self._engine = KittenTTSOnnx(model_dir="", size=self._size, providers=resolve_providers())

    # unload_model() inherited from BackendBase

    async def create_voice_prompt(self, audio_path, reference_text, use_cache=True):
        """KittenTTS uses preset voices, not arbitrary-audio cloning."""
        return {
            "voice_type": "preset",
            "preset_engine": "kitten",
            "preset_voice_id": DEFAULT_VOICE,
        }, False

    async def combine_voice_prompts(self, audio_paths, reference_texts):
        # No voice mixing supported; return a silent placeholder at project rate.
        return np.zeros(SAMPLE_RATE, dtype=np.float32), ""

    async def generate(self, text, voice_prompt, language="en", seed=None, instruct=None, temperature=None):
        await self.load_model()
        voice_name = voice_prompt.get("preset_voice_id") or voice_prompt.get("kitten_voice") or DEFAULT_VOICE

        def _gen() -> np.ndarray:
            engine = self._engine
            audio = engine.generate(text, voice=voice_name, speed=1.0)
            return np.asarray(audio, dtype=np.float32)

        return await asyncio.to_thread(_gen), SAMPLE_RATE


kitten_tts_onnx_backend = KittenTTSOnnxBackend()
