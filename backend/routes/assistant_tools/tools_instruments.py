INSTRUMENTS_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "play_gm_instrument",
            "description": "Render a General-MIDI instrument note (program 0-127) via a SoundFont: piano, bass, strings, brass, pads, bells, and more. Offline; requires a SoundFont (any Store instrument-pack bank, or an .sf2 in data/soundfonts).",
            "parameters": {
                "type": "object",
                "properties": {
                    "program": {
                        "type": "integer",
                        "description": "GM program 0-127 (0 piano, 32 bass, 40 strings, 56 trumpet, 73 pad, 112 bell)",
                    },
                    "note": {"type": "integer", "default": 60},
                    "duration": {"type": "number", "default": 1.0},
                    "velocity": {"type": "number", "default": 0.8},
                },
                "required": ["program"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "play_drum_machine",
            "description": "Render a drum pattern loop from synthesized hits (kick/snare/hihat/clap/tom). Each step is a voice name or list of names.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "array",
                        "description": "List of steps; each step a voice name or list of names",
                    },
                    "step_duration": {"type": "number", "default": 0.125},
                    "bars": {"type": "integer", "default": 1},
                    "velocity": {"type": "number", "default": 0.8},
                },
                "required": ["pattern"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "play_piano_note",
            "description": "Render a piano note (additive synth) at a MIDI note. Offline.",
            "parameters": {
                "type": "object",
                "properties": {
                    "note": {"type": "integer", "description": "MIDI note 21-108"},
                    "duration": {"type": "number", "default": 1.0},
                    "velocity": {"type": "number", "default": 0.8},
                },
                "required": ["note"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "play_synth_note",
            "description": "Render a synth note (sine/square/sawtooth/triangle) at a MIDI note. Offline.",
            "parameters": {
                "type": "object",
                "properties": {
                    "note": {"type": "integer", "description": "MIDI note 21-108"},
                    "duration": {"type": "number", "default": 1.0},
                    "waveform": {"type": "string", "default": "sawtooth"},
                    "velocity": {"type": "number", "default": 0.8},
                },
                "required": ["note"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "play_drum_pad",
            "description": "Render a single synthesized drum hit (kick/snare/hihat/clap/tom). Offline.",
            "parameters": {
                "type": "object",
                "properties": {
                    "drum_type": {"type": "string", "default": "kick"},
                    "duration": {"type": "number", "default": 0.5},
                    "velocity": {"type": "number", "default": 0.8},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_noise",
            "description": "Generate procedural noise (white/pink/brown). Offline.",
            "parameters": {
                "type": "object",
                "properties": {
                    "noise_type": {"type": "string", "default": "white"},
                    "duration": {"type": "number", "default": 1.0},
                    "amplitude": {"type": "number", "default": 0.5},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_loudness",
            "description": "Measure loudness of a stored clip: integrated LUFS, true-peak (dBTP), RMS, crest factor, loudness range, duration.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "export_subtitles",
            "description": "Transcribe a stored clip locally (Whisper) and export SRT/VTT subtitles.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "fmt": {"type": "string", "default": "srt", "description": "srt or vtt"},
                    "model": {"type": "string", "description": "Whisper model size (optional)"},
                    "language": {"type": "string", "description": "ISO language code (optional)"},
                },
                "required": ["audio_path"],
            },
        },
    },
]
