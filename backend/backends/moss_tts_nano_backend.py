"""MOSS-TTS-Nano backend via the audio.cpp one-shot CLI.

Migrated from ONNX to ``audiocpp_cli --task tts|clon --family moss_tts_nano``
(2026-11-14). Single self-contained GGUF (Apache-2.0; catalog id
``moss-tts-nano``):

- ``audio-cpp/audio.cpp-gguf`` →
  ``MOSS-TTS-Nano-100M-GGUF/moss-tts-nano-100m-q8_0.gguf`` (~184 MB, Q8_0)

Zero-shot voice cloning via ``--voice-ref`` (+ optional ``--reference-text``).
Output is resampled to SAMPLE_RATE on load. NOTE: upstream warns that on
CUDA/HIP, incremental decoding with quantized weights can drift and degrade
cloned/long-form audio; on affected GPUs pass session options
``moss_tts_nano.weight_type=f16`` (~100 MB extra VRAM) or use the bf16 GGUF.
CPU backends are numerically exact.
"""

import asyncio
import logging

import numpy as np

from .audio_cpp import find_audiocpp, run_one_shot
from .base import combine_voice_prompts as _combine_voice_prompts

logger = logging.getLogger(__name__)

HF_REPO = "audio-cpp/audio.cpp-gguf"
MODEL_FILE = "MOSS-TTS-Nano-100M-GGUF/moss-tts-nano-100m-q8_0.gguf"
SAMPLE_RATE = 24000

DEFAULT_TIMEOUT_S = 300.0


def build_args(
    *,
    model: str,
    text: str,
    speaker_file: str | None = None,
    reference_text: str | None = None,
    seed: int | None = None,
    temperature: float | None = None,
) -> list[str]:
    """Build the ``audiocpp_cli --task tts|clon --family moss_tts_nano`` argument list (pure, unit-testable)."""
    args = [
        "--task",
        "clon" if speaker_file else "tts",
        "--family",
        "moss_tts_nano",
        "--model",
        model,
        "--text",
        text,
    ]
    if speaker_file:
        args += ["--voice-ref", speaker_file]
        if reference_text:
            args += ["--reference-text", reference_text]
    if seed is not None:
        args += ["--seed", str(seed)]
    if temperature is not None:
        args += ["--temperature", f"{temperature:g}"]
    return args


class MossTTSNanoBackend:
    """MOSS-TTS-Nano backend driving the audio.cpp one-shot CLI (no resident model)."""

    hf_repo = HF_REPO
    sample_rate = SAMPLE_RATE

    def __init__(self):
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

    async def load_model(self, model_size: str = "default") -> None:
        binary = find_audiocpp()
        if binary is None:
            self.load_error = (
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
            raise RuntimeError(self.load_error)
        if not self._is_model_cached():
            raise RuntimeError("MOSS-TTS-Nano is not downloaded. Use the Model Downloads page to download it first.")
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
            "ref_audio": audio_path,
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
            raise RuntimeError("MOSS-TTS-Nano is not downloaded. Use the Model Downloads page to download it first.")

        ref_audio = None
        if voice_prompt:
            ref_audio = voice_prompt.get("ref_audio") or voice_prompt.get("audio_path")
        reference_text = voice_prompt.get("reference_text") if ref_audio else None

        model_file = self._local_file(MODEL_FILE)
        args = build_args(
            model=model_file,
            text=text,
            speaker_file=ref_audio,
            reference_text=reference_text,
            seed=seed,
            temperature=temperature,
        )
        return await asyncio.to_thread(
            run_one_shot,
            args,
            sample_rate=SAMPLE_RATE,
            prefix="moss-tts-nano",
            timeout_s=DEFAULT_TIMEOUT_S,
        )


moss_tts_nano_backend = MossTTSNanoBackend()
