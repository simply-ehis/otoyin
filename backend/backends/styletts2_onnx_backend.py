"""
StyleTTS2 ONNX backend — torch-free, vendored from DDATT/StyleTTS2-onnx-cpp.

This backend is a thin async wrapper around ``_styletts2_onnx.StyleTTS2Onnx``,
which is a faithful port of the upstream C++ runtime. The ONNX pipeline needs
precomputed style + predictor embeddings (``ref_s.bin`` / ``ref_p.bin``) — the
upstream ships a default speaker, and arbitrary-audio cloning requires those
``.bin`` files (produced by ``Assets/get_reference_audio.py`` against the full
StyleTTS2 torch model, NOT at runtime).
"""

import asyncio
import logging
import threading

import numpy as np

from ._styletts2_onnx import StyleTTS2Onnx
from .base import (
    BackendBase,
    combine_voice_prompts as _combine_voice_prompts,
    is_model_cached,
    model_load_progress,
)

logger = logging.getLogger(__name__)

ONNX_REPO = "DDATT/StyleTTS2-ONNX-Cpp"
SAMPLE_RATE = 24000

ONNX_COMPONENTS = [
    "bert_encoder",
    "plbert_simp",
    "final_simp",
]

DEFAULT_REF_FILES = ["ref_s.bin", "ref_p.bin"]


def is_onnx_available() -> bool:
    try:
        import onnxruntime

        return True
    except ImportError:
        return False


class StyleTTS2OnnxBackend(BackendBase):
    _model_attr = "_engine"
    """StyleTTS2 via ONNX Runtime — torch-free, faithful upstream port."""

    def __init__(self):
        self._engine: StyleTTS2Onnx | None = None
        self._lock = threading.Lock()

    def is_loaded(self) -> bool:
        return self._engine is not None

    def _is_model_cached(self, model_size: str = "default") -> bool:
        return is_model_cached(
            ONNX_REPO,
            required_files=ONNX_COMPONENTS + DEFAULT_REF_FILES,
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
            with model_load_progress("styletts2-onnx", is_cached):
                self._engine = self._do_load()
            logger.info("StyleTTS2 ONNX loaded")

    def _do_load(self) -> StyleTTS2Onnx:
        from huggingface_hub import hf_hub_download

        model_dir = None
        for name in ONNX_COMPONENTS:
            path = hf_hub_download(ONNX_REPO, f"{name}.onnx")
            if model_dir is None:
                model_dir = str(path).rsplit("/", 1)[0]

        engine = StyleTTS2Onnx(model_dir)

        try:
            style_path = hf_hub_download(ONNX_REPO, "ref_s.bin")
            pred_path = hf_hub_download(ONNX_REPO, "ref_p.bin")
            engine.load_style(style_path, pred_path)
        except Exception as exc:
            logger.warning(
                "StyleTTS2 default ref embeddings unavailable (%s); "
                "call create_voice_prompt with .bin files before generate().",
                exc,
            )
        return engine

    # unload_model() inherited from BackendBase

    async def create_voice_prompt(self, audio_path, reference_text, use_cache=True):
        """Register precomputed StyleTTS2 embeddings for cloning.

        The ONNX runtime consumes ``ref_s.bin`` / ``ref_p.bin`` produced from
        reference audio (upstream ``Assets/get_reference_audio.py``). Pass a
        directory containing those two files, or a dict with explicit paths.
        Falls back to the bundled default speaker when omitted.
        """
        if isinstance(audio_path, dict):
            ref_s = audio_path.get("ref_s")
            ref_p = audio_path.get("ref_p")
        else:
            ref_s = f"{audio_path}_ref_s.bin"
            ref_p = f"{audio_path}_ref_p.bin"
        return {
            "voice_type": "clone",
            "ref_s": ref_s,
            "ref_p": ref_p,
        }, False

    async def combine_voice_prompts(self, audio_paths, reference_texts):
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=SAMPLE_RATE)

    async def generate(self, text, voice_prompt, language="en", seed=None, instruct=None, temperature=None):
        await self.load_model()

        def _gen():
            engine = self._engine
            if voice_prompt and voice_prompt.get("ref_s") and voice_prompt.get("ref_p"):
                engine.load_style(voice_prompt["ref_s"], voice_prompt["ref_p"])
            audio = engine.synthesize(text, speed=1.0)
            return audio.astype(np.float32), SAMPLE_RATE

        return await asyncio.to_thread(_gen)


styletts2_onnx_backend = StyleTTS2OnnxBackend()
