"""Fish Audio S2 Pro (GGUF) backend via the s2.cpp one-shot CLI.

s2.cpp (https://github.com/rodrigomatta/s2.cpp) is a community-built
pure C++/GGML inference engine for Fish Audio S2 Pro GGUFs -- no Python
dependency, Vulkan GPU or CPU.  We run it as a one-shot subprocess per
generation (cold-load cost is the tradeoff).

The GGUF Q4_K_M (3.4 GB) packs both the Dual-AR transformer weights
and the RVQ audio codec in a single file.  A companion tokenizer.json
(12 MB) is required.

Architecture (~4.56B params):
  Slow-AR: 36-layer Qwen3 (4.13B) -- semantic planning
  Fast-AR: 4-layer transformer (0.42B) -- acoustic codebook gen
  Audio codec: convolutional RVQ (10 codebooks x 4096 entries)

Pipeline:  text -> s2 binary -> output.wav -> PCM
Voices:    preset (v0) or voice cloning via reference audio.
Emotions:  inline [whisper], [angry], etc. — bracket markers passed as instruct.
License:   Fish Audio Research License — non-commercial research only.

Dependencies: None beyond s2.cpp binary and the GGUF + tokenizer.json.
"""

import asyncio
import logging
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from .base import combine_voice_prompts as _combine_voice_prompts

logger = logging.getLogger(__name__)

S2_CPP_REPO = "rodrigomt/s2-pro-gguf"
S2_CPP_GGUF_DEFAULT = "s2-pro-q4_k_m.gguf"
S2_CPP_TOKENIZER = "tokenizer.json"
SAMPLE_RATE = 24000

DEFAULT_TIMEOUT_S = 600.0


def find_s2_cpp() -> Path | None:
    """Resolve the s2.cpp binary (env override, bundled sidecar, PATH)."""
    env_path = os.environ.get("TWENTYLABS_S2_CPP")
    if env_path and Path(env_path).exists():
        return Path(env_path)

    from ..config import get_models_dir

    bundled = get_models_dir() / ("s2.exe" if os.name == "nt" else "s2")
    if bundled.exists():
        return bundled

    exe = "s2.exe" if os.name == "nt" else "s2"
    import shutil

    found = shutil.which(exe)
    return Path(found) if found else None


def _build_s2_args(
    *,
    gguf_path: str,
    tokenizer_path: str,
    text: str,
    output: str,
    ref_audio: str | None = None,
    ref_text: str | None = None,
    seed: int | None = None,
    temperature: float | None = None,
) -> list[str]:
    """Build the ``s2`` argument list."""
    args = ["-m", gguf_path, "-t", tokenizer_path, "-text", text, "-v", "0", "-o", output]
    if ref_audio:
        args += ["-pa", ref_audio]
    if ref_text:
        args += ["-pt", ref_text]
    if seed is not None:
        args += ["-s", str(seed)]
    if temperature is not None:
        args += ["-temp", str(temperature)]
    return args


class FishSpeechS2Backend:
    """TTS backend driving the s2.cpp CLI as one-shot subprocesses."""

    hf_repo = S2_CPP_REPO
    sample_rate = SAMPLE_RATE

    def __init__(self) -> None:
        self.load_error: str | None = None

    def _is_model_cached(self) -> bool:
        from ..services.model_files import is_model_installed

        return is_model_installed(S2_CPP_REPO, S2_CPP_GGUF_DEFAULT) and is_model_installed(
            S2_CPP_REPO, S2_CPP_TOKENIZER
        )

    def _local_file(self, filename: str) -> str:
        from ..services.model_files import resolve_model_file

        return str(resolve_model_file(S2_CPP_REPO, filename))

    def _get_model_path(self, model_size: str) -> str:
        return self._local_file(S2_CPP_GGUF_DEFAULT)

    async def load_model(self, model_size: str) -> None:
        binary = find_s2_cpp()
        if binary is None:
            self.load_error = (
                "s2.cpp binary not found. Bundle s2.exe next to "
                "llama-server.exe in data/models/, or set TWENTYLABS_S2_CPP."
            )
            raise RuntimeError(self.load_error)
        if not self._is_model_cached():
            raise RuntimeError(
                "Fish Audio S2 Pro is not downloaded. Use the Model Downloads page to download it first."
            )
        self.load_error = None

    def unload_model(self) -> None:
        pass

    def is_loaded(self) -> bool:
        return False

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> tuple[dict, bool]:
        return {
            "voice_type": "clone",
            "audio_path": audio_path,
            "reference_text": reference_text,
        }, False

    async def combine_voice_prompts(
        self,
        audio_paths: list[str],
        reference_texts: list[str],
    ) -> tuple[np.ndarray, str]:
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=SAMPLE_RATE)

    async def generate(
        self,
        text: str,
        voice_prompt: dict,
        language: str = "en",
        seed: int | None = None,
        instruct: str | None = None,
        temperature: float | None = None,
    ) -> tuple[np.ndarray, int]:
        # Validate voice cloning input first so empty/missing paths aren't masked by binary errors
        ref_audio = voice_prompt.get("audio_path") if voice_prompt.get("voice_type") == "clone" else None
        if ref_audio is not None and not str(ref_audio).strip():
            raise ValueError("Voice cloning requested but reference audio path is empty")
        if ref_audio and not Path(str(ref_audio)).exists():
            raise ValueError(f"Reference audio not found: {ref_audio}")
        ref_text = voice_prompt.get("reference_text") if ref_audio else None

        gen_text = text
        if instruct:
            # Normalize to bracket form [angry] to match supported_tags / s2.cpp
            clean = instruct.strip().strip("[]() ").strip()
            if clean:
                gen_text = f"[{clean}] {text}"

        binary = find_s2_cpp()
        if binary is None:
            raise RuntimeError(
                "s2.cpp binary not found. Bundle s2.exe next to "
                "llama-server.exe in data/models/, or set TWENTYLABS_S2_CPP."
            )
        if not self._is_model_cached():
            raise RuntimeError(
                "Fish Audio S2 Pro is not downloaded. Use the Model Downloads page to download it first."
            )

        gguf_path = self._local_file(S2_CPP_GGUF_DEFAULT)
        tokenizer_path = self._local_file(S2_CPP_TOKENIZER)

        timeout_s = float(os.environ.get("TWENTYLABS_S2_CPP_TIMEOUT", DEFAULT_TIMEOUT_S))
        tmpdir = tempfile.mkdtemp(prefix="s2-pro-")
        out_wav = str(Path(tmpdir) / "out.wav")

        try:
            args = _build_s2_args(
                gguf_path=gguf_path,
                tokenizer_path=tokenizer_path,
                text=gen_text,
                output=out_wav,
                ref_audio=ref_audio,
                ref_text=ref_text,
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
                    raise RuntimeError(f"s2.cpp failed (exit {proc.returncode}): {' | '.join(tail)}")
                if not Path(out_wav).exists():
                    raise RuntimeError("s2.cpp exited 0 but produced no WAV output")

            await asyncio.to_thread(_run_sync)

            from ..utils.audio import load_audio

            audio, _sr = await asyncio.to_thread(load_audio, out_wav, sample_rate=SAMPLE_RATE)
            return audio.astype(np.float32), SAMPLE_RATE
        except subprocess.TimeoutExpired:
            raise TimeoutError(
                f"s2.cpp exceeded {timeout_s:g}s for this generation. Try a shorter text or a stronger machine."
            ) from None
        finally:
            try:
                import shutil

                shutil.rmtree(tmpdir, ignore_errors=True)
            except OSError:
                pass


fish_speech_s2_backend = FishSpeechS2Backend()
