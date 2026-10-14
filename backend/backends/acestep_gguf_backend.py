"""ACE-Step 1.5 music generation via acestep.cpp (GGML/GGUF).

Portable C++17 inference for ACE-Step 1.5 using GGUF models — no PyTorch.
Uses ``ace-server`` (HTTP API) or ``ace-lm``/``ace-synth`` CLI pipeline.

Models (4 files, ~7.7 GB Q8_0 turbo):
  - LM: ``acestep-5Hz-lm-4B-Q8_0.gguf`` (4.2 GB)
  - Text encoder: ``Qwen3-Embedding-0.6B-Q8_0.gguf`` (748 MB)
  - DiT: ``acestep-v15-turbo-Q8_0.gguf`` (2.4 GB)
  - VAE: ``vae-BF16.gguf`` (322 MB)

CLI tools (preferred for one-shot generation):
  - ``ace-lm``: caption → metadata + lyrics + audio codes
  - ``ace-synth``: audio codes → stereo 48kHz WAV

Runs on CPU, CUDA, Metal, Vulkan.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from ..utils.hidden_subprocess import run_hidden
from .base import BackendBase, ModelNotCachedError

logger = logging.getLogger(__name__)

HF_REPO = "Serveurperso/ACE-Step-1.5-GGUF"

# Default model filenames
LM_FILE = "acestep-5Hz-lm-4B-Q8_0.gguf"
TEXT_ENCODER_FILE = "Qwen3-Embedding-0.6B-Q8_0.gguf"
DIT_FILE = "acestep-v15-turbo-Q8_0.gguf"
VAE_FILE = "vae-BF16.gguf"

ALL_MODEL_FILES = [LM_FILE, TEXT_ENCODER_FILE, DIT_FILE, VAE_FILE]

SAMPLE_RATE = 48000

DEFAULT_TIMEOUT_S = 600.0


def find_acestep_binary(name: str) -> Path | None:
    """Resolve an acestep.cpp binary (env override, bundled sidecar, PATH)."""
    env_path = os.environ.get(f"TWENTYLABS_ACESTEP_{name.upper()}")
    if env_path and Path(env_path).exists():
        return Path(env_path)

    from ..config import get_models_dir

    ext = ".exe" if os.name == "nt" else ""
    bundled = get_models_dir() / "acestep" / f"{name}{ext}"
    if bundled.exists():
        return bundled

    import shutil

    found = shutil.which(name)
    return Path(found) if found else None


def find_ace_server() -> Path | None:
    """Find the ace-server binary."""
    return find_acestep_binary("ace-server")


def find_ace_lm() -> Path | None:
    return find_acestep_binary("ace-lm")


def find_ace_synth() -> Path | None:
    return find_acestep_binary("ace-synth")


def _local_file(filename: str) -> str:
    # Module-level helper: single-dot import (this file IS backend/backends/).
    from ..services.model_files import resolve_model_file

    return str(resolve_model_file(HF_REPO, filename))


class AceStepGGUFBackend(BackendBase):
    """Music generation via acestep.cpp (GGML/GGUF, no torch)."""

    _model_attr = "model"
    hf_repo = HF_REPO
    sample_rate = SAMPLE_RATE

    def __init__(self):
        self.model = None
        self._server_process: subprocess.Popen | None = None
        self._server_port: int = 0

    def is_loaded(self) -> bool:
        return self.model is not None

    def _models_dir(self) -> Path:
        from ..config import get_models_dir

        d = get_models_dir() / "acestep"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _ensure_models(self) -> None:
        """Download GGUF models if not cached."""
        import shutil

        from huggingface_hub import hf_hub_download

        models_dir = self._models_dir()
        for filename in ALL_MODEL_FILES:
            dest = models_dir / filename
            if not dest.exists():
                try:
                    src = hf_hub_download(repo_id=HF_REPO, filename=filename)
                    shutil.copy2(src, dest)
                except Exception as e:
                    logger.warning("Failed to download %s: %s", filename, e)
        from ..services.model_files import clear_hf_repo_cache

        clear_hf_repo_cache(HF_REPO)

    def _models_cached(self) -> bool:
        return all((self._models_dir() / f).exists() for f in ALL_MODEL_FILES)

    async def load_model(self, model_size: str = "default") -> None:
        if self.model is not None:
            return
        if not self._models_cached():
            raise ModelNotCachedError("ACE-Step GGUF models are not downloaded. Use the Model Downloads page first.")
        self.model = True  # Mark as loaded (models are on disk, server starts on demand)
        self.load_error = None

    def _on_unload(self):
        if self._server_process and self._server_process.poll() is None:
            self._server_process.terminate()
            try:
                self._server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._server_process.kill()
        self._server_process = None
        self.model = None

    def _after_unload(self):
        pass

    def _build_request(
        self,
        prompt: str,
        lyrics: str = "",
        duration_seconds: float = 30.0,
        genre: str = "",
        mood: str = "",
        tempo: int | None = None,
        vocal_language: str = "en",
    ) -> dict:
        """Build an AceRequest JSON for acestep.cpp."""
        tags = []
        if genre:
            tags.append(genre)
        if mood:
            tags.append(mood)
        if tempo:
            tags.append(f"{tempo} BPM")

        caption = f"{', '.join(tags)}, {prompt}".strip(", ")
        if not caption:
            caption = prompt

        return {
            "caption": caption,
            "lyrics": lyrics or "",
            "duration": duration_seconds,
            "vocal_language": vocal_language,
            "task_type": "text2music",
        }

    async def generate(
        self,
        prompt: str,
        lyrics: str = "",
        duration_seconds: float = 30.0,
        genre: str = "",
        mood: str = "",
        tempo: int | None = None,
        seed: int | None = None,
        vocal_language: str = "en",
    ) -> tuple[np.ndarray, int]:
        """Generate music via the ace-lm + ace-synth CLI pipeline."""
        lm_bin = find_ace_lm()
        synth_bin = find_ace_synth()

        if lm_bin is None or synth_bin is None:
            raise RuntimeError(
                "acestep.cpp binaries not found. Build acestep.cpp and place ace-lm/ace-synth "
                "in data/models/acestep/, or set TWENTYLABS_ACESTEP_ACE-LM and TWENTYLABS_ACESTEP_ACE-SYNTH."
            )

        if not self._models_cached():
            raise ModelNotCachedError("ACE-Step GGUF models are not downloaded. Use the Model Downloads page first.")

        models_dir = self._models_dir()
        timeout_s = float(os.environ.get("TWENTYLABS_ACESTEP_TIMEOUT", DEFAULT_TIMEOUT_S))

        request = self._build_request(
            prompt=prompt,
            lyrics=lyrics,
            duration_seconds=duration_seconds,
            genre=genre,
            mood=mood,
            tempo=tempo,
            vocal_language=vocal_language,
        )

        tmpdir = tempfile.mkdtemp(prefix="acestep-gguf-")
        request_path = str(Path(tmpdir) / "request.json")
        enriched_path = str(Path(tmpdir) / "request0.json")

        try:
            # Write request JSON
            with open(request_path, "w") as f:
                json.dump([request], f)

            # Step 1: LM generates lyrics + audio codes
            def _run_lm() -> None:
                args = [
                    str(lm_bin),
                    "--request",
                    request_path,
                    "--lm",
                    str(models_dir / LM_FILE),
                ]
                proc = run_hidden(
                    args,
                    capture_output=True,
                    text=True,
                    timeout=timeout_s,
                    cwd=str(models_dir),
                )
                if proc.returncode != 0:
                    tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-5:]
                    raise RuntimeError(f"ace-lm failed (exit {proc.returncode}): {' | '.join(tail)}")
                if not Path(enriched_path).exists():
                    raise RuntimeError("ace-lm exited 0 but produced no request0.json")

            await asyncio.to_thread(_run_lm)

            # Step 2: DiT + VAE synthesizes audio
            out_wav = str(Path(tmpdir) / "out.wav")

            def _run_synth() -> None:
                args = [
                    str(synth_bin),
                    "--request",
                    enriched_path,
                    "--embedding",
                    str(models_dir / TEXT_ENCODER_FILE),
                    "--dit",
                    str(models_dir / DIT_FILE),
                    "--vae",
                    str(models_dir / VAE_FILE),
                    "--out",
                    out_wav,
                ]
                proc = run_hidden(
                    args,
                    capture_output=True,
                    text=True,
                    timeout=timeout_s,
                    cwd=str(models_dir),
                )
                if proc.returncode != 0:
                    tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-5:]
                    raise RuntimeError(f"ace-synth failed (exit {proc.returncode}): {' | '.join(tail)}")
                # ace-synth outputs to request00.mp3 by default, check for that too
                if not Path(out_wav).exists():
                    # Check for mp3 output
                    mp3_out = str(Path(tmpdir) / "request00.mp3")
                    if Path(mp3_out).exists():
                        raise RuntimeError(
                            "ace-synth produced MP3 instead of WAV. "
                            "Add --wav flag to ace-synth or check acestep.cpp version."
                        )
                    raise RuntimeError("ace-synth exited 0 but produced no audio output")

            await asyncio.to_thread(_run_synth)

            # Load the output
            from ..utils.audio import load_audio

            audio, sr = await asyncio.to_thread(load_audio, out_wav, sample_rate=SAMPLE_RATE)
            return audio.astype(np.float32), sr

        except subprocess.TimeoutExpired:
            raise TimeoutError(
                f"acestep.cpp exceeded {timeout_s:g}s. Try shorter duration or a stronger machine."
            ) from None
        finally:
            try:
                import shutil

                shutil.rmtree(tmpdir, ignore_errors=True)
            except OSError:
                pass


acestep_gguf_backend = AceStepGGUFBackend()
