"""
Pocket-TTS (Kyutai) backend.

CC-BY-4.0 (gated, no voice cloning without consent). ~100M, CPU-only
by design, real-time. Supports voice cloning from a wav (or a preset
voice from the kyutai/tts-voices catalog) and multiple languages.
"""

import asyncio
import logging
import threading

import numpy as np

from .base import (
    BackendBase,
    is_model_cached,
    model_load_progress,
)

logger = logging.getLogger(__name__)

POCKET_HF_REPO = "kyutai/pocket-tts"
POCKET_SAMPLE_RATE = 24000
POCKET_PRESET_VOICES = (
    "alba",
    "alba-mackenna",
    "amanda",
    "brian",
    "brian-friend",
    "chris",
    "jenny",
    "jenny-schroeder",
    "jordan",
    "jordan-friend",
    "leo",
    "leo-friend",
    "mahrus",
    "mahrus-langman",
    "mila",
    "mila-friend",
    "patt",
    "patt-friend",
    "tom",
    "tom-langman",
)


class PocketTTSBackend(BackendBase):
    _model_attr = "model"
    """Kyutai Pocket-TTS — tiny CPU TTS with cloning + presets."""

    def __init__(self):
        self.model = None
        self._load_lock = threading.Lock()

    def is_loaded(self) -> bool:
        return self.model is not None

    def _get_model_path(self, model_size: str) -> str:
        return POCKET_HF_REPO

    def _is_model_cached(self, model_size: str = "default") -> bool:
        return is_model_cached(POCKET_HF_REPO)

    async def load_model(self, model_size: str = "default") -> None:
        if self.model is not None:
            return
        await asyncio.to_thread(self._load_model_sync)

    def _load_model_sync(self):
        with self._load_lock:
            if self.model is not None:
                return
            model_name = "pocket-tts"
            is_cached = self._is_model_cached()
            with model_load_progress(model_name, is_cached):
                from pocket_tts import TTSModel

                self.model = TTSModel.load_model()
            logger.info("Pocket-TTS loaded")

    # unload_model() inherited from BackendBase

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> tuple[dict, bool]:
        await self.load_model()
        # A preset voice id (e.g. "alba") or a local/remote wav path both
        # work via get_state_for_audio_prompt. We pass the reference wav;
        # for preset profiles the caller supplies a voice name as audio_path.
        ref = audio_path or POCKET_PRESET_VOICES[0]
        return {"voice_type": "clone", "ref": ref}, False

    async def combine_voice_prompts(self, audio_paths, reference_texts):
        # Pocket has no multi-sample combine — use the first reference.
        from .base import combine_voice_prompts as _cvp

        return await _cvp(audio_paths, reference_texts, sample_rate=POCKET_SAMPLE_RATE)

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
            ref = voice_prompt.get("ref")
            voice_state = self.model.get_state_for_audio_prompt(ref)
            gen_kwargs: dict = {}
            if temperature is not None:
                gen_kwargs["temperature"] = temperature
            audio = self.model.generate_audio(voice_state, text, **gen_kwargs)
            return np.asarray(audio.numpy(), dtype=np.float32), POCKET_SAMPLE_RATE

        return await asyncio.to_thread(_generate_sync)
