"""
Seed-VC voice-conversion backend.

Zero-shot voice conversion: clone a target voice from a reference audio clip
(1-30s) with NO training. Uses the official Seed-VC wrapper (Plachtaa/seed-vc).
Heavier than RVC (DiT + Whisper + BigVGAN + CAMPPlus + RMVPE) and GPU-friendly,
but needs no pre-trained voice pack — just a reference file.

This backend is OPTIONAL: it lazy-imports ``seed_vc_wrapper`` and degrades
gracefully if Seed-VC is not installed or if models fail to download.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path

import numpy as np

from .. import config
from .base import BackendBase

logger = logging.getLogger(__name__)


class SeedVCBackend(BackendBase):
    _model_attr = "model"
    """Zero-shot (reference-audio) voice conversion backend."""

    def __init__(self):
        self.model = None
        self._lock = threading.Lock()
        self._device = "cuda" if self._cuda_available() else "cpu"

    def _cuda_available(self) -> bool:
        try:
            import torch

            return torch.cuda.is_available()
        except Exception:
            logger.debug("CUDA detection failed, falling back to CPU", exc_info=True)
            return False

    def is_loaded(self) -> bool:
        return self.model is not None

    def _venv_site_packages(self) -> Path | None:
        """Locate the Seed-VC side-venv site-packages, if installed.

        Resolved from ``SEED_VC_VENV`` env (a venv dir) or the default
        ``data/models/seed_vc_venv`` created by ``scripts/install_seed_vc.py``.
        Returns the site-packages path, or ``None`` if no venv exists.
        """
        import os

        env = os.environ.get("SEED_VC_VENV")
        candidates = []
        if env:
            candidates.append(Path(env))
        candidates.append(config.get_models_dir() / "seed_vc_venv")
        for venv in candidates:
            if not venv.exists():
                continue
            for sub in ("lib/python*/site-packages", "Lib/site-packages"):
                import glob

                hits = glob.glob(str(venv / sub))
                if hits:
                    return Path(sorted(hits)[-1])
        return None

    def _load_model_sync(self) -> None:
        import sys

        site = self._venv_site_packages()
        if site is not None and str(site) not in sys.path:
            sys.path.insert(0, str(site))

        try:
            from seed_vc_wrapper import SeedVCWrapper
        except ImportError as e:
            raise RuntimeError(
                "Seed-VC is not installed. Run `python scripts/install_seed_vc.py` "
                "(creates an isolated venv) or set SEED_VC_VENV to an existing venv."
            ) from e

        with self._lock:
            if self.model is not None:
                return
            self.model = SeedVCWrapper()
            logger.info("Seed-VC wrapper loaded on %s", self._device)

    # unload_model() inherited from BackendBase

    def convert(
        self,
        audio: np.ndarray,
        sample_rate: int,
        reference_audio_path: str,
        diffusion_steps: int = 10,
        length_adjust: float = 1.0,
        inference_cfg_rate: float = 0.7,
        f0_condition: bool = False,
        pitch_shift: int = 0,
    ) -> tuple[np.ndarray, int]:
        import tempfile

        import soundfile as sf

        with self._lock:
            if self.model is None:
                self._load_model_sync()

            with tempfile.NamedTemporaryFile(suffix=".wav") as tmp_in:
                sf.write(tmp_in, np.asarray(audio, dtype=np.float32), int(sample_rate))
                result = self.model.convert_voice(
                    source=tmp_in.name,
                    target=reference_audio_path,
                    diffusion_steps=diffusion_steps,
                    length_adjust=length_adjust,
                    inference_cfg_rate=inference_cfg_rate,
                    f0_condition=f0_condition,
                    auto_f0_adjust=True,
                    pitch_shift=pitch_shift,
                    stream_output=False,
                )
                # stream_output=False returns the full audio as a numpy array.
                if isinstance(result, tuple):
                    sr, wav = result
                else:
                    wav = result
                    sr = int(sample_rate)
                wav = np.asarray(wav, dtype=np.float32)
                if wav.ndim > 1:
                    wav = wav.mean(axis=1)
                return wav, int(sr)


# Singleton used by the routes/services layer.
seed_vc_backend = SeedVCBackend()
