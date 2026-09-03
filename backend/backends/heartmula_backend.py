"""HeartMuLa 3B (music) backend via the audio.cpp one-shot CLI.

audio.cpp (https://github.com/0xShug0/audio.cpp) is a ggml engine with a
``--task gen --family heartmula`` route that generates complete songs from
lyrics/tags. We run it as a one-shot subprocess per generation — no Python
ML dependencies and no resident model.

Model: ``audio-cpp/audio.cpp-gguf`` → ``HeartMuLa-GGUF/heartmula-q8_0.gguf``
(7.66 GB Q8_0). Weights + engine are Apache-2.0 — sellable (catalog id
``heartmula-3b``, $37). Output is 48 kHz mono WAV (HeartCodec native).
Generation is slow on CPU (minutes per song) — the CLI budget defaults to
one hour and is tunable via ``TWENTYLABS_AUDIOCPP_TIMEOUT``.
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
HEARTMULA_GGUF = "HeartMuLa-GGUF/heartmula-q8_0.gguf"
SAMPLE_RATE = 48000

# Per-generation wall-clock budget. HeartMuLa on CPU takes minutes per
# song, so the default is an hour; tune with TWENTYLABS_AUDIOCPP_TIMEOUT.
DEFAULT_TIMEOUT_S = 3600.0


def build_tags(genre: str, mood: str, tempo: int | None) -> str:
    """Fold the MusicBackend genre/mood/tempo controls into tag text.

    HeartMuLa takes free-form comma-separated tags (lowercased and wrapped
    in ``<tag>`` tokens internally); tempo becomes a ``NNNbpm`` tag.
    """
    tags = [genre, mood]
    if tempo is not None:
        tags.append(f"{tempo}bpm")
    return ",".join(tags)


def build_args(
    *,
    model_dir: str,
    text: str,
    tags: str,
    duration_seconds: float,
    output: str,
    seed: int | None = None,
) -> list[str]:
    """Build the ``audiocpp_cli --task gen --family heartmula`` argument list."""
    args = [
        "--task",
        "gen",
        "--family",
        "heartmula",
        "--model",
        model_dir,
        "--text",
        text,
        "--request-option",
        f"tags={tags}",
        "--request-option",
        f"duration_sec={duration_seconds:g}",
        "--out",
        output,
    ]
    if seed is not None:
        args += ["--seed", str(seed)]
    return args


class HeartMuLaBackend:
    """Music backend driving the audio.cpp heartmula CLI as one-shot subprocesses."""

    hf_repo = HF_REPO
    sample_rate = SAMPLE_RATE

    def __init__(self) -> None:
        self.load_error: str | None = None

    # -- cache / path resolution -------------------------------------------

    def _is_model_cached(self) -> bool:
        from .base import is_model_cached

        return is_model_cached(HF_REPO, required_files=[HEARTMULA_GGUF])

    def _local_gguf(self) -> str:
        from huggingface_hub import hf_hub_download

        return hf_hub_download(repo_id=HF_REPO, filename=HEARTMULA_GGUF, force_offline_if_cached=True)

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
            raise RuntimeError("HeartMuLa is not downloaded. Use the Model Downloads page to download it first.")
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
        duration_seconds: float = 30.0,
        genre: str = "pop",
        mood: str = "neutral",
        tempo: int | None = None,
        seed: int | None = None,
    ) -> tuple[np.ndarray, int]:
        binary = find_audiocpp()
        if binary is None:
            raise RuntimeError(
                "audiocpp_cli binary not found. Bundle audiocpp_cli.exe next to "
                "llama-server.exe in data/models/, or set TWENTYLABS_AUDIOCPP."
            )
        if not self._is_model_cached():
            raise RuntimeError("HeartMuLa is not downloaded. Use the Model Downloads page to download it first.")

        model_dir = self._model_dir()
        timeout_s = float(os.environ.get("TWENTYLABS_AUDIOCPP_TIMEOUT", DEFAULT_TIMEOUT_S))
        tmpdir = tempfile.mkdtemp(prefix="heartmula-")
        out_wav = str(Path(tmpdir) / "out.wav")

        try:
            args = build_args(
                model_dir=model_dir,
                text=prompt,
                tags=build_tags(genre, mood, tempo),
                duration_seconds=duration_seconds,
                output=out_wav,
                seed=seed,
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


heartmula_backend = HeartMuLaBackend()
