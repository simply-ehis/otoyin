"""Fish Audio S2 Pro (GGUF) backend via the audio.cpp one-shot CLI.

Migrated from s2.cpp to ``audiocpp_cli --task tts|clon --family fish_audio``
(2026-11-14). Single self-contained GGUF — no tokenizer sidecar, no s2.cpp
binary (Apache-2.0 — sellable; catalog id ``fish-audio-s2-pro``):

- ``audio-cpp/audio.cpp-gguf`` →
  ``Fish-Audio-S2-Pro-GGUF/fish-audio-s2-pro-q8_0.gguf`` (~6.0 GB, Q8_0)

Languages auto-handled (English and Chinese-style prompts are the tested
paths). Output is mono WAV; native rate is resampled to SAMPLE_RATE on load.
Reference-audio voice cloning via ``--voice-ref`` + ``--reference-text``.
"""

import asyncio
import logging
from pathlib import Path

import numpy as np

from .audio_cpp import find_audiocpp, run_one_shot
from .base import combine_voice_prompts as _combine_voice_prompts

logger = logging.getLogger(__name__)

HF_REPO = "audio-cpp/audio.cpp-gguf"
MODEL_FILE = "Fish-Audio-S2-Pro-GGUF/fish-audio-s2-pro-q8_0.gguf"
SAMPLE_RATE = 24000

DEFAULT_TIMEOUT_S = 600.0


def build_args(
    *,
    model: str,
    text: str,
    speaker_file: str | None = None,
    reference_text: str | None = None,
    seed: int | None = None,
    temperature: float | None = None,
) -> list[str]:
    """Build the ``audiocpp_cli --task fish_audio`` argument list (pure, unit-testable)."""
    args = [
        "--task",
        "clon" if speaker_file else "tts",
        "--family",
        "fish_audio",
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


class FishSpeechS2Backend:
    """TTS backend driving the audio.cpp one-shot CLI (no resident model)."""

    hf_repo = HF_REPO
    sample_rate = SAMPLE_RATE

    def __init__(self) -> None:
        self.load_error: str | None = None

    def _is_model_cached(self) -> bool:
        from ..services.model_files import is_model_installed

        return is_model_installed(HF_REPO, MODEL_FILE)

    def _local_file(self, filename: str) -> str:
        from ..services.model_files import resolve_model_file

        return str(resolve_model_file(HF_REPO, filename))

    def _get_model_path(self, model_size: str) -> str:
        return self._local_file(MODEL_FILE)

    async def load_model(self, model_size: str) -> None:
        binary = find_audiocpp()
        if binary is None:
            self.load_error = (
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
            raise RuntimeError(self.load_error)
        if not self._is_model_cached():
            raise RuntimeError(
                "Fish Audio S2 Pro is not downloaded. Use the Model Downloads page to download it first."
            )
        self.load_error = None

    def unload_model(self) -> None:
        pass

    def is_loaded(self) -> bool:
        return False

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

    async def generate(
        self,
        text: str,
        voice_prompt: dict,
        language: str = "en",
        seed: int | None = None,
        instruct: str | None = None,
        temperature: float | None = None,
    ) -> tuple[np.ndarray, int]:
        # Validate voice cloning input first so empty/missing paths aren't masked by binary errors
        ref_audio = voice_prompt.get("audio_path") if voice_prompt.get("voice_type") == "clone" else None
        if ref_audio is not None and not str(ref_audio).strip():
            raise ValueError("Voice cloning requested but reference audio path is empty")
        if ref_audio and not Path(str(ref_audio)).exists():
            raise ValueError(f"Reference audio not found: {ref_audio}")
        ref_text = voice_prompt.get("reference_text") if ref_audio else None

        gen_text = text
        if instruct:
            # Normalize to bracket form [angry] to match Fish-style tag tokens
            clean = instruct.strip().strip("[]() ").strip()
            if clean:
                gen_text = f"[{clean}] {text}"

        if find_audiocpp() is None:
            raise RuntimeError(
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
        if not self._is_model_cached():
            raise RuntimeError(
                "Fish Audio S2 Pro is not downloaded. Use the Model Downloads page to download it first."
            )

        model_file = self._local_file(MODEL_FILE)
        args = build_args(
            model=model_file,
            text=gen_text,
            speaker_file=ref_audio,
            reference_text=ref_text,
            seed=seed,
            temperature=temperature,
        )
        return await asyncio.to_thread(
            run_one_shot,
            args,
            sample_rate=SAMPLE_RATE,
            prefix="fish-audio",
            timeout_s=DEFAULT_TIMEOUT_S,
            mem_saver_family="fish_audio",
        )


fish_speech_s2_backend = FishSpeechS2Backend()
