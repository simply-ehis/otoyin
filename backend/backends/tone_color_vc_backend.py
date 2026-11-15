"""Tone-Color-VC (audio.cpp tone_color_vc) — OpenVoice V2 standalone converter.

Audio.cpp family ``tone_color_vc``: one self-contained GGUF deriving from
MyShell's OpenVoice V2 (MIT) — reference encoder, flow model, waveform
decoder all in one file. Zero-shot tone-color transfer from any reference
clip. **Voice conversion of any audio is not free by magic — these models
imitate the target.** The app gates storage, not the right to clone: callers
remain responsible for having consent.

- ``audio-cpp/audio.cpp-gguf`` →
  ``Tone-Color-VC-GGUF/tone-color-vc-f16.gguf`` (~63 MB, F16)
"""

import asyncio
import logging

import numpy as np

from .audio_cpp import find_audiocpp, run_one_shot

logger = logging.getLogger(__name__)

HF_REPO = "audio-cpp/audio.cpp-gguf"
MODEL_FILE = "Tone-Color-VC-GGUF/tone-color-vc-f16.gguf"
SAMPLE_RATE = 22050

DEFAULT_TIMEOUT_S = 300.0


def build_args(
    *,
    model: str,
    source: str,
    reference: str,
    seed: int | None = None,
) -> list[str]:
    """Build the ``audiocpp_cli --task vc --family tone_color_vc`` argument list (pure, unit-testable)."""
    args = [
        "--task",
        "vc",
        "--family",
        "tone_color_vc",
        "--model",
        model,
        "--audio",
        source,
        "--voice-ref",
        reference,
    ]
    if seed is not None:
        args += ["--seed", str(seed)]
    return args


class ToneColorVCBackend:
    """Voice-conversion backend driving the audio.cpp CLI as one-shot subprocesses."""

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
            raise RuntimeError("Tone-Color-VC is not downloaded. Use the Model Downloads page to download it first.")
        self.load_error = None

    def unload_model(self) -> None:
        """Nothing resident to unload — subprocesses exit after each call."""

    def is_loaded(self) -> bool:
        return False

    # -- conversion ---------------------------------------------------------

    async def convert(
        self,
        source: str,
        reference: str,
        seed: int | None = None,
    ) -> tuple[np.ndarray, int]:
        """Convert ``source`` WAV so its timbre matches ``reference``."""
        if find_audiocpp() is None:
            raise RuntimeError(
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
        if not self._is_model_cached():
            raise RuntimeError("Tone-Color-VC is not downloaded. Use the Model Downloads page to download it first.")

        model_file = self._local_file(MODEL_FILE)
        args = build_args(model=model_file, source=source, reference=reference, seed=seed)
        return await asyncio.to_thread(
            run_one_shot,
            args,
            sample_rate=SAMPLE_RATE,
            prefix="tone-color-vc",
            timeout_s=DEFAULT_TIMEOUT_S,
        )


tone_color_vc_backend = ToneColorVCBackend()
