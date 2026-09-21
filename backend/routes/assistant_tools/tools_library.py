LIBRARY_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_skills",
            "description": "List executable workflow skills and the assistant tools each skill uses. Filter by a task description when useful.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Optional task or workflow to match."}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_custom_skills",
            "description": "List user-created custom skills with their trigger phrases and tool chains.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "voice_changer_capabilities",
            "description": "Probe the real-time voice changer's available capabilities/engines.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "voice_changer_effects",
            "description": "Get available voice changer effects with their parameter ranges.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "voice_changer_status",
            "description": "Get the real-time voice changer status and available effects ranges.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    # ─── Audio channels ──────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "list_channels",
            "description": "List audio channels used to group voices for shared processing.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_channel",
            "description": "Get a single audio channel by id.",
            "parameters": {
                "type": "object",
                "properties": {"channel_id": {"type": "string"}},
                "required": ["channel_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_channel_voices",
            "description": "List the voices assigned to an audio channel.",
            "parameters": {
                "type": "object",
                "properties": {"channel_id": {"type": "string"}},
                "required": ["channel_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_channel",
            "description": "Create an audio channel grouping voices by device/role.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "device_ids": {"type": "array", "items": {"type": "string"}, "default": []},
                },
                "required": ["name"],
            },
        },
    },
    # ─── Stories sequencer ───────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "list_stories",
            "description": "List story sequences.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_story",
            "description": "Get a story with its items.",
            "parameters": {
                "type": "object",
                "properties": {"story_id": {"type": "string"}},
                "required": ["story_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_story",
            "description": "Create a new story sequence.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "export_story_audio",
            "description": "Render and download a story's sequenced audio.",
            "parameters": {
                "type": "object",
                "properties": {"story_id": {"type": "string"}},
                "required": ["story_id"],
            },
        },
    },
    # ─── Standalone project ───────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "list_project_templates",
            "description": "List project templates (blank/dialogue/podcast/audiobook/short-film).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_project",
            "description": "Create a standalone project.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "default": "Untitled Project"},
                    "description": {"type": "string", "default": ""},
                    "fps": {"type": "number", "default": 24.0},
                    "sample_rate": {"type": "integer", "default": 48000},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_project",
            "description": "Save a standalone project as JSON.",
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
            "name": "load_project",
            "description": "Load a standalone project from JSON.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "session_data": {"type": "string"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "import_script",
            "description": "Import a script (plain text or JSON) into a project.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_json": {"type": "string"},
                    "text": {"type": "string"},
                    "format": {"type": "string", "default": "plain"},
                },
                "required": ["project_json", "text"],
            },
        },
    },
]
