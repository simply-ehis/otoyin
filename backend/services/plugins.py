"""Plugin hosting — unified registry of built-in DSP effects and scanned VST3/AU plugins."""

import io
import logging
import os
import platform
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


BUILTIN_EFFECTS = {
    "pitch_shift": {
        "name": "Pitch Shift",
        "description": "Shift pitch up or down by semitones",
        "params": {"semitones": {"min": -12, "max": 12, "default": 0, "unit": "st"}},
    },
    "formant_shift": {
        "name": "Formant Shift",
        "description": "Shift formant frequencies",
        "params": {"shift_factor": {"min": 0.5, "max": 2.0, "default": 1.0, "unit": ""}},
    },
    "time_stretch": {
        "name": "Time Stretch",
        "description": "Stretch or compress time without pitch change",
        "params": {"factor": {"min": 0.5, "max": 2.0, "default": 1.0, "unit": ""}},
    },
    "reverb": {
        "name": "Reverb",
        "description": "Room reverb with adjustable size and damping",
        "params": {
            "room_size": {"min": 0, "max": 1, "default": 0.5, "unit": ""},
            "damping": {"min": 0, "max": 1, "default": 0.5, "unit": ""},
            "wet": {"min": 0, "max": 1, "default": 0.3, "unit": ""},
        },
    },
    "delay": {
        "name": "Delay",
        "description": "Echo/delay with feedback control",
        "params": {
            "delay_ms": {"min": 10, "max": 1000, "default": 200, "unit": "ms"},
            "feedback": {"min": 0, "max": 0.9, "default": 0.4, "unit": ""},
            "mix": {"min": 0, "max": 1, "default": 0.3, "unit": ""},
        },
    },
    "chorus": {
        "name": "Chorus",
        "description": "Chorus/flanger modulation effect",
        "params": {
            "depth": {"min": 0, "max": 0.01, "default": 0.002, "unit": ""},
            "rate": {"min": 0.1, "max": 5, "default": 1.5, "unit": "Hz"},
            "mix": {"min": 0, "max": 1, "default": 0.5, "unit": ""},
        },
    },
    "distortion": {
        "name": "Distortion",
        "description": "Soft-clipping distortion/saturation",
        "params": {
            "gain": {"min": 1, "max": 10, "default": 2.0, "unit": ""},
            "mix": {"min": 0, "max": 1, "default": 0.5, "unit": ""},
        },
    },
    "eq": {
        "name": "EQ",
        "description": "3-band shelving EQ",
        "params": {
            "low_gain": {"min": -12, "max": 12, "default": 0, "unit": "dB"},
            "mid_gain": {"min": -12, "max": 12, "default": 0, "unit": "dB"},
            "high_gain": {"min": -12, "max": 12, "default": 0, "unit": "dB"},
        },
    },
    "compressor": {
        "name": "Compressor",
        "description": "Dynamic range compressor",
        "params": {
            "threshold": {"min": -60, "max": 0, "default": -20, "unit": "dB"},
            "ratio": {"min": 1, "max": 20, "default": 4, "unit": ""},
            "attack": {"min": 0.001, "max": 0.1, "default": 0.01, "unit": "s"},
            "release": {"min": 0.01, "max": 1, "default": 0.1, "unit": "s"},
        },
    },
    "noise_gate": {
        "name": "Noise Gate",
        "description": "Gate that silences below threshold",
        "params": {"threshold": {"min": -60, "max": 0, "default": -40, "unit": "dB"}},
    },
}


@dataclass
class PluginInfo:
    id: str
    name: str
    vendor: str
    category: str
    path: str
    version: str
    is_vst3: bool = False
    is_au: bool = False
    is_builtin: bool = False
    is_enabled: bool = True
    params: dict = field(default_factory=dict)
    description: str = ""


# ── VST3/AU scanning ──────────────────────────────────────────────────


def _scan_vst3_paths() -> list[str]:
    system = platform.system()
    if system == "Windows":
        return [
            os.environ.get("VST3_USER_PATH", str(Path.home() / "Documents" / "VST3")),
            os.environ.get("VST3_SYSTEM_PATH", "C:\\Program Files\\Common Files\\VST3"),
            "C:\\Program Files\\Steinberg\\VST3",
        ]
    if system == "Darwin":
        return [
            os.path.expanduser("~/Library/Audio/Plug-Ins/VST3"),
            "/Library/Audio/Plug-Ins/VST3",
        ]
    return [
        os.path.expanduser("~/.vst3"),
        "/usr/lib/vst3",
        "/usr/local/lib/vst3",
    ]


def _scan_au_paths() -> list[str]:
    if platform.system() == "Darwin":
        return [
            os.path.expanduser("~/Library/Audio/Plug-Ins/Components"),
            "/Library/Audio/Plug-Ins/Components",
        ]
    return []


def _parse_vst3_name(path: str) -> tuple[str, str, str]:
    stem = Path(path).stem
    name = stem.removesuffix(".vst3")
    name = name.replace("_", " ").replace("-", " ").strip()
    vendor = "Unknown"
    known_vendors = {
        "iZotope",
        "Waves",
        "FabFilter",
        "Valhalla",
        "Soundtoys",
        "Arturia",
        "Native",
        "Korg",
        "Roland",
        "Ableton",
        "Steinberg",
        "UAD",
        "Universal",
        "Lexicon",
        "Eventide",
        "Melda",
        "W.A",
    }
    for v in known_vendors:
        if name.startswith(v):
            vendor = v
            name = name.removeprefix(v).strip()
            break
    return name.strip(), vendor, "1.0.0"


def scan_external_plugins(paths: list[str]) -> list[PluginInfo]:
    found: list[PluginInfo] = []
    for search_path in paths:
        if not os.path.isdir(search_path):
            continue
        try:
            for entry in os.scandir(search_path):
                if entry.is_dir() and entry.name.endswith(".vst3"):
                    name, vendor, version = _parse_vst3_name(entry.path)
                    found.append(
                        PluginInfo(
                            id=f"vst3-{entry.name}",
                            name=name,
                            vendor=vendor,
                            category="VST3",
                            path=entry.path,
                            version=version,
                            is_vst3=True,
                        )
                    )
                elif entry.is_dir() and entry.name.endswith(".component"):
                    name = entry.name.removesuffix(".component").replace("_", " ").strip()
                    found.append(
                        PluginInfo(
                            id=f"au-{entry.name}",
                            name=name,
                            vendor="Unknown",
                            category="Audio Unit",
                            path=entry.path,
                            version="1.0.0",
                            is_au=True,
                        )
                    )
        except PermissionError:
            logger.warning(f"Permission denied scanning {search_path}")
            continue
    return found


# ── Unified Plugin Registry ───────────────────────────────────────────


class PluginRegistry:
    def __init__(self):
        self._external: list[PluginInfo] = []
        self._builtin: list[PluginInfo] = []
        self._scanned = False

    def scan(self):
        paths = _scan_vst3_paths() + _scan_au_paths()
        self._external = scan_external_plugins(paths)
        self._builtin = self._build_builtin_plugins()
        self._scanned = True
        logger.info(f"Registry: {len(self._builtin)} built-in + {len(self._external)} external plugins")

    def _build_builtin_plugins(self) -> list[PluginInfo]:
        plugins = []
        for type_key, defn in BUILTIN_EFFECTS.items():
            params = {}
            for pname, pdef in defn.get("params", {}).items():
                params[pname] = {
                    "min": pdef.get("min", 0),
                    "max": pdef.get("max", 1),
                    "default": pdef.get("default", 0),
                    "unit": pdef.get("unit", ""),
                }
            plugins.append(
                PluginInfo(
                    id=f"builtin-{type_key}",
                    name=defn.get("name", type_key),
                    vendor="21labs",
                    category="Built-in",
                    path="",
                    version="1.0.0",
                    is_builtin=True,
                    params=params,
                    description=defn.get("description", ""),
                )
            )
        return plugins

    def list_all(self) -> list[PluginInfo]:
        if not self._scanned:
            self.scan()
        return self._builtin + self._external

    def list_by_category(self, category: str) -> list[PluginInfo]:
        return [p for p in self.list_all() if p.category.lower() == category.lower()]

    def get(self, plugin_id: str) -> PluginInfo | None:
        for p in self.list_all():
            if p.id == plugin_id:
                return p
        return None

    def load_plugin(self, plugin_id: str) -> bool:
        plugin = self.get(plugin_id)
        if plugin and plugin.is_builtin:
            logger.info(f"Loaded built-in plugin: {plugin.name}")
            return True
        if plugin and (plugin.is_vst3 or plugin.is_au):
            logger.info(f"Loaded external plugin (metadata only): {plugin.name}")
            return True
        return False


registry = PluginRegistry()


def list_plugins() -> list[dict]:
    return [
        {
            "id": p.id,
            "name": p.name,
            "vendor": p.vendor,
            "category": p.category,
            "version": p.version,
            "type": "Built-in" if p.is_builtin else "VST3" if p.is_vst3 else "AU" if p.is_au else "Unknown",
            "enabled": p.is_enabled,
            "is_builtin": p.is_builtin,
            "params": p.params,
            "description": p.description,
        }
        for p in registry.list_all()
    ]


def get_plugin_status() -> dict:
    if not registry._scanned:
        registry.scan()
    all_plugins = registry.list_all()
    return {
        "available": len(all_plugins) > 0,
        "plugin_count": len(all_plugins),
        "builtin_count": len(registry._builtin),
        "external_count": len(registry._external),
        "platform": platform.system(),
        "scan_paths": _scan_vst3_paths() + _scan_au_paths(),
    }


def process_plugin_chain(
    audio_path: str,
    chain: list[dict],
    output_path: str,
) -> str:
    """Apply a plugin chain to an audio file and save the result."""
    from .. import config
    from ..services.effects_chain import EffectConfig, apply_effects_chain
    from ..utils.audio import load_audio, save_audio

    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    audio, sample_rate = load_audio(str(resolved))

    effect_configs = []
    for item in chain:
        plugin_id = item.get("plugin_id", "")
        params = item.get("params", {})
        enabled = item.get("enabled", True)
        plugin = registry.get(plugin_id)
        if plugin and plugin.is_builtin and enabled:
            effect_type = plugin_id.removeprefix("builtin-")
            effect_configs.append(
                EffectConfig(
                    effect_type=effect_type,
                    enabled=True,
                    params=params,
                )
            )

    if effect_configs:
        processed = apply_effects_chain(audio, sample_rate, effect_configs)
    else:
        processed = audio

    save_audio(processed, output_path, sample_rate)
    return output_path


def preview_plugin_chain(
    audio_path: str,
    chain: list[dict],
) -> bytes:
    """Apply a plugin chain and return raw WAV bytes (no file saved)."""
    from .. import config
    from ..services.effects_chain import EffectConfig, apply_effects_chain
    from ..utils.audio import load_audio

    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    audio, sample_rate = load_audio(str(resolved))

    effect_configs = []
    for item in chain:
        plugin_id = item.get("plugin_id", "")
        params = item.get("params", {})
        enabled = item.get("enabled", True)
        plugin = registry.get(plugin_id)
        if plugin and plugin.is_builtin and enabled:
            effect_type = plugin_id.removeprefix("builtin-")
            effect_configs.append(
                EffectConfig(
                    effect_type=effect_type,
                    enabled=True,
                    params=params,
                )
            )

    if effect_configs:
        processed = apply_effects_chain(audio, sample_rate, effect_configs)
    else:
        processed = audio

    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, processed, sample_rate, format="WAV")
    buf.seek(0)
    return buf.read()
