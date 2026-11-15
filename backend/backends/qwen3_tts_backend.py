"""Qwen3-TTS 1.7B Base (GGUF) backend via the audio.cpp one-shot CLI.

Migrated from ``llama-tts`` to ``audiocpp_cli --task tts --family qwen3_tts``
(2026-11-14). audio.cpp replaces the separate backbone+mmproj pair llama.cpp
needed with one self-contained GGUF — no mmproj, no llama.cpp dependency:

- ``audio-cpp/audio.cpp-gguf`` →
  ``Qwen3-TTS-12Hz-1.7B-Base-GGUF/qwen3-tts-12hz-1.7b-base-q8_0_v2.gguf``
  (~2.57 GB, Q8_0_v2)

Weights are Apache-2.0 (sellable; catalog id ``qwen3-tts-1.7b``). Output is
24 kHz 16-bit mono WAV. Voice cloning via ``--voice-ref`` (reference clip,
4-10 s). No resident model — the process exits after each generation.
"""

import asyncio
import logging

import numpy as np

from .audio_cpp import find_audiocpp, run_one_shot
from .base import combine_voice_prompts as _combine_voice_prompts

logger = logging.getLogger(__name__)

HF_REPO = "audio-cpp/audio.cpp-gguf"
MODEL_FILE = "Qwen3-TTS-12Hz-1.7B-Base-GGUF/qwen3-tts-12hz-1.7b-base-q8_0_v2.gguf"
SAMPLE_RATE = 24000

# Local defaults; override globally with TWENTYLABS_AUDIOCPP_TIMEOUT.
DEFAULT_TIMEOUT_S = 300.0


def build_tts_args(
    *,
    model: str,
    text: str,
    language: str | None = "en",
    seed: int | None = None,
    speaker_file: str | None = None,
    reference_text: str | None = None,
) -> list[str]:
    """Build the ``audiocpp_cli --task tts --family qwen3_tts`` argument list (pure, unit-testable)."""
    args = [
        "--task",
        "tts",
        "--family",
        "qwen3_tts",
        "--model",
        model,
        "--text",
        text,
    ]
    if language:
        args += ["--language", language]
    if seed is not None:
        args += ["--seed", str(seed)]
    if speaker_file:
        args += ["--voice-ref", speaker_file]
        if reference_text:
            args += ["--reference-text", reference_text]
    return args


class Qwen3TTSBackend:
    """TTS backend driving the audio.cpp one-shot CLI (no resident model)."""

    hf_repo = HF_REPO
    sample_rate = SAMPLE_RATE

    def __init__(self) -> None:
        self.load_error: str | None = None

    # -- cache / path resolution -------------------------------------------

    def _is_model_cached(self) -> bool:
        from ..services.model_files import is_model_installed

        return is_model_installed(HF_REPO, MODEL_FILE)

    def _local_file(self, filename: str) -> str:
        from ..services.model_files import resolve_model_file

        return str(resolve_model_file(HF_REPO, filename))

    def _get_model_path(self, model_size: str) -> str:
        return self._local_file(MODEL_FILE)

    # -- lifecycle ----------------------------------------------------------

    async def load_model(self, model_size: str) -> None:
        """No resident model — verify the GGUF + binary are available."""
        binary = find_audiocpp()
        if binary is None:
            self.load_error = (
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
            raise RuntimeError(self.load_error)
        if not self._is_model_cached():
            raise RuntimeError("Qwen3 TTS is not downloaded. Use the Model Downloads page to download it first.")
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
        # audiocpp_cli takes the reference clip path directly (--voice-ref).
        return {"voice_type": "clone", "audio_path": audio_path, "reference_text": reference_text}, False

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
        # instruct/temperature are not exposed by the qwen3_tts family; callers
        # pass them for protocol compatibility and they are intentionally ignored.
        if find_audiocpp() is None:
            raise RuntimeError(
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
        if not self._is_model_cached():
            raise RuntimeError("Qwen3 TTS is not downloaded. Use the Model Downloads page to download it first.")

        model_file = self._local_file(MODEL_FILE)
        speaker_file = voice_prompt.get("audio_path") if voice_prompt.get("voice_type") == "clone" else None
        reference_text = voice_prompt.get("reference_text") if speaker_file else None

        args = build_tts_args(
            model=model_file,
            text=text,
            language=language,
            seed=seed,
            speaker_file=speaker_file,
            reference_text=reference_text,
        )
        return await asyncio.to_thread(
            run_one_shot,
            args,
            sample_rate=SAMPLE_RATE,
            prefix="qwen3-tts",
            timeout_s=DEFAULT_TIMEOUT_S,
            mem_saver_family="qwen3_tts",
        )


qwen3_tts_backend = Qwen3TTSBackend()
