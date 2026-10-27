"""SteerTTS backend — subprocess-based (uses steertts CLI).

SteerTTS is a controllable TTS with 2,825 voices, 12 acoustic controls,
style tags, and zero-shot voice cloning. Runs via ``python -m steertts``.
No torch in the main process (steertts manages its own torch internally).
"""

from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

STEER_MODEL_DIR = os.environ.get("STEER_TTS_MODEL_DIR", "").strip() or None


def _resolve_model_dir() -> str | None:
    if STEER_MODEL_DIR:
        return STEER_MODEL_DIR
    # Try steertts's own resolver (downloads/caches the model)
    try:
        from steertts import resolve_model_dir

        return str(resolve_model_dir())
    except Exception:
        logger.debug("steertts resolve_model_dir failed", exc_info=True)
    # Fallback to the local download dir used during dev
    dev_dir = "C:/tmp/steer-full"
    if os.path.isdir(dev_dir):
        return dev_dir
    return None


class SteerTTSBackend:
    MODEL_CONFIGS = []

    def __init__(self) -> None:
        self._loaded = False
        self._voice = "voice_1688"

    async def load_model(self, model_size: str = "default") -> None:
        # SteerTTS loads lazily on first generate; just mark loaded.
        self._loaded = True

    async def create_voice_prompt(self, audio_path, reference_text, use_cache=True):
        return ({}, False)

    async def combine_voice_prompts(self, audio_paths, reference_texts):
        return (np.zeros(0, dtype="float32"), "")

    async def generate(
        self,
        text: str,
        voice_prompt: dict,
        language: str = "en",
        seed: int | None = None,
        instruct: str | None = None,
        temperature: float | None = None,
    ) -> tuple:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._generate_sync, text, seed)

    def _generate_sync(self, text: str, seed: int | None = None) -> tuple:
        out_path = Path(tempfile.gettempdir()) / f"steer_{os.getpid()}.wav"
        cmd = [sys.executable, "-m", "steertts"]
        model_dir = _resolve_model_dir()
        if model_dir:
            cmd += ["--model", model_dir]
        cmd += ["say", text, "-o", str(out_path)]
        if self._voice:
            cmd += ["--voice", self._voice]
        if seed is not None:
            cmd += ["--seed", str(seed)]
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=300)
        except subprocess.CalledProcessError as e:
            logger.error("steertts failed: %s", e.stderr)
            raise RuntimeError(f"steertts failed: {e.stderr}")
        if not out_path.exists():
            raise RuntimeError("steertts produced no output")
        audio, sr = sf.read(str(out_path), dtype="float32", always_2d=True)
        audio = audio[:, 0] if audio.shape[1] == 1 else audio.mean(axis=1)
        try:
            out_path.unlink(missing_ok=True)
        except Exception:
            pass
        return audio.astype("float32"), sr

    def unload_model(self) -> None:
        self._loaded = False

    def is_loaded(self) -> bool:
        return self._loaded


steer_tts_backend = SteerTTSBackend()