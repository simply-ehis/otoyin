"""Kokoro 82M backend via the audio.cpp one-shot CLI.

Migrated from torch/ONNX to ``audiocpp_cli --task tts --family kokoro_tts``
(2026-11-14) — no Python Kokoro dependency, no torch:

- ``audio-cpp/audio.cpp-gguf`` → ``Kokoro-82M-GGUF/kokoro-82m-q8_0.gguf``
  (~181 MB, Q8_0; weights, config, vocabulary, all 54 voice packs)

Apache-2.0 (sellable; catalog id ``kokoro-onnx`` for backwards compatibility).
Output is 24 kHz mono WAV. Voice selection via ``--voice-id`` — the packaged
voice id IS the app's Kokoro voice id (``af_heart``, ``zm_yunjian`` ...).
Voice mixing expressions like ``af_heart+af_bella`` pass through unchanged.
Long-text chunking is handled inside the audio.cpp runtime; no Python-side
chunking or per-chunk timeout scaffolding remains.
"""

import asyncio
import logging

import numpy as np

from .audio_cpp import find_audiocpp, run_one_shot
from .base import combine_voice_prompts as _combine_voice_prompts

logger = logging.getLogger(__name__)

# Shared voice table (id, name, gender, language) — the audiocpp packaged
# voices. Kept tuple-shaped for the profiles service.
KOKORO_VOICES = [
    ("af_alloy", "Alloy", "female", "en"),
    ("af_aoede", "Aoede", "female", "en"),
    ("af_bella", "Bella", "female", "en"),
    ("af_heart", "Heart", "female", "en"),
    ("af_jessica", "Jessica", "female", "en"),
    ("af_kore", "Kore", "female", "en"),
    ("af_nicole", "Nicole", "female", "en"),
    ("af_nova", "Nova", "female", "en"),
    ("af_river", "River", "female", "en"),
    ("af_sarah", "Sarah", "female", "en"),
    ("af_sky", "Sky", "female", "en"),
    ("am_adam", "Adam", "male", "en"),
    ("am_echo", "Echo", "male", "en"),
    ("am_eric", "Eric", "male", "en"),
    ("am_fenrir", "Fenrir", "male", "en"),
    ("am_liam", "Liam", "male", "en"),
    ("am_michael", "Michael", "male", "en"),
    ("am_onyx", "Onyx", "male", "en"),
    ("am_puck", "Puck", "male", "en"),
    ("am_santa", "Santa", "male", "en"),
    ("bf_alice", "Alice", "female", "en"),
    ("bf_emma", "Emma", "female", "en"),
    ("bf_isabella", "Isabella", "female", "en"),
    ("bf_lily", "Lily", "female", "en"),
    ("bm_daniel", "Daniel", "male", "en"),
    ("bm_fable", "Fable", "male", "en"),
    ("bm_george", "George", "male", "en"),
    ("bm_lewis", "Lewis", "male", "en"),
    ("ef_dora", "Dora", "female", "es"),
    ("em_alex", "Alex", "male", "es"),
    ("em_santa", "Santa", "male", "es"),
    ("ff_siwis", "Siwis", "female", "fr"),
    ("hf_alpha", "Alpha", "female", "hi"),
    ("hf_beta", "Beta", "female", "hi"),
    ("hm_omega", "Omega", "male", "hi"),
    ("hm_psi", "Psi", "male", "hi"),
    ("if_sara", "Sara", "female", "it"),
    ("im_nicola", "Nicola", "male", "it"),
    ("jf_alpha", "Alpha", "female", "ja"),
    ("jf_gongitsune", "Gongitsune", "female", "ja"),
    ("jf_nezumi", "Nezumi", "female", "ja"),
    ("jf_tebukuro", "Tebukuro", "female", "ja"),
    ("jm_kumo", "Kumo", "male", "ja"),
    ("pf_dora", "Dora", "female", "pt"),
    ("pm_alex", "Alex", "male", "pt"),
    ("pm_santa", "Santa", "male", "pt"),
    ("zf_xiaobei", "Xiaobei", "female", "zh"),
    ("zf_xiaoni", "Xiaoni", "female", "zh"),
    ("zf_xiaoxiao", "Xiaoxiao", "female", "zh"),
    ("zf_xiaoyi", "Xiaoyi", "female", "zh"),
    ("zm_yunjian", "Yunjian", "male", "zh"),
    ("zm_yunxi", "Yunxi", "male", "zh"),
    ("zm_yunxia", "Yunxia", "male", "zh"),
    ("zm_yunyang", "Yunyang", "male", "zh"),
]

HF_REPO = "audio-cpp/audio.cpp-gguf"
MODEL_FILE = "Kokoro-82M-GGUF/kokoro-82m-q8_0.gguf"
KOKORO_SAMPLE_RATE = 24000
KOKORO_DEFAULT_VOICE = "af_heart"

# Map our ISO codes to the language codes the GGUF runtime expects.
ONNX_LANG_MAP = {
    "en": "en-us",
    "es": "es",
    "fr": "fr",
    "hi": "hi",
    "it": "it",
    "pt": "pt",
    "ja": "ja",
    "zh": "zh",
}

DEFAULT_TIMEOUT_S = 120.0


def build_tts_args(
    *,
    model: str,
    text: str,
    voice_id: str | None = None,
    language: str | None = "en",
    seed: int | None = None,
) -> list[str]:
    """Build the ``audiocpp_cli --task tts --family kokoro_tts`` argument list (pure, unit-testable)."""
    args = [
        "--task",
        "tts",
        "--family",
        "kokoro_tts",
        "--model",
        model,
        "--text",
        text,
        "--voice-id",
        voice_id or KOKORO_DEFAULT_VOICE,
    ]
    if language:
        args += ["--language", ONNX_LANG_MAP.get(language, language)]
    if seed is not None:
        args += ["--seed", str(seed)]
    return args


class KokoroTTSBackend:
    """Kokoro TTS backend driving the audio.cpp one-shot CLI (no resident model)."""

    hf_repo = HF_REPO
    sample_rate = KOKORO_SAMPLE_RATE

    def __init__(self):
        self.load_error: str | None = None
        self.model_size = "default"

    # -- cache / path resolution -------------------------------------------

    def _is_model_cached(self, model_size: str = "default") -> bool:
        from ..services.model_files import is_model_installed

        return is_model_installed(HF_REPO, MODEL_FILE)

    def _get_model_path(self, model_size: str) -> str:
        from ..services.model_files import resolve_model_file

        return str(resolve_model_file(HF_REPO, MODEL_FILE))

    # -- lifecycle ----------------------------------------------------------

    async def load_model(self, model_size: str = "default") -> None:
        binary = find_audiocpp()
        if binary is None:
            self.load_error = (
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
            raise RuntimeError(self.load_error)
        if not self._is_model_cached(model_size):
            raise RuntimeError("Kokoro is not downloaded. Use the Model Downloads page to download it first.")
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
        # Kokoro doesn't clone; cloned-profile callers get the default voice.
        return {
            "voice_type": "preset",
            "preset_engine": "kokoro",
            "preset_voice_id": KOKORO_DEFAULT_VOICE,
        }, False

    async def combine_voice_prompts(
        self,
        audio_paths: list[str],
        reference_texts: list[str],
    ) -> tuple[np.ndarray, str]:
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=KOKORO_SAMPLE_RATE)

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
            raise RuntimeError("Kokoro is not downloaded. Use the Model Downloads page to download it first.")

        voice_name = voice_prompt.get("preset_voice_id") or voice_prompt.get("kokoro_voice") or KOKORO_DEFAULT_VOICE
        model_file = self._get_model_path("default")

        args = build_tts_args(
            model=model_file,
            text=text,
            voice_id=voice_name,
            language=language,
            seed=seed,
        )
        return await asyncio.to_thread(
            run_one_shot,
            args,
            sample_rate=KOKORO_SAMPLE_RATE,
            prefix="kokoro",
            timeout_s=DEFAULT_TIMEOUT_S,
            espeak_family="kokoro_tts",
        )


kokoro_backend = KokoroTTSBackend()
