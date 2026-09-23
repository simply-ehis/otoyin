"""Audio event detection via YAMNet (ONNX Runtime, no torch).

YAMNet (Google, AudioSet, Apache-2.0) predicts 521 audio event classes per
0.48 s-hop frame — laughter, applause, sighs, coughs, music, and hundreds
more. Weights are the straight tf2onnx conversion
``audiomagic/yamnet-onnx`` (``yamnet.onnx`` + ``yamnet_class_map.csv``),
verified against its published reference vectors in
``backend/tests/test_yamnet_onnx.py``.

The model is BUNDLED (see ``build_binary.py`` --add-data), resolved
frozen-aware with a models-dir fallback. The mel frontend is baked into
the graph: input is raw 16 kHz mono waveform, no feature code to get wrong.
"""

from __future__ import annotations

import csv
import logging
import threading
from pathlib import Path

import numpy as np

from .. import config
from .base import BackendBase, ModelNotCachedError, model_load_progress

logger = logging.getLogger(__name__)

ONNX_REPO = "audiomagic/yamnet-onnx"
ONNX_FILE = "yamnet.onnx"
CLASS_MAP_FILE = "yamnet_class_map.csv"

SAMPLE_RATE = 16000
# README framing: 0.96 s window advancing 0.48 s; frame i spans
# [i * HOP, i * HOP + LENGTH]. Short inputs zero-pad to one frame.
FRAME_LENGTH_S = 0.96
FRAME_HOP_S = 0.48


def frame_time_range(index: int) -> tuple[float, float]:
    """Start/end seconds of YAMNet output frame ``index``."""
    start = index * FRAME_HOP_S
    return start, start + FRAME_LENGTH_S


def _resolve_files() -> tuple[Path | None, Path | None]:
    """Locate (yamnet.onnx, class map): bundled copy first, models dir next."""
    import sys

    candidates: list[Path] = []
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            candidates.append(Path(meipass) / "yamnet")
    candidates.append(config.get_models_dir() / "yamnet")
    for directory in candidates:
        onnx_path = directory / ONNX_FILE
        csv_path = directory / CLASS_MAP_FILE
        if onnx_path.is_file() and csv_path.is_file():
            return onnx_path, csv_path
    return None, None


class YamnetOnnxBackend(BackendBase):
    _model_attr = "session"
    """Audio event classifier: 521 AudioSet classes per 0.48 s frame."""

    def __init__(self):
        self.session = None
        self._class_names: list[str] | None = None
        self._lock = threading.Lock()

    def is_loaded(self) -> bool:
        return self.session is not None

    def class_names(self) -> list[str]:
        """521 display names in class-index order (from the shipped CSV)."""
        if self._class_names is None:
            _, csv_path = _resolve_files()
            if csv_path is None:
                raise ModelNotCachedError(
                    "YAMNet class map not found. It ships with the app bundle; "
                    "in dev it lives at <models>/yamnet/yamnet_class_map.csv."
                )
            with open(csv_path, newline="", encoding="utf-8") as fh:
                self._class_names = [row["display_name"] for row in csv.DictReader(fh)]
        return self._class_names

    def _ensure_models(self) -> None:
        """Fetch weights into the models dir when neither copy exists."""
        onnx_path, _ = _resolve_files()
        if onnx_path is not None:
            return
        from huggingface_hub import hf_hub_download

        model_dir = config.get_models_dir() / "yamnet"
        model_dir.mkdir(parents=True, exist_ok=True)
        import shutil

        for filename in (ONNX_FILE, CLASS_MAP_FILE):
            dest = model_dir / filename
            if dest.exists():
                continue
            try:
                src = hf_hub_download(repo_id=ONNX_REPO, filename=filename)
                shutil.copy2(src, dest)
            except Exception as exc:
                logger.warning("Failed to download %s: %s", filename, exc)

    def _load_session(self) -> None:
        import onnxruntime as ort

        onnx_path, _ = _resolve_files()
        if onnx_path is None:
            raise ModelNotCachedError(
                "YAMNet weights not found. They ship with the app bundle; "
                "in dev download audiomagic/yamnet-onnx into <models>/yamnet/."
            )
        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 2
        opts.intra_op_num_threads = 2
        self.session = ort.InferenceSession(str(onnx_path), opts)
        # Force the class map to load now so a corrupt CSV fails at load,
        # not mid-pack.
        self.class_names()

    def load_model(self, model_size: str = "default") -> None:
        with self._lock:
            if self.session is not None:
                return
            # Bundled model: always treated as cached (no download flow).
            with model_load_progress("yamnet-onnx", True):
                self._ensure_models()
                self._load_session()
        logger.info("YAMNet event classifier loaded")

    def _on_unload(self):
        self.session = None
        self._class_names = None

    def score_audio(self, audio: np.ndarray, sample_rate: int) -> list[dict]:
        """Score audio, returning per-frame class scores.

        Args:
            audio: mono float waveform (any range; normalized to [-1, 1]).
            sample_rate: its sample rate (resampled to 16 kHz when needed).

        Returns:
            One dict per 0.48 s-hop frame: ``{start, end, scores}`` where
            ``scores`` maps class index -> score float.
        """
        if self.session is None:
            raise RuntimeError("YAMNet session not loaded — call load_model() first")
        mono = np.asarray(audio, dtype=np.float32)
        if mono.ndim > 1:
            mono = mono.mean(axis=-1)
        mono = mono.ravel()
        peak = float(np.abs(mono).max()) if mono.size else 0.0
        if peak > 0:
            mono = mono / max(peak, 1e-8)
            mono = np.clip(mono, -1.0, 1.0)
        if sample_rate != SAMPLE_RATE:
            import librosa

            mono = librosa.resample(mono, orig_sr=sample_rate, target_sr=SAMPLE_RATE).astype(np.float32)
        input_name = self.session.get_inputs()[0].name
        raw_scores = self.session.run(None, {input_name: mono})[0]
        frames = []
        for index, row in enumerate(raw_scores):
            start, end = frame_time_range(index)
            frames.append(
                {
                    "start": start,
                    "end": end,
                    "scores": {i: float(s) for i, s in enumerate(row)},
                }
            )
        return frames


yamnet_backend = YamnetOnnxBackend()
