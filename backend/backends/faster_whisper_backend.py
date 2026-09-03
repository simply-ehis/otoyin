"""
faster-whisper STT backend.

Multilingual models via CTranslate2 int8 quantization — fast CPU/GPU inference.
Returns per-word timestamps + confidence via faster-whisper's word-level output.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from .. import config
from .base import BackendBase, model_load_progress

logger = logging.getLogger(__name__)

HF_REPO_PREFIX = "Systran/faster-whisper-"

FASTER_WHISPER_MODELS = {
    "tiny.en": "tiny.en",
    "base.en": "base.en",
    "small.en": "small.en",
    "medium.en": "medium.en",
    "large-v3": "large-v3",
    "large-v3-turbo": "large-v3-turbo",
}

DEFAULT_MODEL = "tiny.en"

MODEL_FILE = "model.bin"


class FasterWhisperSTTBackend(BackendBase):
    """STT via faster-whisper (CTranslate2) — word timestamps + confidence."""

    _model_attr = "model"

    def __init__(self, model_size: str = DEFAULT_MODEL, device: str = "cpu", compute_type: str = "int8"):
        self.model = None
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type

    def _model_path(self, model_size: str) -> Path:
        model_dir = config.get_models_dir() / f"faster-whisper-{model_size}"
        return model_dir / MODEL_FILE

    def _model_dir(self, model_size: str) -> Path:
        return config.get_models_dir() / f"faster-whisper-{model_size}"

    def _is_model_cached(self, model_size: str) -> bool:
        return self._model_path(model_size).exists()

    def is_loaded(self) -> bool:
        return self.model is not None

    async def load_model(self, model_size: str | None = None) -> None:
        if model_size is None:
            model_size = self.model_size
        if self.model is not None and self.model_size == model_size:
            return
        await asyncio.to_thread(self._load_model_sync, model_size)

    load_model_async = load_model

    def _load_model_sync(self, model_size: str) -> None:
        is_cached = self._is_model_cached(model_size)
        with model_load_progress(f"faster-whisper-{model_size}", is_cached):
            if not is_cached:
                from ..services.model_registry import MODEL_NOT_DOWNLOADED_MSG

                raise FileNotFoundError(MODEL_NOT_DOWNLOADED_MSG)

            from faster_whisper import WhisperModel

            self.model = WhisperModel(
                str(self._model_dir(model_size)),
                device=self.device,
                compute_type=self.compute_type,
            )
        self.model_size = model_size
        logger.info("faster-whisper %s loaded (device=%s, compute_type=%s)", model_size, self.device, self.compute_type)

    def _download_model(self, model_size: str) -> str:
        from huggingface_hub import hf_hub_download

        repo_id = f"{HF_REPO_PREFIX}{model_size}"
        logger.info("Downloading faster-whisper %s from %s ...", model_size, repo_id)
        cached = hf_hub_download(repo_id=repo_id, filename=MODEL_FILE)

        dest = self._model_path(model_size)
        dest.parent.mkdir(parents=True, exist_ok=True)
        import shutil

        shutil.copy2(cached, dest)
        logger.info("faster-whisper model cached at %s", dest)
        return str(dest)

    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
        model_size: str | None = None,
    ) -> str:
        await self.load_model(model_size)

        def _transcribe_sync() -> str:
            segments, _ = self.model.transcribe(str(audio_path), language=language, word_timestamps=False)
            return " ".join(s.text for s in segments).strip()

        return await asyncio.to_thread(_transcribe_sync)

    async def transcribe_with_segments(
        self,
        audio_path: str,
        language: str | None = None,
        model_size: str | None = None,
    ) -> dict:
        await self.load_model(model_size)

        def _transcribe_sync() -> dict:
            segments, _ = self.model.transcribe(str(audio_path), language=language, word_timestamps=False)
            result_segments = []
            full_text_parts = []
            for seg in segments:
                result_segments.append(
                    {
                        "start": seg.start * 1000.0,
                        "end": seg.end * 1000.0,
                        "text": seg.text.strip(),
                    }
                )
                full_text_parts.append(seg.text.strip())
            return {
                "text": " ".join(full_text_parts).strip(),
                "segments": result_segments,
            }

        return await asyncio.to_thread(_transcribe_sync)

    async def transcribe_with_words(
        self,
        audio_path: str,
        language: str | None = None,
        model_size: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return per-word timestamps + confidence: [{word, start_ms, end_ms, confidence}]."""
        await self.load_model(model_size)

        def _transcribe_sync() -> list[dict[str, Any]]:
            segments, _ = self.model.transcribe(str(audio_path), language=language, word_timestamps=True)
            words = []
            for seg in segments:
                if seg.words:
                    for w in seg.words:
                        words.append(
                            {
                                "word": w.word.strip(),
                                "start_ms": w.start * 1000.0,
                                "end_ms": w.end * 1000.0,
                                "confidence": float(w.probability) if w.probability is not None else 1.0,
                            }
                        )
            return words

        return await asyncio.to_thread(_transcribe_sync)

    def unload_model(self) -> None:
        if self.model is not None:
            del self.model
            self.model = None
        from .base import cleanup_gpu_memory

        cleanup_gpu_memory()
