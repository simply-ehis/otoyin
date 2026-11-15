"""VoxCPM2 backend via the audio.cpp one-shot CLI.

Migrated from CrispASR ``voxcpm2-tts`` to ``audiocpp_cli --task tts
--family voxcpm2`` (2026-11-14). Single self-contained GGUF (Apache-2.0;
catalog id ``voxcpm2``):

- ``audio-cpp/audio.cpp-gguf`` → ``VoxCPM2-GGUF/voxcpm2-q8_0.gguf``
  (~2.8 GB, Q8_0)

VoxCPM2 is a 2B tokenizer-free diffusion-autoregressive TTS model (OpenBMB),
2M+ hours multilingual speech. Voice cloning via ``--voice-ref`` (ultimate
clone adds ``--reference-text``). Voice design via parenthesized style in the
text itself (e.g. ``(A young woman, gentle voice)Hello!``) — no separate
voice-design flag; streaming is offline-only in this path.
"""

import asyncio
import logging

import numpy as np

from .audio_cpp import find_audiocpp, run_one_shot
from .base import combine_voice_prompts as _combine_voice_prompts

logger = logging.getLogger(__name__)

HF_REPO = "audio-cpp/audio.cpp-gguf"
MODEL_FILE = "VoxCPM2-GGUF/voxcpm2-q8_0.gguf"
SAMPLE_RATE = 48000

DEFAULT_TIMEOUT_S = 600.0


def build_tts_args(
    *,
    model: str,
    text: str,
    voice_wav: str | None = None,
    reference_text: str | None = None,
    seed: int | None = None,
) -> list[str]:
    """Build the ``audiocpp_cli --task tts --family voxcpm2`` argument list (pure, unit-testable)."""
    args = [
        "--task",
        "tts",
        "--family",
        "voxcpm2",
        "--model",
        model,
        "--text",
        text,
    ]
    if voice_wav:
        args += ["--voice-ref", voice_wav]
        if reference_text:
            args += ["--reference-text", reference_text]
    if seed is not None:
        args += ["--seed", str(seed)]
    return args


class VoxCPM2Backend:
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

    async def load_model(self, model_size: str = "default") -> None:
        binary = find_audiocpp()
        if binary is None:
            self.load_error = (
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
            raise RuntimeError(self.load_error)
        if not self._is_model_cached():
            raise RuntimeError("VoxCPM2 is not downloaded. Use the Model Downloads page to download it first.")
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
            "voice_wav": audio_path,
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
            raise RuntimeError("VoxCPM2 is not downloaded. Use the Model Downloads page to download it first.")

        voice_wav = voice_prompt.get("voice_wav") or voice_prompt.get("audio_path")
        reference_text = voice_prompt.get("reference_text") if voice_wav else None

        # Voice design: prepend parenthesized instruction to text
        synth_text = text
        if instruct and not voice_wav:
            synth_text = f"({instruct}){text}"

        model_file = self._local_file(MODEL_FILE)
        args = build_tts_args(
            model=model_file,
            text=synth_text,
            voice_wav=voice_wav,
            reference_text=reference_text,
            seed=seed,
        )
        return await asyncio.to_thread(
            run_one_shot,
            args,
            sample_rate=SAMPLE_RATE,
            prefix="voxcpm2",
            timeout_s=DEFAULT_TIMEOUT_S,
        )


voxcpm2_backend = VoxCPM2Backend()
