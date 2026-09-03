"""Assistant tool schemas for audiobooks, comping, mixer, and translate."""

AUDIOBOOK_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_audiobooks",
            "description": "List all imported audiobooks with chapter counts.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_audiobook",
            "description": "Get full audiobook details including chapters and cast.",
            "parameters": {
                "type": "object",
                "properties": {"book_id": {"type": "string"}},
                "required": ["book_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "render_audiobook",
            "description": "Render all chapters of an audiobook to audio.",
            "parameters": {
                "type": "object",
                "properties": {"book_id": {"type": "string"}},
                "required": ["book_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "export_audiobook",
            "description": "Export the rendered audiobook as M4B or WAV.",
            "parameters": {
                "type": "object",
                "properties": {
                    "book_id": {"type": "string"},
                    "format": {"type": "string", "default": "m4b"},
                    "bitrate": {"type": "integer", "default": 128},
                },
                "required": ["book_id"],
            },
        },
    },
]

COMPING_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "comping_list_sessions",
            "description": "List saved comping sessions.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "comping_save_session",
            "description": "Save a comping session snapshot.",
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
            "name": "comping_load_session",
            "description": "Load a comping session by ID.",
            "parameters": {
                "type": "object",
                "properties": {"session_id": {"type": "string"}},
                "required": ["session_id"],
            },
        },
    },
]

MIXER_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "mixer_preview",
            "description": "Preview a mixer configuration — mix multiple tracks with volume/pan/effects.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tracks": {"type": "array", "items": {"type": "object"}},
                    "sample_rate": {"type": "integer", "default": 44100},
                    "master_volume": {"type": "number", "default": 1.0},
                },
                "required": ["tracks"],
            },
        },
    },
]

TRANSLATE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "translate_text",
            "description": "Translate text to a target language using the local LLM.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "target_language": {"type": "string"},
                    "source_language": {"type": "string"},
                },
                "required": ["text", "target_language"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "translate_batch",
            "description": "Translate multiple text segments to a target language in one call.",
            "parameters": {
                "type": "object",
                "properties": {
                    "texts": {"type": "array", "items": {"type": "string"}},
                    "target_language": {"type": "string"},
                    "source_language": {"type": "string"},
                },
                "required": ["texts", "target_language"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "translate_languages",
            "description": "List available translation target languages.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

STUDIO_TOOLS = AUDIOBOOK_TOOLS + COMPING_TOOLS + MIXER_TOOLS + TRANSLATE_TOOLS
