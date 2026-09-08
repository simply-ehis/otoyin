"""
Backend protocols, the declarative ModelConfig, and engine registries.

This module defines the public type surface for the backends package:
- :class:`ModelConfig` — declarative descriptor for a downloadable model variant.
- The ``*Backend`` :class:`~typing.Protocol` definitions that every backend
  implementation conforms to (TTS, STT, VC, LLM, Music).
- The supported-engine registries the factory functions dispatch on.
"""

import logging
import threading
from dataclasses import dataclass, field
from typing import Any, Protocol

import numpy as np
from typing_extensions import runtime_checkable

logger = logging.getLogger(__name__)

DEFAULT_LLM_TEMPERATURE = 0.7

LANGUAGE_CODE_TO_NAME = {
    "zh": "chinese",
    "en": "english",
    "ja": "japanese",
    "ko": "korean",
    "de": "german",
    "fr": "french",
    "ru": "russian",
    "pt": "portuguese",
    "es": "spanish",
    "it": "italian",
}


@dataclass
class PresetVoiceConfig:
    """Structured preset voice entry for models with built-in voices."""

    id: str  # e.g. "af_heart", "Vivian"
    name: str  # Display name e.g. "Heart", "Vivian"
    gender: str | None = None  # "female", "male", or None
    language: str | None = None  # primary language code


@dataclass
class ModelConfig:
    """Declarative config for a downloadable model variant."""

    model_name: str  # e.g. "zonos-v0.1", "kokoro"
    display_name: str  # e.g. "Zyphra Zonos v0.1"
    engine: str  # e.g. "zonos", "kokoro"
    hf_repo_id: str  # e.g. "YatharthS/LuxTTS"
    model_size: str = "default"
    size_mb: int = 0
    needs_trim: bool = False
    supports_instruct: bool = False
    # Capability flags — drive the UI (voice-selection mode, emotion/tag inputs).
    clone_voice: bool = False  # zero-shot cloning from reference audio
    emotion_control: bool = False  # emotion/style editing (e.g. [Angry], whisper)
    paralinguistic_tags: bool = False  # inline [laugh]/[uhm] style tags in text
    voice_design: bool = False  # describe a voice via text attributes (no reference audio)
    supports_editing: bool = False  # audio editing (in-the-wild) beyond plain TTS
    gpu_only: bool = False  # requires CUDA GPU (no CPU fallback) — UI disables on CPU hosts
    min_ram_mb: int = 0  # minimum system RAM (MB) for comfortable use; 0 = auto-estimate from size_mb
    min_vram_mb: int = 0  # minimum GPU VRAM (MB) for comfortable use; 0 = auto-estimate from size_mb
    quant: str | None = None  # quantization used for download/load (e.g. "Q8_0")
    supported_tags: list[str] = field(default_factory=list)  # inline [tag] vocabulary (paralinguistic/emotion)
    languages: list[str] = field(default_factory=lambda: ["en"])
    preset_voices: list[str] = field(default_factory=list)  # fixed voice presets (e.g. KittenTTS)
    structured_preset_voices: list[PresetVoiceConfig] = field(default_factory=list)  # rich voice metadata
    supports_voice_mixing: bool = False  # True for Kokoro (voices can be blended)
    # Quality scoring (0-10) — reflects capability, quality, and value within
    # the model's category.  10 = best-in-class; scores are per-category so
    # TTS scores are only compared against other TTS models, etc.
    quality_score: int = 0  # 0-10, set in config files
    category: str = "tts"  # tts | stt | llm | music | sfx | vc
    # On-demand pip dependencies — installed automatically when the model
    # is downloaded. Empty list = no extra pip deps needed (uses base install
    # or a binary sidecar like llama-server/crispasr).
    pip_packages: list[str] = field(default_factory=list)
    # Dedicated venv name for engines with conflicting deps (e.g. "rvc"
    # pins numpy<=1.23.5). If set, pip installs into data/venvs/{venv_name}/
    # instead of the main environment. None = install into main env.
    venv_name: str | None = None

    def __post_init__(self):
        """Validate quantization field based on engine type."""
        self._validate_quant()

    def _validate_quant(self):
        """Validate quantization field based on engine type."""
        if self.engine == "gguf_llm":
            valid_quants = {
                "Q4_K_M",
                "Q5_K_M",
                "Q8_0",
                "Q4_K_S",
                "Q6_K",
                "Q2_K",
                "Q3_K_M",
                "Q3_K_L",
                "Q3_K_S",
                "Q5_K_S",
                "Q4_0",
            }
            if self.quant and self.quant not in valid_quants:
                raise ValueError(f"GGUF LLM must use valid quant: {valid_quants}, got {self.quant}")
            if not self.quant:
                # Default to Q4_K_M for GGUF LLM
                self.quant = "Q4_K_M"

        elif self.engine in {"neutts_2e", "orpheus"}:
            # GGUF-based TTS - must have quant
            if not self.quant:
                raise ValueError(f"Engine {self.engine} must have quant field")

        elif self.engine in {
            "kokoro",
            "pocket_tts",
            "parler_tts",
            "kitten_tts",
            "moss_tts_nano",
            "stable_audio",
        }:
            # ONNX TTS models - quant optional, will be INT8 quantized in pipeline
            if not self.quant:
                self.quant = "int8"

        elif self.engine in {"acestep", "heartmula", "sa3_sfx", "minimax_music3"}:
            # Music generation models
            if not self.quant:
                self.quant = "bf16" if self.engine == "acestep" else "Q8_0"


@runtime_checkable
class TTSBackend(Protocol):
    """Protocol for TTS backend implementations.

    Each backend class should define ``MODEL_CONFIGS`` as a class variable
    listing its ``ModelConfig`` entries.
    """

    async def load_model(self, model_size: str) -> None:
        """Load TTS model."""
        ...

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> tuple[dict, bool]:
        """
        Create voice prompt from reference audio.

        Returns:
            Tuple of (voice_prompt_dict, was_cached)
        """
        ...

    async def combine_voice_prompts(
        self,
        audio_paths: list[str],
        reference_texts: list[str],
    ) -> tuple[np.ndarray, str]:
        """
        Combine multiple voice prompts.

        Returns:
            Tuple of (combined_audio_array, combined_text)
        """
        ...

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
        Generate audio from text.

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        ...

    def unload_model(self) -> None:
        """Unload model to free memory."""
        ...

    def is_loaded(self) -> bool:
        """Check if model is loaded."""
        ...

    def _get_model_path(self, model_size: str) -> str:
        """
        Get model path for a given size.

        Returns:
            Model path or HuggingFace Hub ID
        """
        ...


@runtime_checkable
class STTBackend(Protocol):
    """Protocol for STT (Speech-to-Text) backend implementations."""

    async def load_model(self, model_size: str) -> None:
        """Load STT model."""
        ...

    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
        model_size: str | None = None,
    ) -> str:
        """
        Transcribe audio to text.

        Returns:
            Transcribed text
        """
        ...

    async def transcribe_with_segments(
        self,
        audio_path: str,
        language: str | None = None,
        model_size: str | None = None,
    ) -> dict:
        """
        Transcribe audio to text with segment-level timestamps.

        Returns:
            {"text": str, "segments": [{"start": float, "end": float, "text": str}]}
        """
        ...

    async def transcribe_with_words(
        self,
        audio_path: str,
        language: str | None = None,
        model_size: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Transcribe audio to text with word-level timestamps and confidence.

        Returns:
            [{"word": str, "start_ms": float, "end_ms": float, "confidence": float}]
        """
        ...

    def unload_model(self) -> None:
        """Unload model to free memory."""
        ...

    def is_loaded(self) -> bool:
        """Check if model is loaded."""
        ...


@runtime_checkable
class VCBackend(Protocol):
    """Protocol for voice-conversion (RVC) backend implementations."""

    def load_model(self, voice_name: str) -> None:
        """Load a voice-conversion model (RVC generator for a voice pack)."""
        ...

    def convert(
        self,
        audio_path: str,
        voice_name: str,
        pitch_shift: int = 0,
    ) -> tuple[np.ndarray, int]:
        """
        Convert input audio into the target voice.

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        ...

    def unload_model(self) -> None:
        """Unload the current voice-conversion model."""
        ...

    def is_loaded(self) -> bool:
        """Check if a model is currently loaded."""
        ...


@runtime_checkable
class LLMBackend(Protocol):
    """Protocol for local LLM (chat/completion) backend implementations."""

    async def load_model(self, model_size: str) -> None:
        """Load LLM weights and tokenizer."""
        ...

    async def generate(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int | None = None,
        temperature: float = DEFAULT_LLM_TEMPERATURE,
        model_size: str | None = None,
        examples: list[tuple[str, str]] | None = None,
    ) -> str:
        """Run a single-turn chat completion and return the assistant reply.

        ``examples`` is an optional list of ``(user, assistant)`` pairs
        prepended to the conversation as proper chat turns — small models
        pattern-match on inline system-prompt examples (echoing them
        verbatim for unrelated inputs), but treat structured turns as
        data and generalize instead. Used by the refinement service.
        """
        ...

    def unload_model(self) -> None: ...

    def is_loaded(self) -> bool: ...


@runtime_checkable
class MusicBackend(Protocol):
    """Protocol for music / song / beat generation backends.

    Unifies the local engines that turn a text prompt into raw audio so
    agents and the UI can drive any of them through one interface.
    """

    def load_model(self) -> None:
        """Load the music model weights."""
        ...

    def generate(
        self,
        prompt: str,
        duration_seconds: float = 30.0,
        genre: str = "pop",
        mood: str = "neutral",
        tempo: int | None = None,
        seed: int | None = None,
    ) -> tuple[np.ndarray, int]:
        """
        Generate music audio from a text prompt.

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        ...

    def is_available(self) -> bool:
        """Whether the engine's package is installed on this machine."""
        ...

    def is_loaded(self) -> bool:
        """Check if the model is loaded."""
        ...

    def unload_model(self) -> None:
        """Unload the model to free memory."""
        ...


# Supported TTS engines — keyed by engine name, value is the backend class import path.
# The factory function uses this for the if/elif chain; the model configs live on the backend classes.
TTS_ENGINES = {
    "kokoro": "Kokoro 82M",
    "fish_speech_s2": "Fish Audio S2 Pro (GGUF)",
    "zonos": "Zyphra Zonos",
    "pocket_tts": "Pocket-TTS",
    "parler_tts": "Parler-TTS Mini",
    "moss_tts_nano": "MOSS-TTS-Nano",
    "kitten_tts": "KittenTTS (mini)",
    "neutts": "NeuTTS-Air",
    "neutts_2e": "NeuTTS-2E",
    "orpheus": "Orpheus TTS 3B",
    "qwen3_tts": "Qwen3-TTS 12Hz 1.7B Base",
    "bark_small": "Bark Small (GGUF)",
}

LLM_ENGINES = {
    "gguf_llm": "Local GGUF (llama.cpp server)",
}

# Supported music / SFX engines — keyed by engine name.
MUSIC_ENGINES = {
    "stable_audio": "Stable Audio Open (sound effects)",
    "acestep": "ACE-Step 1.5 (music generation)",
    "heartmula": "HeartMuLa 3B (music generation)",
    "sa3_sfx": "Stable Audio 3 Small SFX (sound effects)",
    "minimax_music3": "MiniMax Music 3 (music generation)",
    "cloud": "Cloud (BYOK)",
}

# Lock guarding the global backend instance registries in registry.py.
_registry_lock = threading.Lock()
