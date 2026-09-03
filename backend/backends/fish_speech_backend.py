"""
Fish Speech TTS backend.

Fish Speech S1-mini (0.5B) — zero-shot TTS with voice cloning
from reference audio, multilingual, and fast VQGAN inference.

Installation:
  pip install fish-speech

Model: fishaudio/openaudio-s1-mini (HuggingFace)
License: Apache 2.0
"""

import asyncio
import logging

import numpy as np

from .base import (
    BackendBase,
    combine_voice_prompts as _combine_voice_prompts,
    get_torch_device,
    model_load_progress,
)

logger = logging.getLogger(__name__)

FISH_SPEECH_HF_REPO = "fishaudio/openaudio-s1-mini"
FISH_SPEECH_SAMPLE_RATE = 44100


class FishSpeechBackend(BackendBase):
    _model_attr = "_model"
    """Fish Speech S1-mini (0.5B) TTS backend — zero-shot voice cloning."""

    def __init__(self):
        self._model = None
        self._device: str | None = None

    def _get_device(self) -> str:
        return get_torch_device()

    @property
    def device(self) -> str:
        if self._device is None:
            self._device = self._get_device()
        return self._device

    def is_loaded(self) -> bool:
        return self._model is not None

    def _get_model_path(self, model_size: str) -> str:
        return FISH_SPEECH_HF_REPO

    def _is_model_cached(self, model_size: str = "default") -> bool:
        from .base import is_model_cached

        return is_model_cached(
            FISH_SPEECH_HF_REPO,
            required_files=["model.pth", "config.json"],
        )

    async def load_model(self, model_size: str = "default") -> None:
        if self._model is not None:
            return
        await asyncio.to_thread(self._load_model_sync)

    def _load_model_sync(self):
        model_name = "fish_speech"
        is_cached = self._is_model_cached()
        with model_load_progress(model_name, is_cached):
            logger.info(f"Loading Fish Speech S1-mini on {self.device}...")
            # OpenAudio S1-mini exposes a unified `fish_speech` API;
            # the 0.5B checkpoint is both smaller and higher-quality than 1.7B.
            from fish_speech.models.text2semantic import TextToSemanticModel as FishModel

            self._model = FishModel.from_pretrained(FISH_SPEECH_HF_REPO).to(self.device).eval()
        logger.info("Fish Speech S1-mini loaded successfully")

    # unload_model() inherited from BackendBase

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> tuple[dict, bool]:
        return {"voice_type": "clone", "audio_path": audio_path, "reference_text": reference_text}, False

    async def combine_voice_prompts(
        self,
        audio_paths: list[str],
        reference_texts: list[str],
    ) -> tuple[np.ndarray, str]:
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=FISH_SPEECH_SAMPLE_RATE)

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
                if torch.cuda.is_available():
                    torch.cuda.manual_seed(seed)

            # Fish S1 supports parenthetical emotion markers like
            # (whispering), (laughing), (sad).  Prepend instruct as a
            # marker so the model applies the requested style.
            gen_text = text
            if instruct:
                gen_text = f"({instruct}) {text}"

            from fish_speech.text import text_to_semantic
            from fish_speech.vocode import semantic_to_waveform

            semantic_tokens = text_to_semantic(
                self._model,
                gen_text,
                language=language,
                device=self.device,
            )
            audio = semantic_to_waveform(semantic_tokens, device=self.device)
            if isinstance(audio, torch.Tensor):
                audio = audio.detach().cpu().numpy()
            return audio.astype(np.float32), FISH_SPEECH_SAMPLE_RATE

        return await asyncio.to_thread(_generate_sync)
