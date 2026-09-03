GENERATION_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "generate_speech",
            "description": "Generate speech from text using a voice profile.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Text to speak"},
                    "profile_id": {"type": "string", "description": "Voice profile ID"},
                },
                "required": ["text", "profile_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_preset_voices",
            "description": "List all available preset voices (Kokoro, KittenTTS) with their engine, language, and gender.",
            "parameters": {
                "type": "object",
                "properties": {"engine": {"type": "string", "description": "Optional engine filter"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_profile",
            "description": "Create a new voice profile. voice_type: 'cloned' (requires reference audio), 'preset' (built-in voice), or 'designed' (text description via Parler-TTS). For designed voices, provide design_prompt. For preset, provide preset_engine and preset_voice_id. For cloned, provide sample_path and reference_text.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "voice_type": {"type": "string", "enum": ["cloned", "preset", "designed"], "default": "cloned"},
                    "language": {"type": "string", "default": "en"},
                    "description": {"type": "string"},
                    "design_prompt": {"type": "string"},
                    "preset_engine": {"type": "string"},
                    "preset_voice_id": {"type": "string"},
                    "sample_path": {"type": "string"},
                    "reference_text": {"type": "string"},
                    "personality": {"type": "string"},
                    "default_engine": {"type": "string"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_profile",
            "description": "Get a voice profile by ID with full details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "profile_id": {"type": "string"},
                },
                "required": ["profile_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_profile",
            "description": "Delete a voice profile by ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "profile_id": {"type": "string"},
                },
                "required": ["profile_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_profile",
            "description": "Update a voice profile. Can update name, description, language, personality, default_engine.",
            "parameters": {
                "type": "object",
                "properties": {
                    "profile_id": {"type": "string"},
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "language": {"type": "string"},
                    "personality": {"type": "string"},
                    "default_engine": {"type": "string"},
                },
                "required": ["profile_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_profile_sample",
            "description": "Add a reference audio sample to a cloned voice profile. For voice_type='cloned' profiles only.",
            "parameters": {
                "type": "object",
                "properties": {
                    "profile_id": {"type": "string"},
                    "sample_path": {"type": "string"},
                    "reference_text": {"type": "string"},
                },
                "required": ["profile_id", "sample_path", "reference_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_profile_samples",
            "description": "List reference audio samples for a voice profile.",
            "parameters": {
                "type": "object",
                "properties": {
                    "profile_id": {"type": "string"},
                },
                "required": ["profile_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "clone_voice",
            "description": "Clone a voice from reference audio. Creates a new voice profile from the provided audio file and reference text. Returns the new profile_id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "sample_path": {"type": "string"},
                    "reference_text": {"type": "string"},
                    "language": {"type": "string", "default": "en"},
                    "description": {"type": "string"},
                    "default_engine": {"type": "string"},
                },
                "required": ["name", "sample_path", "reference_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "apply_effects",
            "description": "Apply an audio effects chain to a generation's clean audio.",
            "parameters": {
                "type": "object",
                "properties": {
                    "generation_id": {"type": "string"},
                    "effects_chain": {"type": "array", "items": {"type": "object"}},
                },
                "required": ["generation_id", "effects_chain"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_voices",
            "description": "List available voice profiles.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_effects",
            "description": "List available audio effects.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "export_audio",
            "description": "Export audio with a platform preset.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "preset": {"type": "string", "description": "Platform preset name"},
                },
                "required": ["audio_path", "preset"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "measure_loudness",
            "description": "Measure LUFS loudness of audio.",
            "parameters": {
                "type": "object",
                "properties": {"audio_path": {"type": "string"}},
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "transcribe",
            "description": "Transcribe an audio file (already on disk) to text using Whisper.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string", "description": "Server-side storage path to the audio file"},
                    "language": {"type": "string", "description": "Optional language code"},
                    "model": {"type": "string", "description": "Optional Whisper model size"},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_captures",
            "description": "List recorded audio captures.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_sfx",
            "description": "Generate a sound effect from a text prompt (Stable Audio Open).",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string"},
                    "duration_seconds": {"type": "number", "default": 5.0},
                    "seed": {"type": "integer"},
                },
                "required": ["prompt"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_music",
            "description": "Generate a music track from a text prompt (ACE-Step, HeartMuLa, etc.).",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string"},
                    "engine": {"type": "string", "default": "acestep"},
                    "duration_seconds": {"type": "number", "default": 30.0},
                    "genre": {"type": "string", "default": "pop"},
                    "mood": {"type": "string", "default": "neutral"},
                    "tempo": {"type": "integer"},
                    "seed": {"type": "integer"},
                },
                "required": ["prompt"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_pitch",
            "description": "Analyze the pitch (note/frequency) of an audio file using YIN.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "sample_rate": {"type": "integer", "default": 48000},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "spatial_binaural",
            "description": "Apply binaural panning to audio based on a 3D position.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "position": {
                        "type": "object",
                        "description": "3D position for the sound source",
                        "properties": {
                            "x": {"type": "number", "default": 0.0},
                            "y": {"type": "number", "default": 0.0},
                            "z": {"type": "number", "default": 0.0},
                            "distance": {"type": "number", "default": 1.0},
                            "gain_db": {"type": "number", "default": 0.0},
                        },
                    },
                },
                "required": ["audio_path", "position"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "spatial_doppler",
            "description": "Apply a Doppler pitch effect to a moving sound source.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "speed": {"type": "number", "default": 1.0},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "spatial_convolution",
            "description": "Apply environmental convolution reverb to audio.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "environment": {
                        "type": "string",
                        "enum": ["car_interior", "coffee_shop", "bedroom", "church", "studio_booth"],
                        "default": "studio_booth",
                    },
                    "wet_dry_mix": {"type": "number", "default": 0.3, "description": "0=dry, 1=full reverb"},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "spatial_render",
            "description": "Full spatial render: binaural + convolution in one pass.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "position": {
                        "type": "object",
                        "properties": {
                            "x": {"type": "number", "default": 0.0},
                            "y": {"type": "number", "default": 0.0},
                            "z": {"type": "number", "default": 0.0},
                            "distance": {"type": "number", "default": 1.0},
                            "gain_db": {"type": "number", "default": 0.0},
                        },
                    },
                    "environment": {"type": "string", "default": "studio_booth"},
                    "wet_dry_mix": {"type": "number", "default": 0.3},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_models",
            "description": "List all available models and their load status.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "adr_create_session",
            "description": "Create an ADR session with optional script lines.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "fps": {"type": "number", "default": 24.0},
                    "lines": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "line_id": {"type": "string"},
                                "original_text": {"type": "string"},
                                "character": {"type": "string"},
                                "target_duration_ms": {"type": "number"},
                            },
                        },
                    },
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "adr_list_sessions",
            "description": "List all ADR sessions.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "adr_get_session",
            "description": "Get a single ADR session with its lines and takes.",
            "parameters": {
                "type": "object",
                "properties": {"session_id": {"type": "string"}},
                "required": ["session_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "adr_upload_guide",
            "description": "Set the guide (reference) audio for an ADR session from a server-side file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string"},
                    "audio_path": {"type": "string"},
                },
                "required": ["session_id", "audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "adr_upload_take",
            "description": "Upload an actor take for an ADR line from a server-side file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string"},
                    "line_id": {"type": "string"},
                    "audio_path": {"type": "string"},
                },
                "required": ["session_id", "line_id", "audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "adr_select_take",
            "description": "Mark a take as the selected (chosen) take for an ADR line.",
            "parameters": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string"},
                    "line_id": {"type": "string"},
                    "take_id": {"type": "string"},
                },
                "required": ["session_id", "line_id", "take_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "adr_auto_select",
            "description": "Automatically pick the best-scoring take for an ADR line.",
            "parameters": {
                "type": "object",
                "properties": {"line_id": {"type": "string"}},
                "required": ["line_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "studio_save_session",
            "description": "Save an Audio Studio session (name + project data).",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "default": "Untitled Session"},
                    "data": {"type": "object", "description": "Audio Studio project JSON"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "studio_load_session",
            "description": "Load a saved Audio Studio session by ID.",
            "parameters": {
                "type": "object",
                "properties": {"session_id": {"type": "string"}},
                "required": ["session_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "studio_list_sessions",
            "description": "List saved Audio Studio sessions.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ui_navigate",
            "description": "Navigate the app to a view. Views: home, voices, workspace, adr, studio, audioStudio, effects, models, captures, stories, projects, plugins, scripting, telemetry, shortcuts, community-presets, spectrogram, lottie. For adr you may pass a session id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "view": {
                        "type": "string",
                        "description": "One of: home, voices, workspace, adr, studio, audioStudio, effects, models, captures, stories, projects, plugins, scripting, telemetry, shortcuts, community-presets, spectrogram, lottie",
                    },
                    "session": {"type": "string", "description": "ADR session id (only used with view 'adr')"},
                },
                "required": ["view"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ui_set_voice_profile",
            "description": "Set the currently selected voice profile used for generation.",
            "parameters": {
                "type": "object",
                "properties": {"profile_id": {"type": "string"}},
                "required": ["profile_id"],
            },
        },
    },
]
