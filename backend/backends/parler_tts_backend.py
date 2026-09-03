"""
Parler-TTS Mini TTS backend.

Apache-2.0 (fully open: code + weights + datasets). Voice is
selected via a text *description* (speaker attributes), NOT a reference
clip — so "voice design" rather than cloning. 880M mini-v1.
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

PARLER_HF_REPO = "parler-tts/parler-tts-mini-v1"
PARLER_SAMPLE_RATE = 24000

# Map preset voice names to text descriptions for the Parler model.
_PRESET_DESCRIPTIONS: dict[str, str] = {
    "Jon": "A male speaker with a clear, confident American voice.",
    "Lea": "A female speaker with a warm, friendly tone.",
    "Gary": "A male speaker with a deep, resonant voice.",
    "Jenna": "A female speaker with a bright, energetic delivery.",
    "Mike": "A male speaker with a casual, conversational style.",
    "Laura": "A female speaker with a smooth, professional tone.",
    "Alex": "A male speaker with a calm, measured delivery.",
    "Ella": "A female speaker with a soft, gentle voice.",
    "Josh": "A male speaker with an upbeat, youthful energy.",
    "Bill": "A male speaker with a mature, authoritative voice.",
    "Mia": "A female speaker with a clear, expressive delivery.",
    "Zoey": "A female speaker with a playful, animated tone.",
    "Tom": "A male speaker with a straightforward, natural delivery.",
    "Lily": "A female speaker with a sweet, melodic voice.",
}


class ParlerTTSBackend(BackendBase):
    _model_attr = "model"
    """Parler-TTS Mini — text-described voice design."""

    def __init__(self):
        self.model = None
        self.tokenizer = None
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
        return PARLER_HF_REPO

    def _is_model_cached(self, model_size: str = "default") -> bool:
        return is_model_cached(PARLER_HF_REPO)

    async def load_model(self, model_size: str = "default") -> None:
        if self.model is not None:
            return
        await asyncio.to_thread(self._load_model_sync)

    def _load_model_sync(self):
        with self._load_lock:
            if self.model is not None:
                return
            model_name = "parler-tts-mini"
            is_cached = self._is_model_cached()
            with model_load_progress(model_name, is_cached):
                from parler_tts import ParlerTTSForConditionalGeneration
                from transformers import AutoTokenizer

                self.model = ParlerTTSForConditionalGeneration.from_pretrained(PARLER_HF_REPO)
                self.tokenizer = AutoTokenizer.from_pretrained(PARLER_HF_REPO)
            logger.info("Parler-TTS Mini loaded")

    def _on_unload(self):
        self.tokenizer = None
        self._device = None

    # unload_model() inherited from BackendBase

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> tuple[dict, bool]:
        # Parler uses a text description, not a reference clip.
        # Check if reference_text matches a preset voice name first.
        preset_desc = _PRESET_DESCRIPTIONS.get(reference_text, "")
        description = (
            preset_desc
            or reference_text
            or (
                "A female speaker with a slightly expressive and animated "
                "tone delivers her speech in a clear, natural sounding voice."
            )
        )
        return {"voice_type": "design", "description": description}, False

    async def combine_voice_prompts(self, audio_paths, reference_texts):
        # Design voices are not combinable — return the first description.
        description = reference_texts[0] if reference_texts else ""
        return np.zeros(0, dtype=np.float32), description

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
            import torch

            if seed is not None:
                torch.manual_seed(seed)
            description = voice_prompt.get("description", "")
            # If instruct overrides the description, use it.
            if instruct:
                description = instruct
            # Map preset voice names to descriptions.
            if description in _PRESET_DESCRIPTIONS:
                description = _PRESET_DESCRIPTIONS[description]
            input_ids = self.tokenizer(description, return_tensors="pt").input_ids
            prompt_ids = self.tokenizer(text, return_tensors="pt").input_ids
            gen = self.model.generate(
                input_ids=input_ids,
                prompt_input_ids=prompt_ids,
            )
            audio = gen.cpu().numpy().squeeze()
            return audio.astype(np.float32), PARLER_SAMPLE_RATE

        return await asyncio.to_thread(_generate_sync)
