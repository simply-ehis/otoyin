"""Pocket TTS (100M) backend via the audio.cpp one-shot CLI.

Migrated from torch/ONNX to ``audiocpp_cli --task tts --family pocket_tts``
(2026-11-14). English package — q8_0 GGUF (~122 MB) plus packaged voice-state
embeddings installed as a subtree:

- ``audio-cpp/audio.cpp-gguf`` → ``PocketTTS-GGUF/english/``
  ``pocket-tts-english-q8_0.gguf`` + ``embeddings/*.safetensors`` (~270 MB)

CC-BY-4.0 (catalog id ``pocket-tts``). Output is 24 kHz mono WAV. Voice
selection via ``--voice-id`` from packaged states (alba, anna, cosette, ...);
voice cloning via ``--voice-ref`` (no transcript needed — Pocket TTS does not
use one). Long-form handled inside the runtime.

Non-English packages (``PocketTTS-GGUF/{french,german,italian,portuguese,
spanish}``) can ship later as separate catalog entries.
"""

import asyncio
import logging
from pathlib import Path

import numpy as np

from .audio_cpp import find_audiocpp, run_one_shot
from .base import combine_voice_prompts as _combine_voice_prompts

logger = logging.getLogger(__name__)

HF_REPO = "audio-cpp/audio.cpp-gguf"
MODEL_FILE = "PocketTTS-GGUF/english/pocket-tts-english-q8_0.gguf"
MODEL_DIR_REL = "PocketTTS-GGUF/english"
SAMPLE_RATE = 24000
DEFAULT_VOICE = "alba"

DEFAULT_TIMEOUT_S = 300.0


def build_args(
    *,
    model_dir: str,
    text: str,
    voice_id: str | None = None,
    speaker_file: str | None = None,
    seed: int | None = None,
) -> list[str]:
    """Build the ``audiocpp_cli --task tts --family pocket_tts`` argument list (pure, unit-testable)."""
    args = [
        "--task",
        "tts",
        "--family",
        "pocket_tts",
        "--model",
        model_dir,
        "--text",
        text,
    ]
    if speaker_file:
        args += ["--voice-ref", speaker_file]
    elif voice_id:
        args += ["--voice-id", voice_id]
    else:
        args += ["--voice-id", DEFAULT_VOICE]
    if seed is not None:
        args += ["--seed", str(seed)]
    return args


class PocketTTSBackend:
    """Pocket TTS backend driving the audio.cpp one-shot CLI (no resident model)."""

    hf_repo = HF_REPO
    sample_rate = SAMPLE_RATE

    def __init__(self):
        self.load_error: str | None = None

    # -- cache / path resolution -------------------------------------------

    def _app_dir(self) -> Path:
        from ..services.model_files import app_snapshot_dir

        return app_snapshot_dir(HF_REPO) / MODEL_DIR_REL

    def _is_model_cached(self) -> bool:
        # The package is installed as a subtree snapshot; the q8_0 GGUF must exist.
        from ..services.model_files import is_model_installed

        return is_model_installed(HF_REPO, MODEL_FILE)

    def _get_model_path(self, model_size: str) -> str:
        # audiocpp_cli loads the Pocket TTS package directory.
        return str(self._app_dir())

    # -- lifecycle ----------------------------------------------------------

    async def load_model(self, model_size: str = "default") -> None:
        binary = find_audiocpp()
        if binary is None:
            self.load_error = (
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
            raise RuntimeError(self.load_error)
        if not self._is_model_cached():
            raise RuntimeError("Pocket TTS is not downloaded. Use the Model Downloads page to download it first.")
        self.load_error = None

    def unload_model(self) -> None:
        """Nothing resident to unload — subprocesses exit after each call."""

    def is_loaded(self) -> bool:
        return False

    # -- voice prompts ------------------------------------------------------

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> tuple[dict, bool]:
        return {
            "voice_type": "clone",
            "audio_path": audio_path,
            "reference_text": reference_text,
        }, False

    async def combine_voice_prompts(
        self,
        audio_paths: list[str],
        reference_texts: list[str],
    ) -> tuple[np.ndarray, str]:
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=SAMPLE_RATE)

    # -- generation ---------------------------------------------------------

    async def generate(
        self,
        text: str,
        voice_prompt: dict,
        language: str = "en",
        seed: int | None = None,
        instruct: str | None = None,
        temperature: float | None = None,
    ) -> tuple[np.ndarray, int]:
        if find_audiocpp() is None:
            raise RuntimeError(
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
        if not self._is_model_cached():
            raise RuntimeError("Pocket TTS is not downloaded. Use the Model Downloads page to download it first.")

        ref_audio = voice_prompt.get("audio_path") if voice_prompt.get("voice_type") == "clone" else None
        # Pocket TTS cloning does not use a reference transcript.
        voice_id = voice_prompt.get("preset_voice_id") or voice_prompt.get("pocket_voice")
        model_dir = self._get_model_path("default")

        args = build_args(
            model_dir=model_dir,
            text=text,
            voice_id=str(voice_id) if voice_id else None,
            speaker_file=ref_audio,
            seed=seed,
        )
        return await asyncio.to_thread(
            run_one_shot,
            args,
            sample_rate=SAMPLE_RATE,
            prefix="pocket-tts",
            timeout_s=DEFAULT_TIMEOUT_S,
        )


pocket_tts_backend = PocketTTSBackend()
