"""Community preset repository — browsable collection of shared presets."""

from dataclasses import dataclass


@dataclass
class CommunityPreset:
    id: str
    name: str
    description: str
    author: str
    category: str
    tags: list[str]
    effects_chain: list[dict]
    created_at: str = ""
    is_featured: bool = False


_presets: list[CommunityPreset] = [
    CommunityPreset(
        id="builtin-voice-clean",
        name="Voice Clean",
        description="Clean dialogue with gate, compression, and EQ",
        author="otoyin",
        category="Voice",
        tags=["dialogue", "clean", "voice"],
        effects_chain=[
            {"type": "noise_gate", "params": {"threshold": -40}},
            {"type": "compressor", "params": {"threshold_db": -18, "ratio": 3}},
            {"type": "eq", "params": {"low_gain": -2, "mid_gain": 1, "high_gain": 2}},
        ],
        created_at="2024-01-01T00:00:00",
        is_featured=True,
    ),
    CommunityPreset(
        id="builtin-podcast",
        name="Podcast Ready",
        description="Loud and clear for podcast distribution",
        author="otoyin",
        category="Voice",
        tags=["podcast", "broadcast", "loud"],
        effects_chain=[
            {"type": "compressor", "params": {"threshold_db": -20, "ratio": 4}},
            {"type": "eq", "params": {"low_gain": -3, "mid_gain": 2, "high_gain": 3}},
            {"type": "gain", "params": {"gain_db": 3}},
        ],
        created_at="2024-01-01T00:00:00",
        is_featured=True,
    ),
    CommunityPreset(
        id="builtin-cinematic",
        name="Cinematic Voice",
        description="Cinematic dialogue with subtle reverb",
        author="otoyin",
        category="Voice",
        tags=["cinema", "film", "reverb"],
        effects_chain=[
            {"type": "reverb", "params": {"room_size": 0.3, "damping": 0.5, "wet_level": 0.15}},
            {"type": "compressor", "params": {"threshold_db": -22, "ratio": 3}},
        ],
        created_at="2024-01-01T00:00:00",
        is_featured=True,
    ),
    CommunityPreset(
        id="builtin-robot",
        name="Robot Voice",
        description="Robotic voice effect with chorus and distortion",
        author="otoyin",
        category="Effects",
        tags=["robot", "sci-fi", "effect"],
        effects_chain=[
            {"type": "chorus", "params": {"rate_hz": 0.1, "depth": 0.9, "centre_delay_ms": 15}},
            {"type": "pitch_shift", "params": {"semitones": -2}},
            {"type": "distortion", "params": {"gain_db": 6}},
        ],
        created_at="2024-01-01T00:00:00",
    ),
    CommunityPreset(
        id="builtin-whisper",
        name="Whisper",
        description="Intimate whisper effect with compression and presence",
        author="otoyin",
        category="Voice",
        tags=["whisper", "intimate", "close"],
        effects_chain=[
            {"type": "compressor", "params": {"threshold_db": -30, "ratio": 6}},
            {"type": "eq", "params": {"low_gain": -6, "mid_gain": 4, "high_gain": 6}},
            {"type": "gain", "params": {"gain_db": 6}},
        ],
        created_at="2024-01-01T00:00:00",
    ),
]


def list_community_presets(category: str | None = None, search: str | None = None) -> list[CommunityPreset]:
    results = _presets
    if category:
        results = [p for p in results if p.category.lower() == category.lower()]
    if search:
        search_lower = search.lower()
        results = [
            p
            for p in results
            if search_lower in p.name.lower()
            or search_lower in p.description.lower()
            or any(search_lower in t for t in p.tags)
        ]
    return sorted(results, key=lambda p: (-p.is_featured, p.name))


def list_categories() -> list[str]:
    return list(set(p.category for p in _presets))
