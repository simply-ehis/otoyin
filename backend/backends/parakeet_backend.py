"""
Parakeet TDT 0.6B v3 STT backend via parakeet.cpp.

Native C++ inference — no Python/PyTorch/ONNX dependency.
Supports 25 European languages with automatic language detection.
GGUF weights from mudler/parakeet-cpp-gguf.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import subprocess
from pathlib import Path

from .. import config
from .base import BackendBase, model_load_progress

logger = logging.getLogger(__name__)

# HF repo hosting the pre-converted GGUF weights.
HF_REPO = "mudler/parakeet-cpp-gguf"

# Model files: key = model_size for the app, value = remote filename.
PARAKEET_FILES = {
    "v3-f16": "tdt_ctc-110m-f16.gguf",
    "v3-q8": "tdt_ctc-110m-q8_0.gguf",
}

# Default model (quantized for speed).
DEFAULT_MODEL = "v3-q8"

# Supported languages (25 European).
SUPPORTED_LANGUAGES = [
    "en",
    "es",
    "fr",
    "de",
    "it",
    "nl",
    "pl",
    "pt",
    "ru",
    "uk",
    "ro",
    "cs",
    "el",
    "hu",
    "sv",
    "bg",
    "hr",
    "sk",
    "sl",
    "da",
    "fi",
    "lt",
    "lv",
    "et",
    "mt",
]


class ParakeetSTTBackend(BackendBase):
    """CPU-only STT via parakeet.cpp — native C++ inference, no Python deps."""

    _model_attr = "model"

    def __init__(self, model_size: str = DEFAULT_MODEL):
        self.model = None
        self.model_size = model_size
        self._binary_path: Path | None = None

    def _model_path(self, model_size: str) -> Path:
        filename = PARAKEET_FILES.get(model_size, f"parakeet-{model_size}.gguf")
        return config.get_models_dir() / filename

    def _is_model_cached(self, model_size: str) -> bool:
        return self._model_path(model_size).exists()

    def is_loaded(self) -> bool:
        return self.model is not None

    async def load_model(self, model_size: str | None = None) -> None:
        if self.is_loaded():
            return

        model_size = model_size or self.model_size
        self.model_size = model_size

        if not self._is_model_cached(model_size):
            await self._download_model(model_size)

        model_path = self._model_path(model_size)

        # Try to find parakeet.cpp binary in PATH or data dir
        self._binary_path = self._find_binary()
        if self._binary_path is None:
            raise RuntimeError(
                "parakeet.cpp binary not found. Install from "
                "https://github.com/mudler/parakeet.cpp or place the binary "
                "in the data/bin directory."
            )

        # Mark as loaded (binary found + model cached)
        self.model = True
        logger.info(
            "parakeet.cpp %s loaded (binary=%s, model=%s)",
            model_size,
            self._binary_path,
            model_path,
        )

    async def _download_model(self, model_size: str) -> None:
        """Download GGUF weights from HuggingFace."""
        from huggingface_hub import hf_hub_download

        filename = PARAKEET_FILES.get(model_size, f"parakeet-{model_size}.gguf")
        models_dir = config.get_models_dir()
        models_dir.mkdir(parents=True, exist_ok=True)

        dest = models_dir / filename
        if dest.exists():
            return

        logger.info("Downloading parakeet %s from %s ...", model_size, HF_REPO)
        with model_load_progress(f"parakeet-{model_size}", is_cached=False):
            await asyncio.to_thread(
                hf_hub_download,
                repo_id=HF_REPO,
                filename=filename,
                local_dir=str(models_dir),
            )
        from ..services.model_files import clear_hf_repo_cache

        clear_hf_repo_cache(HF_REPO)
        logger.info("parakeet model cached at %s", dest)

    def _find_binary(self) -> Path | None:
        """Locate the parakeet.cpp binary."""
        # Check data/bin first
        data_bin = config.get_data_dir() / "bin" / "parakeet"
        if data_bin.exists():
            return data_bin

        # Check PATH
        which = shutil.which("parakeet")
        if which:
            return Path(which)

        # Check common locations
        for name in ("parakeet.exe", "parakeet.cpp.exe", "parakeet-cpp"):
            candidate = config.get_data_dir() / "bin" / name
            if candidate.exists():
                return candidate

        return None

    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
        model_size: str | None = None,
    ) -> str:
        """Transcribe audio using parakeet.cpp binary."""
        if not self.is_loaded():
            raise RuntimeError("Parakeet model not loaded")

        model_size = model_size or self.model_size
        model_path = self._model_path(model_size)

        # Build command
        cmd = [
            str(self._binary_path),
            "--model",
            str(model_path),
            "--audio",
            audio_path,
            "--output",
            "text",
        ]

        if language and language in SUPPORTED_LANGUAGES:
            cmd.extend(["--language", language])

        # Run in thread pool to avoid blocking
        result = await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            raise RuntimeError(f"parakeet.cpp failed: {result.stderr[:500]}")

        return result.stdout.strip()

    async def transcribe_with_segments(
        self,
        audio_path: str,
        language: str | None = None,
        model_size: str | None = None,
    ) -> dict:
        """Transcribe with word-level timestamps."""
        if not self.is_loaded():
            raise RuntimeError("Parakeet model not loaded")

        model_size = model_size or self.model_size
        model_path = self._model_path(model_size)

        # Build command with JSON output for segments
        cmd = [
            str(self._binary_path),
            "--model",
            str(model_path),
            "--audio",
            audio_path,
            "--output",
            "json",
        ]

        if language and language in SUPPORTED_LANGUAGES:
            cmd.extend(["--language", language])

        result = await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            raise RuntimeError(f"parakeet.cpp failed: {result.stderr[:500]}")

        import json

        try:
            data = json.loads(result.stdout)
            return {
                "text": data.get("text", ""),
                "segments": data.get("segments", []),
            }
        except json.JSONDecodeError:
            # Fallback: return raw text as single segment
            return {
                "text": result.stdout.strip(),
                "segments": [{"text": result.stdout.strip(), "start": 0, "end": 0}],
            }

    def unload_model(self) -> None:
        self.model = None
        self._binary_path = None
        logger.info("parakeet.cpp model unloaded")
