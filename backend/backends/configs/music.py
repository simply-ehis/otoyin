"""
Music, spatial, translation, audio-processing, SoundFont, and cloud-VC model configs.
"""

from ..protocols import ModelConfig


def _get_steam_audio_configs() -> list[ModelConfig]:
    """Return Steam Audio SDK config (optional spatial audio download)."""
    return [
        ModelConfig(
            model_name="steam-audio",
            display_name="Steam Audio SDK (spatial audio)",
            engine="steam_audio",
            hf_repo_id="ValveSoftware/steam-audio",
            model_size="v4.8.1",
            size_mb=51,
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
            model_size="Q8_0",
            size_mb=7700,
            min_ram_mb=8000,
            min_vram_mb=0,
            quant="Q8_0",
            languages=["en"],
            category="music",
        ),
        ModelConfig(
            model_name="heartmula-3b",
            display_name="HeartMuLa 3B (music generation)",
            engine="heartmula",
            hf_repo_id="audio-cpp/audio.cpp-gguf",
            model_size="Q8_0",
            size_mb=7660,
            min_ram_mb=8000,
            min_vram_mb=0,
            quant="Q8_0",
            languages=["en"],
            category="music",
        ),
        ModelConfig(
            model_name="stable-audio-open-1.0",
            display_name="Stable Audio Open 1.0 (music + SFX, torch)",
            engine="stable_audio",
            hf_repo_id="StabilityAI/stable-audio-open-1.0",
            model_size="default",
            # Real: model.safetensors is 4,629,043,112 B (~4415 MB). Was declared
            # 2500 MB with quant="int8", but the repo ships no quantized export —
            # only fp32/bf16 PyTorch checkpoints.
            size_mb=4415,
            min_ram_mb=6000,
            min_vram_mb=0,
            languages=["en"],
            category="music",
            quant="fp32",
            pip_packages=["stable-audio-open"],
        ),
        ModelConfig(
            model_name="stable-audio-3-small-sfx",
            display_name="Stable Audio 3 Small SFX",
            engine="sa3_sfx",
            hf_repo_id="audio-cpp/audio.cpp-gguf",
            model_size="sf3-sfx",
            size_mb=1606,
            min_ram_mb=2200,
            min_vram_mb=0,
            download_file="Stable-Audio-3-Small-SFX-GGUF/stable-audio-3-small-sfx-q8_0.gguf",
            quant="Q8_0",
            languages=["en"],
            category="sfx",
        ),
        ModelConfig(
            model_name="moss-soundeffect-v2",
            display_name="MOSS-SoundEffect v2",
            engine="moss_soundeffect",
            hf_repo_id="audio-cpp/audio.cpp-gguf",
            model_size="default",
            size_mb=3816,
            min_ram_mb=6000,
            min_vram_mb=6000,
            languages=["en", "zh"],
            category="sfx",
            quant="Q8_0",
            pip_packages=[],
            download_file="MOSS-SoundEffect-v2-GGUF/moss-soundeffect-v2-q8_0.gguf",
            license_id="apache-2.0",
            license_note="MOSS-SoundEffect v2 (Apache-2.0).",
        ),
        ModelConfig(
            model_name="stable-audio-3-small-music",
            display_name="Stable Audio 3 Small Music",
            engine="sa3_music",
            hf_repo_id="audio-cpp/audio.cpp-gguf",
            model_size="default",
            size_mb=1606,
            min_ram_mb=2200,
            min_vram_mb=2000,
            languages=["en"],
            category="music",
            quant="Q8_0",
            pip_packages=[],
            download_file="Stable-Audio-3-Small-Music-GGUF/stable-audio-3-small-music-q8_0.gguf",
            license_id="stability-community-license",
            license_note="Stability Community License — commercial use allowed below $1M/yr with attribution, otherwise non-commercial.",
            commercial_use=True,
        ),
        ModelConfig(
            model_name="music-cloud",
            display_name="Cloud (BYOK)",
            engine="cloud",
            hf_repo_id="",
            model_size="cloud",
            size_mb=0,
            languages=["en"],
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
                category="translation",
                pip_packages=["argostranslate>=1.9.0"],
            )
        )
    return configs


def _get_audio_processing_configs() -> list[ModelConfig]:
    """Return audio-processing model configs (none left; Demucs lives in _get_demucs_configs)."""
    return []


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
            category="instruments",
            download_url="https://github.com/pianobooster/fluid-soundfont/releases/download/v3.1/FluidR3_GM.sf2",
        ),
    ]


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
            category="vc",
        )
    ]


def _get_demucs_configs() -> list[ModelConfig]:
    """Demucs stem-separation (ONNX, no torch)."""
    return [
        ModelConfig(
            model_name="demucs-int8",
            display_name="Demucs (Stem Separation)",
            engine="demucs_onnx",
            hf_repo_id="itamiArika/htdemucs-int8-memory",
            model_size="int8",
            size_mb=94,
            min_ram_mb=2000,
            min_vram_mb=0,
            quant="int8",
            languages=["en"],
            category="music",
            commercial_use=True,
        )
    ]
