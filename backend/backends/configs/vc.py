"""Voice-conversion configs — audiocpp_cli one-shot VC engines."""

from ..protocols import ModelConfig, PresetVoiceConfig


def _get_neutts_configs() -> list[ModelConfig]:
    """Return NeuTTS-Air config (GGUF backbone, zero-shot clone, Apache 2.0)."""
    return [
        ModelConfig(
            model_name="neutts-air-q8",
            display_name="NeuTTS-Air (Q8_0 GGUF)",
            engine="neutts",
            hf_repo_id="neuphonic/neutts-air-q8-gguf",
            model_size="q8",
            size_mb=803,
            min_ram_mb=900,
            min_vram_mb=0,
            languages=["en"],
            clone_voice=True,
            quant="Q8_0",
            category="tts",
            pip_packages=["neutts[llama,onnx]>=0.1.0"],
            license_id="apache-2.0",
            license_note="NeuTTS-Air code/weights declared Apache-2.0 by the publisher.",
        ),
    ]


def _get_neutts_2e_configs() -> list[ModelConfig]:
    """Return NeuTTS-2E config (audiocpp neutts family, emotion-aware, 9 preset voices)."""
    neutts_2e_voices = [
        PresetVoiceConfig(id="dave", name="Dave", gender="male", language="en"),
        PresetVoiceConfig(id="emily", name="Emily", gender="female", language="en"),
        PresetVoiceConfig(id="greta", name="Greta", gender="female", language="en"),
        PresetVoiceConfig(id="jo", name="Jo", gender="neutral", language="en"),
        PresetVoiceConfig(id="juliette", name="Juliette", gender="female", language="en"),
        PresetVoiceConfig(id="mateo", name="Mateo", gender="male", language="en"),
        PresetVoiceConfig(id="paul", name="Paul", gender="male", language="en"),
        PresetVoiceConfig(id="sophie", name="Sophie", gender="female", language="en"),
        PresetVoiceConfig(id="steven", name="Steven", gender="male", language="en"),
    ]
    return [
        ModelConfig(
            model_name="neutts-2e-orig",
            display_name="NeuTTS-2E",
            engine="neutts_2e",
            hf_repo_id="audio-cpp/audio.cpp-gguf",
            model_size="orig",
            size_mb=2877,
            min_ram_mb=3500,
            min_vram_mb=0,
            languages=["en"],
            clone_voice=False,
            emotion_control=True,
            category="tts",
            pip_packages=[],
            download_file="NeuTTS-2E-GGUF/neutts-2e-orig.gguf",
            structured_preset_voices=neutts_2e_voices,
            # Upstream ships no quantized package; original precision is unknown to us — claim nothing.
            quant=None,
            license_id="neutts-open-license",
            license_note="NeuTTS-2E uses a custom open license; verify terms before commercial use.",
        ),
    ]


def _get_orpheus_configs() -> list[ModelConfig]:
    """Return Orpheus 3B configs (GGUF, SNAC decoder, 8 voices, emotion tags)."""
    orpheus_voices = [
        PresetVoiceConfig(id="tara", name="Tara", gender="female", language="en"),
        PresetVoiceConfig(id="leah", name="Leah", gender="female", language="en"),
        PresetVoiceConfig(id="jess", name="Jess", gender="female", language="en"),
        PresetVoiceConfig(id="leo", name="Leo", gender="male", language="en"),
        PresetVoiceConfig(id="dan", name="Dan", gender="male", language="en"),
        PresetVoiceConfig(id="mia", name="Mia", gender="female", language="en"),
        PresetVoiceConfig(id="zac", name="Zac", gender="male", language="en"),
        PresetVoiceConfig(id="zoe", name="Zoe", gender="female", language="en"),
    ]
    return [
        ModelConfig(
            model_name="orpheus-q8-0",
            display_name="Orpheus 3B (Q8_0, 3.7GB)",
            engine="orpheus",
            hf_repo_id="cstr/orpheus-3b-0.1-ft-GGUF",
            model_size="Q8_0",
            size_mb=3700,
            min_ram_mb=3800,
            min_vram_mb=0,
            category="tts",
            pip_packages=["snac>=1.0.0"],
            paralinguistic_tags=True,
            supported_tags=["<laugh>", "<sigh>", "<cough>", "<sniffle>", "<groan>", "<yawn>", "<gasp>"],
            structured_preset_voices=orpheus_voices,
            quant="Q8_0",
            needs_trim=True,
            license_id="mixed",
            license_note="Code and weight licenses differ for Orpheus; verify both before distribution.",
        ),
    ]


def _get_meanvc2_configs() -> list[ModelConfig]:
    """Return MeanVC2 config (ASLP-Lab, Apache-2.0, 110 ms latency VC)."""
    return [
        ModelConfig(
            model_name="meanvc2-fp32",
            display_name="MeanVC2",
            engine="meanvc2",
            hf_repo_id="audio-cpp/audio.cpp-gguf",
            model_size="120ms-40ms",
            size_mb=1554,
            min_ram_mb=2000,
            min_vram_mb=0,
            languages=["en", "zh", "ja", "ko", "fr", "de", "es", "pt", "it", "ru", "ar", "hi"],
            clone_voice=True,
            gpu_only=False,
            category="vc",
            pip_packages=[],
            download_file="MeanVC2-GGUF/meanvc2-120ms-40ms-fp32.gguf",
            quant="F32",
            license_id="apache-2.0",
            license_note="Apache-2.0 (ASLP-lab/MeanVC2).",
        ),
    ]


def _get_tone_color_vc_configs() -> list[ModelConfig]:
    """Return Tone-Color-VC config (OpenVoice V2 standalone, MIT)."""
    return [
        ModelConfig(
            model_name="tone-color-vc-f16",
            display_name="Tone Color VC",
            engine="tone_color_vc",
            hf_repo_id="audio-cpp/audio.cpp-gguf",
            model_size="default",
            size_mb=63,
            min_ram_mb=200,
            min_vram_mb=0,
            languages=["en", "zh", "ja", "ko", "fr", "de", "es", "pt", "it", "ru", "ar", "hi"],
            clone_voice=True,
            gpu_only=False,
            category="vc",
            pip_packages=[],
            download_file="Tone-Color-VC-GGUF/tone-color-vc-f16.gguf",
            quant="F16",
            license_id="mit",
            license_note="MIT (MyShell OpenVoice V2 lineage).",
        ),
    ]


def _get_seed_vc_configs() -> list[ModelConfig]:
    """Return Seed-VC config (audio.cpp seed_vc family; GPL-3.0 upstream)."""
    return [
        ModelConfig(
            model_name="seed-vc-mlx-q8",
            display_name="Seed-VC",
            engine="seed_vc",
            hf_repo_id="audio-cpp/audio.cpp-gguf",
            model_size="default",
            size_mb=2976,
            min_ram_mb=3400,
            min_vram_mb=2000,
            languages=["en", "zh"],
            clone_voice=True,
            gpu_only=False,
            category="vc",
            pip_packages=[],
            download_file="SeedVC-MLX-GGUF/seed-vc-mlx-q8_0.gguf",
            quant="Q8_0",
            license_id="gpl-3.0",
            license_note=(
                "GPL-3.0 upstream (Plachtaa/seed-vc). One-shot subprocess invocation; "
                "redistribution of weights needs license review."
            ),
        ),
    ]
