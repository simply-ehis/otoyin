"""Seed-VC backend via the audio.cpp one-shot CLI.

Migrated from the PyTorch wrapper to ``audiocpp_cli --task vc --family
seed_vc`` (2026-11-15). Zero-shot voice conversion (no training):

- ``audio-cpp/audio.cpp-gguf`` →
  ``SeedVC-MLX-GGUF/seed-vc-mlx-q8_0.gguf`` (~3.0 GB, Q8_0)

Upstream (Plachtaa/seed-vc) is **GPL-3.0** — review your obligations before
redistributing binaries or model weights; the app itself contains no GPL
code (one-shot subprocess invocation is a compatible boundary).

Also supports ``--task svc`` (singing voice conversion, `v1_svc` route),
not wired in this path. Audio.cpp does not expose a seed here (diffusion
RNG seed is accepted as ``--seed`` for reproducibility though with a
``--request-option seed=...`` if ever needed.
"""

import asyncio
import logging

import numpy as np

from .audio_cpp import find_audiocpp, run_one_shot

logger = logging.getLogger(__name__)

HF_REPO = "audio-cpp/audio.cpp-gguf"
MODEL_FILE = "SeedVC-MLX-GGUF/seed-vc-mlx-q8_0.gguf"
SAMPLE_RATE = 24000

DEFAULT_TIMEOUT_S = 600.0


def build_args(
    *,
    model: str,
    source: str,
    reference: str,
    route: str = "v2_vc",
    seed: int | None = None,
) -> list[str]:
    """Build the ``audiocpp_cli --task vc --family seed_vc`` argument list (pure, unit-testable)."""
    args = [
        "--task",
        "vc",
        "--family",
        "seed_vc",
        "--model",
        model,
        "--audio",
        source,
        "--voice-ref",
        reference,
        "--task-route",
        route,
    ]
    allowed = {"v2_vc", "v1_whisper_bigvgan_vc", "v1_xlsr_hift_vc"}
    if route not in allowed:
        raise ValueError(f"Unknown Seed-VC route {route!r}; expected one of {sorted(allowed)}")
    if seed is not None:
        args += ["--seed", str(seed)]
    return args


class SeedVCBackend:
    """Seed-VC backend driving the audio.cpp one-shot CLI (no resident model)."""

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
            raise RuntimeError("Seed-VC is not downloaded. Use the Model Downloads page to download it first.")
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
        route: str = "v2_vc",
        seed: int | None = None,
    ) -> tuple[np.ndarray, int]:
        """Convert ``source`` WAV so its timbre matches ``reference``.

        ``route``: ``v2_vc`` (default, V2 CFM), ``v1_whisper_bigvgan_vc`` or
        ``v1_xlsr_hift_vc`` (V1 families with explicit F0/duration controls).
        """
        allowed = {"v2_vc", "v1_whisper_bigvgan_vc", "v1_xlsr_hift_vc"}
        if route not in allowed:
            raise ValueError(f"Unknown Seed-VC route {route!r}; expected one of {sorted(allowed)}")

        if find_audiocpp() is None:
            raise RuntimeError(
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
        if not self._is_model_cached():
            raise RuntimeError("Seed-VC is not downloaded. Use the Model Downloads page to download it first.")

        model_file = self._local_file(MODEL_FILE)
        args = build_args(model=model_file, source=source, reference=reference, route=route, seed=seed)
        return await asyncio.to_thread(
            run_one_shot,
            args,
            sample_rate=SAMPLE_RATE,
            prefix="seed-vc",
            timeout_s=DEFAULT_TIMEOUT_S,
        )


seed_vc_backend = SeedVCBackend()
