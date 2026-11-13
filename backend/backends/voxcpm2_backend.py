"""VoxCPM2 (GGUF) backend via the CrispASR one-shot CLI.

CrispASR (https://github.com/CrispStrobe/CrispASR) supports VoxCPM2 TTS
via ``--backend voxcpm2-tts``. The model is ``cstr/voxcpm2-GGUF``
(2.83 GB Q8_0, Apache-2.0). No Python TTS dependencies — zero torch.

VoxCPM2 is a 2B tokenizer-free diffusion-autoregressive TTS model (OpenBMB)
trained on 2M+ hours of multilingual speech. 30 languages, 48 kHz output,
zero-shot voice cloning from a reference WAV, and voice design via
parenthesized instructions in the input text (e.g.
``(A young woman, gentle voice)Hello!``).

Voices are cloned from a reference WAV via ``--voice <wav>`` (requires
``--i-have-rights`` flag for voice cloning consent). Voice design is
achieved by prepending a parenthesized description to the text — no
separate ``--instruct`` flag needed for this backend.
"""

import asyncio
import logging
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from ..utils.audio import load_audio
from ..utils.hidden_subprocess import run_hidden
from .base import combine_voice_prompts as _combine_voice_prompts

logger = logging.getLogger(__name__)

HF_REPO = "cstr/voxcpm2-GGUF"
BACKBONE_QUANT = "q8_0"
SAMPLE_RATE = 48000

DEFAULT_TIMEOUT_S = 600.0


def find_crispasr() -> Path | None:
    """Resolve the CrispASR binary (env override, bundled sidecar, PATH, auto-download)."""
    from ..utils.sidecar_downloader import find_crispasr as _find

    return _find()


def _local_file(filename: str) -> str:
    from .services.model_files import resolve_model_file

    return str(resolve_model_file(HF_REPO, filename))


def build_tts_args(
    *,
    backbone: str,
    text: str,
    output: str,
    voice_wav: str | None = None,
    language: str = "en",
    seed: int | None = None,
) -> list[str]:
    """Build the ``crispasr --backend voxcpm2-tts`` argument list."""
    args = [
        "--backend",
        "voxcpm2-tts",
        "-m",
        backbone,
        "--tts",
        text,
        "--tts-output",
        output,
        "-tl",
        language,
    ]
    if voice_wav:
        args += ["--voice", voice_wav, "--i-have-rights"]
    if seed is not None:
        args += ["-s", str(seed)]
    return args


class VoxCPM2Backend:
    """TTS backend driving the CrispASR voxcpm2-tts CLI as one-shot subprocesses."""

    hf_repo = HF_REPO
    sample_rate = SAMPLE_RATE

    def __init__(self) -> None:
        self.load_error: str | None = None

    # -- cache / path resolution -------------------------------------------

    def _is_model_cached(self) -> bool:
        from ..services.model_files import is_model_installed

        return is_model_installed(HF_REPO, f"voxcpm2-{BACKBONE_QUANT}.gguf")

    def _get_model_path(self, model_size: str) -> str:
        return _local_file(f"voxcpm2-{BACKBONE_QUANT}.gguf")

    # -- lifecycle ----------------------------------------------------------

    async def load_model(self, model_size: str = "default") -> None:
        """No resident model — verify the GGUF + binary are available."""
        binary = find_crispasr()
        if binary is None:
            self.load_error = (
                "CrispASR binary not found. Bundle crispasr.exe next to "
                "llama-server.exe in data/models/, or set TWENTYLABS_CRISPASR."
            )
            raise RuntimeError(self.load_error)
        if not self._is_model_cached():
            raise RuntimeError("VoxCPM2 is not downloaded. Use the Model Downloads page to download it first.")
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
        return {
            "voice_type": "clone",
            "voice_wav": audio_path,
            "reference_text": reference_text,
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
        binary = find_crispasr()
        if binary is None:
            raise RuntimeError(
                "CrispASR binary not found. Bundle crispasr.exe next to "
                "llama-server.exe in data/models/, or set TWENTYLABS_CRISPASR."
            )
        if not self._is_model_cached():
            raise RuntimeError("VoxCPM2 is not downloaded. Use the Model Downloads page to download it first.")

        backbone = self._get_model_path("default")
        voice_wav = voice_prompt.get("voice_wav")

        # Voice design: prepend parenthesized instruction to text
        synth_text = text
        if instruct and not voice_wav:
            synth_text = f"({instruct}){text}"

        timeout_s = float(os.environ.get("TWENTYLABS_CRISPASR_TIMEOUT", DEFAULT_TIMEOUT_S))
        tmpdir = tempfile.mkdtemp(prefix="voxcpm2-")
        out_wav = str(Path(tmpdir) / "out.wav")

        try:
            args = build_tts_args(
                backbone=backbone,
                text=synth_text,
                output=out_wav,
                voice_wav=voice_wav,
                language=language,
                seed=seed,
            )

            def _run_sync() -> None:
                proc = run_hidden(
                    [str(binary), *args],
                    capture_output=True,
                    text=True,
                    timeout=timeout_s,
                )
                if proc.returncode != 0:
                    tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-5:]
                    raise RuntimeError(f"crispasr voxcpm2-tts failed (exit {proc.returncode}): {' | '.join(tail)}")
                if not Path(out_wav).exists():
                    raise RuntimeError("crispasr voxcpm2-tts exited 0 but produced no WAV output")

            await asyncio.to_thread(_run_sync)
            audio, _sr = await asyncio.to_thread(load_audio, out_wav, sample_rate=SAMPLE_RATE)
            return audio.astype(np.float32), SAMPLE_RATE
        except subprocess.TimeoutExpired:
            raise TimeoutError(
                f"crispasr voxcpm2-tts exceeded {timeout_s:g}s. Try shorter text or a stronger machine."
            ) from None
        finally:
            try:
                import shutil

                shutil.rmtree(tmpdir, ignore_errors=True)
            except OSError:
                pass


voxcpm2_backend = VoxCPM2Backend()
