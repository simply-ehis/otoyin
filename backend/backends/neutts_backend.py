"""
NeuTTS-Air backend (neuphonic/neutts).

Instant zero-shot voice cloning from a short reference clip, backed by a
small LM backbone in GGUF format (Q4/Q8, via llama-cpp-python — no PyTorch
on the language-model side) paired with the NeuCodec audio codec. Prefers
the ONNX decoder-only codec build (torch-free); falls back to the PyTorch
codec if onnxruntime isn't installed.

OPTIONAL: lazy-imports the `neutts` package, degrades gracefully (clear
501) if it isn't installed. Apache 2.0 licensed — see NeuTTS's other
backbones (Nano, 2E) for the custom "NeuTTS Open License" variants, not
used here.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import threading

from .. import config
from .base import BackendBase, ModelNotCachedError, model_load_progress

logger = logging.getLogger(__name__)

BACKBONE_REPO = "neuphonic/neutts-air-q4-gguf"
CODEC_REPO_ONNX = "neuphonic/neucodec-onnx-decoder"
CODEC_REPO_TORCH = "neuphonic/neucodec"
SAMPLE_RATE = 24000


class NeuTTSBackend(BackendBase):
    _model_attr = "tts"
    """NeuTTS-Air: GGUF backbone + ONNX (preferred) or torch codec."""

    def __init__(self):
        self.tts = None
        self._codec_is_onnx = False
        self._lock = threading.Lock()
        self._voice_cache: dict[str, tuple] = {}

    def is_loaded(self) -> bool:
        return self.tts is not None

    def _is_model_cached(self) -> bool:
        # App folder is the source of truth (installed via the Models tab;
        # the HF cache is never read as a fallback). NOTE: the third-party
        # NeuTTS loader itself resolves by repo id internally, so its own
        # cache behavior is library-managed.
        from ..services.model_files import is_model_installed

        return is_model_installed(BACKBONE_REPO, "neutts-air-q4_0.gguf")

    async def load_model(self, model_size: str = "default") -> None:
        if self.tts is not None:
            return
        await asyncio.to_thread(self._load_model_sync)

    def _load_model_sync(self) -> None:
        with self._lock:
            if self.tts is not None:
                return
            try:
                from neutts import NeuTTS
            except ImportError as e:
                raise RuntimeError(
                    'NeuTTS is not installed. Run `pip install "neutts[llama,onnx]"` '
                    "to enable it (optional, not in the base install)."
                ) from e

            is_cached = self._is_model_cached()
            with model_load_progress("neutts-air", is_cached):
                try:
                    import onnxruntime  # noqa: F401

                    codec_repo = CODEC_REPO_ONNX
                    self._codec_is_onnx = True
                except ImportError:
                    codec_repo = CODEC_REPO_TORCH
                    self._codec_is_onnx = False
                    logger.info("onnxruntime not installed — NeuTTS codec will use the torch path")

                self.tts = NeuTTS(
                    backbone_repo=BACKBONE_REPO,
                    backbone_device="cpu",
                    codec_repo=codec_repo,
                    codec_device="cpu",
                )
            logger.info("NeuTTS-Air loaded (codec=%s)", "onnx" if self._codec_is_onnx else "torch")

    def unload_model(self):
        with self._lock:
            super().unload_model()

    def _after_unload(self):
        self._voice_cache.clear()

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> tuple[dict, bool]:
        """Encode a reference clip into NeuTTS's ref_codes + carry the transcript.

        NeuTTS needs both: encode_reference() only produces the audio codes,
        infer() separately needs the reference transcript text alongside them.
        """

        await self.load_model()

        cache_key = hashlib.sha256(f"{audio_path}:{reference_text}".encode()).hexdigest()
        if use_cache and cache_key in self._voice_cache:
            return {"cache_key": cache_key}, True

        resolved = config.resolve_storage_path(audio_path)
        if resolved is None or not resolved.exists():
            raise ModelNotCachedError(f"Reference audio not found: {audio_path}")

        ref_codes = await asyncio.to_thread(self.tts.encode_reference, str(resolved))
        self._voice_cache[cache_key] = (ref_codes, reference_text)
        return {"cache_key": cache_key}, False

    async def combine_voice_prompts(self, prompts: list[dict]) -> dict:
        # NeuTTS has no native multi-reference blending — use the first prompt,
        # matching how other single-reference backends in this codebase handle it.
        if not prompts:
            raise ValueError("No voice prompts to combine")
        return prompts[0]

    async def generate(
        self,
        text: str,
        voice_prompt: dict,
        **kwargs,
    ) -> tuple:
        await self.load_model()

        cache_key = voice_prompt.get("cache_key")
        cached = self._voice_cache.get(cache_key) if cache_key else None
        if cached is None:
            raise ValueError("Voice prompt not found — call create_voice_prompt first")
        ref_codes, ref_text = cached

        wav = await asyncio.to_thread(self.tts.infer, text, ref_codes, ref_text)
        return wav, SAMPLE_RATE


# Singleton used by the routes/services layer.
neutts_backend = NeuTTSBackend()
