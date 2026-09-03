"""
StyleTTS2 TTS backend.

Code MIT / weights CC-BY-NC. ~150M, fast. Zero-shot voice
cloning via a style vector extracted from a reference clip.
Uses MIT `gruut` phonemizer (the PyPI package avoids the GPL
espeak fork). CPU-capable.
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

STYLETTS2_HF_REPO = "yl4579/StyleTTS2-LibriTTS"
STYLETTS2_SAMPLE_RATE = 24000


class StyleTTS2Backend(BackendBase):
    _model_attr = "model"
    """StyleTTS2 — fast zero-shot cloning (style vector)."""

    def __init__(self):
        self.model = None
        self._device = None
        self._load_lock = threading.Lock()

    def _get_device(self) -> str:
        from .base import get_torch_device

        return get_torch_device(allow_mps=True, allow_xpu=True)

    def is_loaded(self) -> bool:
        return self.model is not None

    @property
    def device(self) -> str:
        if self._device is None:
            self._device = self._get_device()
        return self._device

    def _get_model_path(self, model_size: str) -> str:
        return STYLETTS2_HF_REPO

    def _is_model_cached(self, model_size: str = "default") -> bool:
        return is_model_cached(STYLETTS2_HF_REPO)

    async def load_model(self, model_size: str = "default") -> None:
        if self.model is not None:
            return
        await asyncio.to_thread(self._load_model_sync)

    def _load_model_sync(self):
        with self._load_lock:
            if self.model is not None:
                return
            model_name = "styletts2"
            is_cached = self._is_model_cached()
            with model_load_progress(model_name, is_cached):
                from styletts2 import StyleTTS2

                self.model = StyleTTS2()
            logger.info("StyleTTS2 loaded on %s", self.device)

    def _on_unload(self):
        self._device = None

    # unload_model() inherited from BackendBase

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> tuple[dict, bool]:
        await self.load_model()
        # StyleTTS2 extracts a style vector from the reference clip at
        # inference time, so we pass the path through.
        return {
            "voice_type": "clone",
            "ref_audio": str(audio_path),
            "ref_text": reference_text,
        }, False

    async def combine_voice_prompts(self, audio_paths, reference_texts):
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=STYLETTS2_SAMPLE_RATE)

    async def generate(
        self,
        text: str,
        voice_prompt: dict,
        language: str = "en",
        seed: int | None = None,
        instruct: str | None = None,
        temperature: float | None = None,
    ) -> tuple[np.ndarray, int]:
        await self.load_model()

        def _generate_sync():
            if seed is not None:
                import torch

                torch.manual_seed(seed)
            audio = self.model.inference(
                text,
                ref_audio=voice_prompt.get("ref_audio"),
                ref_text=voice_prompt.get("ref_text", ""),
            )
            return np.asarray(audio, dtype=np.float32), STYLETTS2_SAMPLE_RATE

        return await asyncio.to_thread(_generate_sync)
