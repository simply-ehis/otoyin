"""
ChatTTS TTS backend.

CC-BY-NC-4.0. Conversational TTS with paralinguistic tags
([laugh], [cry], etc.) inline in the text. No native voice cloning.
Runs on CPU (slow).
"""

import asyncio
import logging
import threading

import numpy as np

from .base import (
    BackendBase,
    combine_voice_prompts as _combine_voice_prompts,
    model_load_progress,
)

logger = logging.getLogger(__name__)

CHATTTS_HF_REPO = "2Noise/ChatTTS"
CHATTTS_SAMPLE_RATE = 24000


class ChatTTSBackend(BackendBase):
    _model_attr = "model"
    """ChatTTS — paralinguistic-tag TTS (no cloning)."""

    def __init__(self):
        self.model = None
        self._load_lock = threading.Lock()

    def is_loaded(self) -> bool:
        return self.model is not None

    def _get_model_path(self, model_size: str) -> str:
        return CHATTTS_HF_REPO

    def _is_model_cached(self, model_size: str = "default") -> bool:
        from .base import is_model_cached

        return is_model_cached(CHATTTS_HF_REPO)

    async def load_model(self, model_size: str = "default") -> None:
        if self.model is not None:
            return
        await asyncio.to_thread(self._load_model_sync)

    def _load_model_sync(self):
        with self._load_lock:
            if self.model is not None:
                return
            model_name = "chattts"
            is_cached = self._is_model_cached()
            with model_load_progress(model_name, is_cached):
                import ChatTTS

                self.model = ChatTTS.Chat()
                self.model.load_models(compile=False)
            logger.info("ChatTTS loaded")

    # unload_model() inherited from BackendBase

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> tuple[dict, bool]:
        # ChatTTS has no native cloning; voice_prompt is unused.
        return {"voice_type": "none"}, False

    async def combine_voice_prompts(self, audio_paths, reference_texts):
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=CHATTTS_SAMPLE_RATE)

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
            # instruct (e.g. emotion) is passed verbatim; ChatTTS parses
            # inline [tag] tokens. A leading instruct becomes a tag hint.
            gen_text = text
            if instruct:
                gen_text = f"[{instruct}]{text}"
            infer_kwargs: dict = {}
            if temperature is not None:
                infer_kwargs["temperature"] = temperature
            wavs = self.model.infer([gen_text], **infer_kwargs)
            audio = np.asarray(wavs[0], dtype=np.float32)
            return audio, CHATTTS_SAMPLE_RATE

        return await asyncio.to_thread(_generate_sync)
