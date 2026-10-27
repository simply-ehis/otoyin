"""
Kokoro TTS backend implementation.

Wraps the Kokoro-82M model for fast, lightweight text-to-speech.
82M parameters, CPU realtime, 24kHz output, Apache 2.0 license.

Kokoro uses pre-built voice style vectors (not traditional zero-shot cloning
from arbitrary audio). Voice prompts are stored as deferred references to
HF-hosted voice .pt files.

Languages supported (via misaki G2P):
  - American English (a), British English (b)
  - Spanish (e), French (f), Hindi (h), Italian (i), Portuguese (p)
  - Japanese (j) — requires misaki[ja]
  - Chinese (z) — requires misaki[zh]
"""

import asyncio
import logging
import threading

import numpy as np

from ..utils.chunked_tts import concatenate_audio_chunks, split_text_into_chunks
from .base import (
    BackendBase,
    combine_voice_prompts as _combine_voice_prompts,
    get_torch_device,
    model_load_progress,
)

logger = logging.getLogger(__name__)

# HuggingFace repo for model + voice detection
KOKORO_HF_REPO = "hexgrad/Kokoro-82M"
KOKORO_SAMPLE_RATE = 24000

# Default voice if none specified
KOKORO_DEFAULT_VOICE = "af_heart"

# Long-text handling.  Kokoro's KPipeline only splits input on newlines, so a
# long paragraph is fed whole to misaki G2P, which can stall on rare inputs.
# We pre-split into short sentence-sized chunks and bound each chunk with a
# wall-clock timeout so a hung G2P/inference call can never pin the (serial)
# generation queue forever.  A single pathological sentence still gets a
# generous per-call timeout.
KOKORO_CHUNK_MAX_CHARS = 250
KOKORO_CHUNK_TIMEOUT = 120.0
KOKORO_SINGLE_TIMEOUT = 300.0
KOKORO_CROSSFADE_MS = 50

# All available Kokoro voices: (voice_id, display_name, gender, lang_code)
KOKORO_VOICES = [
    # American English female
    ("af_alloy", "Alloy", "female", "en"),
    ("af_aoede", "Aoede", "female", "en"),
    ("af_bella", "Bella", "female", "en"),
    ("af_heart", "Heart", "female", "en"),
    ("af_jessica", "Jessica", "female", "en"),
    ("af_kore", "Kore", "female", "en"),
    ("af_nicole", "Nicole", "female", "en"),
    ("af_nova", "Nova", "female", "en"),
    ("af_river", "River", "female", "en"),
    ("af_sarah", "Sarah", "female", "en"),
    ("af_sky", "Sky", "female", "en"),
    # American English male
    ("am_adam", "Adam", "male", "en"),
    ("am_echo", "Echo", "male", "en"),
    ("am_eric", "Eric", "male", "en"),
    ("am_fenrir", "Fenrir", "male", "en"),
    ("am_liam", "Liam", "male", "en"),
    ("am_michael", "Michael", "male", "en"),
    ("am_onyx", "Onyx", "male", "en"),
    ("am_puck", "Puck", "male", "en"),
    ("am_santa", "Santa", "male", "en"),
    # British English female
    ("bf_alice", "Alice", "female", "en"),
    ("bf_emma", "Emma", "female", "en"),
    ("bf_isabella", "Isabella", "female", "en"),
    ("bf_lily", "Lily", "female", "en"),
    # British English male
    ("bm_daniel", "Daniel", "male", "en"),
    ("bm_fable", "Fable", "male", "en"),
    ("bm_george", "George", "male", "en"),
    ("bm_lewis", "Lewis", "male", "en"),
    # Spanish
    ("ef_dora", "Dora", "female", "es"),
    ("em_alex", "Alex", "male", "es"),
    ("em_santa", "Santa", "male", "es"),
    # French
    ("ff_siwis", "Siwis", "female", "fr"),
    # Hindi
    ("hf_alpha", "Alpha", "female", "hi"),
    ("hf_beta", "Beta", "female", "hi"),
    ("hm_omega", "Omega", "male", "hi"),
    ("hm_psi", "Psi", "male", "hi"),
    # Italian
    ("if_sara", "Sara", "female", "it"),
    ("im_nicola", "Nicola", "male", "it"),
    # Japanese
    ("jf_alpha", "Alpha", "female", "ja"),
    ("jf_gongitsune", "Gongitsune", "female", "ja"),
    ("jf_nezumi", "Nezumi", "female", "ja"),
    ("jf_tebukuro", "Tebukuro", "female", "ja"),
    ("jm_kumo", "Kumo", "male", "ja"),
    # Portuguese
    ("pf_dora", "Dora", "female", "pt"),
    ("pm_alex", "Alex", "male", "pt"),
    ("pm_santa", "Santa", "male", "pt"),
    # Chinese
    ("zf_xiaobei", "Xiaobei", "female", "zh"),
    ("zf_xiaoni", "Xiaoni", "female", "zh"),
    ("zf_xiaoxiao", "Xiaoxiao", "female", "zh"),
    ("zf_xiaoyi", "Xiaoyi", "female", "zh"),
]

# Map our ISO language codes to Kokoro lang_code characters
LANG_CODE_MAP = {
    "en": "a",  # American English
    "es": "e",
    "fr": "f",
    "hi": "h",
    "it": "i",
    "pt": "p",
    "ja": "j",
    "zh": "z",
}


class KokoroTTSBackend(BackendBase):
    _model_attr = "_model"
    """Kokoro-82M TTS backend — tiny, fast, CPU-friendly."""

    def __init__(self):
        self._model = None
        self._pipelines: dict = {}  # lang_code -> KPipeline
        self._pipeline_lock = threading.Lock()
        self._device: str | None = None
        self.model_size = "default"

    def _get_device(self) -> str:
        """Select device. Kokoro supports CUDA and CPU. MPS needs fallback env var."""
        device = get_torch_device(allow_mps=False)
        # Kokoro can use MPS but requires PYTORCH_ENABLE_MPS_FALLBACK=1
        # For now, skip MPS to avoid user confusion — CPU is already realtime
        return device

    @property
    def device(self) -> str:
        if self._device is None:
            self._device = self._get_device()
        return self._device

    def is_loaded(self) -> bool:
        return self._model is not None

    def _get_model_path(self, model_size: str) -> str:
        return KOKORO_HF_REPO

    def _is_model_cached(self, model_size: str = "default") -> bool:
        """Check if Kokoro model files are in the app folder.

        NOTE: the third-party kokoro loader (KModel/KPipeline) resolves by
        repo id internally, so its own cache behavior is library-managed.
        """
        from ..services.model_files import is_snapshot_installed

        return is_snapshot_installed(KOKORO_HF_REPO)

    async def load_model(self, model_size: str = "default") -> None:
        """Load the Kokoro model."""
        if self._model is not None:
            return
        await asyncio.to_thread(self._load_model_sync)

    def _load_model_sync(self):
        """Synchronous model loading."""
        model_name = "kokoro"
        is_cached = self._is_model_cached()

        with model_load_progress(model_name, is_cached):
            from kokoro import KModel

            device = self.device
            logger.info(f"Loading Kokoro-82M on {device}...")

            self._model = KModel(repo_id=KOKORO_HF_REPO).to(device).eval()

        logger.info("Kokoro-82M loaded successfully")

    def _get_pipeline(self, lang_code: str):
        """Get or create a KPipeline for the given language code."""
        kokoro_lang = LANG_CODE_MAP.get(lang_code, "a")

        with self._pipeline_lock:
            if kokoro_lang not in self._pipelines:
                from kokoro import KPipeline

                # Create pipeline with our existing model (no redundant model loading)
                self._pipelines[kokoro_lang] = KPipeline(
                    lang_code=kokoro_lang,
                    repo_id=KOKORO_HF_REPO,
                    model=self._model,
                )

            return self._pipelines[kokoro_lang]

    def _after_unload(self):
        self._pipelines.clear()

    # unload_model() inherited from BackendBase

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> tuple[dict, bool]:
        """
        Create voice prompt for Kokoro.

        Kokoro doesn't do traditional voice cloning from arbitrary audio.
        When called for a cloned profile (fallback), uses the default voice.
        For preset profiles, the voice_prompt dict is built by the profile
        service and bypasses this method entirely.
        """
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
        """Combine voice prompts — uses base implementation for audio concatenation."""
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=KOKORO_SAMPLE_RATE)

    async def generate(
        self,
        text: str,
        voice_prompt: dict,
        language: str = "en",
        seed: int | None = None,
        instruct: str | None = None,
        temperature: float | None = None,
    ) -> tuple[np.ndarray, int]:
        """
        Generate audio from text using Kokoro.

        Long text is pre-split into short sentence-sized chunks and each chunk
        is generated independently with a wall-clock timeout.  A chunk that
        hangs (Kokoro's G2P can stall on rare inputs) or errors is skipped, so
        one bad sentence never blocks the whole request or the serial
        generation queue.  Successful chunks are crossfaded back together.

        Args:
            text: Text to synthesize
            voice_prompt: Dict with kokoro_voice / preset_voice_id key
            language: Language code
            seed: Random seed for reproducibility
            instruct: Not supported by Kokoro (ignored)

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        await self.load_model()

        voice_name = voice_prompt.get("preset_voice_id") or voice_prompt.get("kokoro_voice") or KOKORO_DEFAULT_VOICE

        chunks = split_text_into_chunks(text, KOKORO_CHUNK_MAX_CHARS)

        # Fast path: a single short sentence — one bounded call.
        if len(chunks) <= 1:
            return await self._generate_chunk(text, voice_name, language, seed, KOKORO_SINGLE_TIMEOUT)

        audio_chunks: list[np.ndarray] = []
        for i, chunk in enumerate(chunks):
            chunk_seed = (seed + i) if seed is not None else None
            try:
                audio, _sr = await self._generate_chunk(chunk, voice_name, language, chunk_seed, KOKORO_CHUNK_TIMEOUT)
            except TimeoutError as exc:
                # Fail loud: silently dropping sentences corrupts narration.
                # The service layer retries per chunk, so transients recover.
                raise TimeoutError(f"Kokoro chunk {i + 1}/{len(chunks)} timed out (hung G2P/inference)") from exc
            except Exception as exc:
                raise RuntimeError(f"Kokoro chunk {i + 1}/{len(chunks)} failed: {exc}") from exc
            if audio is not None and len(audio):
                audio_chunks.append(audio.astype(np.float32))

        if not audio_chunks:
            raise RuntimeError("Kokoro produced no audio for the given text")

        audio = concatenate_audio_chunks(audio_chunks, KOKORO_SAMPLE_RATE, crossfade_ms=KOKORO_CROSSFADE_MS)
        return audio, KOKORO_SAMPLE_RATE

    async def generate_stream(
        self,
        text: str,
        voice_prompt: dict,
        language: str = "en",
        seed: int | None = None,
        instruct: str | None = None,
        temperature: float | None = None,
    ):
        await self.load_model()

        voice_name = voice_prompt.get("preset_voice_id") or voice_prompt.get("kokoro_voice") or KOKORO_DEFAULT_VOICE

        chunks = split_text_into_chunks(text, KOKORO_CHUNK_MAX_CHARS)

        if len(chunks) <= 1:
            audio, sr = await self._generate_chunk(text, voice_name, language, seed, KOKORO_SINGLE_TIMEOUT)
            if audio is not None and len(audio):
                import numpy as np

                yield audio.astype(np.float32), sr, True
            return

        for i, chunk in enumerate(chunks):
            chunk_seed = (seed + i) if seed is not None else None
            try:
                audio, _sr = await self._generate_chunk(chunk, voice_name, language, chunk_seed, KOKORO_CHUNK_TIMEOUT)
            except Exception as exc:
                raise RuntimeError(f"Kokoro chunk {i + 1}/{len(chunks)} failed: {exc}") from exc
            if audio is not None and len(audio):
                import numpy as np

                is_final = i == len(chunks) - 1
                yield audio.astype(np.float32), KOKORO_SAMPLE_RATE, is_final

    async def _generate_chunk(
        self,
        chunk_text: str,
        voice_name: str,
        language: str,
        seed: int | None,
        timeout: float,
    ) -> tuple[np.ndarray, int]:
        """Generate one chunk with a wall-clock *timeout* (seconds).

        Runs Kokoro's synchronous ``KPipeline`` in a worker thread and bounds
        the wait with ``asyncio.wait_for``.  On timeout a ``TimeoutError`` is
        raised so the caller can retry or fail the synthesis — callers must
        never silently skip the chunk (dropped sentences corrupt narration).
        Note: a Python worker thread cannot be force-killed, so the stalled thread lingers until it
        naturally exits; for a guaranteed kill a process-isolated worker would
        be required.  Under normal load chunks finish in well under a second,
        so pool exhaustion is not a concern in practice.
        """

        def _generate_sync() -> np.ndarray:
            import torch

            if seed is not None:
                torch.manual_seed(seed)
                if torch.cuda.is_available():
                    torch.cuda.manual_seed(seed)

            pipeline = self._get_pipeline(language)
            pieces: list[np.ndarray] = []
            for result in pipeline(chunk_text, voice=voice_name, speed=1.0):
                if result.audio is not None:
                    piece = result.audio
                    if isinstance(piece, torch.Tensor):
                        piece = piece.detach().cpu().numpy()
                    pieces.append(piece.squeeze())

            if not pieces:
                return np.zeros(KOKORO_SAMPLE_RATE, dtype=np.float32)
            return np.concatenate(pieces).astype(np.float32)

        audio = await asyncio.wait_for(asyncio.to_thread(_generate_sync), timeout=timeout)
        return audio, KOKORO_SAMPLE_RATE
