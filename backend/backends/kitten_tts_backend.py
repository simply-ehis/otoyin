"""KittenTTS Mini 0.8 backend via the audio.cpp one-shot CLI.

Migrated from ONNX to ``audiocpp_cli --task tts --family kitten_tts``
(2026-11-14) — no Python inference path, no phoneme dictionaries to ship:

- ``audio-cpp/audio.cpp-gguf`` →
  ``KittenTTS-GGUF/kitten-tts-mini-0.8-orig.gguf`` (~288 MB; no quantized
  package published upstream, so this is the original precision)

Apache-2.0 (catalog id ``kitten-tts-mini``). Output is 24 kHz mono WAV.
8 packaged voices, ``--voice-id <Name>``, English only, no cloning, no
voice-mixing. Long text is chunked inside the runtime.
"""

import asyncio
import logging

import numpy as np

from .audio_cpp import find_audiocpp, run_one_shot
from .base import combine_voice_prompts as _combine_voice_prompts

logger = logging.getLogger(__name__)

HF_REPO = "audio-cpp/audio.cpp-gguf"
MODEL_FILE = "KittenTTS-GGUF/kitten-tts-mini-0.8-orig.gguf"
SAMPLE_RATE = 24000
DEFAULT_VOICE = "Bella"

KITTEN_VOICE_IDS = ["Bella", "Jasper", "Luna", "Bruno", "Rosie", "Hugo", "Kiki", "Leo"]

DEFAULT_TIMEOUT_S = 300.0


def build_args(
    *,
    model: str,
    text: str,
    voice_id: str | None = None,
    seed: int | None = None,
) -> list[str]:
    """Build the ``audiocpp_cli --task tts --family kitten_tts`` argument list (pure, unit-testable)."""
    args = [
        "--task",
        "tts",
        "--family",
        "kitten_tts",
        "--model",
        model,
        "--text",
        text,
        "--voice-id",
        voice_id or DEFAULT_VOICE,
    ]
    if seed is not None:
        args += ["--seed", str(seed)]
    return args


class KittenTTSBackend:
    """Kitten TTS backend driving the audio.cpp one-shot CLI (no resident model)."""

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
            raise RuntimeError("Kitten TTS is not downloaded. Use the Model Downloads page to download it first.")
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
        # Kitten has 8 packaged voices only; clone requests get the default.
        return {
            "voice_type": "preset",
            "preset_engine": "kitten_tts",
            "preset_voice_id": DEFAULT_VOICE,
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
            raise RuntimeError("Kitten TTS is not downloaded. Use the Model Downloads page to download it first.")

        voice_name = voice_prompt.get("preset_voice_id") or DEFAULT_VOICE
        model_file = self._local_file(MODEL_FILE)

        args = build_args(model=model_file, text=text, voice_id=str(voice_name), seed=seed)
        return await asyncio.to_thread(
            run_one_shot,
            args,
            sample_rate=SAMPLE_RATE,
            prefix="kitten-tts",
            timeout_s=DEFAULT_TIMEOUT_S,
        )


kitten_tts_backend = KittenTTSBackend()
