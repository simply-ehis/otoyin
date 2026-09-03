"""
F5-TTS ONNX backend — torch-free.

Wraps the vendored upstream inference engine in ``_f5_tts_onnx.F5TTSOnnx``
(source: DakeQQ/F5-TTS-ONNX, Apache-2.0). This file only adapts the Di
Stefano backend contract and resolves the ONNX + vocab assets from the
HuggingFace cache; no inference logic is reimplemented here.

Requires: onnxruntime, numpy, jieba, pypinyin, soundfile, scipy (lazy).
"""

import asyncio
import logging
import os
import threading

import numpy as np

from .base import (
    BackendBase,
    combine_voice_prompts as _combine_voice_prompts,
    is_model_cached,
    model_load_progress,
)

logger = logging.getLogger(__name__)

ONNX_REPO = "huggingfacess/F5-TTS-ONNX"
VOCAB_REPO = "SWivid/F5-TTS"
VOCAB_FILE = "F5TTS_v1_Base/vocab.txt"
SAMPLE_RATE = 24000


def is_onnx_available() -> bool:
    """True if onnxruntime + jieba + pypinyin are importable."""
    try:
        import jieba
        import onnxruntime
        import pypinyin

        return True
    except ImportError:
        return False


def _resolve_assets() -> tuple[str, str, str, str]:
    """Return (preprocess, transformer, decoder, vocab) cached paths.

    Each ONNX graph is resolved through the shared precision resolver so an
    int8/fp16 sibling shipped by the repo is preferred over fp32.
    """
    from huggingface_hub import hf_hub_download

    from ._onnx_precision import resolve_session_path

    pre_fp32 = hf_hub_download(ONNX_REPO, "F5_Preprocess.onnx")
    trf_fp32 = hf_hub_download(ONNX_REPO, "F5_Transformer.onnx")
    dec_fp32 = hf_hub_download(ONNX_REPO, "F5_Decode.onnx")
    vocab = hf_hub_download(VOCAB_REPO, VOCAB_FILE)

    pre = resolve_session_path(os.path.dirname(pre_fp32), "F5_Preprocess")[0]
    trf = resolve_session_path(os.path.dirname(trf_fp32), "F5_Transformer")[0]
    dec = resolve_session_path(os.path.dirname(dec_fp32), "F5_Decode")[0]
    return pre, trf, dec, vocab


class F5TTSOnnxBackend(BackendBase):
    _model_attr = "_engine"
    """F5-TTS via ONNX Runtime — no torch, delegates to upstream engine."""

    def __init__(self):
        self._engine = None
        self._lock = threading.Lock()

    def is_loaded(self) -> bool:
        return self._engine is not None

    def _get_model_path(self, model_size: str) -> str:
        return ONNX_REPO

    def _is_model_cached(self, model_size: str = "default") -> bool:
        return is_model_cached(
            ONNX_REPO, required_files=["F5_Preprocess.onnx", "F5_Transformer.onnx", "F5_Decode.onnx"]
        )

    async def load_model(self, model_size: str = "default") -> None:
        if self._engine is not None:
            return
        await asyncio.to_thread(self._load_sync)

    def _load_sync(self) -> None:
        with self._lock:
            if self._engine is not None:
                return
            is_cached = self._is_model_cached()
            with model_load_progress("f5-tts-onnx", is_cached):
                from ._f5_tts_onnx import F5TTSOnnx

                pre, trf, dec, vocab = _resolve_assets()
                self._engine = F5TTSOnnx(pre, trf, dec, vocab)
            logger.info("F5-TTS ONNX loaded")

    # unload_model() inherited from BackendBase

    async def create_voice_prompt(self, audio_path, reference_text, use_cache=True):
        return {
            "voice_type": "clone",
            "ref_audio": str(audio_path),
            "ref_text": reference_text,
        }, False

    async def combine_voice_prompts(self, audio_paths, reference_texts):
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=SAMPLE_RATE)

    async def generate(self, text, voice_prompt, language="en", seed=None, instruct=None, temperature=None):
        await self.load_model()

        ref_audio = voice_prompt.get("ref_audio", "")
        ref_text = voice_prompt.get("ref_text", "")

        def _gen():
            audio = self._engine.generate(text, ref_audio, ref_text)
            if audio is None or audio.size == 0:
                return np.zeros(SAMPLE_RATE, dtype=np.float32), SAMPLE_RATE
            return audio.astype(np.float32), SAMPLE_RATE

        return await asyncio.to_thread(_gen)


f5_tts_onnx_backend = F5TTSOnnxBackend()
