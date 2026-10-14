"""Qwen3-TTS 12Hz 1.7B Base (GGUF) backend.

Runs Qwen3-TTS through llama.cpp's ``llama-tts`` CLI (llama.cpp >= b10270,
PR #26254) as a one-shot subprocess per generation. No Python TTS
dependencies and no resident model — the process exits after each WAV,
which keeps RAM usage bounded on small machines (cold-load cost is the
tradeoff, ~5-20 s on a 2-core box).

Two GGUF files are required (both from ``ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF``):
- the backbone (``Qwen3-TTS-12Hz-1.7B-Base-Q4_K_M.gguf``, 1.04 GB)
- the mmproj audio decoder (``mmproj-Qwen3-TTS-12Hz-1.7B-Base-Q8_0.gguf``,
  446 MB) — ``llama-tts`` errors out without it.

Weights are Apache-2.0 (sellable; catalog id ``qwen3-tts-1.7b``). Output is
24 kHz 16-bit mono WAV. Voice cloning via ``--tts-speaker-file`` (reference
clip, 4-10 s). Expected CPU RTF ~3-6 on weak hardware — batch TTS, not
streaming. llama-server has no TTS endpoint; only the ``llama-tts`` CLI
synthesizes speech (verified 2026-08-19).
"""

import asyncio
import logging
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from ..utils.audio import load_audio
from .base import combine_voice_prompts as _combine_voice_prompts

logger = logging.getLogger(__name__)

HF_REPO = "ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF"
BACKBONE_QUANT = "Q4_K_M"
MMPROJ_FILENAME = "mmproj-Qwen3-TTS-12Hz-1.7B-Base-Q8_0.gguf"
SAMPLE_RATE = 24000

# Qwen3-TTS occasionally misses its EOS and "breathes" up to the frame cap
# (~1 in 30 utterances). 512 frames ≈ 41 s — safe because the generation
# pipeline chunks long text into short pieces before calling generate().
MAX_FRAMES = 512

# Per-generation wall-clock budget. One-shot llama-tts loads the model per
# call; on a 2-core box RTF ~3-6 means a 10 s sentence can take ~30-60 s.
DEFAULT_TIMEOUT_S = 300.0


def find_llama_tts() -> Path | None:
    """Resolve the llama.cpp TTS binary (env override, bundled sidecar, PATH)."""
    env_path = os.environ.get("TWENTYLABS_LLAMA_TTS")
    if env_path and Path(env_path).exists():
        return Path(env_path)

    from ..config import get_models_dir

    bundled = get_models_dir() / ("llama-tts.exe" if os.name == "nt" else "llama-tts")
    if bundled.exists():
        return bundled

    exe = "llama-tts.exe" if os.name == "nt" else "llama-tts"
    import shutil

    found = shutil.which(exe)
    return Path(found) if found else None


def build_tts_args(
    *,
    backbone: str,
    mmproj: str,
    text: str,
    output: str,
    language: str = "en",
    seed: int | None = None,
    speaker_file: str | None = None,
    max_frames: int = MAX_FRAMES,
) -> list[str]:
    """Build the ``llama-tts`` argument list (pure, unit-testable)."""
    args = [
        "-m",
        backbone,
        "-mm",
        mmproj,
        "-p",
        text,
        "--tts-lang",
        language,
        "-n",
        str(max_frames),
        "-o",
        output,
    ]
    if seed is not None:
        args += ["-s", str(seed)]
    if speaker_file:
        args += ["--tts-speaker-file", speaker_file]
    return args


class Qwen3TTSBackend:
    """TTS backend driving ``llama-tts`` one-shot subprocesses."""

    hf_repo = HF_REPO
    sample_rate = SAMPLE_RATE

    def __init__(self) -> None:
        self.load_error: str | None = None

    # -- cache / path resolution -------------------------------------------

    def _is_model_cached(self) -> bool:
        from ..services.model_files import is_model_installed

        return is_model_installed(HF_REPO, f"Qwen3-TTS-12Hz-1.7B-Base-{BACKBONE_QUANT}.gguf") and is_model_installed(
            HF_REPO, MMPROJ_FILENAME
        )

    def _local_file(self, filename: str) -> str:
        from ..services.model_files import resolve_model_file

        return str(resolve_model_file(HF_REPO, filename))

    def _get_model_path(self, model_size: str) -> str:
        return self._local_file(f"Qwen3-TTS-12Hz-1.7B-Base-{BACKBONE_QUANT}.gguf")

    # -- lifecycle ----------------------------------------------------------

    async def load_model(self, model_size: str) -> None:
        """No resident model — verify the GGUF pair + binary are available."""
        binary = find_llama_tts()
        if binary is None:
            self.load_error = (
                "llama-tts binary not found. Bundle llama-tts.exe next to "
                "llama-server.exe in data/models/, or set TWENTYLABS_LLAMA_TTS."
            )
            raise RuntimeError(self.load_error)
        if not self._is_model_cached():
            raise RuntimeError(
                "Qwen3-TTS 12Hz 1.7B Base is not downloaded. Use the Model Downloads page to download it first."
            )
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
        # llama-tts takes the reference clip path directly (--tts-speaker-file).
        return {"voice_type": "clone", "audio_path": audio_path, "reference_text": reference_text}, False

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
        binary = find_llama_tts()
        if binary is None:
            raise RuntimeError(
                "llama-tts binary not found. Bundle llama-tts.exe next to "
                "llama-server.exe in data/models/, or set TWENTYLABS_LLAMA_TTS."
            )
        if not self._is_model_cached():
            raise RuntimeError(
                "Qwen3-TTS 12Hz 1.7B Base is not downloaded. Use the Model Downloads page to download it first."
            )

        backbone = self._local_file(f"Qwen3-TTS-12Hz-1.7B-Base-{BACKBONE_QUANT}.gguf")
        mmproj = self._local_file(MMPROJ_FILENAME)
        speaker_file = voice_prompt.get("audio_path") if voice_prompt.get("voice_type") == "clone" else None

        timeout_s = float(os.environ.get("TWENTYLABS_LLAMA_TTS_TIMEOUT", DEFAULT_TIMEOUT_S))
        tmpdir = tempfile.mkdtemp(prefix="qwen3-tts-")
        out_wav = str(Path(tmpdir) / "out.wav")

        try:
            args = build_tts_args(
                backbone=backbone,
                mmproj=mmproj,
                text=text,
                output=out_wav,
                language=language,
                seed=seed,
                speaker_file=speaker_file,
            )

            def _run_sync() -> None:
                proc = subprocess.run(
                    [str(binary), *args],
                    capture_output=True,
                    text=True,
                    timeout=timeout_s,
                )
                if proc.returncode != 0:
                    tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-5:]
                    raise RuntimeError(f"llama-tts failed (exit {proc.returncode}): {' | '.join(tail)}")
                if not Path(out_wav).exists():
                    raise RuntimeError("llama-tts exited 0 but produced no WAV output")

            await asyncio.to_thread(_run_sync)
            audio, _sr = await asyncio.to_thread(load_audio, out_wav, sample_rate=SAMPLE_RATE)
            return audio.astype(np.float32), SAMPLE_RATE
        except subprocess.TimeoutExpired:
            raise TimeoutError(
                f"llama-tts exceeded {timeout_s:g}s for this generation. Try a shorter text or a stronger machine."
            ) from None
        finally:
            try:
                import shutil

                shutil.rmtree(tmpdir, ignore_errors=True)
            except OSError:  # pragma: no cover - best-effort cleanup
                pass


qwen3_tts_backend = Qwen3TTSBackend()
