"""Preset sharing for otoyin — JSON export/import."""

import json
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass
class Preset:
    id: str
    name: str
    description: str = ""
    author: str = "Unknown"
    version: str = "1.0"
    effects_chain: list[dict] = field(default_factory=list)
    mixer_settings: dict | None = None
    tags: list[str] = field(default_factory=list)
    created_at: str = ""
    is_builtin: bool = False


def create_preset(name: str, effects_chain: list[dict], **kwargs) -> Preset:
    return Preset(
        id=str(uuid.uuid4()),
        name=name,
        effects_chain=effects_chain,
        created_at=datetime.now(UTC).isoformat(),
        **kwargs,
    )


def preset_to_export(preset: Preset) -> str:
    data = {
        "21labs_preset_version": "1.0",
        "preset": {
            "name": preset.name,
            "description": preset.description,
            "author": preset.author,
            "version": preset.version,
            "effects_chain": preset.effects_chain,
            "mixer_settings": preset.mixer_settings,
            "tags": preset.tags,
        },
    }
    return json.dumps(data, indent=2)


def preset_from_import(json_str: str) -> Preset:
    data = json.loads(json_str)
    p = data.get("preset", data)
    return Preset(
        id=str(uuid.uuid4()),
        name=p.get("name", "Imported Preset"),
        description=p.get("description", ""),
        author=p.get("author", "Unknown"),
        version=p.get("version", "1.0"),
        effects_chain=p.get("effects_chain", []),
        mixer_settings=p.get("mixer_settings"),
        tags=p.get("tags", []),
        created_at=datetime.now(UTC).isoformat(),
    )


BUILTIN_PRESETS = [
    create_preset(
        "Voice Clean",
        [
            {"type": "noise_gate", "params": {"threshold": -40}},
            {"type": "compressor", "params": {"threshold_db": -18, "ratio": 3}},
            {"type": "eq", "params": {"low_gain": -2, "mid_gain": 1, "high_gain": 2}},
        ],
        description="Clean up dialogue recordings",
        is_builtin=True,
        tags=["dialogue", "clean"],
    ),
    create_preset(
        "Podcast Ready",
        [
            {"type": "compressor", "params": {"threshold_db": -20, "ratio": 4}},
            {"type": "eq", "params": {"low_gain": -3, "mid_gain": 2, "high_gain": 3}},
            {"type": "gain", "params": {"gain_db": 3}},
        ],
        description="Loud and clear for podcasts",
        is_builtin=True,
        tags=["podcast"],
    ),
    create_preset(
        "Cinematic Voice",
        [
            {"type": "reverb", "params": {"room_size": 0.3, "damping": 0.5, "wet_level": 0.15}},
            {"type": "compressor", "params": {"threshold_db": -22, "ratio": 3}},
        ],
        description="Cinematic dialogue feel",
        is_builtin=True,
        tags=["cinema", "voice"],
    ),
]
