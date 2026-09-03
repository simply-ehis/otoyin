SESSION_MODELS_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "captures_refine",
            "description": "Refine (clean up) a recorded capture.",
            "parameters": {
                "type": "object",
                "properties": {"capture_id": {"type": "string"}},
                "required": ["capture_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "captures_retranscribe",
            "description": "Re-run speech-to-text on a capture.",
            "parameters": {
                "type": "object",
                "properties": {"capture_id": {"type": "string"}},
                "required": ["capture_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generation_version_audio",
            "description": "Fetch the audio for a specific generation version by id.",
            "parameters": {
                "type": "object",
                "properties": {"version_id": {"type": "string"}},
                "required": ["version_id"],
            },
        },
    },
    # ─── Models lifecycle ─────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "model_cache_dir",
            "description": "Get the local model cache directory.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "model_progress",
            "description": "Get download progress for a model by name.",
            "parameters": {
                "type": "object",
                "properties": {"model_name": {"type": "string"}},
                "required": ["model_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "models_download",
            "description": "Download a model by name.",
            "parameters": {
                "type": "object",
                "properties": {"model_name": {"type": "string"}},
                "required": ["model_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "models_load",
            "description": "Load a TTS model of the given size (default: engine's default size).",
            "parameters": {
                "type": "object",
                "properties": {"model_size": {"type": "string", "default": "default"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "models_unload",
            "description": "Unload the currently loaded TTS model.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    # ─── Session / telemetry / GPU / import ───────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "session_save",
            "description": "Save the current workspace session.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "session_data": {"type": "string"},
                },
                "required": ["name", "session_data"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "session_load",
            "description": "Load a saved workspace session.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "session_data": {"type": "string"},
                },
                "required": ["name", "session_data"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "telemetry_status",
            "description": "Get telemetry enablement status.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "telemetry_toggle",
            "description": "Enable or disable telemetry.",
            "parameters": {
                "type": "object",
                "properties": {"enabled": {"type": "boolean"}},
                "required": ["enabled"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "cuda_status",
            "description": "Get CUDA/GPU backend status.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "cuda_download",
            "description": "Download the CUDA/GPU backend.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_import_formats",
            "description": "List supported import audio/video formats.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "import_info",
            "description": "Get import capability info (ffmpeg availability, etc.).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]
