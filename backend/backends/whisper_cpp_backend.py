"""
Whisper.cpp STT backend.

English-only tiny model (~75MB, ~100MB RAM) via pywhispercpp.
Zero PyTorch / CTranslate2 dependency — pure GGML inference on CPU.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from .. import config
from .base import BackendBase, model_load_progress

logger = logging.getLogger(__name__)

# The HF repo that hosts the GGML model files.
HF_REPO = "ggerganov/whisper.cpp"

# Model definitions: key = model_size for the app, value = remote filename.
WHISPER_CPP_FILES = {
    "tiny.en": "ggml-tiny.en.bin",
    "base.en": "ggml-base.en.bin",
}

# Default model (lightest English-only).
DEFAULT_MODEL = "tiny.en"


class WhisperCppSTTBackend(BackendBase):
    _model_attr = "model"
    """CPU-only STT via whisper.cpp GGML inference — no PyTorch needed."""

    def __init__(self, model_size: str = DEFAULT_MODEL):
        self.model = None
        self.model_size = model_size

    def _model_path(self, model_size: str) -> Path:
        filename = WHISPER_CPP_FILES.get(model_size, f"ggml-{model_size}.bin")
        return config.get_models_dir() / filename

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
        with model_load_progress(f"whisper-{model_size}", is_cached):
            if not is_cached:
                # Hard gate: no auto-download. Routes check the manifest first,
                # but guard the backend directly so no caller can fetch weights.
                from ..services.model_registry import MODEL_NOT_DOWNLOADED_MSG

                raise FileNotFoundError(MODEL_NOT_DOWNLOADED_MSG)

            from pywhispercpp import Whisper

            self.model = Whisper(
                model_size,
                models_dir=str(config.get_models_dir()),
            )
        self.model_size = model_size
        logger.info("whisper.cpp %s loaded", model_size)

    def _download_model(self, model_size: str) -> str:
        from huggingface_hub import hf_hub_download

        filename = WHISPER_CPP_FILES.get(model_size, f"ggml-{model_size}.bin")
        logger.info("Downloading %s from %s ...", filename, HF_REPO)
        cached = hf_hub_download(repo_id=HF_REPO, filename=filename)
        import shutil

        dest = self._model_path(model_size)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(cached, dest)
        from ..services.model_files import clear_hf_repo_cache

        clear_hf_repo_cache(HF_REPO)
        logger.info("whisper.cpp model cached at %s", dest)
        return str(dest)

    # unload_model() inherited from BackendBase (del + cleanup_gpu_memory)

    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
        model_size: str | None = None,
    ) -> str:
        await self.load_model(model_size)

        def _transcribe_sync() -> str:
            segments = self.model.transcribe(str(audio_path))
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
            segments = self.model.transcribe(str(audio_path))
            result_segments = []
            full_text_parts = []
            for seg in segments:
                result_segments.append(
                    {
                        "start": seg.t0 / 100.0,
                        "end": seg.t1 / 100.0,
                        "text": seg.text.strip(),
                    }
                )
                full_text_parts.append(seg.text.strip())
            return {
                "text": " ".join(full_text_parts).strip(),
                "segments": result_segments,
            }

        return await asyncio.to_thread(_transcribe_sync)
