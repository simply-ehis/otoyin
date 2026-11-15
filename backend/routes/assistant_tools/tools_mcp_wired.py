"""Tool schemas for ENDPOINT_MAP entries wired from MCP tool decorators.

These tools were originally MCP-only but got wired into ENDPOINT_MAP
to make them dual-surface. This file provides their OpenAI-compatible
tool schemas for the assistant layer.
"""

MCP_WIRED_TOOLS = [
    # ── ADR ──────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "adr_align",
            "description": "Align ADR takes to dialogue timing.",
            "parameters": {
                "type": "object",
                "properties": {
                    "guide_audio": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": "Guide audio as float array",
                    },
                    "take_audio": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": "Take audio as float array",
                    },
                    "sample_rate": {"type": "integer", "default": 24000},
                },
                "required": ["guide_audio", "take_audio"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "adr_guide_audio",
            "description": "Get the guide audio for an ADR session.",
            "parameters": {"type": "object", "properties": {"session_id": {"type": "string"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "adr_guide_waveform",
            "description": "Get the waveform data for an ADR session's guide audio.",
            "parameters": {"type": "object", "properties": {"session_id": {"type": "string"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "adr_score",
            "description": "Score ADR takes for quality.",
            "parameters": {
                "type": "object",
                "properties": {
                    "line_id": {"type": "string"},
                    "audio": {"type": "array", "items": {"type": "number"}, "description": "Audio as float array"},
                    "sample_rate": {"type": "integer", "default": 24000},
                },
                "required": ["line_id", "audio"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "adr_take_audio",
            "description": "Get the audio for an ADR take.",
            "parameters": {"type": "object", "properties": {"take_id": {"type": "string"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "adr_upload_guide_path",
            "description": "Upload a guide audio file to an ADR session.",
            "parameters": {
                "type": "object",
                "properties": {"session_id": {"type": "string"}, "audio_path": {"type": "string"}},
                "required": ["session_id", "audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "adr_upload_takes_path",
            "description": "Upload a take audio file to an ADR line.",
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
            "name": "adr_waveform",
            "description": "Get the waveform data for an ADR take.",
            "parameters": {"type": "object", "properties": {"take_id": {"type": "string"}}},
        },
    },
    # ── Audiobooks ───────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "add_audiobook_cast",
            "description": "Add a character to an audiobook's cast.",
            "parameters": {
                "type": "object",
                "properties": {
                    "book_id": {"type": "string"},
                    "character": {"type": "string"},
                    "profile_id": {"type": "string"},
                },
                "required": ["book_id", "character", "profile_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_audiobook_chapter",
            "description": "Add a chapter to an audiobook.",
            "parameters": {
                "type": "object",
                "properties": {
                    "book_id": {"type": "string"},
                    "title": {"type": "string"},
                    "text": {"type": "string"},
                },
                "required": ["book_id", "title", "text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_audiobook",
            "description": "Create a new audiobook project.",
            "parameters": {"type": "object", "properties": {"title": {"type": "string"}, "author": {"type": "string"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "import_audiobook",
            "description": "Import an audiobook from EPUB or PDF.",
            "parameters": {
                "type": "object",
                "properties": {"file_path": {"type": "string"}, "format": {"type": "string"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_audiobook_utterances",
            "description": "List utterances for an audiobook chapter.",
            "parameters": {
                "type": "object",
                "properties": {"book_id": {"type": "string"}, "chapter_id": {"type": "string"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "parse_audiobook_script",
            "description": "Parse an audiobook chapter script into utterances.",
            "parameters": {
                "type": "object",
                "properties": {"book_id": {"type": "string"}, "chapter_id": {"type": "string"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "render_audiobook_chapter",
            "description": "Render an audiobook chapter to audio.",
            "parameters": {
                "type": "object",
                "properties": {"book_id": {"type": "string"}, "chapter_id": {"type": "string"}},
            },
        },
    },
    # ── Batch ────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "batch_create_from_list",
            "description": "Create a batch job from a list of items.",
            "parameters": {"type": "object", "properties": {"items": {"type": "array"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "batch_job_items",
            "description": "List items in a batch job.",
            "parameters": {"type": "object", "properties": {"job_id": {"type": "string"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "batch_job_progress",
            "description": "Get progress of a batch job.",
            "parameters": {"type": "object", "properties": {"job_id": {"type": "string"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "batch_job_retry",
            "description": "Retry a failed batch job.",
            "parameters": {"type": "object", "properties": {"job_id": {"type": "string"}}},
        },
    },
    # ── DSP ──────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "dsp_capabilities",
            "description": "Get available DSP effects and their parameter ranges.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dsp_effect",
            "description": "Apply a DSP effect to audio.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "type": {"type": "string", "description": "Effect type (e.g. vocoder, pitch_shift, eq3band)"},
                },
                "required": ["audio_path", "type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dsp_synth",
            "description": "Synthesize audio using a DSP engine.",
            "parameters": {"type": "object", "properties": {"preset": {"type": "string"}}},
        },
    },
    # ── Dubbing ──────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "dub_cancel",
            "description": "Cancel a dubbing job.",
            "parameters": {"type": "object", "properties": {"job_id": {"type": "string"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dub_download",
            "description": "Download a completed dubbing job.",
            "parameters": {"type": "object", "properties": {"job_id": {"type": "string"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dub_languages",
            "description": "List available dubbing languages.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dub_preview",
            "description": "Preview a dubbing job before committing.",
            "parameters": {
                "type": "object",
                "properties": {"video_path": {"type": "string"}, "language": {"type": "string"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dub_status",
            "description": "Get the status of a dubbing job.",
            "parameters": {"type": "object", "properties": {"job_id": {"type": "string"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dub_video",
            "description": "Start a video dubbing job.",
            "parameters": {
                "type": "object",
                "properties": {"video_path": {"type": "string"}, "language": {"type": "string"}},
            },
        },
    },
    # ── Export ───────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "apply_export_preset",
            "description": "Apply an export preset to audio.",
            "parameters": {
                "type": "object",
                "properties": {"audio_path": {"type": "string"}, "preset_name": {"type": "string"}},
                "required": ["audio_path", "preset_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_export_presets",
            "description": "List available export presets.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    # ── Reference Voices ─────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_reference_voice",
            "description": "Get details of a reference voice.",
            "parameters": {"type": "object", "properties": {"voice_id": {"type": "string"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_reference_voices",
            "description": "List all available reference voices.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reference_voice_audio",
            "description": "Get the audio for a reference voice.",
            "parameters": {"type": "object", "properties": {"voice_id": {"type": "string"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reload_reference_voices",
            "description": "Reload reference voices from disk.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "use_reference_voice",
            "description": "Use a reference voice for voice conversion.",
            "parameters": {
                "type": "object",
                "properties": {"voice_id": {"type": "string"}, "audio_path": {"type": "string"}},
            },
        },
    },
    # ── Spatial ──────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "list_convolution_presets",
            "description": "List available convolution reverb presets.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_spatial_presets",
            "description": "List available spatial audio presets.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "spatial_status",
            "description": "Get the status of the spatial audio engine.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    # ── Sounds / Freesound ──────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "download_freesound",
            "description": "Download a sound from Freesound.",
            "parameters": {"type": "object", "properties": {"sound_id": {"type": "string"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_freesound",
            "description": "Search Freesound for sounds.",
            "parameters": {"type": "object", "properties": {"query": {"type": "string"}}},
        },
    },
    # ── Voice Converter ──────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "convert_voice",
            "description": "Convert audio to sound like a target voice.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "engine": {"type": "string", "description": "VC engine (meanvc2, tone_color_vc, seed_vc)"},
                    "voice_pack": {"type": "string", "description": "Voice pack or model name"},
                    "reference_audio_path": {"type": "string", "description": "Reference audio for zero-shot cloning"},
                    "transpose": {"type": "integer", "description": "Pitch shift in semitones"},
                },
                "required": ["audio_path"],
            },
        },
    },
    # ── Models ───────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "models_list",
            "description": "List all available models and their status.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    # ── Help ─────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "app_help",
            "description": "Search the app's help documentation.",
            "parameters": {"type": "object", "properties": {"query": {"type": "string"}}},
        },
    },
    # ── Studio (client commands: UI store setters drive the editor) ───
    {
        "type": "function",
        "function": {
            "name": "studio_add_track",
            "description": "Add a track to an Audio Studio session.",
            "parameters": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string"},
                    "track_type": {"type": "string", "enum": ["audio", "midi"]},
                    "name": {"type": "string"},
                },
                "required": ["session_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "studio_set_master_volume",
            "description": "Set the master volume for an Audio Studio session.",
            "parameters": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string"},
                    "volume": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                },
                "required": ["session_id", "volume"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "studio_import_session",
            "description": "Import a session into Audio Studio from exported JSON data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Session name"},
                    "data": {"type": "object", "description": "Session data payload"},
                },
                "required": ["name", "data"],
            },
        },
    },
    # ── Voice Changer store setters (client commands; UI owns live graph) ──
    {
        "type": "function",
        "function": {
            "name": "voice_changer_enable",
            "description": "Enable or disable the real-time Voice Changer.",
            "parameters": {
                "type": "object",
                "properties": {"enabled": {"type": "boolean", "default": True}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "voice_changer_set_profile",
            "description": "Set the active Voice Changer profile.",
            "parameters": {
                "type": "object",
                "properties": {"profile": {"type": "string"}},
                "required": ["profile"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "voice_changer_set_preset",
            "description": "Apply a Voice Changer preset (telephone/deep/chipmunk) or clear it.",
            "parameters": {
                "type": "object",
                "properties": {"preset": {"type": ["string", "null"]}},
            },
        },
    },
    # ── Workflow ──────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "plan_workflow",
            "description": "Decompose a complex audio task into an ordered plan of MCP tool calls.",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {"type": "string"},
                    "steps": {"type": "array", "items": {"type": "object"}},
                    "template": {"type": "string"},
                },
                "required": ["description", "steps"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "execute_plan",
            "description": "Execute a workflow plan step-by-step.",
            "parameters": {
                "type": "object",
                "properties": {
                    "plan": {"type": "object"},
                    "stop_on_failure": {"type": "boolean", "default": True},
                },
                "required": ["plan"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "plan_templates",
            "description": "List available workflow plan templates.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]
