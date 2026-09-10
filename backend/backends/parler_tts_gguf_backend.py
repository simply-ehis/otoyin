"""Parler TTS Mini (GGUF) backend via the CrispASR CLI.

CrispASR (https://github.com/CrispStrobe/CrispASR) supports Parler TTS
via ``--backend parler-tts``. The model is ``cstr/parler-tts-mini-v1.1-GGUF``
(~900M, Apache-2.0). No Python TTS dependencies — zero torch.

Parler TTS is prompt-conditioned: describe the desired voice in natural
language via ``--instruct`` (e.g. "A warm female voice speaking slowly").
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

HF_REPO = "cstr/parler-tts-mini-v1.1-GGUF"
BACKBONE_QUANT = "q4_k"
SAMPLE_RATE = 44100

DEFAULT_TIMEOUT_S = 600.0

DEFAULT_INSTRUCT = "A clear, neutral voice speaking at a moderate pace."


def find_crispasr() -> Path | None:
    """Resolve the CrispASR binary (env override, bundled sidecar, PATH)."""
    env_path = os.environ.get("TWENTYLABS_CRISPASR")
    if env_path and Path(env_path).exists():
        return Path(env_path)

    from ..config import get_models_dir

    bundled = get_models_dir() / ("crispasr.exe" if os.name == "nt" else "crispasr")
    if bundled.exists():
        return bundled

    exe = "crispasr.exe" if os.name == "nt" else "crispasr"
    import shutil

    found = shutil.which(exe)
    return Path(found) if found else None


def _local_file(filename: str) -> str:
    from huggingface_hub import hf_hub_download

    return hf_hub_download(repo_id=HF_REPO, filename=filename, force_offline_if_cached=True)


def build_tts_args(
    *,
    backbone: str,
    text: str,
    output: str,
    instruct: str | None = None,
    language: str = "en",
    seed: int | None = None,
    temperature: float | None = None,
) -> list[str]:
    """Build the ``crispasr --backend parler-tts`` argument list."""
    args = [
        "--backend",
        "parler-tts",
        "-m",
        backbone,
        "--tts",
        text,
        "--tts-output",
        output,
        "-tl",
        language,
    ]
    if instruct:
        args += ["--instruct", instruct]
    if seed is not None:
        args += ["-s", str(seed)]
    if temperature is not None:
        args += ["-temp", str(temperature)]
    return args


class ParlerTTSGGUFBackend:
    """TTS backend driving the CrispASR parler-tts CLI as one-shot subprocesses."""

    hf_repo = HF_REPO
    sample_rate = SAMPLE_RATE

    def __init__(self) -> None:
        self.load_error: str | None = None

    # -- cache / path resolution -------------------------------------------

    def _is_model_cached(self) -> bool:
        from .base import is_model_cached

        return is_model_cached(HF_REPO, required_files=[f"parler-tts-mini-v1.1-{BACKBONE_QUANT}.gguf"])

    def _get_model_path(self) -> str:
        return _local_file(f"parler-tts-mini-v1.1-{BACKBONE_QUANT}.gguf")

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
            raise RuntimeError("Parler TTS GGUF is not downloaded. Use the Model Downloads page to download it first.")
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
            "voice_type": "instruct",
            "instruct": reference_text or DEFAULT_INSTRUCT,
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
            raise RuntimeError("Parler TTS GGUF is not downloaded. Use the Model Downloads page to download it first.")

        backbone = self._get_model_path()
        instruct_text = instruct or voice_prompt.get("instruct", DEFAULT_INSTRUCT)
        timeout_s = float(os.environ.get("TWENTYLABS_CRISPASR_TIMEOUT", DEFAULT_TIMEOUT_S))
        tmpdir = tempfile.mkdtemp(prefix="parler-tts-gguf-")
        out_wav = str(Path(tmpdir) / "out.wav")

        try:
            args = build_tts_args(
                backbone=backbone,
                text=text,
                output=out_wav,
                instruct=instruct_text,
                language=language,
                seed=seed,
                temperature=temperature,
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
                    raise RuntimeError(f"crispasr parler-tts failed (exit {proc.returncode}): {' | '.join(tail)}")
                if not Path(out_wav).exists():
                    raise RuntimeError("crispasr parler-tts exited 0 but produced no WAV output")

            await asyncio.to_thread(_run_sync)
            audio, _sr = await asyncio.to_thread(load_audio, out_wav, sample_rate=SAMPLE_RATE)
            return audio.astype(np.float32), SAMPLE_RATE
        except subprocess.TimeoutExpired:
            raise TimeoutError(
                f"crispasr parler-tts exceeded {timeout_s:g}s. Try shorter text or a stronger machine."
            ) from None
        finally:
            try:
                import shutil

                shutil.rmtree(tmpdir, ignore_errors=True)
            except OSError:
                pass


parler_tts_gguf_backend = ParlerTTSGGUFBackend()
