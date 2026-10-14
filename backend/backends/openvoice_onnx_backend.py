"""OpenVoice v2 tone-color conversion via ONNX Runtime.

ONNX-based OpenVoice inference using ``onnxruntime`` — no PyTorch required.
Uses pre-exported ONNX models from ``Hinotsuba/OpenVoice-ONNX-v2``:
- ``tone_extract.onnx`` (3.36 MB): extracts 256-d voice fingerprint
- ``tone_color.onnx`` (157 MB): transfers voice characteristics

This backend only handles tone-color conversion (voice cloning). You still
need a base TTS engine (e.g., Kokoro, Piper) to generate source audio, then
apply OpenVoice tone conversion on top.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path

import numpy as np

from .. import config
from .base import BackendBase, ModelNotCachedError, model_load_progress

logger = logging.getLogger(__name__)

ONNX_REPO = "Hinotsuba/OpenVoice-ONNX-v2"
TONE_EXTRACT_FILE = "tone_extract.onnx"
TONE_COLOR_FILE = "tone_color.onnx"
TONE_CONFIG_FILE = "tone_config.json"

SAMPLE_RATE = 24000


class OpenVoiceOnnxBackend(BackendBase):
    _model_attr = "tone_color_session"
    """OpenVoice v2 tone-color conversion via ONNX Runtime (no torch)."""

    def __init__(self):
        self.tone_color_session = None
        self._lock = threading.Lock()
        self._tone_extract_session = None
        self._se_cache: dict[str, np.ndarray] = {}

    def _get_models_dir(self) -> Path:
        return config.get_models_dir() / "openvoice"

    def is_loaded(self) -> bool:
        return self.tone_color_session is not None

    def _ensure_models(self) -> None:
        """Download ONNX models if not cached."""
        import shutil

        from huggingface_hub import hf_hub_download

        model_dir = self._get_models_dir()
        model_dir.mkdir(parents=True, exist_ok=True)

        for filename in [TONE_EXTRACT_FILE, TONE_COLOR_FILE, TONE_CONFIG_FILE]:
            dest = model_dir / filename
            if not dest.exists():
                try:
                    src = hf_hub_download(repo_id=ONNX_REPO, filename=filename)
                    shutil.copy2(src, dest)
                except Exception as e:
                    logger.warning("Failed to download %s: %s", filename, e)
        from ..services.model_files import clear_hf_repo_cache

        clear_hf_repo_cache(ONNX_REPO)

    def _load_sessions(self) -> None:
        """Load ONNX sessions for tone extraction and color transfer."""
        import onnxruntime as ort

        model_dir = self._get_models_dir()
        extract_path = model_dir / TONE_EXTRACT_FILE
        color_path = model_dir / TONE_COLOR_FILE

        if not extract_path.exists() or not color_path.exists():
            raise ModelNotCachedError("OpenVoice ONNX models are not downloaded. Use the Model Downloads page first.")

        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 2
        opts.intra_op_num_threads = 2

        self._tone_extract_session = ort.InferenceSession(str(extract_path), opts)
        self.tone_color_session = ort.InferenceSession(str(color_path), opts)

    def load_model(self, model_size: str = "default") -> None:
        with self._lock:
            if self.tone_color_session is not None:
                return
            self._load_model_sync()

    def _load_model_sync(self) -> None:
        with model_load_progress("openvoice-onnx", False):
            self._ensure_models()
            self._load_sessions()
        logger.info("OpenVoice ONNX converter loaded")

    def _on_unload(self):
        self.tone_color_session = None
        self._tone_extract_session = None

    def _after_unload(self):
        self._se_cache.clear()

    def _extract_se(self, audio_path: str) -> np.ndarray:
        """Extract speaker embedding from audio using the tone_extract model."""
        import soundfile as sf

        audio, sr = sf.read(audio_path)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)

        # Resample to 24kHz if needed
        if sr != SAMPLE_RATE:
            from ..utils.audio import resample_audio

            audio = resample_audio(audio, sr, SAMPLE_RATE)

        audio = np.asarray(audio, dtype=np.float32)

        # Pad to fixed length (1.5 seconds = 36000 samples at 24kHz)
        target_len = 36000
        if len(audio) < target_len:
            audio = np.pad(audio, (0, target_len - len(audio)))
        elif len(audio) > target_len:
            audio = audio[:target_len]

        # Add batch dimension
        audio = audio[np.newaxis, :]

        # Run tone extraction
        se = self._tone_extract_session.run(None, {"audio": audio})[0]
        return se.squeeze()

    def convert(
        self,
        audio_path: str,
        reference_audio_path: str,
        tau: float = 0.3,
    ) -> tuple:
        """Convert audio to the timbre of reference_audio_path.

        tau: noise-scale for tone-color extraction — lower is closer to
        the reference (default 0.3 matches official demo).
        """
        import soundfile as sf

        with self._lock:
            if self.tone_color_session is None:
                self._load_model_sync()

            # Extract or cache speaker embeddings
            source_se = self._se_cache.get(audio_path)
            if source_se is None:
                source_se = self._extract_se(audio_path)
                self._se_cache[audio_path] = source_se

            target_se = self._se_cache.get(reference_audio_path)
            if target_se is None:
                target_se = self._extract_se(reference_audio_path)
                self._se_cache[reference_audio_path] = target_se

            # Load source audio
            audio, sr = sf.read(audio_path)
            if audio.ndim > 1:
                audio = audio.mean(axis=1)
            audio = np.asarray(audio, dtype=np.float32)

            # Resample to 24kHz if needed
            if sr != SAMPLE_RATE:
                from ..utils.audio import resample_audio

                audio = resample_audio(audio, sr, SAMPLE_RATE)

            # Run tone color transfer
            result = self.tone_color_session.run(
                None,
                {
                    "audio": audio[np.newaxis, :],
                    "source_se": source_se[np.newaxis, :],
                    "target_se": target_se[np.newaxis, :],
                    "tau": np.array([tau], dtype=np.float32),
                },
            )[0]

            return result.squeeze().astype(np.float32), SAMPLE_RATE


# Singleton used by the routes/services layer.
openvoice_onnx_backend = OpenVoiceOnnxBackend()
