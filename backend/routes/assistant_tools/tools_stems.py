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
]