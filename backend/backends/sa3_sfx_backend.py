"""Stable Audio 3 Small SFX backend via the audio.cpp one-shot CLI.

audio.cpp (https://github.com/0xShug0/audio.cpp) exposes a
``--task gen --family stable_audio`` route covering the Stable Audio 3
family. We run it as a one-shot subprocess per generation — no Python ML
dependencies and no resident model.

Model: ``audio-cpp/audio.cpp-gguf`` →
``Stable-Audio-3-Small-SFX-GGUF/stable-audio-3-small-sfx-q8_0.gguf``
(1.68 GB Q8_0, single file packs DiT + SAME codec + T5Gemma encoder).
Weights are under the Stability AI Community License (free for commercial
use while the whole org makes < $1M/yr, with attribution and no
foundational-model use) — catalog id ``stable-audio-3-small-sfx``, $25.
Output is 44.1 kHz stereo WAV (SAME codec native); ``load_audio`` mixes
to mono. audio.cpp exposes no seed for this family (diffusion RNG), so
the MusicBackend ``seed`` parameter is accepted and ignored.
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
from .audio_cpp import find_audiocpp

logger = logging.getLogger(__name__)

HF_REPO = "audio-cpp/audio.cpp-gguf"
SA3_SFX_GGUF = "Stable-Audio-3-Small-SFX-GGUF/stable-audio-3-small-sfx-q8_0.gguf"
SAMPLE_RATE = 44100

# Official prompting guide: prefix SFX prompts with the TrackType marker
# for more semantically coherent sound effects.
SFX_PROMPT_PREFIX = "TrackType: SFX. "

# Per-generation wall-clock budget; tune with TWENTYLABS_AUDIOCPP_TIMEOUT.
DEFAULT_TIMEOUT_S = 3600.0


def build_text(prompt: str) -> str:
    """Prefix the prompt with the model's ``TrackType: SFX`` marker."""
    return f"{SFX_PROMPT_PREFIX}{prompt}"


def build_args(
    *,
    model_dir: str,
    text: str,
    duration_seconds: float,
    output: str,
) -> list[str]:
    """Build the ``audiocpp_cli --task gen --family stable_audio`` argument list."""
    return [
        "--task",
        "gen",
        "--family",
        "stable_audio",
        "--model",
        model_dir,
        "--text",
        text,
        "--duration-seconds",
        f"{duration_seconds:g}",
        "--out",
        output,
    ]


class SA3SfxBackend:
    """SFX backend driving the audio.cpp stable_audio CLI as one-shot subprocesses."""

    hf_repo = HF_REPO
    sample_rate = SAMPLE_RATE

    def __init__(self) -> None:
        self.load_error: str | None = None

    # -- cache / path resolution -------------------------------------------

    def _is_model_cached(self) -> bool:
        from ..services.model_files import is_model_installed

        return is_model_installed(HF_REPO, SA3_SFX_GGUF)

    def _local_gguf(self) -> str:
        from ..services.model_files import resolve_model_file

        return str(resolve_model_file(HF_REPO, SA3_SFX_GGUF))

    def _model_dir(self) -> str:
        """audio.cpp loads a family GGUF from the directory it is given."""
        return str(Path(self._local_gguf()).parent)

    # -- lifecycle ----------------------------------------------------------

    def load_model(self) -> None:
        """No resident model — verify the binary + GGUF are available."""
        binary = find_audiocpp()
        if binary is None:
            self.load_error = (
                "audiocpp_cli binary not found. Bundle audiocpp_cli.exe next to "
                "llama-server.exe in data/models/, or set TWENTYLABS_AUDIOCPP."
            )
            raise RuntimeError(self.load_error)
        if not self._is_model_cached():
            raise RuntimeError(
                "Stable Audio 3 Small SFX is not downloaded. Use the Model Downloads page to download it first."
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
        """Generate sound effects from a prompt.

        ``genre``/``mood``/``tempo``/``seed`` are accepted for MusicBackend
        protocol compatibility and ignored — audio.cpp exposes no seed for
        the stable_audio family and the SFX model is prompt-only.
        """
        binary = find_audiocpp()
        if binary is None:
            raise RuntimeError(
                "audiocpp_cli binary not found. Bundle audiocpp_cli.exe next to "
                "llama-server.exe in data/models/, or set TWENTYLABS_AUDIOCPP."
            )
        if not self._is_model_cached():
            raise RuntimeError(
                "Stable Audio 3 Small SFX is not downloaded. Use the Model Downloads page to download it first."
            )

        timeout_s = float(os.environ.get("TWENTYLABS_AUDIOCPP_TIMEOUT", DEFAULT_TIMEOUT_S))
        tmpdir = tempfile.mkdtemp(prefix="sa3-sfx-")
        out_wav = str(Path(tmpdir) / "out.wav")

        try:
            args = build_args(
                model_dir=self._model_dir(),
                text=build_text(prompt),
                duration_seconds=duration_seconds,
                output=out_wav,
            )
            proc = subprocess.run(
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
            raise TimeoutError(
                f"audiocpp exceeded {timeout_s:g}s for this generation. Try a shorter duration or a stronger machine."
            ) from None
        finally:
            with contextlib.suppress(OSError):
                shutil.rmtree(tmpdir, ignore_errors=True)


sa3_sfx_backend = SA3SfxBackend()
