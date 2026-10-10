"""
Kokoro TTS backend — ONNX Runtime variant.

Torch-free implementation of the Kokoro-82M engine using ``kokoro-onnx``
(``thewh1teagle/kokoro-onnx``) on top of ``onnxruntime``. This is the
preferred Kokoro backend: it removes the ~600 MB torch dependency and runs
fully on CPU (or CUDA/DirectML via the ONNX Runtime provider chain).

The torch backend (``kokoro_backend.KokoroTTSBackend``) remains as a lazy
fallback for hosts that have the ``.pth`` model but not ``kokoro_onnx``.

Model files are the standard Kokoro ONNX release artifacts:
  - ``kokoro-v1.0.onnx``  (the synthesis graph)
  - ``voices-v1.0.bin``   (the single combined voice style bank)

The synthesis graph is fetched from the HuggingFace mirror
``Heliosoph/kokoro-v1.0-onnx`` (an exact re-host of the official
``thewh1teagle/kokoro-onnx`` release). The combined voice bank is only
published as a single file on the project's GitHub release
(``model-files-v1.0/voices-v1.0.bin``); the backend downloads it on demand
into the HuggingFace cache so everything lives in one place offline.
"""

import asyncio
import logging
import os
import threading
from typing import Any

import numpy as np
from huggingface_hub import hf_hub_download

from ..utils.chunked_tts import concatenate_audio_chunks, split_text_into_chunks
from .base import (
    BackendBase,
    combine_voice_prompts as _combine_voice_prompts,
    model_load_progress,
)
from .kokoro_backend import (
    KOKORO_CHUNK_MAX_CHARS,
    KOKORO_CHUNK_TIMEOUT,
    KOKORO_CROSSFADE_MS,
    KOKORO_DEFAULT_VOICE,
    KOKORO_SAMPLE_RATE,
    KOKORO_SINGLE_TIMEOUT,
)

logger = logging.getLogger(__name__)

# HF mirror of the official Kokoro ONNX release (hosts kokoro-v1.0.onnx).
KOKORO_ONNX_REPO = "Heliosoph/kokoro-v1.0-onnx"
KOKORO_ONNX_MODEL_FILE = "kokoro-v1.0.onnx"

# The combined voice bank is only shipped as a single file on the GitHub
# release; we cache it under the same HF cache namespace as the model.
KOKORO_ONNX_VOICES_FILE = "voices-v1.0.bin"
KOKORO_ONNX_VOICES_URL = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
)

# The HF mirror (Heliosoph/kokoro-v1.0-onnx) publishes ONLY the fp32 graph, so
# _onnx_precision.resolve_session_path() always landed on fp32 (~326 MB). The
# upstream thewh1teagle/kokoro-onnx GitHub release publishes the same weights in
# fp16 and int8, and it is already the source of our voices file — so prefer
# those and keep the mirror purely as an fp32 fallback.
#
# Published sizes / correlation vs fp32 (release model-files-v1.1):
#   kokoro-v1.0.onnx      325,505,369 B  baseline
#   kokoro-v1.0.fp16.onnx 163,527,961 B  0.999
#   kokoro-v1.0.int8.onnx 114,119,327 B  0.916
KOKORO_RELEASE_BASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1"

# Ordered best-first: (release_filename, local_filename, expected_bytes).
# local_filename must match _onnx_precision's naming exactly —
# "<stem>.onnx" / "<stem>_int8.onnx" / "<stem>_fp16.onnx" — because that is what
# resolve_session_path() globs for. Deriving it by slicing the release filename
# is wrong here: the stem "kokoro-v1.0" itself ends in ".0", so slicing off
# ".onnx" leaves "kokoro-v1.0.int8.onnx" (dot) instead of "kokoro-v1.0_int8.onnx"
# (underscore) and the resolver silently misses it.
KOKORO_ONNX_VARIANTS: tuple[tuple[str, str, int], ...] = (
    ("kokoro-v1.0.int8.onnx", "kokoro-v1.0_int8.onnx", 114_119_327),
    ("kokoro-v1.0.fp16.onnx", "kokoro-v1.0_fp16.onnx", 163_527_961),
    ("kokoro-v1.0.onnx", "kokoro-v1.0.onnx", 325_505_369),
)

# Map our ISO language codes to the BCP-47-ish codes kokoro_onnx expects.
ONNX_LANG_MAP = {
    "en": "en-us",
    "es": "es",
    "fr": "fr",
    "hi": "hi",
    "it": "it",
    "pt": "pt",
    "ja": "ja",
    "zh": "zh",
}


def is_onnx_available() -> bool:
    """Return True if the kokoro-onnx runtime is importable on this host."""
    try:
        import kokoro_onnx

        return True
    except Exception:
        logger.debug("kokoro_onnx not importable", exc_info=True)
        return False


class KokoroONNXBackend(BackendBase):
    _model_attr = "_model"
    """Kokoro-82M TTS backend — ONNX Runtime, no torch."""

    def __init__(self):
        self._model = None
        self._model_path: str | None = None
        self._voices_path: str | None = None
        self._lock = threading.Lock()
        self.model_size = "default"

    # -- loading -----------------------------------------------------------

    def _variants_root(self) -> str:
        """Directory holding downloaded precision variants of the Kokoro graph."""
        from .. import config

        path = config.get_data_dir() / "models" / "kokoro-onnx"
        os.makedirs(path, exist_ok=True)
        return str(path)

    def _cached_variant(self) -> tuple[str, str] | None:
        """Return ``(path, precision)`` for an already-downloaded variant, if any.

        Delegates to _onnx_precision so the int8 > fp16 > fp32 preference lives in
        one place instead of being reimplemented per engine.
        """
        from ._onnx_precision import resolve_session_path

        try:
            return resolve_session_path(self._variants_root(), "kokoro-v1.0")
        except FileNotFoundError:
            return None

    def _download_best_variant(self) -> str | None:
        """Fetch the smallest published variant that isn't already on disk.

        Returns None when every variant is present (the caller then re-resolves),
        and raises if a download fails so the fp32 mirror can take over.
        """
        root = self._variants_root()
        for release_name, local_name, expected in KOKORO_ONNX_VARIANTS:
            target = os.path.join(root, local_name)
            if os.path.exists(target) and os.path.getsize(target) >= expected * 0.95:
                continue  # already have this one
            logger.info(
                "Kokoro ONNX: fetching %s (~%d MB; int8 is ~212 MB lighter than fp32)",
                release_name,
                expected // (1024 * 1024),
            )
            self._download_file(f"{KOKORO_RELEASE_BASE}/{release_name}", target)
            return target
        return None

    def _resolve_paths(self) -> tuple[str, str]:
        """Locate the ONNX model + voices files.

        Preference order:
          1. an already-downloaded quantized variant (int8 > fp16 > fp32)
          2. download the best variant published on the kokoro-onnx release
          3. fall back to the HF mirror, which only ships fp32

        The combined voice bank is only published on the GitHub release, so it is
        fetched on demand if absent.
        """
        cached = self._cached_variant()
        if cached is not None:
            model_path, precision = cached
            if precision != "fp32":
                logger.info("Kokoro ONNX: using cached %s graph", precision)
            return model_path, self._resolve_voices_path()

        fetched = self._download_best_variant()
        if fetched:
            resolved = self._cached_variant()
            if resolved is not None:
                return resolved[0], self._resolve_voices_path()

        # Fallback: the HF mirror (fp32 only).
        model_fp32 = hf_hub_download(
            repo_id=KOKORO_ONNX_REPO,
            filename=KOKORO_ONNX_MODEL_FILE,
            local_files_only=True,
        )
        from ._onnx_precision import resolve_session_path

        model_path, _precision = resolve_session_path(os.path.dirname(model_fp32), "kokoro-v1.0")
        voices_path = self._resolve_voices_path()
        return model_path, voices_path

    def _resolve_voices_path(self) -> str:
        """Return the path to voices-v1.0.bin, downloading it if missing."""
        cached = self._voices_cached_path()
        if cached is not None:
            return cached

        os.makedirs(os.path.dirname(self._voices_local_path()), exist_ok=True)
        self._download_file(KOKORO_ONNX_VOICES_URL, self._voices_local_path())
        return self._voices_local_path()

    def _voices_local_path(self) -> str:
        return os.path.join(
            os.path.expanduser("~"),
            ".cache",
            "huggingface",
            "hub",
            f"models--{KOKORO_ONNX_REPO.replace('/', '--')}",
            "snapshots",
            "onnx-voices",
            KOKORO_ONNX_VOICES_FILE,
        )

    def _voices_cached_path(self) -> str | None:
        """Return a voices path only if the file is already on disk."""
        try:
            hf_path = hf_hub_download(
                repo_id=KOKORO_ONNX_REPO,
                filename=KOKORO_ONNX_VOICES_FILE,
                local_files_only=True,
            )
            if os.path.getsize(hf_path) > 1_000_000:
                return hf_path
        except Exception:
            logger.debug("Kokoro ONNX voices not in HF cache", exc_info=True)
        local = self._voices_local_path()
        if os.path.exists(local) and os.path.getsize(local) > 1_000_000:
            return local
        return None

    @staticmethod
    def _download_file(url: str, dest: str) -> None:
        """Stream-download ``url`` to ``dest`` with a stall-safe timeout."""
        import requests

        tmp = dest + ".part"
        try:
            with requests.get(url, stream=True, timeout=30, verify=True) as r:
                r.raise_for_status()
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        if chunk:
                            f.write(chunk)
            os.replace(tmp, dest)
        except Exception:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise

    def is_loaded(self) -> bool:
        return self._model is not None

    def _is_model_cached(self, model_size: str = "default") -> bool:
        """True when a Kokoro graph is on disk — quantized variant or HF mirror.

        The voices file is downloaded on-demand during ``load_model`` so it does
        not need to be present for the engine to count as cached.
        """
        # Preferred location: our downloaded precision variants.
        if self._cached_variant() is not None:
            return True

        from .base import is_model_cached

        return is_model_cached(KOKORO_ONNX_REPO, required_files=[KOKORO_ONNX_MODEL_FILE])

    async def load_model(self, model_size: str = "default") -> None:
        if self._model is not None:
            return
        await asyncio.to_thread(self._load_model_sync)

    def _load_model_sync(self) -> None:
        if self._model is not None:
            return
        model_name = "kokoro-onnx"
        is_cached = self._is_model_cached()

        with model_load_progress(model_name, is_cached):
            from kokoro_onnx import Kokoro

            self._model_path, self._voices_path = self._resolve_paths()
            logger.info("Loading Kokoro ONNX from %s ...", self._model_path)
            self._model = Kokoro(self._model_path, self._voices_path)

        logger.info("Kokoro ONNX loaded successfully")

    def _after_unload(self):
        self._model_path = None
        self._voices_path = None

    # unload_model() inherited from BackendBase

    # -- voice prompts -----------------------------------------------------

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> tuple[dict, bool]:
        """Kokoro uses preset voices, not arbitrary-audio cloning."""
        return {
            "voice_type": "preset",
            "preset_engine": "kokoro",
            "preset_voice_id": KOKORO_DEFAULT_VOICE,
        }, False

    async def combine_voice_prompts(
        self,
        audio_paths: list[str],
        reference_texts: list[str],
    ) -> tuple[np.ndarray, str]:
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=KOKORO_SAMPLE_RATE)

    # -- generation --------------------------------------------------------

    async def generate(
        self,
        text: str,
        voice_prompt: dict,
        language: str = "en",
        seed: int | None = None,
        instruct: str | None = None,
        temperature: float | None = None,
    ) -> tuple[np.ndarray, int]:
        """Synthesize ``text`` to audio using the ONNX Kokoro engine.

        Long text is pre-split into short sentence-sized chunks; each chunk is
        generated independently and the results are crossfaded back together,
        mirroring the torch backend's resilient behaviour.
        """
        await self.load_model()

        voice_name = voice_prompt.get("preset_voice_id") or voice_prompt.get("kokoro_voice") or KOKORO_DEFAULT_VOICE
        onnx_lang = ONNX_LANG_MAP.get(language, "en-us")

        chunks = split_text_into_chunks(text, KOKORO_CHUNK_MAX_CHARS)

        if len(chunks) <= 1:
            return await self._generate_chunk(text, voice_name, onnx_lang, seed, KOKORO_SINGLE_TIMEOUT)

        audio_chunks: list[np.ndarray] = []
        for i, chunk in enumerate(chunks):
            chunk_seed = (seed + i) if seed is not None else None
            try:
                audio, _sr = await self._generate_chunk(chunk, voice_name, onnx_lang, chunk_seed, KOKORO_CHUNK_TIMEOUT)
            except TimeoutError as exc:
                # Fail loud: silently dropping sentences corrupts narration.
                # The service layer retries per chunk, so transients recover.
                raise TimeoutError(f"Kokoro-ONNX chunk {i + 1}/{len(chunks)} timed out: {chunk[:80]!r}") from exc
            except Exception as exc:
                raise RuntimeError(f"Kokoro-ONNX chunk {i + 1}/{len(chunks)} failed: {exc}") from exc
            if audio is not None and len(audio):
                audio_chunks.append(audio.astype(np.float32))

        if not audio_chunks:
            raise RuntimeError("Kokoro-ONNX produced no audio for the given text")

        audio = concatenate_audio_chunks(audio_chunks, KOKORO_SAMPLE_RATE, crossfade_ms=KOKORO_CROSSFADE_MS)
        return audio, KOKORO_SAMPLE_RATE

    async def _generate_chunk(
        self,
        chunk_text: str,
        voice_name: str,
        onnx_lang: str,
        seed: int | None,
        timeout: float,
    ) -> tuple[np.ndarray, int]:
        """Generate a single chunk with a wall-clock timeout."""

        def _generate_sync() -> np.ndarray:
            import random

            if seed is not None:
                random.seed(seed)

            audio = self._infer_chunk(chunk_text, voice_name, onnx_lang)
            audio = np.asarray(audio, dtype=np.float32)
            if audio.ndim > 1:
                audio = audio.squeeze()
            return audio

        audio = await asyncio.wait_for(asyncio.to_thread(_generate_sync), timeout=timeout)
        return audio, KOKORO_SAMPLE_RATE

    def _infer_chunk(self, text: str, voice_name: str, onnx_lang: str) -> np.ndarray:
        """Run one inference through the ONNX session."""
        model: Any = self._model
        audio, _sr = model.create(text, voice=voice_name, lang=onnx_lang)
        return np.asarray(audio, dtype=np.float32).squeeze()


# Module-level singleton, mirroring the other backends' convention.
kokoro_onnx_backend = KokoroONNXBackend()
