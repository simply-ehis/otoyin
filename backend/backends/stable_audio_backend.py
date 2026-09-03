"""Stable Audio Open SFX generation backend."""

import importlib

import numpy as np

from .base import BackendBase, ModelNotCachedError, is_model_cached

STABLE_AUDIO_HF_REPO = "StabilityAI/stable-audio-open-1.0"


class StableAudioBackend(BackendBase):
    _model_attr = "model"
    """Stable Audio Open sound effects generation engine."""

    def __init__(self, model_path: str | None = None):
        self.model = None
        self.model_path = model_path
        self.device = "cpu"

    def load_model(self):
        if self.model is not None:
            return
        import torch

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        repo = self.model_path or STABLE_AUDIO_HF_REPO
        if not is_model_cached(repo):
            raise ModelNotCachedError(
                f"Model '{repo}' is not downloaded. Use the Model Downloads page to download it first."
            )
        try:
            from stable_audio_open import StableAudioPipeline

            self.model = StableAudioPipeline.from_pretrained(repo).to(self.device)
        except ImportError as exc:
            raise RuntimeError("Stable Audio Open not installed. Install with: pip install stable-audio-open") from exc

    def generate(
        self,
        prompt: str,
        duration_seconds: float = 5.0,
        genre: str = "sfx",
        mood: str = "neutral",
        tempo: int | None = None,
        seed: int | None = None,
    ) -> tuple[np.ndarray, int]:
        self.load_model()
        if seed is not None:
            import torch

            torch.manual_seed(seed)
        result = self.model.generate(
            prompt=prompt,
            duration=duration_seconds,
        )
        audio = result.audio if hasattr(result, "audio") else result
        if isinstance(audio, torch.Tensor):
            audio = audio.cpu().numpy()
        if audio.ndim > 1:
            audio = audio.mean(axis=0)
        return audio, result.sample_rate if hasattr(result, "sample_rate") else 44100

    def is_available(self) -> bool:
        try:
            importlib.util.find_spec("stable_audio_open")

            return True
        except ImportError:
            return False

    def is_loaded(self) -> bool:
        return self.model is not None

    # unload_model() inherited from BackendBase


stable_audio_backend = StableAudioBackend()
