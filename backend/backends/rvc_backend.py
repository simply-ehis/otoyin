"""
RVC v2 voice-conversion backend.

Lightweight retrieval-based voice conversion. Uses a shared HuBERT content
extractor + per-voice generator weights. Voice packs are HuggingFace repos
containing a `.pth` generator (and optionally a `.index` retrieval file).
"""

from __future__ import annotations

import contextlib
import logging
import threading
from pathlib import Path

import numpy as np

from .. import config
from .base import BackendBase, model_load_progress

logger = logging.getLogger(__name__)

# Shared feature extractor (HuBERT-base) — downloaded once, reused for all voices.
HUBERT_REPO = "lassl/ContentVec-128"
HUBERT_FILE = "contentvec_base.pt"

# Registered voice packs: name -> source descriptor.
# `repo`: HuggingFace repo id.
# `pth`: filename of the generator checkpoint inside the repo.
# `index`: optional filename of the feature-index inside the repo.
# `zip`: optional name of a zip archive that contains the .pth/.index
#        (extracted after download). Used when a repo ships packs as zips
#        (e.g. sxndypz/rvc-v2-models) instead of root-level files.
RVC_VOICE_PACKS = {
    "default": {
        "repo": "PhoenixStormJr/RVC-V2-default-voice",
        "pth": "default.pth",
        "index": "added_IVF511_Flat_nprobe_1_default_v2.index",
    },
    "an-v2": {
        "repo": "sxndypz/rvc-v2-models",
        "zip": "an_v2.zip",
        "pth": "an_v2.pth",
        "index": "an_v2.index",
    },
    "coconut-v2": {
        "repo": "sxndypz/rvc-v2-models",
        "zip": "coconutv2.zip",
        "pth": "coconutv2.pth",
        "index": "coconutv2.index",
    },
}


class RVCBackend(BackendBase):
    _model_attr = "model"
    """RVC v2 voice-conversion backend (CPU-first, GPU optional)."""

    def __init__(self):
        self.model = None
        self.voice_name = None
        self._lock = threading.Lock()
        self._device = "cpu"

    def _resolve_device(self) -> str:
        try:
            import torch

            return "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            logger.debug("CUDA detection failed, falling back to CPU", exc_info=True)
            return "cpu"

    def _get_models_dir(self) -> Path:
        return config.get_models_dir() / "rvc"

    def _hubert_path(self) -> Path:
        return self._get_models_dir() / HUBERT_FILE

    def _voice_dir(self, voice_name: str) -> Path:
        return self._get_models_dir() / voice_name

    def pack_source(self, voice_name: str) -> dict | None:
        desc = RVC_VOICE_PACKS.get(voice_name)
        if isinstance(desc, str):
            desc = {"repo": desc, "pth": f"{voice_name}.pth"}
        return desc

    def _find_generator(self, voice_name: str) -> Path | None:
        d = self._voice_dir(voice_name)
        if not d.exists():
            return None
        for f in d.iterdir():
            if f.suffix == ".pth":
                return f
        return None

    def _find_index(self, voice_name: str) -> Path | None:
        d = self._voice_dir(voice_name)
        if not d.exists():
            return None
        for f in d.iterdir():
            if f.suffix == ".index":
                return f
        return None

    def is_loaded(self) -> bool:
        return self.model is not None

    def load_model(self, voice_name: str) -> None:
        with self._lock:
            if self.model is not None and self.voice_name == voice_name:
                return
            self._load_model_sync(voice_name)

    def _load_model_sync(self, voice_name: str) -> None:
        gen_path = self._find_generator(voice_name)
        if gen_path is None:
            from .base import ModelNotCachedError

            raise ModelNotCachedError(
                f"RVC voice pack '{voice_name}' is not downloaded. Use the Model Downloads page first."
            )

        from rvc_python.infer import RVCInference

        self._device = self._resolve_device()
        with model_load_progress(f"rvc-{voice_name}", False):
            self.model = RVCInference(
                models_dir=str(self._get_models_dir()),
                device=self._device,
                f0method="rmvpe",
                index_rate=0.5,
                protect=0.33,
            )
            self.model.load_model(voice_name)
        self.voice_name = voice_name
        logger.info("RVC voice pack '%s' loaded on %s", voice_name, self._device)

    def _on_unload(self):
        with contextlib.suppress(Exception):
            self.model.unload_model()

    def _after_unload(self):
        self.voice_name = None

    # unload_model() inherited from BackendBase

    def convert(
        self,
        audio: np.ndarray,
        sample_rate: int,
        voice_name: str,
        transpose: int = 0,
        index_rate: float = 0.5,
        f0_method: str = "rmvpe",
    ) -> tuple[np.ndarray, int]:
        import tempfile

        import soundfile as sf

        with self._lock:
            if self.model is None or self.voice_name != voice_name:
                self._load_model_sync(voice_name)

            self.model.set_params(
                f0up_key=transpose,
                f0method=f0_method,
                index_rate=index_rate,
                protect=0.33,
            )

            with tempfile.NamedTemporaryFile(suffix=".wav") as tmp_in:
                sf.write(tmp_in, np.asarray(audio, dtype=np.float32), int(sample_rate))
                with tempfile.NamedTemporaryFile(suffix=".wav") as tmp_out:
                    self.model.infer_file(tmp_in.name, tmp_out.name)
                    wav, sr = sf.read(tmp_out.name)
            return np.asarray(wav, dtype=np.float32), int(sr)


# Singleton used by the routes/services layer.
rvc_backend = RVCBackend()
