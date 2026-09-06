"""TTS model configs."""

from ..protocols import ModelConfig, PresetVoiceConfig

# Populated lazily from bark_backend.BARK_VOICES on first call (avoids a
# circular import through .base -> configs).
_BARK_STRUCTURED_VOICES: list[PresetVoiceConfig] | None = None

# Shared Pocket-TTS voice presets (torch + ONNX variants use identical lists).
_POCKET_TTS_PRESET_IDS = [
    "alba",
    "alba-mackenna",
    "amanda",
    "brian",
    "brian-friend",
    "chris",
    "jenny",
    "jenny-schroeder",
    "jordan",
    "jordan-friend",
    "leo",
    "leo-friend",
    "mahrus",
    "mahrus-langman",
    "mila",
    "mila-friend",
    "patt",
    "patt-friend",
    "tom",
    "tom-langman",
]
_POCKET_TTS_STRUCTURED_VOICES = [
    PresetVoiceConfig(id="alba", name="Alba", gender="female", language="en"),
    PresetVoiceConfig(id="alba-mackenna", name="Alba Mackenna", gender="female", language="en"),
    PresetVoiceConfig(id="amanda", name="Amanda", gender="female", language="en"),
    PresetVoiceConfig(id="brian", name="Brian", gender="male", language="en"),
    PresetVoiceConfig(id="brian-friend", name="Brian (Friend)", gender="male", language="en"),
    PresetVoiceConfig(id="chris", name="Chris", gender="male", language="en"),
    PresetVoiceConfig(id="jenny", name="Jenny", gender="female", language="en"),
    PresetVoiceConfig(id="jenny-schroeder", name="Jenny Schroeder", gender="female", language="en"),
    PresetVoiceConfig(id="jordan", name="Jordan", gender="neutral", language="en"),
    PresetVoiceConfig(id="jordan-friend", name="Jordan (Friend)", gender="neutral", language="en"),
    PresetVoiceConfig(id="leo", name="Leo", gender="male", language="en"),
    PresetVoiceConfig(id="leo-friend", name="Leo (Friend)", gender="male", language="en"),
    PresetVoiceConfig(id="mahrus", name="Mahrus", gender="male", language="en"),
    PresetVoiceConfig(id="mahrus-langman", name="Mahrus Langman", gender="male", language="en"),
    PresetVoiceConfig(id="mila", name="Mila", gender="female", language="en"),
    PresetVoiceConfig(id="mila-friend", name="Mila (Friend)", gender="female", language="en"),
    PresetVoiceConfig(id="patt", name="Patt", gender="female", language="en"),
    PresetVoiceConfig(id="patt-friend", name="Patt (Friend)", gender="female", language="en"),
    PresetVoiceConfig(id="tom", name="Tom", gender="male", language="en"),
    PresetVoiceConfig(id="tom-langman", name="Tom Langman", gender="male", language="en"),
]


# Shared Kokoro voice presets (torch + ONNX variants use identical lists).
_KOKORO_STRUCTURED_VOICES = [
    # American English female
    PresetVoiceConfig(id="af_alloy", name="Alloy", gender="female", language="en"),
    PresetVoiceConfig(id="af_aoede", name="Aoede", gender="female", language="en"),
    PresetVoiceConfig(id="af_bella", name="Bella", gender="female", language="en"),
    PresetVoiceConfig(id="af_heart", name="Heart", gender="female", language="en"),
    PresetVoiceConfig(id="af_jessica", name="Jessica", gender="female", language="en"),
    PresetVoiceConfig(id="af_kore", name="Kore", gender="female", language="en"),
    PresetVoiceConfig(id="af_nicole", name="Nicole", gender="female", language="en"),
    PresetVoiceConfig(id="af_nova", name="Nova", gender="female", language="en"),
    PresetVoiceConfig(id="af_river", name="River", gender="female", language="en"),
    PresetVoiceConfig(id="af_sarah", name="Sarah", gender="female", language="en"),
    PresetVoiceConfig(id="af_sky", name="Sky", gender="female", language="en"),
    # American English male
    PresetVoiceConfig(id="am_adam", name="Adam", gender="male", language="en"),
    PresetVoiceConfig(id="am_echo", name="Echo", gender="male", language="en"),
    PresetVoiceConfig(id="am_eric", name="Eric", gender="male", language="en"),
    PresetVoiceConfig(id="am_fenrir", name="Fenrir", gender="male", language="en"),
    PresetVoiceConfig(id="am_liam", name="Liam", gender="male", language="en"),
    PresetVoiceConfig(id="am_michael", name="Michael", gender="male", language="en"),
    PresetVoiceConfig(id="am_onyx", name="Onyx", gender="male", language="en"),
    PresetVoiceConfig(id="am_puck", name="Puck", gender="male", language="en"),
    PresetVoiceConfig(id="am_santa", name="Santa", gender="male", language="en"),
    # British English female
    PresetVoiceConfig(id="bf_alice", name="Alice", gender="female", language="en"),
    PresetVoiceConfig(id="bf_emma", name="Emma", gender="female", language="en"),
    PresetVoiceConfig(id="bf_isabella", name="Isabella", gender="female", language="en"),
    PresetVoiceConfig(id="bf_lily", name="Lily", gender="female", language="en"),
    # British English male
    PresetVoiceConfig(id="bm_daniel", name="Daniel", gender="male", language="en"),
    PresetVoiceConfig(id="bm_fable", name="Fable", gender="male", language="en"),
    PresetVoiceConfig(id="bm_george", name="George", gender="male", language="en"),
    PresetVoiceConfig(id="bm_lewis", name="Lewis", gender="male", language="en"),
    # Spanish
    PresetVoiceConfig(id="ef_dora", name="Dora", gender="female", language="es"),
    PresetVoiceConfig(id="em_alex", name="Alex", gender="male", language="es"),
    PresetVoiceConfig(id="em_santa", name="Santa", gender="male", language="es"),
    # French
    PresetVoiceConfig(id="ff_siwis", name="Siwis", gender="female", language="fr"),
    # Hindi
    PresetVoiceConfig(id="hf_alpha", name="Alpha", gender="female", language="hi"),
    PresetVoiceConfig(id="hf_beta", name="Beta", gender="female", language="hi"),
    PresetVoiceConfig(id="hm_omega", name="Omega", gender="male", language="hi"),
    PresetVoiceConfig(id="hm_psi", name="Psi", gender="male", language="hi"),
    # Italian
    PresetVoiceConfig(id="if_sara", name="Sara", gender="female", language="it"),
    PresetVoiceConfig(id="im_nicola", name="Nicola", gender="male", language="it"),
    # Japanese
    PresetVoiceConfig(id="jf_alpha", name="Alpha", gender="female", language="ja"),
    PresetVoiceConfig(id="jf_gongitsune", name="Gongitsune", gender="female", language="ja"),
    PresetVoiceConfig(id="jf_nezumi", name="Nezumi", gender="female", language="ja"),
    PresetVoiceConfig(id="jf_tebukuro", name="Tebukuro", gender="female", language="ja"),
    PresetVoiceConfig(id="jm_kumo", name="Kumo", gender="male", language="ja"),
    # Portuguese
    PresetVoiceConfig(id="pf_dora", name="Dora", gender="female", language="pt"),
    PresetVoiceConfig(id="pm_alex", name="Alex", gender="male", language="pt"),
    PresetVoiceConfig(id="pm_santa", name="Santa", gender="male", language="pt"),
    # Chinese
    PresetVoiceConfig(id="zf_xiaobei", name="Xiaobei", gender="female", language="zh"),
    PresetVoiceConfig(id="zf_xiaoni", name="Xiaoni", gender="female", language="zh"),
    PresetVoiceConfig(id="zf_xiaoxiao", name="Xiaoxiao", gender="female", language="zh"),
    PresetVoiceConfig(id="zf_xiaoyi", name="Xiaoyi", gender="female", language="zh"),
]


def _get_tts_configs() -> list[ModelConfig]:
    """Return model configs for the standard TTS engines.

    These are static — no backend-type branching needed.
    """
    from ..bark_backend import BARK_VOICES

    global _BARK_STRUCTURED_VOICES
    if _BARK_STRUCTURED_VOICES is None:
        _BARK_STRUCTURED_VOICES = [
            PresetVoiceConfig(id=voice_id, name=name, gender=gender, language=language)
            for voice_id, name, gender, language in BARK_VOICES
        ]
    return [
        # --- Kokoro 82M (ONNX): torch-free, same 45 voices, 8 languages ---
        ModelConfig(
            model_name="kokoro-onnx",
            display_name="Kokoro 82M",
            engine="kokoro",
            hf_repo_id="Heliosoph/kokoro-v1.0-onnx",
            size_mb=340,
            languages=["en", "es", "fr", "hi", "it", "pt", "ja", "zh"],
            supports_voice_mixing=True,
            structured_preset_voices=_KOKORO_STRUCTURED_VOICES,
            quality_score=10,
            category="tts",
            quant="int8",
        ),
        # --- Fish Audio S2 Pro (GGUF, 4.56B Dual-AR): s2.cpp sidecar -----
        # Fish Audio Research License (non-commercial research). Q4_K_M GGUF
        # (3.4 GB) packs Dual-AR weights + RVQ codec. One-shot subprocess per
        # generation; voice cloning from 5-30s reference audio. Priced at
        # $80 user anchor (overrides $91 equation — see PRICING_PLAN.md §3).
        ModelConfig(
            model_name="fish-speech-s2-pro",
            display_name="Fish Audio S2 Pro (GGUF)",
            engine="fish_speech_s2",
            hf_repo_id="rodrigomt/s2-pro-gguf",
            size_mb=3400,
            clone_voice=True,
            quality_score=10,
            category="tts",
            emotion_control=True,
            paralinguistic_tags=True,
            gpu_only=True,
            quant="Q4_K_M",
            supported_tags=[
                "[angry]",
                "[sad]",
                "[whisper]",
                "[shout]",
                "[laugh]",
                "[sigh]",
                "[excited]",
                "[surprised]",
            ],
            languages=["en", "zh", "ja", "ko", "de", "fr", "es", "pt", "ru", "it"],
        ),
        # --- Zyphra Zonos v0.1: Apache-2.0, clone + emotion ------------
        ModelConfig(
            model_name="zonos-v0.1",
            display_name="Zyphra Zonos v0.1",
            engine="zonos",
            hf_repo_id="Zyphra/Zonos-v0.1-transformer",
            size_mb=2000,
            clone_voice=True,
            quality_score=9,
            category="tts",
            emotion_control=True,
            paralinguistic_tags=True,
            supported_tags=[
                "[angry]",
                "[happy]",
                "[sad]",
                "[fearful]",
                "[surprised]",
                "[whisper]",
                "[shout]",
                "[laugh]",
                "[cry]",
                "[excited]",
            ],
            languages=["en", "ja", "zh", "fr", "de"],
        ),
        # --- Pocket-TTS: 100M, CPU, clone + presets, CC-BY-4.0 -----
        ModelConfig(
            model_name="pocket-tts",
            display_name="Pocket-TTS",
            engine="pocket_tts",
            hf_repo_id="kyutai/pocket-tts",
            size_mb=200,
            clone_voice=True,
            quality_score=5,
            category="tts",
            preset_voices=_POCKET_TTS_PRESET_IDS,
            structured_preset_voices=_POCKET_TTS_STRUCTURED_VOICES,
            languages=["en", "fr", "de", "pt", "it", "es"],
        ),
        # --- Pocket-TTS ONNX: torch-free, 6 languages ---
        ModelConfig(
            model_name="pocket-tts-onnx",
            display_name="Pocket-TTS",
            engine="pocket_tts",
            hf_repo_id="KevinAHM/pocket-tts-onnx",
            size_mb=200,
            clone_voice=True,
            quality_score=5,
            category="tts",
            preset_voices=_POCKET_TTS_PRESET_IDS,
            structured_preset_voices=_POCKET_TTS_STRUCTURED_VOICES,
            languages=["en", "de", "fr", "it", "pt", "es"],
            quant="int8",
        ),
        # --- MOSS-TTS-Nano: 100M, torch-free ONNX, zero-shot clone -----
        # Weights = MOSS-TTS-Nano-100M-ONNX (~673MB: .data + .onnx) +
        # MOSS-Audio-Tokenizer-Nano-ONNX (~91MB codec). Only ONNX path
        # exists (no torch fallback); factory raises if assets absent.
        ModelConfig(
            model_name="moss-tts-nano",
            display_name="MOSS-TTS-Nano",
            engine="moss_tts_nano",
            hf_repo_id="OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX",
            size_mb=763,
            clone_voice=True,
            quality_score=5,
            category="tts",
            languages=[
                "en",
                "zh",
                "ja",
                "ko",
                "de",
                "fr",
                "ru",
                "pt",
                "es",
                "it",
                "ar",
                "tr",
                "pl",
                "nl",
                "id",
                "vi",
                "th",
                "he",
                "sv",
                "fi",
            ],
            quant="int8",
        ),
        # --- Parler-TTS Mini: Apache-2.0, text-described voice --------
        ModelConfig(
            model_name="parler-tts-mini",
            display_name="Parler-TTS Mini",
            engine="parler_tts",
            hf_repo_id="parler-tts/parler-tts-mini-v1",
            model_size="mini",
            size_mb=880,
            voice_design=True,
            quality_score=6,
            category="tts",
            preset_voices=[
                "Jon",
                "Lea",
                "Gary",
                "Jenna",
                "Mike",
                "Laura",
                "Alex",
                "Ella",
                "Josh",
                "Bill",
                "Mia",
                "Zoey",
                "Tom",
                "Lily",
            ],
            structured_preset_voices=[
                PresetVoiceConfig(id="Jon", name="Jon", gender="male", language="en"),
                PresetVoiceConfig(id="Lea", name="Lea", gender="female", language="en"),
                PresetVoiceConfig(id="Gary", name="Gary", gender="male", language="en"),
                PresetVoiceConfig(id="Jenna", name="Jenna", gender="female", language="en"),
                PresetVoiceConfig(id="Mike", name="Mike", gender="male", language="en"),
                PresetVoiceConfig(id="Laura", name="Laura", gender="female", language="en"),
                PresetVoiceConfig(id="Alex", name="Alex", gender="male", language="en"),
                PresetVoiceConfig(id="Ella", name="Ella", gender="female", language="en"),
                PresetVoiceConfig(id="Josh", name="Josh", gender="male", language="en"),
                PresetVoiceConfig(id="Bill", name="Bill", gender="male", language="en"),
                PresetVoiceConfig(id="Mia", name="Mia", gender="female", language="en"),
                PresetVoiceConfig(id="Zoey", name="Zoey", gender="female", language="en"),
                PresetVoiceConfig(id="Tom", name="Tom", gender="male", language="en"),
                PresetVoiceConfig(id="Lily", name="Lily", gender="female", language="en"),
            ],
            languages=["en"],
            needs_trim=True,
            quant="int8",
        ),
        # --- KittenTTS mini: Apache-2.0, lightest TTS (no torch, CPU-only).
        # Checkpoint is selectable via KITTEN_SIZE env (mini=80MB / micro=40MB /
        # nano=15MB). 8 preset voices, no cloning, no voice mixing. Output 24kHz.
        ModelConfig(
            model_name="kitten-tts-mini",
            display_name="KittenTTS (mini, 80MB)",
            engine="kitten_tts",
            hf_repo_id="KittenML/kitten-tts-mini-0.8",
            model_size="mini",
            size_mb=80,
            quality_score=3,
            category="tts",
            preset_voices=["Bella", "Jasper", "Luna", "Bruno", "Rosie", "Hugo", "Kiki", "Leo"],
            structured_preset_voices=[
                PresetVoiceConfig(id="Bella", name="Bella", gender="female", language="en"),
                PresetVoiceConfig(id="Jasper", name="Jasper", gender="male", language="en"),
                PresetVoiceConfig(id="Luna", name="Luna", gender="female", language="en"),
                PresetVoiceConfig(id="Bruno", name="Bruno", gender="male", language="en"),
                PresetVoiceConfig(id="Rosie", name="Rosie", gender="female", language="en"),
                PresetVoiceConfig(id="Hugo", name="Hugo", gender="male", language="en"),
                PresetVoiceConfig(id="Kiki", name="Kiki", gender="female", language="en"),
                PresetVoiceConfig(id="Leo", name="Leo", gender="male", language="en"),
            ],
            languages=["en"],
            quant="int8",
        ),
        # --- Qwen3-TTS 12Hz 1.7B Base (GGUF): llama-tts sidecar ------------
        # Apache-2.0 weights, sellable (catalog id qwen3-tts-1.7b, $40).
        # Needs TWO files from ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF:
        # backbone Q4_K_M (1.04 GB) + mmproj Q8_0 (446 MB). One-shot
        # subprocess per generation; batch TTS on weak CPUs (RTF ~3-6).
        ModelConfig(
            model_name="qwen3-tts-1.7b",
            display_name="Qwen3-TTS 12Hz 1.7B Base (GGUF)",
            engine="qwen3_tts",
            hf_repo_id="ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF",
            size_mb=1486,
            clone_voice=True,
            voice_design=True,
            quality_score=8,
            category="tts",
            quant="Q4_K_M",
            languages=["zh", "en", "de", "it", "pt", "es", "ja", "ko", "fr", "ru"],
        ),
        # --- Bark Small (GGUF): CrispASR sidecar ---------------------------
        # MIT weights, sellable (catalog id bark-small, $5). Single GGUF
        # (bark-small-q4_k.gguf, 235 MB) packs all three GPT-2 sub-models +
        # the EnCodec 24kHz decoder. Preset voices only (26 speakers from
        # suno/bark-small, packed into .npz at download time). One-shot
        # subprocess per generation; batch TTS on weak CPUs (RTF ~3.3).
        ModelConfig(
            model_name="bark-small",
            display_name="Bark Small (GGUF)",
            engine="bark_small",
            hf_repo_id="cstr/bark-small-GGUF",
            size_mb=235,
            quality_score=4,
            category="tts",
            quant="q4_k",
            preset_voices=[v.id for v in _BARK_STRUCTURED_VOICES],
            structured_preset_voices=_BARK_STRUCTURED_VOICES,
            languages=["en", "de", "es", "fr", "hi", "it", "ja", "ko", "pl", "pt", "ru", "tr", "zh"],
        ),
    ]
