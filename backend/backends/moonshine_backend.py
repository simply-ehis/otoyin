"""Moonshine STT backend via transcribe.cpp (GGUF, no torch).

Moonshine (https://github.com/moonshine-ai/moonshine) is an encoder-decoder
ASR model optimized for low-latency on-device inference. GGUF conversions
from memoravox/*-gguf repos run via transcribe.cpp — a lightweight C++
inference tool similar to CrispASR.

Three model sizes:
  - tiny (27M, 35 MB Q8_0, 12% WER) — ultra-light, Raspberry Pi friendly
  - base (61M, 74 MB Q8_0, 3.3% WER) — best balance for CPU
  - streaming-small (123M, 189 MB Q8_0, 2.5% WER) — streaming-capable, best accuracy

All models: English-only, MIT license, 16 kHz PCM input, raw transcript output.
No word-level timestamps (use Whisper for that). No translation.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
from pathlib import Path

from .. import config
from .base import BackendBase, model_load_progress

logger = logging.getLogger(__name__)

# GGUF repos — Q8_0 only (smallest quant that preserves accuracy).
_MODELS = {
    "moonshine-tiny": {
        "repo": "memoravox/moonshine-tiny-gguf",
        "file": "moonshine-tiny-Q8_0.gguf",
        "size_mb": 35,
    },
    "moonshine-base": {
        "repo": "memoravox/moonshine-base-gguf",
        "file": "moonshine-base-Q8_0.gguf",
        "size_mb": 74,
    },
    "moonshine-streaming-small": {
        "repo": "memoravox/moonshine-streaming-small-gguf",
        "file": "moonshine-streaming-small-Q8_0.gguf",
        "size_mb": 189,
    },
}

DEFAULT_MODEL = "moonshine-base"
SAMPLE_RATE = 16000


def _find_transcribe_cpp() -> Path | None:
    """Resolve the transcribe.cpp binary (env override, bundled sidecar, PATH)."""
    env_path = os.environ.get("TRANSCRIBE_CPP")
    if env_path and Path(env_path).exists():
        return Path(env_path)

    bundled = config.get_models_dir() / ("transcribe.exe" if os.name == "nt" else "transcribe")
    if bundled.exists():
        return bundled

    exe = "transcribe.exe" if os.name == "nt" else "transcribe"
    found = shutil.which(exe)
    return Path(found) if found else None


def _gguf_path(model_name: str) -> Path | None:
    """Return the local GGUF path for a Moonshine model, or None."""
    info = _MODELS.get(model_name)
    if not info:
        return None
    return config.get_models_dir() / info["file"]


def _download_gguf(model_name: str) -> Path:
    """Download the GGUF file from HuggingFace and return the local path."""
    from huggingface_hub import hf_hub_download

    info = _MODELS[model_name]
    dest = config.get_models_dir()
    dest.mkdir(parents=True, exist_ok=True)

    local = hf_hub_download(
        repo_id=info["repo"],
        filename=info["file"],
        local_dir=str(dest),
    )
    return Path(local)


class MoonshineSTTBackend(BackendBase):
    """CPU-only STT via Moonshine GGUF + transcribe.cpp subprocess."""

    _model_attr = "model"

    def __init__(self, model_name: str = DEFAULT_MODEL):
        self.model = None
        self.model_name = model_name

    def is_loaded(self) -> bool:
        return self.model is not None

    async def load_model(self, model_name: str | None = None) -> None:
        if model_name:
            self.model_name = model_name

        binary = _find_transcribe_cpp()
        if binary is None:
            raise RuntimeError(
                "transcribe.cpp not found. Set TRANSCRIBE_CPP env var or "
                "place the binary in the models directory."
            )

        gguf = _gguf_path(self.model_name)
        if gguf is None:
            raise RuntimeError(f"Unknown Moonshine model: {self.model_name}")
        if not gguf.exists():
            logger.info("Downloading Moonshine GGUF: %s", self.model_name)
            await asyncio.to_thread(_download_gguf, self.model_name)

        self.model = {
            "binary": binary,
            "gguf": gguf,
            "model_name": self.model_name,
        }
        model_load_progress.send(model=self.model_name, progress=1.0)

    async def unload_model(self) -> None:
        self.model = None

    async def transcribe(
        self,
        audio_path: str,
        language: str = "en",
        model_name: str | None = None,
    ) -> str:
        """Transcribe audio to plain text."""
        result = await self.transcribe_with_segments(audio_path, language, model_name)
        return result["text"]

    async def transcribe_with_segments(
        self,
        audio_path: str,
        language: str = "en",
        model_name: str | None = None,
    ) -> dict:
        """Transcribe audio and return {text, segments}.

        Note: Moonshine/transcribe.cpp does not produce word-level timestamps.
        Segments are returned as a single segment spanning the full audio.
        """
        if not self.is_loaded or (model_name and model_name != self.model["model_name"]):
            await self.load_model(model_name)

        binary = self.model["binary"]
        gguf = self.model["gguf"]

        # Ensure audio is 16 kHz mono WAV for Moonshine
        tmpdir = tempfile.mkdtemp(prefix="moonshine-")
        wav_path = str(Path(tmpdir) / "input.wav")

        try:
            from ..utils.audio import load_audio, save_audio

            # Resample to 16 kHz mono WAV for Moonshine
            audio, sr = await asyncio.to_thread(load_audio, audio_path, SAMPLE_RATE, True)
            await asyncio.to_thread(save_audio, audio, wav_path, sr)

            args = [str(binary), "-m", str(gguf), "-f", wav_path]
            proc = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120.0)

            if proc.returncode != 0:
                raise RuntimeError(
                    f"transcribe.cpp exited {proc.returncode}: {stderr.decode(errors='replace')}"
                )

            text = stdout.decode(errors="replace").strip()

            return {
                "text": text,
                "segments": [{"start": 0.0, "end": 0.0, "text": text}] if text else [],
            }
        except TimeoutError as exc:
            raise RuntimeError("transcribe.cpp timed out after 120s") from exc
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)


moonshine_stt_backend = MoonshineSTTBackend()
