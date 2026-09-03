"""
F5-TTS (Small / v1 Base) TTS backend.

Code MIT; weights CC-BY-NC. Zero-shot voice cloning from a
reference clip + transcript. F16 GGUF recommended (flow-matching
architecture makes Q8 unintelligible). CPU-capable via forks.
"""

import asyncio
import logging
import threading

import numpy as np

from .base import (
    BackendBase,
    combine_voice_prompts as _combine_voice_prompts,
    get_torch_device,
    is_model_cached,
    model_load_progress,
)

logger = logging.getLogger(__name__)

F5_HF_REPO = "SWivid/F5-TTS"
F5_SAMPLE_RATE = 24000
F5_DEFAULT_MODEL = "F5TTS_v1_Base"


class F5TTSBackend(BackendBase):
    _model_attr = "model"
    """F5-TTS Small — zero-shot reference-audio cloning."""

    def __init__(self):
        self.model = None
        self._device = None
        self._load_lock = threading.Lock()

    def _get_device(self) -> str:
        return get_torch_device(allow_mps=True, allow_xpu=True)

    def is_loaded(self) -> bool:
        return self.model is not None

    @property
    def device(self) -> str:
        if self._device is None:
            self._device = self._get_device()
        return self._device

    def _get_model_path(self, model_size: str) -> str:
        return F5_HF_REPO

    def _is_model_cached(self, model_size: str = "default") -> bool:
        return is_model_cached(F5_HF_REPO)

    async def load_model(self, model_size: str = "default") -> None:
        if self.model is not None:
            return
        await asyncio.to_thread(self._load_model_sync)

    def _load_model_sync(self):
        with self._load_lock:
            if self.model is not None:
                return
            model_name = "f5-tts"
            is_cached = self._is_model_cached()
            with model_load_progress(model_name, is_cached):
                from f5_tts.api import F5TTS

                self.model = F5TTS(model_type=F5_DEFAULT_MODEL)
            logger.info("F5-TTS loaded")

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
        # F5 needs the reference clip + transcript at generate time.
        return {
            "voice_type": "clone",
            "ref_audio": str(audio_path),
            "ref_text": reference_text,
        }, False

    async def combine_voice_prompts(self, audio_paths, reference_texts):
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=F5_SAMPLE_RATE)

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
            ref_audio = voice_prompt.get("ref_audio")
            ref_text = voice_prompt.get("ref_text", "")
            wav, sr, _ = self.model.infer(
                ref_audio=ref_audio,
                ref_text=ref_text,
                gen_text=text,
                seed=seed,
            )
            return np.asarray(wav, dtype=np.float32), int(sr)

        return await asyncio.to_thread(_generate_sync)
