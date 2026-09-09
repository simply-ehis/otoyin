"""RVC v2 voice-conversion backend via ONNX Runtime.

ONNX-based RVC inference using ``onnxruntime`` — no PyTorch required.
Uses ContentVec encoder + RMVPE pitch estimator from
``TigreGotico/voiceclonnx-rvc`` and per-voice generator ONNX models.

Voice packs are HuggingFace repos containing a `.onnx` generator
(and optionally a `.index` retrieval file). The base models (ContentVec
encoder + RMVPE pitch estimator) are shared across all voices.
"""

from __future__ import annotations

import logging
import tempfile
import threading
from pathlib import Path

import numpy as np

from .. import config
from .base import BackendBase, model_load_progress

logger = logging.getLogger(__name__)

# Shared base models from voiceclonnx-rvc
BASE_REPO = "TigreGotico/voiceclonnx-rvc"
CONTENTVEC_FILE = "contentvec_768l12.onnx"
CONTENTVEC_FILE_Q8 = "contentvec_768l12_q8.onnx"
RMVPE_FILE = "rmvpe.onnx"
RMVPE_FILE_Q8 = "rmvpe_q8.onnx"

SAMPLE_RATE = 44100

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


class RVCOnnxBackend(BackendBase):
    _model_attr = "model"
    """RVC v2 voice-conversion backend using ONNX Runtime (no torch)."""

    def __init__(self):
        self.model = None
        self.voice_name = None
        self._lock = threading.Lock()
        self._contentvec_session = None
        self._rmvpe_session = None

    def _get_models_dir(self) -> Path:
        return config.get_models_dir() / "rvc"

    def pack_source(self, voice_name: str) -> dict | None:
        desc = RVC_VOICE_PACKS.get(voice_name)
        if isinstance(desc, str):
            desc = {"repo": desc, "pth": f"{voice_name}.pth"}
        return desc

    def _base_dir(self) -> Path:
        return self._get_models_dir() / "onnx_base"

    def _voice_dir(self, voice_name: str) -> Path:
        return self._get_models_dir() / voice_name

    def _find_generator(self, voice_name: str) -> Path | None:
        d = self._voice_dir(voice_name)
        if not d.exists():
            return None
        for f in d.iterdir():
            if f.suffix == ".onnx":
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

    def _ensure_base_models(self) -> None:
        """Download ContentVec encoder and RMVPE pitch estimator if not cached."""
        import shutil

        from huggingface_hub import hf_hub_download

        base = self._base_dir()
        base.mkdir(parents=True, exist_ok=True)

        contentvec_path = base / CONTENTVEC_FILE
        if not contentvec_path.exists():
            try:
                src = hf_hub_download(repo_id=BASE_REPO, filename=CONTENTVEC_FILE)
                shutil.copy2(src, contentvec_path)
            except Exception:
                # Try Q8 quantized version
                src = hf_hub_download(repo_id=BASE_REPO, filename=CONTENTVEC_FILE_Q8)
                shutil.copy2(src, contentvec_path)

        rmvpe_path = base / RMVPE_FILE
        if not rmvpe_path.exists():
            try:
                src = hf_hub_download(repo_id=BASE_REPO, filename=RMVPE_FILE)
                shutil.copy2(src, rmvpe_path)
            except Exception:
                src = hf_hub_download(repo_id=BASE_REPO, filename=RMVPE_FILE_Q8)
                shutil.copy2(src, rmvpe_path)

    def _load_base_sessions(self) -> None:
        """Load ONNX sessions for ContentVec and RMVPE."""
        import onnxruntime as ort

        base = self._base_dir()
        contentvec_path = base / CONTENTVEC_FILE
        rmvpe_path = base / RMVPE_FILE

        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 2
        opts.intra_op_num_threads = 2

        self._contentvec_session = ort.InferenceSession(str(contentvec_path), opts)
        self._rmvpe_session = ort.InferenceSession(str(rmvpe_path), opts)

    def load_model(self, voice_name: str = "default") -> None:
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

        with model_load_progress(f"rvc-onnx-{voice_name}", False):
            self._ensure_base_models()
            self._load_base_sessions()

            import onnxruntime as ort

            opts = ort.SessionOptions()
            opts.inter_op_num_threads = 2
            opts.intra_op_num_threads = 2
            self.model = ort.InferenceSession(str(gen_path), opts)

        self.voice_name = voice_name
        logger.info("RVC ONNX voice pack '%s' loaded", voice_name)

    def _on_unload(self):
        self.model = None
        self._contentvec_session = None
        self._rmvpe_session = None

    def _after_unload(self):
        self.voice_name = None

    def convert(
        self,
        audio: np.ndarray,
        sample_rate: int,
        voice_name: str,
        transpose: int = 0,
        index_rate: float = 0.5,
        f0_method: str = "rmvpe",
    ) -> tuple[np.ndarray, int]:
        import soundfile as sf

        with self._lock:
            if self.model is None or self.voice_name != voice_name:
                self._load_model_sync(voice_name)

            with tempfile.NamedTemporaryFile(suffix=".wav") as tmp_in:
                sf.write(tmp_in, np.asarray(audio, dtype=np.float32), int(sample_rate))
                with tempfile.NamedTemporaryFile(suffix=".wav") as tmp_out:
                    self._infer_file(tmp_in.name, tmp_out.name)
                    wav, sr = sf.read(tmp_out.name)
            return np.asarray(wav, dtype=np.float32), int(sr)

    def _infer_file(self, input_path: str, output_path: str) -> None:
        """Basic ONNX inference: load audio, run through generator, save."""
        import soundfile as sf

        audio, sr = sf.read(input_path)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)

        # Resample to 44.1kHz if needed
        if sr != SAMPLE_RATE:
            from ..utils.audio import resample_audio

            audio = resample_audio(audio, sr, SAMPLE_RATE)
            sr = SAMPLE_RATE

        audio = np.asarray(audio, dtype=np.float32)

        # Extract features using ContentVec
        if self._contentvec_session is not None:
            # Pad to 32-sample chunks for ContentVec
            chunk_size = 32 * 256  # 8192 samples
            if len(audio) < chunk_size:
                audio = np.pad(audio, (0, chunk_size - len(audio)))
            feats = self._contentvec_session.run(None, {"input": audio[np.newaxis, :]})[0]
        else:
            feats = audio[np.newaxis, :]

        # Run through voice generator
        result = self.model.run(None, {"feats": feats})[0]

        # Write output
        if result.ndim > 1:
            result = result.squeeze()
        sf.write(output_path, result.astype(np.float32), SAMPLE_RATE)


# Singleton used by the routes/services layer.
rvc_onnx_backend = RVCOnnxBackend()
