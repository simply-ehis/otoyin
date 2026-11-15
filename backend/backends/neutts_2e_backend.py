"""NeuTTS-2E backend via the audio.cpp one-shot CLI.

Migrated from the ``neutts[llama,onnx]`` package to
``audiocpp_cli --task tts --family neutts`` (2026-11-14):

- ``audio-cpp/audio.cpp-gguf`` →
  ``NeuTTS-2E-GGUF/neutts-2e-orig.gguf`` (~2.9 GB; no quantized package is
  published, so this is the original precision)

Built-in speaker prompts only — the audiocpp neutts family has no
reference-audio cloning (lineage is the Neuphonic NeuTTS-2E bundle). Nine
voices: dave, emily, greta, jo, juliette, mateo, paul, sophie, steven.
Emotion control via ``--request-option emotion=<name>``
(angry, disgusted, sad, happy, fearful, neutral, surprised). English only.
"""

import asyncio
import logging

import numpy as np

from .audio_cpp import find_audiocpp, run_one_shot

logger = logging.getLogger(__name__)

HF_REPO = "audio-cpp/audio.cpp-gguf"
MODEL_FILE = "NeuTTS-2E-GGUF/neutts-2e-orig.gguf"
SAMPLE_RATE = 24000

NEUTTS_SPEAKERS = ("dave", "emily", "greta", "jo", "juliette", "mateo", "paul", "sophie", "steven")
NEUTTS_EMOTIONS = ("angry", "disgusted", "sad", "happy", "fearful", "neutral", "surprised")
DEFAULT_VOICE = "emily"

DEFAULT_TIMEOUT_S = 300.0


def build_args(
    *,
    model: str,
    text: str,
    voice_id: str | None = None,
    emotion: str | None = None,
    seed: int | None = None,
) -> list[str]:
    """Build the ``audiocpp_cli --task tts --family neutts`` argument list (pure, unit-testable)."""
    args = [
        "--task",
        "tts",
        "--family",
        "neutts",
        "--model",
        model,
        "--text",
        text,
        "--voice-id",
        voice_id or DEFAULT_VOICE,
    ]
    if emotion:
        args += ["--request-option", f"emotion={emotion}"]
    if seed is not None:
        args += ["--seed", str(seed)]
    return args


class NeuTTS2EBackend:
    """NeuTTS-2E backend driving the audio.cpp one-shot CLI (no resident model)."""

    hf_repo = HF_REPO
    sample_rate = SAMPLE_RATE

    EMOTIONS = NEUTTS_EMOTIONS
    SPEAKERS = NEUTTS_SPEAKERS

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
            raise RuntimeError("NeuTTS-2E is not downloaded. Use the Model Downloads page to download it first.")
        self.load_error = None

    def unload_model(self) -> None:
        """Nothing resident to unload — subprocesses exit after each call."""

    def is_loaded(self) -> bool:
        return False

    # -- voice prompts ------------------------------------------------------

    async def create_voice_prompt(
        self,
        audio_path: str | None = None,
        reference_text: str = "",
        use_cache: bool = True,
    ) -> tuple[dict, bool]:
        # No reference-audio cloning in the audiocpp family — preset voices only.
        return {
            "voice_type": "preset",
            "preset_engine": "neutts_2e",
            "speaker": DEFAULT_VOICE,
            "emotion": "neutral",
        }, False

    async def combine_voice_prompts(self, prompts: list[dict]) -> dict:
        """Nothing to combine for preset-voice prompts — return the first."""
        if not prompts:
            raise ValueError("No voice prompts to combine")
        return prompts[0]

    # -- generation ---------------------------------------------------------

    async def generate(
        self,
        text: str,
        voice_prompt: dict,
        language: str = "en",
        seed: int | None = None,
        instruct: str | None = None,
        temperature: float | None = None,
        **kwargs,
    ) -> tuple[np.ndarray, int]:
        if find_audiocpp() is None:
            raise RuntimeError(
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
        if not self._is_model_cached():
            raise RuntimeError("NeuTTS-2E is not downloaded. Use the Model Downloads page to download it first.")

        speaker = str(voice_prompt.get("speaker") or voice_prompt.get("preset_voice_id") or DEFAULT_VOICE)
        if speaker not in NEUTTS_SPEAKERS:
            speaker = DEFAULT_VOICE
        emotion = str(voice_prompt.get("emotion") or (instruct or "neutral").strip().lower() or "neutral")
        if emotion not in NEUTTS_EMOTIONS:
            emotion = "neutral"

        model_file = self._local_file(MODEL_FILE)
        args = build_args(
            model=model_file,
            text=text,
            voice_id=speaker,
            emotion=emotion,
            seed=seed,
        )
        return await asyncio.to_thread(
            run_one_shot,
            args,
            sample_rate=SAMPLE_RATE,
            prefix="neutts-2e",
            timeout_s=DEFAULT_TIMEOUT_S,
        )


neutts_2e_backend = NeuTTS2EBackend()
