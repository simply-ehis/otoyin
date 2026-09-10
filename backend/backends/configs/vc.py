"""Voice-conversion model configs — RVC ONNX, NeuTTS, Orpheus, Seed-VC, OpenVoice ONNX."""

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
            min_ram_mb=1500,
            min_vram_mb=0,
            languages=["en"],
            clone_voice=True,
            quant="Q8_0",
            quality_score=7,
            category="tts",
            pip_packages=["neutts[llama,onnx]>=0.1.0"],
        ),
    ]


def _get_neutts_2e_configs() -> list[ModelConfig]:
    """Return NeuTTS-2E configs (emotion-aware, GGUF backbone, 4 preset speakers)."""
    neutts_2e_voices = [
        PresetVoiceConfig(id="emily", name="Emily", gender="female", language="en"),
        PresetVoiceConfig(id="paul", name="Paul", gender="male", language="en"),
        PresetVoiceConfig(id="sophie", name="Sophie", gender="female", language="en"),
        PresetVoiceConfig(id="steven", name="Steven", gender="male", language="en"),
    ]
    return [
        ModelConfig(
            model_name="neutts-2e-q4",
            display_name="NeuTTS-2E (Q4 GGUF)",
            engine="neutts_2e",
            hf_repo_id="neuphonic/neutts-2e-q4-gguf",
            model_size="q4",
            size_mb=500,
            min_ram_mb=1000,
            min_vram_mb=0,
            languages=["en"],
            clone_voice=True,
            emotion_control=True,
            quality_score=7,
            category="tts",
            pip_packages=["neutts[llama,onnx]>=0.1.0"],
            structured_preset_voices=neutts_2e_voices,
            quant="Q4_0",
        ),
        ModelConfig(
            model_name="neutts-2e-q8",
            display_name="NeuTTS-2E (Q8_0 GGUF)",
            engine="neutts_2e",
            hf_repo_id="neuphonic/neutts-2e-q8-gguf",
            model_size="q8",
            size_mb=800,
            min_ram_mb=1500,
            min_vram_mb=0,
            languages=["en"],
            clone_voice=True,
            emotion_control=True,
            quality_score=8,
            category="tts",
            pip_packages=["neutts[llama,onnx]>=0.1.0"],
            structured_preset_voices=neutts_2e_voices,
            quant="Q8_0",
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
            min_ram_mb=5000,
            min_vram_mb=0,
            quality_score=10,
            category="tts",
            pip_packages=["snac>=1.0.0"],
            paralinguistic_tags=True,
            supported_tags=["<laugh>", "<sigh>", "<cough>", "<sniffle>", "<groan>", "<yawn>", "<gasp>"],
            structured_preset_voices=orpheus_voices,
            quant="Q8_0",
            needs_trim=True,
        ),
    ]


def _get_seed_vc_configs() -> list[ModelConfig]:
    """Return Seed-VC config (zero-shot, reference-audio, optional user download)."""
    return [
        ModelConfig(
            model_name="seed-vc",
            display_name="Seed-VC (zero-shot clone)",
            engine="seed_vc",
            hf_repo_id="Plachta/Seed-VC",
            model_size="base",
            size_mb=1500,
            min_ram_mb=2000,
            min_vram_mb=2000,
            languages=["en"],
            clone_voice=True,
            gpu_only=True,
            quality_score=8,
            category="vc",
            pip_packages=["seed-vc"],
            venv_name="seed_vc",
        ),
    ]


def _get_openvoice_onnx_configs() -> list[ModelConfig]:
    """Return OpenVoice ONNX config (tone-color conversion, no torch)."""
    return [
        ModelConfig(
            model_name="openvoice-onnx-v2",
            display_name="OpenVoice V2 ONNX (zero-shot tone color)",
            engine="openvoice_onnx",
            hf_repo_id="Hinotsuba/OpenVoice-ONNX-v2",
            model_size="v2",
            size_mb=161,
            quality_score=6,
            category="vc",
            pip_packages=["onnxruntime>=1.16.0"],
        ),
    ]


def _get_rvc_onnx_configs() -> list[ModelConfig]:
    """Return RVC ONNX voice-conversion pack configs (no torch)."""
    from ..rvc_onnx_backend import RVC_VOICE_PACKS

    configs = []
    for name, desc in RVC_VOICE_PACKS.items():
        repo = desc["repo"] if isinstance(desc, dict) else desc
        configs.append(
            ModelConfig(
                model_name=f"rvc-onnx-{name}",
                display_name=f"RVC ONNX Voice Pack: {name}",
                engine="rvc_onnx",
                hf_repo_id=repo,
                model_size=name,
                size_mb=120,
                min_ram_mb=512,
                min_vram_mb=0,
                languages=["en"],
                gpu_only=False,
                quality_score=5,
                category="vc",
                pip_packages=["onnxruntime>=1.16.0"],
                venv_name="rvc",
            )
        )
    return configs
