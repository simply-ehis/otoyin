"""
STT model configs — whisper, faster-whisper, Parakeet, Qwen3-ASR, cloud.
"""

from ..protocols import ModelConfig


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
            min_ram_mb=1700,
            category="stt",
            clone_voice=False,
            pip_packages=["pywhispercpp>=1.5.0"],
        ),
    ]


def _get_moonshine_configs() -> list[ModelConfig]:
    """Return Moonshine STT model configs (GGUF via transcribe.cpp, no torch).

    Moonshine is optimized for low-latency on-device English STT.
    All models: English-only, MIT license, 16 kHz PCM input.

    Selection guide:
      moonshine-tiny            — ultra-light, 35 MB, Raspberry Pi friendly
      moonshine-base            — best balance, 74 MB, good accuracy
      moonshine-streaming-small — streaming-capable, 189 MB, best accuracy
    """
    return [
        ModelConfig(
            model_name="moonshine-tiny",
            display_name="Moonshine Tiny (35 MB)",
            engine="moonshine",
            hf_repo_id="memoravox/moonshine-tiny-gguf",
            model_size="moonshine-tiny",
            size_mb=35,
            min_ram_mb=100,
            category="stt",
            languages=["en"],
            quant="Q8_0",
        ),
        ModelConfig(
            model_name="moonshine-base",
            display_name="Moonshine Base (74 MB)",
            engine="moonshine",
            hf_repo_id="memoravox/moonshine-base-gguf",
            model_size="moonshine-base",
            size_mb=74,
            min_ram_mb=200,
            category="stt",
            languages=["en"],
            quant="Q8_0",
        ),
        ModelConfig(
            model_name="moonshine-streaming-small",
            display_name="Moonshine Streaming Small (189 MB)",
            engine="moonshine",
            hf_repo_id="memoravox/moonshine-streaming-small-gguf",
            model_size="moonshine-streaming-small",
            size_mb=189,
            min_ram_mb=300,
            category="stt",
            languages=["en"],
            quant="Q8_0",
            preload_priority=0,
            cold_start_ms=2000,
            warm_start_ms=300,
            streaming=True,
            execution_provider="CPU",
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
            model_name="faster-whisper-tiny-en",
            display_name="Whisper Tiny EN (faster-whisper)",
            engine="faster-whisper",
            hf_repo_id="Systran/faster-whisper-tiny.en",
            model_size="tiny.en",
            size_mb=75,
            category="stt",
            pip_packages=["faster-whisper>=1.0.0"],
        ),
        ModelConfig(
            model_name="faster-whisper-base-en",
            display_name="Whisper Base EN (faster-whisper)",
            engine="faster-whisper",
            hf_repo_id="Systran/faster-whisper-base.en",
            model_size="base.en",
            size_mb=142,
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
            min_ram_mb=1700,
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
            min_ram_mb=3200,
            category="stt",
            pip_packages=["faster-whisper>=1.0.0"],
        ),
        ModelConfig(
            model_name="faster-whisper-large-v3-turbo",
            display_name="Whisper Large-v3-Turbo (faster-whisper)",
            engine="faster-whisper",
            hf_repo_id="Systran/faster-whisper-large-v3-turbo",
            model_size="large-v3-turbo",
            size_mb=1620,
            min_ram_mb=1700,
            category="stt",
            pip_packages=["faster-whisper>=1.0.0"],
        ),
    ]


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
            # Real size of tdt-0.6b-v3-q8_0.gguf is 940,663,680 B (~897 MB).
            size_mb=897,
            min_ram_mb=1000,
            min_vram_mb=0,
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
            # Real size of tdt-0.6b-v3-f16.gguf is 1,441,046,400 B (~1375 MB).
            # This was declared as 220 MB, which made fp16 look *smaller* than the
            # q8 graph and under-stated the download by ~1.1 GB.
            size_mb=1375,
            min_ram_mb=1500,
            min_vram_mb=0,
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
            min_ram_mb=1800,
            min_vram_mb=0,
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
            min_ram_mb=700,
            min_vram_mb=0,
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
            category="stt",
        )
    ]


def get_stt_model_configs() -> list[ModelConfig]:
    """Return all STT model configs (moonshine + parakeet + qwen3_asr + faster-whisper + whisper)."""
    return (
        _get_cloud_stt_configs()
        + _get_moonshine_configs()
        + _get_parakeet_configs()
        + _get_qwen3_asr_configs()
        + _get_faster_whisper_configs()
        + _get_whisper_configs()
    )
