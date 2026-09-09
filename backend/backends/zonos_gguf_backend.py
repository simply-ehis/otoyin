"""Zonos v0.1 (GGUF) backend via the CrispASR CLI.

CrispASR (https://github.com/CrispStrobe/CrispASR) supports Zonos TTS
via ``--backend zonos-tts``. The model is ``cstr/zonos-v0.1-transformer-GGUF``
(872 MB Q4_K, Apache-2.0) plus a companion DAC codec from
``cstr/dac-44khz-GGUF``. No Python TTS dependencies — zero torch.

Voices are cloned from a reference WAV via ``--voice <wav>`` (requires
``--i-have-rights`` flag for voice cloning consent). Preset voices can be
described via ``--instruct`` text.
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

HF_REPO = "cstr/zonos-v0.1-transformer-GGUF"
DAC_REPO = "cstr/dac-44khz-GGUF"
BACKBONE_QUANT = "q4_k"
SAMPLE_RATE = 44100

DEFAULT_TIMEOUT_S = 600.0


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


def _local_file(repo: str, filename: str) -> str:
    from huggingface_hub import hf_hub_download

    return hf_hub_download(repo_id=repo, filename=filename, force_offline_if_cached=True)


def build_tts_args(
    *,
    backbone: str,
    codec: str,
    text: str,
    output: str,
    voice_wav: str | None = None,
    instruct: str | None = None,
    language: str = "en",
    seed: int | None = None,
    temperature: float | None = None,
) -> list[str]:
    """Build the ``crispasr --backend zonos-tts`` argument list."""
    args = [
        "--backend", "zonos-tts",
        "-m", backbone,
        "--tts-codec", codec,
        "--tts", text,
        "--tts-output", output,
        "-tl", language,
    ]
    if voice_wav:
        args += ["--voice", voice_wav, "--i-have-rights"]
    if instruct:
        args += ["--instruct", instruct]
    if seed is not None:
        args += ["-s", str(seed)]
    if temperature is not None:
        args += ["-temp", str(temperature)]
    return args


class ZonosGGUFBackend:
    """TTS backend driving the CrispASR zonos-tts CLI as one-shot subprocesses."""

    hf_repo = HF_REPO
    sample_rate = SAMPLE_RATE

    def __init__(self) -> None:
        self.load_error: str | None = None

    # -- cache / path resolution -------------------------------------------

    def _is_model_cached(self) -> bool:
        from .base import is_model_cached

        return is_model_cached(HF_REPO, required_files=[f"zonos-v0.1-transformer-{BACKBONE_QUANT}.gguf"])

    def _get_backbone_path(self) -> str:
        return _local_file(HF_REPO, f"zonos-v0.1-transformer-{BACKBONE_QUANT}.gguf")

    def _get_codec_path(self) -> str:
        return _local_file(DAC_REPO, "dac-44khz-f32.gguf")

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
            raise RuntimeError(
                "Zonos GGUF is not downloaded. Use the Model Downloads page to download it first."
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
            raise RuntimeError(
                "Zonos GGUF is not downloaded. Use the Model Downloads page to download it first."
            )

        backbone = self._get_backbone_path()
        codec = self._get_codec_path()
        voice_wav = voice_prompt.get("voice_wav")
        timeout_s = float(os.environ.get("TWENTYLABS_CRISPASR_TIMEOUT", DEFAULT_TIMEOUT_S))
        tmpdir = tempfile.mkdtemp(prefix="zonos-gguf-")
        out_wav = str(Path(tmpdir) / "out.wav")

        try:
            args = build_tts_args(
                backbone=backbone,
                codec=codec,
                text=text,
                output=out_wav,
                voice_wav=voice_wav,
                instruct=instruct,
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
                    raise RuntimeError(f"crispasr zonos-tts failed (exit {proc.returncode}): {' | '.join(tail)}")
                if not Path(out_wav).exists():
                    raise RuntimeError("crispasr zonos-tts exited 0 but produced no WAV output")

            await asyncio.to_thread(_run_sync)
            audio, _sr = await asyncio.to_thread(load_audio, out_wav, sample_rate=SAMPLE_RATE)
            return audio.astype(np.float32), SAMPLE_RATE
        except subprocess.TimeoutExpired:
            raise TimeoutError(
                f"crispasr zonos-tts exceeded {timeout_s:g}s. Try shorter text or a stronger machine."
            ) from None
        finally:
            try:
                import shutil

                shutil.rmtree(tmpdir, ignore_errors=True)
            except OSError:
                pass


zonos_gguf_backend = ZonosGGUFBackend()
