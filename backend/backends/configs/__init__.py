"""
Model-config builders and lookup helpers for the backends package.

These are static descriptors of every downloadable model variant the app
knows about (TTS, STT/Whisper, LLM, voice-conversion, spatial audio). They
are pure data + small helpers and contain no backend instantiation logic.
"""

from ...utils.model_lifecycle import lifecycle_manager
from ..protocols import ModelConfig
from .tts import (
    _get_tts_configs,
    _get_tts_gguf_configs,
)
from .vc import (
    _get_neutts_2e_configs,
    _get_neutts_configs,
    _get_openvoice_onnx_configs,
    _get_orpheus_configs,
    _get_rvc_onnx_configs,
    _get_seed_vc_configs,
)


def _get_whisper_configs() -> list[ModelConfig]:
    """Return whisper.cpp STT model configs (CPU-friendly GGML binaries).

    All models run via whisper.cpp — pure C++, no Python/PyTorch needed.
    GGML files: ggml-{model_size}.bin from ggerganov/whisper.cpp.

    Selection guide:
      tiny.en        — fastest, EN-only (75 MB)
      base.en        — good speed/accuracy, EN-only (142 MB)
      large-v3-turbo — flagship multilingual, near-human accuracy,
                        4-8x faster than full large-v3 (1.6 GB)
    """
    return [
        ModelConfig(
            model_name="whisper-tiny-en",
            display_name="Whisper Tiny EN",
            engine="whisper",
            hf_repo_id="ggerganov/whisper.cpp",
            model_size="tiny.en",
            size_mb=75,
            quality_score=3,
            category="stt",
            pip_packages=["pywhispercpp>=1.5.0"],
        ),
        ModelConfig(
            model_name="whisper-base-en",
            display_name="Whisper Base EN",
            engine="whisper",
            hf_repo_id="ggerganov/whisper.cpp",
            model_size="base.en",
            size_mb=142,
            quality_score=5,
            category="stt",
            pip_packages=["pywhispercpp>=1.5.0"],
        ),
        ModelConfig(
            model_name="whisper-large-v3-turbo",
            display_name="Whisper Large-v3-Turbo",
            engine="whisper",
            hf_repo_id="ggerganov/whisper.cpp",
            model_size="large-v3-turbo",
            size_mb=1620,
            min_ram_mb=2000,
            quality_score=10,
            category="stt",
            clone_voice=False,
            pip_packages=["pywhispercpp>=1.5.0"],
        ),
    ]


def _get_faster_whisper_configs() -> list[ModelConfig]:
    """Return faster-whisper STT model configs (CTranslate2 int8, word timestamps + confidence).

    All models run via faster-whisper — CTranslate2 int8 quantization, CPU/GPU.
    Returns per-word timestamps and confidence via faster-whisper's word-level output.

    Selection guide:
      tiny.en        — fastest, EN-only (75 MB)
      base.en        — good speed/accuracy, EN-only (142 MB)
      small.en       — excellent accuracy, EN-only (466 MB)
      medium.en      — best EN accuracy before large (1.5 GB)
      large-v3       — flagship multilingual (3.1 GB)
      large-v3-turbo — near-human accuracy, 99 languages, 4-8x faster (1.6 GB)
    """
    return [
        ModelConfig(
            model_name="whisper-tiny-en",
            display_name="Whisper Tiny EN (faster-whisper)",
            engine="faster-whisper",
            hf_repo_id="Systran/faster-whisper-tiny.en",
            model_size="tiny.en",
            size_mb=75,
            quality_score=3,
            category="stt",
            pip_packages=["faster-whisper>=1.0.0"],
        ),
        ModelConfig(
            model_name="whisper-base-en",
            display_name="Whisper Base EN (faster-whisper)",
            engine="faster-whisper",
            hf_repo_id="Systran/faster-whisper-base.en",
            model_size="base.en",
            size_mb=142,
            quality_score=5,
            category="stt",
            pip_packages=["faster-whisper>=1.0.0"],
        ),
        ModelConfig(
            model_name="whisper-small-en",
            display_name="Whisper Small EN (faster-whisper)",
            engine="faster-whisper",
            hf_repo_id="Systran/faster-whisper-small.en",
            model_size="small.en",
            size_mb=466,
            quality_score=7,
            category="stt",
            pip_packages=["faster-whisper>=1.0.0"],
        ),
        ModelConfig(
            model_name="whisper-medium-en",
            display_name="Whisper Medium EN (faster-whisper)",
            engine="faster-whisper",
            hf_repo_id="Systran/faster-whisper-medium.en",
            model_size="medium.en",
            size_mb=1530,
            min_ram_mb=2000,
            quality_score=8,
            category="stt",
            pip_packages=["faster-whisper>=1.0.0"],
        ),
        ModelConfig(
            model_name="whisper-large-v3",
            display_name="Whisper Large-v3 (faster-whisper)",
            engine="faster-whisper",
            hf_repo_id="Systran/faster-whisper-large-v3",
            model_size="large-v3",
            size_mb=3100,
            min_ram_mb=4000,
            quality_score=10,
            category="stt",
            pip_packages=["faster-whisper>=1.0.0"],
        ),
        ModelConfig(
            model_name="whisper-large-v3-turbo",
            display_name="Whisper Large-v3-Turbo (faster-whisper)",
            engine="faster-whisper",
            hf_repo_id="Systran/faster-whisper-large-v3-turbo",
            model_size="large-v3-turbo",
            size_mb=1620,
            min_ram_mb=2000,
            quality_score=9,
            category="stt",
            pip_packages=["faster-whisper>=1.0.0"],
        ),
    ]


def _get_gguf_llm_configs() -> list[ModelConfig]:
    """Return GGUF planner LLM configs (assistant stack, locked 2026-08-16).

    Lineup (see docs/ASSISTANT_ARCHITECTURE.md): jackrong Qwen3.5-2B is the
    FREE default planner; jackrong Qwen3.5-0.8B is the free low-RAM fallback;
    Qwopus3.5-4B-v3, Spark-X 2.5-4B, LFM2.5-2.6B QAD, MiniCPM5-2B, and
    Qwen3.8-27B are PAID planners. All run via llama.cpp server.exe.
    """
    planner_languages = [
        "en",
        "zh",
        "ja",
        "ko",
        "de",
        "fr",
        "es",
        "it",
        "pt",
        "ru",
    ]

    return [
        ModelConfig(
            model_name="planner-4b",
            display_name="Qwen3.5-4B (Premium — Free)",
            engine="gguf_llm",
            hf_repo_id="unsloth/Qwen3.5-4B-GGUF",
            model_size="4B-Q4_K_M",
            size_mb=2740,
            min_ram_mb=3500,
            quant="Q4_K_M",
            languages=planner_languages,
            quality_score=7,
            category="llm",
        ),
        ModelConfig(
            model_name="planner-0.8b",
            display_name="Qwen3.5-0.8B Opus-Distilled (Fallback — Free)",
            engine="gguf_llm",
            hf_repo_id="Jackrong/Qwen3.5-0.8B-Claude-4.6-Opus-Reasoning-Distilled-GGUF",
            model_size="0.8B-Q5_K_M",
            size_mb=700,
            min_ram_mb=1000,
            quant="Q5_K_M",
            languages=planner_languages,
            quality_score=4,
            category="llm",
        ),
        ModelConfig(
            model_name="planner-lfm2-2.6b",
            display_name="LiquidAI LFM2-2.6B (Latest — Free)",
            engine="gguf_llm",
            hf_repo_id="LiquidAI/LFM2-2.6B-GGUF",
            model_size="2.6B-Q4_K_M",
            size_mb=1600,
            min_ram_mb=2500,
            quant="Q4_K_M",
            languages=planner_languages,
            quality_score=10,
            category="llm",
        ),
        ModelConfig(
            model_name="planner-4b-v3",
            display_name="Qwopus3.5-4B-v3 (Premium — $40)",
            engine="gguf_llm",
            hf_repo_id="Jackrong/Qwopus3.5-4B-v3-GGUF",
            model_size="4B-Q4_K_M",
            size_mb=2800,
            min_ram_mb=4000,
            quant="Q4_K_M",
            languages=planner_languages,
            quality_score=10,
            category="llm",
            supports_instruct=True,
            supported_tags=["thinking", "tool_call", "json_mode"],
        ),
        ModelConfig(
            model_name="planner-spark-x-2.5-4b",
            display_name="Spark-X 2.5-4B (Agentic — $40)",
            engine="gguf_llm",
            hf_repo_id="XHToken/Spark-X2.5-4B-GGUF",
            model_size="spark-4B-Q4_K_M",
            size_mb=2500,
            min_ram_mb=3500,
            quant="Q4_K_M",
            languages=planner_languages,
            quality_score=9,
            category="llm",
        ),
        ModelConfig(
            model_name="planner-lfm2-2.6b-qad",
            display_name="LFM2.5-2.6B QAD-Q4_0 (Special Offer — $13)",
            engine="gguf_llm",
            hf_repo_id="LiquidAI/LFM2.5-2.6B-GGUF",
            model_size="2.6B-QAD-Q4_0",
            size_mb=1590,
            min_ram_mb=4096,
            min_vram_mb=0,
            quant="Q4_0",
            languages=[
                *planner_languages,
                "ar",
                "hi",
                "tr",
                "vi",
                "th",
                "id",
                "ms",
                "fa",
                "he",
                "pl",
                "nl",
                "sv",
                "da",
                "no",
                "fi",
            ],
            quality_score=9,
            category="llm",
            supports_instruct=True,
            supported_tags=["thinking", "tool_call", "json_mode"],
        ),
        ModelConfig(
            model_name="planner-minicpm5-2b",
            display_name="MiniCPM5-2B (2B SOTA — $5 PROMO)",
            engine="gguf_llm",
            hf_repo_id="openbmb/MiniCPM5-2B-GGUF",
            model_size="2B-Q4_K_M",
            size_mb=1600,
            min_ram_mb=2500,
            min_vram_mb=0,
            quant="Q4_K_M",
            languages=planner_languages,
            quality_score=9,
            category="llm",
            supports_instruct=True,
            supported_tags=["thinking", "tool_call", "json_mode"],
        ),
        ModelConfig(
            model_name="planner-qwen3-8-27b",
            display_name="Qwen3.8-27B (Dense 27B — 9.8 GB)",
            engine="gguf_llm",
            hf_repo_id="unsloth/Qwen3.8-27B-GGUF",
            model_size="27B-UD-Q2_K_XL",
            size_mb=9830,
            min_ram_mb=13000,
            min_vram_mb=0,
            quant="UD-Q2_K_XL",
            languages=planner_languages,
            quality_score=9,
            category="llm",
            supports_instruct=True,
            supported_tags=["thinking", "tool_call", "json_mode"],
        ),
    ]


def _get_steam_audio_configs() -> list[ModelConfig]:
    """Return Steam Audio SDK config (optional spatial audio download)."""
    return [
        ModelConfig(
            model_name="steam-audio",
            display_name="Steam Audio SDK (spatial audio)",
            engine="steam_audio",
            hf_repo_id="ValveSoftware/steam-audio",
            model_size="v4.8.1",
            size_mb=10,
            quality_score=5,
            category="spatial",
        )
    ]


def _get_music_configs() -> list[ModelConfig]:
    """Return music-generation model configs (paid engines)."""
    return [
        ModelConfig(
            model_name="acestep-1-5-gguf",
            display_name="ACE-Step 1.5 GGUF (music, no torch)",
            engine="acestep_gguf",
            hf_repo_id="Serveurperso/ACE-Step-1.5-GGUF",
            model_size="turbo-Q8_0",
            size_mb=7700,
            min_ram_mb=10000,
            min_vram_mb=0,
            quant="Q8_0",
            languages=["en"],
            quality_score=9,
            category="music",
        ),
        ModelConfig(
            model_name="heartmula-3b",
            display_name="HeartMuLa 3B (music generation)",
            engine="heartmula",
            hf_repo_id="audio-cpp/audio.cpp-gguf",
            model_size="3B-Q8_0",
            size_mb=7660,
            min_ram_mb=10000,
            min_vram_mb=0,
            quant="Q8_0",
            languages=["en"],
            quality_score=8,
            category="music",
        ),
        ModelConfig(
            model_name="stable-audio-3-small-sfx",
            display_name="Stable Audio 3 Small SFX (sound effects)",
            engine="sa3_sfx",
            hf_repo_id="audio-cpp/audio.cpp-gguf",
            model_size="Small-SFX-Q8_0",
            size_mb=1684,
            min_ram_mb=2500,
            min_vram_mb=0,
            quant="Q8_0",
            languages=["en"],
            quality_score=7,
            category="music",
        ),
        ModelConfig(
            model_name="music-cloud",
            display_name="Cloud (BYOK)",
            engine="cloud",
            hf_repo_id="",
            model_size="cloud",
            size_mb=0,
            languages=["en"],
            quality_score=0,
            category="music",
        ),
    ]


def _get_translation_configs() -> list[ModelConfig]:
    """Return Argos Translate offline pack configs (one per language pair)."""
    pairs = [
        ("en", "es"),
        ("en", "fr"),
        ("en", "de"),
        ("en", "ja"),
        ("en", "zh"),
        ("en", "pt"),
        ("en", "ru"),
        ("en", "ar"),
        ("en", "hi"),
        ("en", "it"),
        ("es", "en"),
        ("fr", "en"),
        ("de", "en"),
        ("ja", "en"),
        ("zh", "en"),
        ("pt", "en"),
        ("ru", "en"),
        ("ar", "en"),
        ("hi", "en"),
        ("it", "en"),
    ]
    configs: list[ModelConfig] = []
    for src, tgt in pairs:
        configs.append(
            ModelConfig(
                model_name=f"translate-{src}-{tgt}",
                display_name=f"Translate {src.upper()}→{tgt.upper()}",
                engine="argos_translate",
                hf_repo_id=f"argos-translate-{src}-{tgt}",
                model_size=f"{src}-{tgt}",
                size_mb=45,
                quality_score=8,
                category="translation",
                pip_packages=["argostranslate>=1.9.0"],
            )
        )
    return configs


def _get_audio_processing_configs() -> list[ModelConfig]:
    """Return audio-processing model configs (Demucs stem separation)."""
    return [
        ModelConfig(
            model_name="demucs_onnx",
            display_name="Demucs HTDemucs (vocal isolation)",
            engine="demucs_onnx",
            hf_repo_id="MrCitron/demucs-v4-onnx",
            model_size="htdemucs",
            size_mb=316,
            quality_score=8,
            category="sfx",
            pip_packages=["demucs>=4.0.0"],
            venv_name="demucs",
        ),
    ]


def _get_soundfont_configs() -> list[ModelConfig]:
    """Return free downloadable SoundFont banks (GM + drums).

    Each bank downloads straight into the instruments library and registers
    as an installed instrument pack — the same one-click flow as the
    translation packs. Sources are redistributable: FluidR3 is MIT,
    GeneralUser GS is free for any use incl. redistribution (attribution
    kept in the catalog copy below).
    """
    return [
        ModelConfig(
            model_name="sf2-generaluser-gs",
            display_name="GeneralUser GS (GM + drums)",
            engine="soundfont",
            hf_repo_id="mrbumpy409/GeneralUser-GS",
            model_size="generaluser-gs",
            size_mb=31,
            quality_score=8,
            category="instruments",
            download_url="https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2",
        ),
        ModelConfig(
            model_name="sf2-fluid-gm",
            display_name="FluidR3 GM (classic GM + drums)",
            engine="soundfont",
            hf_repo_id="pianobooster/fluid-soundfont",
            model_size="fluid-r3-gm",
            size_mb=142,
            quality_score=7,
            category="instruments",
            download_url="https://github.com/pianobooster/fluid-soundfont/releases/download/v3.1/FluidR3_GM.sf2",
        ),
    ]


def get_vc_backend(engine: str):
    """Return the voice-conversion backend for the requested engine.

    Engines:
      - ``rvc_onnx``     → RVCOnnxBackend (pre-trained voice packs, ONNX, no torch)
      - ``seed_vc``      → SeedVCBackend (zero-shot from reference audio)
      - ``openvoice_onnx`` → OpenVoiceOnnxBackend (tone-color conversion, ONNX, no torch)

    Local engines require no factory-level manifest row: backends
    self-gate on cache presence at load, and ``cloud`` (BYOK, no local
    weights) is exempt by design. See the gating audit doc.
    """
    if engine == "seed_vc":
        from ..seed_vc_backend import seed_vc_backend

        lifecycle_manager.register("seed_vc", seed_vc_backend.is_loaded, seed_vc_backend.unload_model)
        return seed_vc_backend
    if engine == "openvoice_onnx":
        from ..openvoice_onnx_backend import openvoice_onnx_backend

        lifecycle_manager.register(
            "openvoice_onnx", openvoice_onnx_backend.is_loaded, openvoice_onnx_backend.unload_model
        )
        return openvoice_onnx_backend
    if engine == "rvc_onnx":
        from ..rvc_onnx_backend import rvc_onnx_backend

        lifecycle_manager.register("rvc_onnx", rvc_onnx_backend.is_loaded, rvc_onnx_backend.unload_model)
        return rvc_onnx_backend
    if engine == "cloud":
        from ..cloud_vc_backend import cloud_vc_backend

        lifecycle_manager.register("cloud", cloud_vc_backend.is_loaded, cloud_vc_backend.unload_model)
        return cloud_vc_backend
    raise ValueError(
        f"Unknown voice-conversion engine: {engine!r} (expected rvc_onnx, seed_vc, openvoice_onnx, or cloud)"
    )


def _get_cloud_vc_configs() -> list[ModelConfig]:
    """Return the BYOK cloud voice-conversion config (engine ``cloud``)."""
    return [
        ModelConfig(
            model_name="vc-cloud",
            display_name="Cloud (BYOK)",
            engine="cloud",
            hf_repo_id="",
            model_size="cloud",
            size_mb=0,
            languages=["en"],
            quality_score=0,
            category="vc",
        )
    ]


def get_all_model_configs() -> list[ModelConfig]:
    """Return the full list of model configs (TTS + STT + LLM + VC + music + spatial)."""
    return (
        _get_tts_configs()
        + _get_tts_gguf_configs()
        + _get_faster_whisper_configs()
        + _get_whisper_configs()
        + _get_parakeet_configs()
        + _get_qwen3_asr_configs()
        + _get_gguf_llm_configs()
        + _get_rvc_onnx_configs()
        + _get_seed_vc_configs()
        + _get_openvoice_onnx_configs()
        + _get_neutts_configs()
        + _get_neutts_2e_configs()
        + _get_orpheus_configs()
        + _get_music_configs()
        + _get_steam_audio_configs()
        + _get_audio_processing_configs()
        + _get_soundfont_configs()
        + _get_translation_configs()
        + _get_cloud_vc_configs()
        + _get_cloud_stt_configs()
    )


def get_tts_model_configs() -> list[ModelConfig]:
    """Return only TTS model configs."""
    return _get_tts_configs() + _get_tts_gguf_configs() + _get_neutts_2e_configs() + _get_orpheus_configs()


def get_llm_model_configs() -> list[ModelConfig]:
    """Return only LLM model configs."""
    return _get_gguf_llm_configs()


def _get_parakeet_configs() -> list[ModelConfig]:
    """Return Parakeet TDT 0.6B v3 STT model configs (native C++ via parakeet.cpp).

    25 European languages with automatic language detection.
    GGUF weights from mudler/parakeet-cpp-gguf.
    """
    return [
        ModelConfig(
            model_name="parakeet-v3-q8",
            display_name="Parakeet TDT 0.6B v3 (25 languages, C++)",
            engine="parakeet",
            hf_repo_id="mudler/parakeet-cpp-gguf",
            model_size="v3-q8",
            size_mb=600,
            min_ram_mb=800,
            min_vram_mb=0,
            quality_score=8,
            category="stt",
            languages=[
                "en",
                "es",
                "fr",
                "de",
                "it",
                "nl",
                "pl",
                "pt",
                "ru",
                "uk",
                "ro",
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
            ],
        ),
        ModelConfig(
            model_name="parakeet-v3-f16",
            display_name="Parakeet TDT 0.6B v3 FP16 (25 languages, C++)",
            engine="parakeet",
            hf_repo_id="mudler/parakeet-cpp-gguf",
            model_size="v3-f16",
            size_mb=220,
            min_ram_mb=400,
            min_vram_mb=0,
            quality_score=9,
            category="stt",
            languages=[
                "en",
                "es",
                "fr",
                "de",
                "it",
                "nl",
                "pl",
                "pt",
                "ru",
                "uk",
                "ro",
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
            ],
        ),
    ]


def _get_qwen3_asr_configs() -> list[ModelConfig]:
    """Return Qwen3-ASR STT model configs (ONNX Runtime C++).

    52 languages with automatic language detection.
    Pre-exported ONNX from andrewleech/qwen3-asr-*-onnx repos.
    """
    return [
        ModelConfig(
            model_name="qwen3-asr-1.7b-int4",
            display_name="Qwen3-ASR 1.7B INT4 (52 languages)",
            engine="qwen3_asr",
            hf_repo_id="andrewleech/qwen3-asr-1.7b-onnx",
            model_size="1.7b-int4",
            size_mb=1700,
            min_ram_mb=2500,
            min_vram_mb=0,
            quality_score=10,
            category="stt",
            languages=[
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
            ],
        ),
        ModelConfig(
            model_name="qwen3-asr-0.6b-int4",
            display_name="Qwen3-ASR 0.6B INT4 (52 languages, lightweight)",
            engine="qwen3_asr",
            hf_repo_id="andrewleech/qwen3-asr-0.6b-onnx",
            model_size="0.6b-int4",
            size_mb=600,
            min_ram_mb=800,
            min_vram_mb=0,
            quality_score=8,
            category="stt",
            languages=[
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
            ],
        ),
    ]


def _get_cloud_stt_configs() -> list[ModelConfig]:
    """Return the BYOK cloud STT config (selected via ``model="cloud"``)."""
    return [
        ModelConfig(
            model_name="stt-cloud",
            display_name="Cloud (BYOK)",
            engine="cloud",
            hf_repo_id="",
            model_size="cloud",
            size_mb=0,
            languages=["en"],
            quality_score=0,
            category="stt",
        )
    ]


def get_stt_model_configs() -> list[ModelConfig]:
    """Return all STT model configs (parakeet + qwen3_asr + faster-whisper + whisper)."""
    return (
        _get_cloud_stt_configs()
        + _get_parakeet_configs()
        + _get_qwen3_asr_configs()
        + _get_faster_whisper_configs()
        + _get_whisper_configs()
    )


# Lookup helpers — these replace the if/elif chains in main.py


def get_model_config(model_name: str) -> ModelConfig | None:
    """Look up a model config by model_name."""
    for cfg in get_all_model_configs():
        if cfg.model_name == model_name:
            return cfg
    return None


def engine_needs_trim(engine: str) -> bool:
    """Whether this engine's output should be run through trim_tts_output."""
    for cfg in get_tts_model_configs():
        if cfg.engine == engine:
            return cfg.needs_trim
    return False


def engine_has_model_sizes(engine: str) -> bool:
    """Whether this engine supports multiple user-selectable model sizes.

    Counts distinct non-default ``model_size`` values — format variants
    (e.g. torch vs ONNX both with ``model_size="default"``) do not count
    as separate sizes.
    """
    sizes = {c.model_size for c in get_tts_model_configs() if c.engine == engine and c.model_size != "default"}
    return len(sizes) > 1
