"""ACE-Step 1.5 music generation backend (transformers custom-code pipeline).

The official ``ACE-Step/Ace-Step1.5`` bundle ships custom modeling code
(``modeling_acestep_v15_turbo.py`` etc.), so the pipeline runs with
``trust_remote_code=True`` against the HF cache. MIT weights, sellable
(catalog id ``acestep-1-5``, $43). Output is 48kHz stereo from the model,
channel-mean'd to mono to match the pre-existing music backend contract.

Modes:
  - generate: standard text-to-audio (default)
  - cover: cover of the described song/style
  - repaint: reimagined version of the described song/style
"""

import importlib
import logging

import numpy as np

from .base import BackendBase, ModelNotCachedError, is_model_cached

logger = logging.getLogger(__name__)

ACESTEP_HF_REPO = "ACE-Step/Ace-Step1.5"

ACESTEP_SAMPLE_RATE = 48000


class AceStepBackend(BackendBase):
    _model_attr = "model"
    """ACE-Step 1.5 music generation engine."""

    def __init__(self, model_path: str | None = None):
        self.model = None
        self.model_path = model_path
        self.device = "cpu"

    def load_model(self) -> None:
        if self.model is not None:
            return
        import torch
        from transformers import pipeline

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        repo = self.model_path or ACESTEP_HF_REPO
        if not is_model_cached(repo):
            raise ModelNotCachedError(
                f"Model '{repo}' is not downloaded. Use the Model Downloads page to download it first."
            )
        self.model = pipeline("text-to-audio", model=repo, trust_remote_code=True, device=self.device)

    def generate(
        self,
        prompt: str,
        duration_seconds: float = 30.0,
        genre: str = "pop",
        mood: str = "neutral",
        tempo: int | None = None,
        seed: int | None = None,
        mode: str = "generate",
        reference_audio_path: str | None = None,
    ) -> tuple[np.ndarray, int]:
        self.load_model()

        # Fold mode into prompt
        if mode == "cover" and reference_audio_path:
            full_prompt = f"cover of {genre}, {mood}, {prompt}"
            logger.debug("ACE-Step cover mode with reference: %s", reference_audio_path)
        elif mode == "cover":
            full_prompt = f"cover of {genre}, {mood}, {prompt}"
        elif mode == "repaint":
            full_prompt = f"reimagined version of {genre}, {mood}, {prompt}"
            if reference_audio_path:
                logger.debug("ACE-Step repaint mode with reference: %s", reference_audio_path)
        else:
            full_prompt = f"{genre}, {mood}, {prompt}"

        if tempo is not None:
            full_prompt = f"{full_prompt} {tempo} bpm"
        kwargs: dict = {"max_duration_seconds": duration_seconds}
        if seed is not None:
            kwargs["seed"] = seed
        result = self.model(full_prompt, **kwargs)
        if isinstance(result, dict):
            audio = result["audio"]
            sample_rate = int(result.get("sampling_rate", ACESTEP_SAMPLE_RATE))
        else:
            audio = result.audio
            sample_rate = int(getattr(result, "sampling_rate", ACESTEP_SAMPLE_RATE))
        import torch

        if isinstance(audio, torch.Tensor):
            audio = audio.cpu().numpy()
        if audio.ndim > 1:
            audio = audio.mean(axis=0)
        return audio, sample_rate

    def is_available(self) -> bool:
        return importlib.util.find_spec("transformers") is not None and importlib.util.find_spec("torch") is not None

    def is_loaded(self) -> bool:
        return self.model is not None

    # unload_model() inherited from BackendBase


acestep_backend = AceStepBackend()
