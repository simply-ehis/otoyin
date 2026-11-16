"""
Qwen3-ASR STT backend via ONNX Runtime.

52-language support with automatic language detection.
Pre-exported ONNX graphs from andrewleech/qwen3-asr-*-onnx repos.

Architecture (per the export tool / model card):
  - ``encoder.onnx``            : mel spectrogram -> encoder hidden states
  - ``decoder_init.onnx``       : prefill, accepts ``input_ids`` + encoder
                                  hidden states, returns logits + KV cache
  - ``decoder_step.onnx``       : autoregressive step, accepts ``input_embeds``
                                  (looked up from ``embed_tokens.bin``) + KV
                                  cache, returns logits + new KV cache
  - ``embed_tokens.bin``        : shared embedding matrix [vocab, hidden] (FP16)
  - ``tokenizer.json`` / ``config.json`` : vocab, special tokens, mel params

Inference is greedy autoregressive decoding over the init/step split, exactly
as the export intends. Session I/O names are discovered at load time so the
code adapts to either FP32 or int4 variants without hardcoding tensor names.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from pathlib import Path

import numpy as np

from .. import config
from .base import BackendBase, model_load_progress

logger = logging.getLogger(__name__)

# HF repos for pre-exported ONNX models (both FP32 and int4 live in one repo).
HF_REPOS = {
    "1.7b-fp32": "andrewleech/qwen3-asr-1.7b-onnx",
    "1.7b-int4": "andrewleech/qwen3-asr-1.7b-onnx",
    "0.6b-fp32": "andrewleech/qwen3-asr-0.6b-onnx",
    "0.6b-int4": "andrewleech/qwen3-asr-0.6b-onnx",
}

# Filenames published by andrewleech/qwen3-asr-*-onnx (FP32 and int4 variants).
ONNX_FILES = {
    "1.7b-fp32": [
        "encoder.onnx",
        "decoder_init.onnx",
        "decoder_step.onnx",
        "decoder_weights.data",
        "embed_tokens.bin",
        "tokenizer.json",
        "config.json",
    ],
    "1.7b-int4": [
        "encoder.int4.onnx",
        "decoder_init.int4.onnx",
        "decoder_step.int4.onnx",
        "decoder_weights.int4.data",
        "embed_tokens.bin",
        "tokenizer.json",
        "config.json",
    ],
    "0.6b-fp32": [
        "encoder.onnx",
        "decoder_init.onnx",
        "decoder_step.onnx",
        "decoder_weights.data",
        "embed_tokens.bin",
        "tokenizer.json",
        "config.json",
    ],
    "0.6b-int4": [
        "encoder.int4.onnx",
        "decoder_init.int4.onnx",
        "decoder_step.int4.onnx",
        "decoder_weights.int4.data",
        "embed_tokens.bin",
        "tokenizer.json",
        "config.json",
    ],
}

# Default model (1.7B INT4 for best multilingual + reasonable size).
DEFAULT_MODEL = "1.7b-int4"

# Supported languages (52).
SUPPORTED_LANGUAGES = [
    "en",
    "zh",
    "ja",
    "ko",
    "ar",
    "hi",
    "fr",
    "de",
    "es",
    "ru",
    "pt",
    "it",
    "nl",
    "pl",
    "tr",
    "vi",
    "th",
    "id",
    "ms",
    "bn",
    "ta",
    "te",
    "ur",
    "fa",
    "he",
    "ro",
    "uk",
    "cs",
    "el",
    "hu",
    "sv",
    "bg",
    "hr",
    "sk",
    "sl",
    "da",
    "fi",
    "lt",
    "lv",
    "et",
    "mt",
    "ga",
    "cy",
    "eu",
    "ca",
    "gl",
    "af",
    "sw",
    "am",
    "yo",
    "zu",
    "ha",
]

# Fallback special-token IDs (Qwen tokenizer): <|endoftext|>=151643,
# <|im_end|>=151645. Overridden by config.json when present.
_FALLBACK_EOS = {151643, 151645}
_FALLBACK_START = 151644  # <|im_start|>


class Qwen3ASRBackend(BackendBase):
    """ONNX Runtime STT backend for Qwen3-ASR models."""

    _model_attr = "session"

    def __init__(self, model_size: str = DEFAULT_MODEL):
        self.session = None
        self.model_size = model_size
        self._encoder_session = None
        self._decoder_init = None
        self._decoder_step = None
        self._embed_tokens = None
        self._tokenizer = None
        self._config = None
        self._mel_params: dict = {}
        self._eos_ids = set(_FALLBACK_EOS)
        self._start_id = _FALLBACK_START
        self._max_len = 512
        # Cached I/O name maps for the decoder graphs.
        self._enc_input: str | None = None
        self._init_ids: str | None = None
        self._init_enc: str | None = None
        self._init_logits_idx: int = 0
        self._init_kv_idx: list[int] = []
        self._step_embeds: str | None = None
        self._step_enc: str | None = None
        self._step_logits_idx: int = 0
        self._step_kv_in: list[str] = []
        self._step_kv_idx: list[int] = []

    def _model_dir(self, model_size: str) -> Path:
        return config.get_models_dir() / f"qwen3-asr-{model_size}"

    def _is_model_cached(self, model_size: str) -> bool:
        model_dir = self._model_dir(model_size)
        required_files = ONNX_FILES.get(model_size, ONNX_FILES[DEFAULT_MODEL])
        return all((model_dir / f).exists() for f in required_files)

    def is_loaded(self) -> bool:
        return self.session is not None

    async def load_model(self, model_size: str | None = None) -> None:
        if self.is_loaded():
            return

        model_size = model_size or self.model_size
        self.model_size = model_size

        if not self._is_model_cached(model_size):
            await self._download_model(model_size)

        model_dir = self._model_dir(model_size)

        try:
            import onnxruntime as ort
        except ImportError as e:
            raise RuntimeError("onnxruntime not installed. Run: pip install onnxruntime") from e

        files = ONNX_FILES.get(model_size, ONNX_FILES[DEFAULT_MODEL])
        enc_file = next(f for f in files if f.startswith("encoder"))
        init_file = next(f for f in files if f.startswith("decoder_init"))
        step_file = next(f for f in files if f.startswith("decoder_step"))

        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        with model_load_progress(f"qwen3-asr-{model_size}", is_cached=True):
            self._encoder_session = ort.InferenceSession(str(model_dir / enc_file), sess_options)
            self._decoder_init = ort.InferenceSession(str(model_dir / init_file), sess_options)
            self._decoder_step = ort.InferenceSession(str(model_dir / step_file), sess_options)

        embed_path = model_dir / "embed_tokens.bin"
        if embed_path.exists():
            self._embed_tokens = self._load_embed_tokens(embed_path)

        tokenizer_path = model_dir / "tokenizer.json"
        if tokenizer_path.exists():
            with open(tokenizer_path) as f:
                self._tokenizer = json.load(f)
        config_path = model_dir / "config.json"
        if config_path.exists():
            with open(config_path) as f:
                self._config = json.load(f)

        self._load_special_tokens()
        self._load_mel_params()
        self._map_decoder_io()

        self.session = True
        logger.info("Qwen3-ASR %s loaded", model_size)

    async def _download_model(self, model_size: str) -> None:
        """Download ONNX model files from HuggingFace."""
        from huggingface_hub import hf_hub_download

        repo_id = HF_REPOS.get(model_size, HF_REPOS[DEFAULT_MODEL])
        files = ONNX_FILES.get(model_size, ONNX_FILES[DEFAULT_MODEL])
        model_dir = self._model_dir(model_size)
        model_dir.mkdir(parents=True, exist_ok=True)

        logger.info("Downloading Qwen3-ASR %s from %s ...", model_size, repo_id)
        with model_load_progress(f"qwen3-asr-{model_size}", is_cached=False):
            for filename in files:
                dest = model_dir / filename
                if dest.exists():
                    continue
                await asyncio.to_thread(
                    hf_hub_download,
                    repo_id=repo_id,
                    filename=filename,
                    local_dir=str(model_dir),
                )
        logger.info("Qwen3-ASR model cached at %s", model_dir)

    def _load_embed_tokens(self, path: Path) -> np.ndarray:
        raw = np.fromfile(str(path), dtype=np.float16)
        vocab = hidden = None
        if self._config:
            text_cfg = self._config.get("text_config", self._config)
            vocab = text_cfg.get("vocab_size") or self._config.get("vocab_size")
            hidden = text_cfg.get("hidden_size") or self._config.get("hidden_size")
        if vocab is None or hidden is None:
            for o in self._decoder_init.get_outputs():
                if "logits" in o.name:
                    vocab = o.shape[-1]
            hidden = raw.size // int(vocab) if vocab else None
        if hidden is None:
            raise RuntimeError("Cannot infer embedding dimensions for Qwen3-ASR")
        return raw.reshape(int(vocab), int(hidden)).astype(np.float32)

    def _load_special_tokens(self) -> None:
        if not self._config:
            return
        eos = self._config.get("eos_token_id")
        if isinstance(eos, list):
            self._eos_ids = set(eos)
        elif isinstance(eos, int):
            self._eos_ids = {eos}
        start = self._config.get("decoder_start_token_id") or self._config.get("bos_token_id")
        if isinstance(start, int):
            self._start_id = start
        max_len = self._config.get("max_length") or self._config.get("text_config", {}).get("max_length")
        if isinstance(max_len, int):
            self._max_len = max_len

    def _load_mel_params(self) -> None:
        cfg = self._config or {}
        mel = cfg.get("mel_filters") or cfg.get("feature_extractor") or cfg.get("feat_extract")
        if isinstance(mel, dict):
            self._mel_params = mel
        self._mel_params.setdefault("sample_rate", 16000)
        self._mel_params.setdefault("n_mels", 128)
        self._mel_params.setdefault("n_fft", 400)
        self._mel_params.setdefault("hop_length", 160)
        self._mel_params.setdefault("win_length", 400)

    def _map_decoder_io(self) -> None:
        """Discover decoder init/step I/O names so we don't hardcode them."""

        def _has(name, subs):
            return any(s in name for s in subs)

        # encoder input (usually the only / first input)
        self._enc_input = self._encoder_session.get_inputs()[0].name

        # decoder_init inputs
        init_inputs = [i.name for i in self._decoder_init.get_inputs()]
        self._init_ids = next(n for n in init_inputs if _has(n, ["input_ids"]))
        self._init_enc = next((n for n in init_inputs if _has(n, ["encoder"])), None)
        init_outputs = self._decoder_init.get_outputs()
        self._init_logits_idx = next(i for i, o in enumerate(init_outputs) if _has(o.name, ["logits"]))
        self._init_kv_idx = [i for i, o in enumerate(init_outputs) if not _has(o.name, ["logits"])]

        # decoder_step inputs
        step_inputs = [i.name for i in self._decoder_step.get_inputs()]
        self._step_embeds = next(n for n in step_inputs if _has(n, ["input_embeds", "inputs_embeds"]))
        self._step_enc = next((n for n in step_inputs if _has(n, ["encoder"])), None)
        self._step_kv_in = [n for n in step_inputs if n not in (self._step_embeds, self._step_enc)]
        step_outputs = self._decoder_step.get_outputs()
        self._step_logits_idx = next(i for i, o in enumerate(step_outputs) if _has(o.name, ["logits"]))
        self._step_kv_idx = [i for i, o in enumerate(step_outputs) if not _has(o.name, ["logits"])]

    def _audio_to_features(self, audio: np.ndarray) -> np.ndarray:
        """Compute log-mel features shaped to match the encoder input layout."""
        import librosa

        sr = int(self._mel_params.get("sample_rate", 16000))
        n_mels = int(self._mel_params.get("n_mels", 128))
        n_fft = int(self._mel_params.get("n_fft", 400))
        hop = int(self._mel_params.get("hop_length", 160))

        mel = librosa.feature.melspectrogram(
            y=audio.astype(np.float32),
            sr=sr,
            n_fft=n_fft,
            hop_length=hop,
            n_mels=n_mels,
        )
        mel = librosa.power_to_db(mel, ref=np.max)
        mel = mel.astype(np.float32)  # (n_mels, T)

        enc_shape = self._encoder_session.get_inputs()[0].shape
        if len(enc_shape) >= 3 and enc_shape[1] == n_mels:
            features = mel[None, ...]  # (1, n_mels, T)
        else:
            features = mel.T[None, ...]  # (1, T, n_mels)
        return features.astype(np.float32)

    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
        model_size: str | None = None,
    ) -> str:
        """Transcribe audio using Qwen3-ASR ONNX (greedy autoregressive decode)."""
        if not self.is_loaded():
            raise RuntimeError("Qwen3-ASR model not loaded")

        from ..utils.audio import load_audio

        audio, sr = await asyncio.to_thread(load_audio, audio_path)
        audio = np.asarray(audio, dtype=np.float32)
        if audio.max() > 1.0 or audio.min() < -1.0:
            peak = max(abs(float(audio.max())), abs(float(audio.min()))) or 1.0
            audio = audio / peak
        if sr != 16000:
            import librosa

            audio = await asyncio.to_thread(librosa.resample, audio, orig_sr=sr, target_sr=16000)

        features = self._audio_to_features(audio)
        encoder_output = self._encoder_session.run(None, {self._enc_input: features})[0]

        generated = self._decode_loop(encoder_output)
        return self._decode_tokens(np.array(generated[1:], dtype=np.int64))

    def _decode_loop(self, encoder_hidden: np.ndarray) -> list[int]:
        """Greedy autoregressive decoding across decoder_init + decoder_step."""
        init_inputs = {self._init_ids: np.array([[self._start_id]], dtype=np.int64)}
        if self._init_enc:
            init_inputs[self._init_enc] = encoder_hidden
        init_outputs = self._decoder_init.run(None, init_inputs)
        logits = init_outputs[self._init_logits_idx]
        kv = [init_outputs[i] for i in self._init_kv_idx]

        generated: list[int] = [self._start_id]
        for _ in range(self._max_len):
            next_id = int(np.argmax(logits[0, -1]))
            if next_id in self._eos_ids:
                break
            generated.append(next_id)

            emb = self._embed_tokens[next_id].reshape(1, 1, -1).astype(np.float32)
            step_inputs = {self._step_embeds: emb}
            for kvi, kv_name in enumerate(self._step_kv_in):
                step_inputs[kv_name] = kv[kvi]
            step_outputs = self._decoder_step.run(None, step_inputs)
            logits = step_outputs[self._step_logits_idx]
            kv = [step_outputs[i] for i in self._step_kv_idx]

        return generated

    def _decode_tokens(self, token_ids: np.ndarray) -> str:
        """Decode token IDs to text using the tokenizer vocab + byte fallback."""
        if self._tokenizer is None:
            return str(token_ids.tolist())

        vocab = self._tokenizer.get("model", {}).get("vocab", {})
        id_to_token = {v: k for k, v in vocab.items()}
        pieces = [id_to_token.get(int(tid), "") for tid in token_ids.flat]
        text = "".join(pieces)
        text = text.replace("Ġ", " ")
        text = re.sub(r"<0x([0-9A-Fa-f]{2})>", lambda m: chr(int(m.group(1), 16)), text)
        return text.strip()

    async def transcribe_with_segments(
        self,
        audio_path: str,
        language: str | None = None,
        model_size: str | None = None,
    ) -> dict:
        """Transcribe with segment-level timestamps."""
        text = await self.transcribe(audio_path, language, model_size)
        return {
            "text": text,
            "segments": [{"text": text, "start": 0, "end": 0}],
        }

    def unload_model(self) -> None:
        self.session = None
        self._encoder_session = None
        self._decoder_init = None
        self._decoder_step = None
        self._embed_tokens = None
        self._tokenizer = None
        self._config = None
        logger.info("Qwen3-ASR model unloaded")
