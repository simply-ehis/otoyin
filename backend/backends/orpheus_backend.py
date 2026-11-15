"""
Orpheus 3B TTS backend (lex-au/Orpheus-3b-FT).

3-billion parameter TTS model served by the native llama.cpp server sidecar
(GGUF quantized, Vulkan) with the SNAC 24kHz neural audio codec for
token-to-waveform decoding.

Pipeline:  text → llama-server.exe → <custom_token_XXX> stream → SNAC ONNX → PCM

Voices:    tara, leah, jess, leo, dan, mia, zac, zoe (preset, no cloning).
Emotions:  inline tags — <laugh>, <sigh>, <cough>, <sniffle>, <groan>,
           <yawn>, <gasp> — inserted in the input text.

Dependencies: onnxruntime (SNAC); the bundled llama-server.exe serves the GGUF.
No PyTorch required.
License: Apache-2.0 (code) / Orpheus-TTS license (weights).
"""

from __future__ import annotations

import asyncio
import logging
import re
import threading

import numpy as np

from .base import BackendBase, model_load_progress
from .gguf_runner import GGUFServerProcess

logger = logging.getLogger(__name__)

GGUF_REPOS = {
    "Q4_K_M": ("lex-au/Orpheus-3b-FT-Q4_K_M.gguf", "Orpheus-3b-FT-Q4_K_M.gguf"),
    "Q8_0": ("lex-au/Orpheus-3b-FT-Q8_0.gguf", "Orpheus-3b-FT-Q8_0.gguf"),
}

SNAC_REPO = "onnx-community/snac_24khz-ONNX"
SNAC_FILENAME = "onnx/decoder_model.onnx"

SAMPLE_RATE = 24000
MAX_TOKENS = 2048
REPETITION_PENALTY = 1.3
TEMPERATURE = 0.8

# Orpheus custom-token pattern: <custom_token_NNNN>
_TOKEN_RE = re.compile(r"<custom_token_(\d+)>")

# Voice name → capitalized prefix for the prompt
_VOICES = ("tara", "leah", "jess", "leo", "dan", "mia", "zac", "zoe")


# ──────────────────────────── SNAC decoder ────────────────────────────


def _token_to_code(token_id: int, index: int) -> int | None:
    """Convert a single Orpheus custom-token ID to a SNAC codebook entry.

    ``index`` is the position within the 7-token frame (0-6).
    Returns ``None`` if the decoded code is out of the valid 12-bit range.
    """
    code = token_id - 10 - (index * 4096)
    return code if 0 <= code <= 4095 else None


def _decode_tokens(token_ids: list[int], snac_session) -> np.ndarray:
    """Convert Orpheus token IDs → PCM float32 audio via SNAC ONNX.

    Frames are groups of 7 tokens.  The deinterleaving follows the reference
    Orpheus-TTS decoder exactly:
      level 0 (1 code):  token[i+0]
      level 1 (2 codes): token[i+1], token[i+4]
      level 2 (4 codes): token[i+2], token[i+3], token[i+5], token[i+6]
    """
    frames: list[list[int]] = []
    for i in range(0, len(token_ids) - len(token_ids) % 7, 7):
        group = token_ids[i : i + 7]
        codes = [_token_to_code(t, j) for j, t in enumerate(group)]
        if any(c is None for c in codes):
            continue
        frames.append(codes)

    if not frames:
        return np.array([], dtype=np.float32)

    arr = np.array(frames, dtype=np.int64)  # [num_frames, 7]
    num_frames = arr.shape[0]

    # Deinterleave into 3 SNAC levels matching the reference decoder.
    codes_0 = arr[:, 0]  # [T]
    codes_1 = np.stack([arr[:, 1], arr[:, 4]], axis=0)  # [2, T]
    codes_2 = np.stack([arr[:, 2], arr[:, 3], arr[:, 5], arr[:, 6]], axis=0)  # [4, T]

    # SNAC expects [1, 3, max_level_size, T] — pad level 0 (1 code) and level 1 (2 codes) to 4.
    padded = np.zeros((3, 4, num_frames), dtype=np.int64)
    padded[0, 0, :] = codes_0
    padded[1, :2, :] = codes_1
    padded[2, :, :] = codes_2

    input_tensor = padded[np.newaxis, ...]  # [1, 3, 4, T]
    audio = snac_session.run(None, {"input": input_tensor})[0]
    # SNAC overlap-add: extract the valid 2048-sample centre of each block.
    audio = audio.flatten()
    return audio.astype(np.float32)


# ──────────────────────────── Backend ─────────────────────────────────


class OrpheusBackend(BackendBase):
    _model_attr = "llm"
    """Orpheus 3B: GGUF via llama.cpp server sidecar + SNAC ONNX decoder."""

    def __init__(self):
        self.llm = None
        self._snac_session = None
        self._lock = threading.Lock()
        self._current_quant: str | None = None
        self.load_error: str | None = None

    def is_loaded(self) -> bool:
        return self.llm is not None and self.llm.is_alive

    def _is_model_cached(self, model_size: str | None = None) -> bool:
        from ..services.model_files import is_model_installed

        quant = model_size or "Q4_K_M"
        repo, filename = GGUF_REPOS.get(quant, GGUF_REPOS["Q4_K_M"])
        return is_model_installed(repo, filename)

    async def load_model(self, model_size: str = "Q8_0") -> None:
        # Guard on is_loaded() (sidecar health), not just a non-None handle,
        # so a crashed sidecar is detected and re-spawned instead of reused.
        if self.is_loaded() and self._current_quant == model_size:
            return
        if self.llm is not None:
            self.unload_model()
        # Single cache check (also feeds the model_load_progress guard); the
        # actual download happens in _load_model_sync, outside the lock.
        is_cached = self._is_model_cached(model_size)
        await asyncio.to_thread(self._load_model_sync, model_size, is_cached)

    def _ensure_cached(self, quant: str | None = None, progress_cb=None) -> str:
        """Download the Orpheus GGUF if needed; return the local path.

        ``progress_cb(completed, total)`` is invoked during download (used to
        stream first-run progress to the client). ``quant`` defaults to Q4_K_M
        so cache checks from callers that don't pin a quant still work.
        """
        from ..services.model_files import install_model_file, resolve_model_file

        quant = quant or "Q4_K_M"
        if quant not in GGUF_REPOS:
            raise ValueError(f"Unknown Orpheus quant: {quant}. Use Q4_K_M or Q8_0.")
        repo, filename = GGUF_REPOS[quant]
        if progress_cb is not None:
            return str(
                install_model_file(
                    repo,
                    filename,
                    progress_callbacks=[
                        lambda p: progress_cb(getattr(p, "completed", 0) or 0, getattr(p, "total", 0) or 0)
                    ],
                )
            )
        return str(resolve_model_file(repo, filename))

    def _start_server(self, quant: str, model_path: str) -> None:
        """Spawn the llama.cpp server sidecar serving the GGUF."""
        self.llm = GGUFServerProcess(model_path, n_ctx=2048, n_gpu_layers=-1)
        self.llm.start()
        self._current_quant = quant

    def _load_model_sync(self, quant: str = "Q8_0", is_cached: bool | None = None) -> None:
        if quant not in GGUF_REPOS:
            raise ValueError(f"Unknown Orpheus quant: {quant}. Use Q4_K_M or Q8_0.")
        if is_cached is None:
            is_cached = self._is_model_cached(quant)

        # Download (or fetch cached path) OUTSIDE the lock, so the multi-minute
        # network/disk fetch can't block unload_model() (idle scheduler) or a
        # concurrent generate(). model_load_progress also raises
        # ModelNotCachedError when is_cached is False (no-default-model policy).
        with model_load_progress("orpheus-3b", is_cached):
            logger.info("Downloading Orpheus %s GGUF …", quant)
            model_path = self._ensure_cached(quant)

        # Only the sidecar spawn + handle assignment is the critical section.
        with self._lock:
            self.load_error = None
            if self.llm is not None:
                return
            try:
                self._start_server(quant, model_path)
            except Exception as exc:
                self.llm = None
                self.load_error = str(exc)
                logger.warning("Orpheus sidecar start failed: %s", exc)
                raise

        # SNAC decoder loads independently of the sidecar (no shared state).
        self._load_snac()
        logger.info("Orpheus %s loaded (SNAC=%s)", quant, self._snac_backend_name)

    def _load_snac(self) -> None:
        """Load the SNAC 24kHz decoder — onnxruntime-only."""
        from ..services.model_files import resolve_model_file

        snac_path = str(resolve_model_file(SNAC_REPO, SNAC_FILENAME))
        try:
            import onnxruntime as ort
        except ImportError as exc:
            raise RuntimeError(
                "onnxruntime is required for Orpheus orpheus (llama-server + SNAC ONNX). "
                "Reinstall with: pip install onnxruntime"
            ) from exc

        self._snac_session = ort.InferenceSession(snac_path, providers=["CPUExecutionProvider"])
        self._snac_backend_name = "onnx"
        self._decode_fn = self._decode_with_onnx

    def _decode_with_onnx(self, token_ids: list[int]) -> np.ndarray:
        return _decode_tokens(token_ids, self._snac_session)

    def _on_unload(self):
        self.llm.stop()

    def unload_model(self):
        with self._lock:
            super().unload_model()

    def _after_unload(self):
        self._snac_session = None
        self._current_quant = None
        self.load_error = None

    async def create_voice_prompt(
        self,
        audio_path: str | None = None,
        reference_text: str = "",
        use_cache: bool = True,
    ) -> tuple[dict, bool]:
        """Orpheus has preset voices — ignore reference audio, return default."""
        return {"voice": "tara"}, False

    async def combine_voice_prompts(self, prompts: list[dict]) -> dict:
        if not prompts:
            raise ValueError("No voice prompts to combine")
        return prompts[0]

    async def generate(
        self,
        text: str,
        voice_prompt: dict,
        language: str = "en",
        seed: int | None = None,
        instruct: str | None = None,
        temperature: float | None = None,
    ) -> tuple[np.ndarray, int]:
        await self.load_model()

        voice = voice_prompt.get("voice", "tara")
        if voice not in _VOICES:
            voice = "tara"

        temp = temperature if temperature is not None else TEMPERATURE
        return await asyncio.to_thread(self._generate_sync, text, voice, temp, seed, instruct)

    def _generate_sync(
        self,
        text: str,
        voice: str,
        temperature: float,
        seed: int | None = None,
        instruct: str | None = None,
    ) -> tuple[np.ndarray, int]:
        prompt = f"{voice.capitalize()}: {text}\n"
        raw = self.llm.text_completion(
            prompt=prompt,
            max_tokens=MAX_TOKENS,
            temperature=temperature,
            repeat_penalty=REPETITION_PENALTY,
            seed=seed,
            stop=[f"\n{v.capitalize()}:" for v in _VOICES] + ["\n\n", "<|eot_id|>"],
        )
        token_ids = [int(m) for m in _TOKEN_RE.findall(raw)]

        if not token_ids:
            logger.warning("Orpheus produced no custom tokens from output: %.120s…", raw)
            return np.zeros(SAMPLE_RATE, dtype=np.float32), SAMPLE_RATE

        audio = self._decode_fn(token_ids)
        return audio, SAMPLE_RATE


# Singleton used by the routes/services layer.
orpheus_backend = OrpheusBackend()
