"""Stable Audio Open backends via the audio.cpp one-shot CLI.

Migrated from PyTorch to ``audiocpp_cli --task gen --family stable_audio
--mode offline`` (2026-11-15):

- ``StabilityAI/stable-audio-open-1.0`` — the Foundation/Open v1 layout
  audiocpp loads directly (no GGUF conversion required, no Python ML deps)
- Stability AI Community License (non-commercial for large orgs, commercial
  use allowed under $1M/yr with attribution).

Audio 3 SFX is handled by ``sa3_sfx_backend.py`` (audiocpp stable_audio on
the SA3-SFX GGUF). Output is 44.1 kHz stereo WAV (SAME codec is the
Foundation runtime's native output); ``load_audio`` mixes to mono.
"""

import contextlib
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from ..utils.audio import load_audio
from ..utils.hidden_subprocess import run_hidden
from .audio_cpp import find_audiocpp

logger = logging.getLogger(__name__)

STABLE_AUDIO_HF_REPO = "StabilityAI/stable-audio-open-1.0"
SAMPLE_RATE = 44100

DEFAULT_TIMEOUT_S = 3600.0


class StableAudioBackend:
    """Music/SFX one-shot backend driving the audio.cpp stable_audio CLI."""

    hf_repo = STABLE_AUDIO_HF_REPO
    sample_rate = SAMPLE_RATE

    def __init__(self) -> None:
        self.load_error: str | None = None

    def _model_dir(self) -> str:
        from ..services.model_files import app_snapshot_dir

        return str(app_snapshot_dir(STABLE_AUDIO_HF_REPO))

    def _is_model_cached(self) -> bool:
        from ..services.model_files import is_snapshot_installed

        return is_snapshot_installed(STABLE_AUDIO_HF_REPO)

    def load_model(self) -> None:
        """No resident model — verify the binary + Foundation snapshot are available."""
        binary = find_audiocpp()
        if binary is None:
            self.load_error = (
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
            raise RuntimeError(self.load_error)
        if not self._is_model_cached():
            raise RuntimeError(
                "Stable Audio Open is not downloaded. Use the Model Downloads page to download it first."
            )
        self.load_error = None

    def unload_model(self) -> None:
        """Nothing resident to unload — subprocesses exit after each call."""

    def is_loaded(self) -> bool:
        return False

    def is_available(self) -> bool:
        return find_audiocpp() is not None

    # -- generation ---------------------------------------------------------

    def generate(
        self,
        prompt: str,
        duration_seconds: float = 5.0,
        genre: str = "sfx",
        mood: str = "neutral",
        tempo: int | None = None,
        seed: int | None = None,
    ) -> tuple[np.ndarray, int]:
        binary = find_audiocpp()
        if binary is None:
            raise RuntimeError(
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
        if not self._is_model_cached():
            raise RuntimeError(
                "Stable Audio Open is not downloaded. Use the Model Downloads page to download it first."
            )

        timeout_s = float(os.environ.get("TWENTYLABS_AUDIOCPP_TIMEOUT", DEFAULT_TIMEOUT_S))
        tmpdir = tempfile.mkdtemp(prefix="stable-audio-open-")
        out_wav = str(Path(tmpdir) / "out.wav")
        try:
            args = [
                "--task",
                "gen",
                "--family",
                "stable_audio",
                "--mode",
                "offline",
                "--model",
                self._model_dir(),
                "--text",
                prompt,
                "--duration-seconds",
                f"{duration_seconds:g}",
                "--out",
                out_wav,
            ]
            try:
                from ..services.settings import get_low_memory_mode

                if get_low_memory_mode():
                    args += ["--session-option", "stable_audio.mem_saver=true"]
            except Exception:
                logger.debug("low_memory_mode read failed; skipping stable_audio.mem_saver", exc_info=True)
            from .audio_cpp import inject_audiocpp_env_opts

            inject_audiocpp_env_opts(args)
            proc = run_hidden(
                [str(binary), *args],
                capture_output=True,
                text=True,
                timeout=timeout_s,
            )
            if proc.returncode != 0:
                tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-5:]
                raise RuntimeError(f"audiocpp failed (exit {proc.returncode}): {' | '.join(tail)}")
            if not Path(out_wav).exists():
                raise RuntimeError("audiocpp exited 0 but produced no WAV output")

            audio, _sr = load_audio(out_wav, sample_rate=SAMPLE_RATE)
            return audio.astype(np.float32), SAMPLE_RATE
        except subprocess.TimeoutExpired:
            raise TimeoutError(f"audiocpp exceeded {timeout_s:g}s for this generation.") from None
        finally:
            with contextlib.suppress(OSError):
                shutil.rmtree(tmpdir, ignore_errors=True)


stable_audio_backend = StableAudioBackend()
