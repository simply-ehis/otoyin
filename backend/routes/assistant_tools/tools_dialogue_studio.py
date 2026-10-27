DIALOGUE_STUDIO_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_conversation_presets",
            "description": "List available conversation/podcast presets.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "conversation_auto_duck",
            "description": "Compute an auto-ducking gain envelope so background speakers duck under the active one.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lines": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "text": {"type": "string"},
                                "speaker": {"type": "string"},
                                "engine": {"type": "string"},
                                "profile_id": {"type": "string"},
                                "start_mode": {"type": "string", "default": "relative_to_previous"},
                                "start_offset_ms": {"type": "integer", "default": 0},
                                "overlap_ms": {"type": "integer", "default": 0},
                                "track": {"type": "integer", "default": 0},
                            },
                        },
                    }
                },
                "required": ["lines"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "conversation_auto_level",
            "description": "Level-match all speakers to a target LUFS so no voice dominates.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lines": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "text": {"type": "string"},
                                "speaker": {"type": "string"},
                                "engine": {"type": "string"},
                                "profile_id": {"type": "string"},
                                "start_mode": {"type": "string", "default": "relative_to_previous"},
                                "start_offset_ms": {"type": "integer", "default": 0},
                                "overlap_ms": {"type": "integer", "default": 0},
                                "track": {"type": "integer", "default": 0},
                            },
                        },
                    }
                },
                "required": ["lines"],
            },
        },
    },
    # ─── Batch queue ─────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "list_batch_jobs",
            "description": "List batch processing jobs with status and progress.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_batch_job",
            "description": "Get a single batch job by id.",
            "parameters": {
                "type": "object",
                "properties": {"job_id": {"type": "string"}},
                "required": ["job_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_batch_job",
            "description": "Create a batch job to process many generations without blocking.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "func_name": {"type": "string"},
                    "func_args": {"type": "object", "default": {}},
                },
                "required": ["name", "func_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "cancel_batch_job",
            "description": "Cancel a pending/running batch job by id.",
            "parameters": {
                "type": "object",
                "properties": {"job_id": {"type": "string"}},
                "required": ["job_id"],
            },
        },
    },
    # ─── Community presets / preset sharing ──────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "list_community_presets",
            "description": "Browse community-shared effect presets (optional category/search).",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string"},
                    "search": {"type": "string"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_community_preset_categories",
            "description": "List community preset categories.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_builtin_presets",
            "description": "List built-in effect presets (robotic, radio, echo chamber, etc.).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "export_preset",
            "description": "Save an effect chain as a shareable preset.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "effects_chain": {"type": "array", "items": {"type": "object"}},
                    "description": {"type": "string", "default": ""},
                    "author": {"type": "string", "default": "User"},
                    "tags": {"type": "array", "items": {"type": "string"}, "default": []},
                },
                "required": ["name", "effects_chain"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "plan_audio",
            "description": "Generate an automatic audio plan (dialogue/music/sfx/ambient tracks with timing) from a list of scenes. Returns a plan JSON for the Audio Plan tab.",
            "parameters": {
                "type": "object",
                "properties": {
                    "scenes": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "name": {"type": "string"},
                                "duration": {"type": "number"},
                                "dialogue": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "character": {"type": "string"},
                                            "text": {"type": "string"},
                                        },
                                    },
                                },
                            },
                        },
                    },
                    "characters": {"type": "array", "items": {"type": "object"}, "default": []},
                    "fps": {"type": "number", "default": 24.0},
                },
                "required": ["scenes"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "audio_enhance",
            "description": "Enhance audio quality (bandwidth extension + denoise). Returns enhanced audio.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "mode": {"type": "string", "enum": ["auto", "lavasr", "denoise"], "default": "auto"},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mux_video_audio",
            "description": "Combine a video file with an audio file into an MP4 using ffmpeg.",
            "parameters": {
                "type": "object",
                "properties": {
                    "video_path": {"type": "string"},
                    "audio_path": {"type": "string"},
                },
                "required": ["video_path", "audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "download_voice_pack",
            "description": "Download an RVC voice pack from HuggingFace into the models dir.",
            "parameters": {
                "type": "object",
                "properties": {"pack_name": {"type": "string"}},
                "required": ["pack_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "conversation_generate",
            "description": "Generate a stitched multi-speaker conversation audio from lines.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lines": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "text": {"type": "string"},
                                "speaker": {"type": "string"},
                                "engine": {"type": "string"},
                                "profile_id": {"type": "string"},
                                "start_mode": {"type": "string", "default": "relative_to_previous"},
                                "start_offset_ms": {"type": "integer", "default": 0},
                                "overlap_ms": {"type": "integer", "default": 0},
                            },
                        },
                    }
                },
                "required": ["lines"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "import_preset",
            "description": "Import a shared effect preset from JSON.",
            "parameters": {
                "type": "object",
                "properties": {"preset_json": {"type": "string"}},
                "required": ["preset_json"],
            },
        },
    },
]
