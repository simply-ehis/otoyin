from typing import Any

BUILTIN_PRESETS: dict[str, dict[str, Any]] = {
    "robotic": {
        "name": "Robotic",
        "sort_order": 0,
        "description": "Metallic robotic voice (flanger with slow LFO and high feedback)",
        "effects_chain": [
            {
                "type": "chorus",
                "enabled": True,
                "params": {
                    "rate_hz": 0.2,
                    "depth": 1.0,
                    "feedback": 0.35,
                    "centre_delay_ms": 7.0,
                    "mix": 0.5,
                },
            },
        ],
    },
    "radio": {
        "name": "Radio",
        "sort_order": 1,
        "description": "Thin AM-radio voice with band-pass filtering and light compression",
        "effects_chain": [
            {
                "type": "highpass",
                "enabled": True,
                "params": {"cutoff_frequency_hz": 300.0},
            },
            {
                "type": "lowpass",
                "enabled": True,
                "params": {"cutoff_frequency_hz": 3500.0},
            },
            {
                "type": "compressor",
                "enabled": True,
                "params": {
                    "threshold_db": -15.0,
                    "ratio": 6.0,
                    "attack_ms": 5.0,
                    "release_ms": 50.0,
                },
            },
            {
                "type": "gain",
                "enabled": True,
                "params": {"gain_db": 6.0},
            },
        ],
    },
    "echo_chamber": {
        "name": "Echo Chamber",
        "sort_order": 2,
        "description": "Spacious reverb with trailing echo",
        "effects_chain": [
            {
                "type": "reverb",
                "enabled": True,
                "params": {
                    "room_size": 0.85,
                    "damping": 0.3,
                    "wet_level": 0.45,
                    "dry_level": 0.55,
                    "width": 1.0,
                },
            },
            {
                "type": "delay",
                "enabled": True,
                "params": {
                    "delay_seconds": 0.25,
                    "feedback": 0.3,
                    "mix": 0.2,
                },
            },
        ],
    },
    "deep_voice": {
        "name": "Deep Voice",
        "sort_order": 99,
        "description": "Lower pitch with added warmth",
        "effects_chain": [
            {
                "type": "pitch_shift",
                "enabled": True,
                "params": {"semitones": -3.0},
            },
            {
                "type": "lowpass",
                "enabled": True,
                "params": {"cutoff_frequency_hz": 6000.0},
            },
            {
                "type": "compressor",
                "enabled": True,
                "params": {
                    "threshold_db": -18.0,
                    "ratio": 3.0,
                    "attack_ms": 10.0,
                    "release_ms": 150.0,
                },
            },
        ],
    },
    "chipmunk": {
        "name": "Chipmunk",
        "sort_order": 3,
        "description": "High-pitched chipmunk voice",
        "effects_chain": [
            {
                "type": "pitch_shift",
                "enabled": True,
                "params": {"semitones": 7.0},
            },
        ],
    },
    "radio_host": {
        "name": "Radio Host",
        "sort_order": 4,
        "description": "Warm radio host voice with compression and presence",
        "effects_chain": [
            {
                "type": "highpass",
                "enabled": True,
                "params": {"cutoff_frequency_hz": 80.0},
            },
            {
                "type": "lowpass",
                "enabled": True,
                "params": {"cutoff_frequency_hz": 12000.0},
            },
            {
                "type": "compressor",
                "enabled": True,
                "params": {
                    "threshold_db": -20.0,
                    "ratio": 4.0,
                    "attack_ms": 5.0,
                    "release_ms": 100.0,
                },
            },
            {
                "type": "gain",
                "enabled": True,
                "params": {"gain_db": 3.0},
            },
        ],
    },
    "monster": {
        "name": "Monster",
        "sort_order": 5,
        "description": "Deep, menacing monster voice",
        "effects_chain": [
            {
                "type": "pitch_shift",
                "enabled": True,
                "params": {"semitones": -5.0},
            },
            {
                "type": "lowpass",
                "enabled": True,
                "params": {"cutoff_frequency_hz": 5000.0},
            },
            {
                "type": "compressor",
                "enabled": True,
                "params": {
                    "threshold_db": -15.0,
                    "ratio": 6.0,
                    "attack_ms": 2.0,
                    "release_ms": 50.0,
                },
            },
            {
                "type": "gain",
                "enabled": True,
                "params": {"gain_db": 6.0},
            },
        ],
    },
    "whisper": {
        "name": "Whisper",
        "sort_order": 6,
        "description": "Soft whispery voice",
        "effects_chain": [
            {
                "type": "pitch_shift",
                "enabled": True,
                "params": {"semitones": 2.0},
            },
            {
                "type": "highpass",
                "enabled": True,
                "params": {"cutoff_frequency_hz": 200.0},
            },
            {
                "type": "compressor",
                "enabled": True,
                "params": {
                    "threshold_db": -30.0,
                    "ratio": 3.0,
                    "attack_ms": 10.0,
                    "release_ms": 200.0,
                },
            },
        ],
    },
    "reverb_cathedral": {
        "name": "Reverb — Cathedral",
        "sort_order": 10,
        "description": "Large cathedral reverb with long decay",
        "effects_chain": [
            {
                "type": "reverb",
                "enabled": True,
                "params": {
                    "room_size": 0.95,
                    "damping": 0.2,
                    "wet_level": 0.5,
                    "dry_level": 0.5,
                    "width": 1.0,
                },
            },
        ],
    },
    "reverb_hall": {
        "name": "Reverb — Hall",
        "sort_order": 11,
        "description": "Large hall reverb with moderate decay",
        "effects_chain": [
            {
                "type": "reverb",
                "enabled": True,
                "params": {
                    "room_size": 0.8,
                    "damping": 0.4,
                    "wet_level": 0.4,
                    "dry_level": 0.6,
                    "width": 1.0,
                },
            },
        ],
    },
    "reverb_room": {
        "name": "Reverb — Room",
        "sort_order": 12,
        "description": "Small room reverb with short decay",
        "effects_chain": [
            {
                "type": "reverb",
                "enabled": True,
                "params": {
                    "room_size": 0.3,
                    "damping": 0.6,
                    "wet_level": 0.25,
                    "dry_level": 0.75,
                    "width": 0.8,
                },
            },
        ],
    },
    "reverb_plate": {
        "name": "Reverb — Plate",
        "sort_order": 13,
        "description": "Metallic plate-style reverb",
        "effects_chain": [
            {
                "type": "reverb",
                "enabled": True,
                "params": {
                    "room_size": 0.6,
                    "damping": 0.3,
                    "wet_level": 0.35,
                    "dry_level": 0.65,
                    "width": 1.0,
                },
            },
            {
                "type": "chorus",
                "enabled": True,
                "params": {
                    "rate_hz": 0.5,
                    "depth": 0.3,
                    "feedback": 0.0,
                    "centre_delay_ms": 15.0,
                    "mix": 0.2,
                },
            },
        ],
    },
}
