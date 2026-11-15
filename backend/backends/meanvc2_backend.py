"""MeanVC2 (audio.cpp meanvc2 family) — language-agnostic zero-shot voice conversion.

Apache-2.0 upstream (ASLP-LAB/MeanVC2). One self-contained GGUF covering the
recommended 120 ms / 40 ms quality path. Streaming-friendly family — the
160 ms chunks + full conversion run through the CLI's ``--mode streaming``
when ``--mode streaming`` is passed; this one-shot path stays offline.

- ``audio-cpp/audio.cpp-gguf`` →
  ``MeanVC2-GGUF/meanvc2-120ms-40ms-fp32.gguf`` (~1.55 GB). Upstream also
  ships a q4_k variant (~326 MB) that can be substituted via
  ``TWENTYLABS_AUDIOCPP_BACKEND`` plumbing or a config row update later.
"""

import asyncio
import logging

import numpy as np

from .audio_cpp import find_audiocpp, run_one_shot

logger = logging.getLogger(__name__)

HF_REPO = "audio-cpp/audio.cpp-gguf"
MODEL_FILE = "MeanVC2-GGUF/meanvc2-120ms-40ms-fp32.gguf"
SAMPLE_RATE = 16000

DEFAULT_TIMEOUT_S = 600.0


def build_args(
    *,
    model: str,
    source: str,
    reference: str,
    seed: int | None = None,
) -> list[str]:
    """Build the ``audiocpp_cli --task vc --family meanvc2`` argument list (pure, unit-testable)."""
    args = [
        "--task",
        "vc",
        "--family",
        "meanvc2",
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


class MeanVC2Backend:
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
            raise RuntimeError("MeanVC2 is not downloaded. Use the Model Downloads page to download it first.")
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
            raise RuntimeError("MeanVC2 is not downloaded. Use the Model Downloads page to download it first.")

        model_file = self._local_file(MODEL_FILE)
        args = build_args(model=model_file, source=source, reference=reference, seed=seed)
        return await asyncio.to_thread(
            run_one_shot,
            args,
            sample_rate=SAMPLE_RATE,
            prefix="meanvc2",
            timeout_s=DEFAULT_TIMEOUT_S,
        )


meanvc2_backend = MeanVC2Backend()
