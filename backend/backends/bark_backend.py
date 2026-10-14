"""Bark small (GGUF) backend via the CrispASR one-shot CLI.

CrispASR (https://github.com/CrispStrobe/CrispASR) is a whisper.cpp fork
with a ``--backend bark`` mode that synthesizes speech from Bark GGUFs.
We run it as a one-shot subprocess per generation — no Python TTS
dependencies and no resident model (cold-load cost is the tradeoff, and
Bark on CPU is slow: RTF ~3.3, so a 10 s sentence can take ~35 s).

The model is ``cstr/bark-small-GGUF``: ``bark-small-q4_k.gguf`` (235 MB,
MIT — sellable; catalog id ``bark-small``, $5). A single GGUF packs the
three GPT-2 sub-models plus the EnCodec 24 kHz decoder — no companion
files.

Voices are the ``suno/bark-small`` speaker embeddings (MIT). The CrispASR
``--voice`` flag takes a *direct .npz path* (speaker presets are NOT
resolved by the CLI — verified in ``crispasr_backend_bark.cpp``), so the
download flow packs each speaker's three ``*_prompt.npy`` arrays into one
**uncompressed** .npz (``np.savez`` — the embedded parser rejects zipped
archives) under ``data/models/bark/voices/``.

13 languages are baked into the speaker prompts: en de es fr hi it ja ko
pl pt ru tr zh. Output is 24 kHz 16-bit mono WAV. Batch TTS, not streaming.
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

HF_REPO = "cstr/bark-small-GGUF"
BACKBONE_QUANT = "q4_k"
VOICES_REPO = "suno/bark-small"
VOICES_SUBDIR = "speaker_embeddings/v2"
SAMPLE_RATE = 24000

BARK_DEFAULT_VOICE = "v2/en_speaker_0"

# Curated preset voices: two speakers per supported language. Speaker
# selection is stable (0 and 5); gender is not documented by Suno, so we
# leave it unset rather than guess. The id doubles as the HF path suffix
# (speaker_embeddings/v2/<lang>_speaker_<n>/...).
BARK_VOICES: list[tuple[str, str, str | None, str]] = [
    (f"v2/{lang}_speaker_{n}", f"{lang.upper()} {n}", None, lang)
    for lang in ["en", "de", "es", "fr", "hi", "it", "ja", "ko", "pl", "pt", "ru", "tr", "zh"]
    for n in (0, 5)
]

# Per-generation wall-clock budget. One-shot CrispASR loads the model per
# call; Bark on a 2-core box is RTF ~3.3, so a 10 s sentence can take
# ~35 s and the pipeline's longer chunks need headroom.
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


def _voices_dir() -> Path:
    from ..config import get_models_dir

    return get_models_dir() / "bark" / "voices"


def voice_npz_path(voice_id: str) -> Path:
    """Map a preset voice id (``v2/en_speaker_0``) to its packed .npz path."""
    return _voices_dir() / f"{voice_id.replace('/', '_')}.npz"


def voice_npy_filenames(voice_id: str) -> list[str]:
    """Return the three speaker-embedding filenames for a voice id."""
    lang, speaker = voice_id.split("/", 1)[1].split("_speaker_")
    return [f"{VOICES_SUBDIR}/{lang}_speaker_{speaker}_{kind}_prompt.npy" for kind in ("semantic", "coarse", "fine")]


def build_tts_args(
    *,
    backbone: str,
    text: str,
    output: str,
    voice_npz: str | None = None,
    seed: int | None = None,
    temperature: float | None = None,
) -> list[str]:
    """Build the ``crispasr --backend bark`` argument list (pure, testable)."""
    args = ["--backend", "bark", "-m", backbone, "--tts", text, "--tts-output", output]
    if voice_npz:
        args += ["--voice", voice_npz]
    if seed is not None:
        args += ["-s", str(seed)]
    if temperature is not None:
        args += ["-temp", str(temperature)]
    return args


class BarkBackend:
    """TTS backend driving the CrispASR bark CLI as one-shot subprocesses."""

    hf_repo = HF_REPO
    sample_rate = SAMPLE_RATE

    def __init__(self) -> None:
        self.load_error: str | None = None

    # -- cache / path resolution -------------------------------------------

    def _is_model_cached(self) -> bool:
        from ..services.model_files import is_model_installed

        return is_model_installed(HF_REPO, f"bark-small-{BACKBONE_QUANT}.gguf")

    def _local_file(self, filename: str) -> str:
        from ..services.model_files import resolve_model_file

        return str(resolve_model_file(HF_REPO, filename))

    def _get_model_path(self, model_size: str) -> str:
        return self._local_file(f"bark-small-{BACKBONE_QUANT}.gguf")

    # -- voice packing ------------------------------------------------------

    def pack_voice_npz(self, voice_id: str) -> Path:
        """Fetch a speaker's three .npy embeddings and pack them into one .npz.

        The CrispASR npz parser (``bark_tts.cpp::bark_set_speaker_npz``)
        expects a *stored* (uncompressed) zip of plain npy blobs — hence
        ``np.savez`` rather than ``np.savez_compressed``.
        """
        out = voice_npz_path(voice_id)
        if out.exists():
            return out

        arrays: dict[str, np.ndarray] = {}
        for filename in voice_npy_filenames(voice_id):
            from ..services.model_files import install_model_file

            path = str(install_model_file(VOICES_REPO, filename))
            # The CrispASR parser matches exact member names
            # ("semantic_prompt" / "coarse_prompt" / "fine_prompt"), so we
            # keep only the kind part of the source filename.
            key = filename.rsplit("/", 1)[-1].removesuffix("_prompt.npy").rsplit("_", 1)[-1] + "_prompt"
            arrays[key] = np.load(path, allow_pickle=False)

        out.parent.mkdir(parents=True, exist_ok=True)
        np.savez(out, **arrays)
        return out

    # -- lifecycle ----------------------------------------------------------

    async def load_model(self, model_size: str) -> None:
        """No resident model — verify the GGUF + binary are available."""
        binary = find_crispasr()
        if binary is None:
            self.load_error = (
                "CrispASR binary not found. Bundle crispasr.exe next to "
                "llama-server.exe in data/models/, or set TWENTYLABS_CRISPASR."
            )
            raise RuntimeError(self.load_error)
        if not self._is_model_cached():
            raise RuntimeError("Bark Small is not downloaded. Use the Model Downloads page to download it first.")
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
        # Bark has no cloning flow in CrispASR (no reference-wav synthesis);
        # a cloned profile falls back to the default preset voice.
        return {
            "voice_type": "preset",
            "preset_engine": "bark_small",
            "preset_voice_id": BARK_DEFAULT_VOICE,
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
            raise RuntimeError("Bark Small is not downloaded. Use the Model Downloads page to download it first.")

        voice_id = voice_prompt.get("preset_voice_id") or BARK_DEFAULT_VOICE
        voice_npz = voice_npz_path(voice_id)
        if not voice_npz.exists():
            raise RuntimeError(
                f"Bark voice '{voice_id}' is not downloaded. Re-run the Bark Small download to fetch its speaker pack."
            )

        backbone = self._local_file(f"bark-small-{BACKBONE_QUANT}.gguf")
        timeout_s = float(os.environ.get("TWENTYLABS_CRISPASR_TIMEOUT", DEFAULT_TIMEOUT_S))
        tmpdir = tempfile.mkdtemp(prefix="bark-")
        out_wav = str(Path(tmpdir) / "out.wav")

        try:
            args = build_tts_args(
                backbone=backbone,
                text=text,
                output=out_wav,
                voice_npz=str(voice_npz),
                seed=seed,
                temperature=temperature,
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
                    raise RuntimeError(f"crispasr failed (exit {proc.returncode}): {' | '.join(tail)}")
                if not Path(out_wav).exists():
                    raise RuntimeError("crispasr exited 0 but produced no WAV output")

            await asyncio.to_thread(_run_sync)
            audio, _sr = await asyncio.to_thread(load_audio, out_wav, sample_rate=SAMPLE_RATE)
            return audio.astype(np.float32), SAMPLE_RATE
        except subprocess.TimeoutExpired:
            raise TimeoutError(
                f"crispasr exceeded {timeout_s:g}s for this generation. Try a shorter text or a stronger machine."
            ) from None
        finally:
            try:
                import shutil

                shutil.rmtree(tmpdir, ignore_errors=True)
            except OSError:  # pragma: no cover - best-effort cleanup
                pass


bark_backend = BarkBackend()
