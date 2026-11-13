"""Tool schemas for stem separation."""

STEMS_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "separate_stems",
            "description": "Separate an audio file into stems (vocals, drums, bass, other) using Demucs ONNX. Returns stem download links. Use when the user asks to split a track, isolate vocals, make a karaoke version, or separate instruments.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string", "description": "Path to the audio file to separate"},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "stem_separation_status",
            "description": "Check if Demucs stem separation is available and the model is downloaded.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "stem_vocal_split",
            "description": "Split the vocals stem of a separated job into lead and backing voices.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {"type": "string", "description": "ID of the stem separation job"},
                },
                "required": ["job_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "stem_mixdown",
            "description": "Combine all stems of a job into a single mix WAV.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {"type": "string", "description": "ID of the stem separation job"},
                },
                "required": ["job_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "stem_beats",
            "description": "Detect beats and estimate BPM for a separated job.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {"type": "string", "description": "ID of the stem separation job"},
                },
                "required": ["job_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "stem_download",
            "description": "Download a stem file from a separated job.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {"type": "string", "description": "ID of the stem separation job"},
                    "name": {
                        "type": "string",
                        "description": "Name of the stem to download (e.g. vocals, drums, bass, other)",
                    },
                },
                "required": ["job_id", "name"],
            },
        },
    },
]
