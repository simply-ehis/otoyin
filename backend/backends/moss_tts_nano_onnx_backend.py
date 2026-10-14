"""
MOSS-TTS-Nano ONNX backend — torch-free, vendored from OpenMOSS/MOSS-TTS-Nano.

Thin async wrapper around ``_moss_tts_nano_onnx.MossTTSNanoOnnx``. The engine
runs the full ONNX Runtime pipeline (tokenizer + prefill/decode + codec) with
no PyTorch at inference. Output is natively 48 kHz stereo; this wrapper
downmixes to mono and resamples to the project's 24 kHz standard so it plugs
into the rest of the pipeline. Voice cloning uses a reference audio path
(``create_voice_prompt`` stores it); falls back to a bundled built-in voice.
"""

import asyncio
import logging
import threading
from pathlib import Path

import numpy as np

from ._moss_tts_nano_onnx import MossTTSNanoOnnx
from .base import (
    BackendBase,
    combine_voice_prompts as _combine_voice_prompts,
    model_load_progress,
)

logger = logging.getLogger(__name__)

ONNX_REPO_TTS = "OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX"
ONNX_REPO_CODEC = "OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX"
SAMPLE_RATE = 24000

ONNX_COMPONENTS = [
    "browser_poc_manifest.json",
    "tts_browser_onnx_meta.json",
    "tokenizer.model",
    "codec_browser_onnx_meta.json",
]


def is_onnx_available() -> bool:
    """True only when onnxruntime + sentencepiece are importable."""
    try:
        import onnxruntime
        import sentencepiece

        return True
    except ImportError:
        return False


class MossTTSNanoOnnxBackend(BackendBase):
    _model_attr = "_engine"
    """MOSS-TTS-Nano via ONNX Runtime — torch-free, zero-shot cloning."""

    def __init__(self):
        self._engine: MossTTSNanoOnnx | None = None
        self._lock = threading.Lock()

    def is_loaded(self) -> bool:
        return self._engine is not None

    def _is_model_cached(self, model_size: str = "default") -> bool:
        from ..services.model_files import is_model_installed

        return all(is_model_installed(ONNX_REPO_TTS, name) for name in ONNX_COMPONENTS) and (
            is_model_installed(ONNX_REPO_CODEC, "codec_browser_onnx_meta.json")
        )

    async def load_model(self, model_size: str = "default") -> None:
        if self._engine is not None:
            return
        await asyncio.to_thread(self._load_sync)

    def _load_sync(self) -> None:
        if self._engine is not None:
            return
        with self._lock:
            is_cached = self._is_model_cached()
            with model_load_progress("moss-tts-nano-onnx", is_cached):
                self._engine = self._do_load()
            logger.info("MOSS-TTS-Nano ONNX loaded")

    def _do_load(self) -> MossTTSNanoOnnx:
        from ..services.model_files import resolve_model_file

        tts_dir = None
        for name in ("browser_poc_manifest.json", "tts_browser_onnx_meta.json", "tokenizer.model"):
            path = resolve_model_file(ONNX_REPO_TTS, name)
            if tts_dir is None:
                tts_dir = str(Path(path).parent)
        codec_dir = None
        for name in ("codec_browser_onnx_meta.json",):
            path = resolve_model_file(ONNX_REPO_CODEC, name)
            if codec_dir is None:
                codec_dir = str(Path(path).parent)

        model_dir = tts_dir
        engine = MossTTSNanoOnnx(model_dir, thread_count=4, execution_provider="cpu")
        return engine

    # unload_model() inherited from BackendBase

    async def create_voice_prompt(self, audio_path, reference_text, use_cache=True):
        """Register a reference audio clip for zero-shot voice cloning."""
        return {
            "voice_type": "clone",
            "ref_audio": str(audio_path),
        }, False

    async def combine_voice_prompts(self, audio_paths, reference_texts):
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=SAMPLE_RATE)

    async def generate(self, text, voice_prompt, language="en", seed=None, instruct=None, temperature=None):
        await self.load_model()

        def _gen():
            engine = self._engine
            ref_audio = None
            if voice_prompt and voice_prompt.get("ref_audio"):
                ref_audio = voice_prompt["ref_audio"]

            waveform_48k, native_sr = engine.synthesize(
                text=text,
                prompt_audio_path=ref_audio,
                seed=seed,
            )

            audio = self._to_project_rate(waveform_48k, native_sr)
            return audio.astype(np.float32), SAMPLE_RATE

        return await asyncio.to_thread(_gen)

    @staticmethod
    def _to_project_rate(waveform: np.ndarray, native_sr: int) -> np.ndarray:
        """Downmix to mono and resample 48 kHz -> 24 kHz project standard."""
        import librosa

        audio = np.asarray(waveform, dtype=np.float32)
        if audio.ndim == 2 and audio.shape[1] > 1:
            audio = audio.mean(axis=1)
        elif audio.ndim == 2:
            audio = audio[:, 0]
        if native_sr != SAMPLE_RATE:
            audio = librosa.resample(audio, orig_sr=native_sr, target_sr=SAMPLE_RATE)
        return audio


moss_tts_nano_onnx_backend = MossTTSNanoOnnxBackend()
