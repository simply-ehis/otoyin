"""
Zyphra Zonos v0.1 TTS backend.

Apache-2.0. Zero-shot voice cloning + emotion control. ~2GB fp16
transformer checkpoint; GGUF variant available at cstr/zonos-v0.1-transformer-GGUF.
Runs on CPU (slow) / CUDA / MPS.
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

ZONOS_HF_REPO = "Zyphra/Zonos-v0.1-transformer"
ZONOS_SAMPLE_RATE = 24000

# Map emotion strings to Zonos 8D Fourier vectors.
# Format: [Happiness, Sadness, Disgust, Fear, Surprise, Anger, Other, Neutral]  # noqa: ERA001
_EMOTION_VECTORS: dict[str, list[float]] = {
    "happy": [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    "happiness": [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    "sad": [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    "sadness": [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    "disgust": [0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    "fear": [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0],
    "surprised": [0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
    "surprise": [0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
    "angry": [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0],
    "anger": [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0],
    "neutral": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0],
}


class ZonosBackend(BackendBase):
    _model_attr = "model"
    """Zyphra Zonos v0.1 — zero-shot clone + emotion control."""

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
        return ZONOS_HF_REPO

    def _is_model_cached(self, model_size: str = "default") -> bool:
        return is_model_cached(ZONOS_HF_REPO)

    async def load_model(self, model_size: str = "default") -> None:
        if self.model is not None:
            return
        await asyncio.to_thread(self._load_model_sync)

    def _load_model_sync(self):
        with self._load_lock:
            if self.model is not None:
                return
            model_name = "zonos-v0.1"
            is_cached = self._is_model_cached()
            with model_load_progress(model_name, is_cached):
                from zonos.model import Zonos

                self.model = Zonos.from_pretrained(ZONOS_HF_REPO, device=self.device)
            logger.info("Zonos loaded on %s", self.device)

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
        import torchaudio

        wav, sr = torchaudio.load(str(audio_path))
        speaker = self.model.make_speaker_embedding(wav, sr)
        return {"voice_type": "clone", "speaker": speaker, "reference_text": reference_text}, False

    async def combine_voice_prompts(self, audio_paths, reference_texts):
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=ZONOS_SAMPLE_RATE)

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
            from zonos.conditioning import make_cond_dict

            speaker = voice_prompt.get("speaker")
            # Map emotion string to 8D vector; fall back to neutral.
            emotion_key = (instruct or "neutral").lower().strip()
            emotion_vec = _EMOTION_VECTORS.get(emotion_key, _EMOTION_VECTORS["neutral"])
            cond = make_cond_dict(
                text=text,
                speaker=speaker,
                language=language,
                emotion=emotion_vec,
            )
            conditioning = self.model.prepare_conditioning(cond)
            codes = self.model.generate(conditioning)
            audio = self.model.autoencoder.decode(codes)[0].cpu().numpy()
            return audio.astype(np.float32), ZONOS_SAMPLE_RATE

        return await asyncio.to_thread(_generate_sync)
