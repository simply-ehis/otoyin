AUDIO_PRIM_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_plugins",
            "description": "List discovered VST3/AU plugins.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "plugin_status",
            "description": "Get plugin hosting status.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "plugins_scan",
            "description": "Scan the system for VST3/AU plugins.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "plugins_process",
            "description": "Apply a plugin chain (list of dicts) to an audio file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "chain": {"type": "array", "items": {"type": "object"}},
                },
                "required": ["audio_path", "chain"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_scripting_functions",
            "description": "List available scripting API functions for batch automation.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "scripting_execute",
            "description": "Execute a scripting API function by name with args.",
            "parameters": {
                "type": "object",
                "properties": {
                    "function": {"type": "string"},
                    "args": {"type": "object", "default": {}},
                },
                "required": ["function"],
            },
        },
    },
    # ─── Audio primitives ────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "spectrogram",
            "description": "Compute spectrogram data for visualization of an audio file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "fft_size": {"type": "integer", "default": 2048},
                    "hop_length": {"type": "integer", "default": 512},
                    "window": {"type": "string", "default": "hann"},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "noise_reduce",
            "description": "Apply RNNoise / VAD noise reduction to audio.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "vad_threshold": {"type": "number", "default": 0.5},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "normalize_audio",
            "description": "Normalize audio to a target LUFS/db with peak control.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "target_db": {"type": "number", "default": -14.0},
                    "max_peak_db": {"type": "number", "default": -3.0},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "master_audio",
            "description": "Master a finished mix to a broadcast-ready target: glue compression, true-peak limiting, LUFS normalization, optional stereo widening.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "target_lufs": {"type": "number", "default": -14.0},
                    "true_peak_db": {"type": "number", "default": -1.0},
                    "width": {"type": "number", "default": 0.0},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "separate_audio",
            "description": "Separate one stem (vocals/drums/bass/other) from a mix using Demucs. Optional/heavy dependency; returns a clear error if Demucs is not installed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "stem": {"type": "string", "default": "vocals"},
                    "model_name": {"type": "string", "default": "htdemucs"},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_recipe",
            "description": "Run a content recipe end-to-end over generated segments: per-segment cleanup, crossfade concat, optional ducked music bed, then master to the recipe's LUFS target. Returns the export path + measured LUFS.",
            "parameters": {
                "type": "object",
                "properties": {
                    "segments": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "audio_path": {"type": "string"},
                                "effects": {"type": "array", "items": {"type": "object"}, "default": []},
                            },
                            "required": ["audio_path"],
                        },
                    },
                    "recipe": {"type": "string", "default": "podcast"},
                    "music_path": {"type": "string", "default": None},
                    "target_lufs": {"type": "number", "default": None},
                    "gap_ms": {"type": "number", "default": 250},
                },
                "required": ["segments"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "export_reaper_project",
            "description": "Export an Audio Studio session as a Reaper project (.RPP) for DAW interchange. Returns the RPP file as an attachment.",
            "parameters": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string"},
                },
                "required": ["session_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compress_audio",
            "description": "Apply dynamic range compression to audio.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "threshold_db": {"type": "number", "default": -20.0},
                    "ratio": {"type": "number", "default": 4.0},
                    "attack_ms": {"type": "number", "default": 10.0},
                    "release_ms": {"type": "number", "default": 100.0},
                    "makeup_gain_db": {"type": "number", "default": 0.0},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "duck_audio",
            "description": "Apply sidechain ducking to audio for speech enhancement.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "track_configs": {"type": "array", "items": {"type": "object"}, "default": []},
                    "threshold_db": {"type": "number", "default": -30.0},
                    "ratio": {"type": "number", "default": 4.0},
                    "duck_gain_db": {"type": "number", "default": -12.0},
                    "attack_ms": {"type": "number", "default": 5.0},
                    "release_ms": {"type": "number", "default": 50.0},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "silence_removal",
            "description": "Remove silence from audio.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "threshold_db": {"type": "number", "default": -40.0},
                    "min_length_ms": {"type": "integer", "default": 100},
                    "max_silence_ms": {"type": "integer", "default": 5000},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bounce_preview",
            "description": "Preview-mix multiple tracks (volume/pan/crossfade/effects/MIDI) into one WAV.",
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
    {
        "type": "function",
        "function": {
            "name": "copy_segment",
            "description": "Copy a region [start_s, end_s) of an audio file into the clipboard without modifying the source. Returns the extracted clip path + duration.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "start_s": {"type": "number", "default": 0.0},
                    "end_s": {"type": "number", "default": 0.0},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "cut_segment",
            "description": "Cut a region [start_s, end_s) out of an audio file; returns the shortened file plus the extracted clip (so it can be pasted elsewhere).",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "start_s": {"type": "number", "default": 0.0},
                    "end_s": {"type": "number", "default": 0.0},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "paste_segment",
            "description": "Insert a copied/clipped audio file into a target audio file at at_s seconds. With crossfade_ms>0 the splice is equal-power crossfaded; otherwise a clean insert. Returns the merged file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "target_path": {"type": "string"},
                    "clip_path": {"type": "string"},
                    "at_s": {"type": "number", "default": 0.0},
                    "crossfade_ms": {"type": "number", "default": 0.0},
                },
                "required": ["target_path", "clip_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "time_stretch",
            "description": "Change a clip's duration without altering its pitch. rate>1 expands (slower/longer), rate<1 compresses (faster/shorter). Useful for fitting a clip to a timeline.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "rate": {"type": "number", "default": 1.0},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "shout_to_whisper",
            "description": "Soften a loud, projected take into a close, breathy whisper-like delivery: formant shift down, high-frequency attenuation, and dynamic de-emphasis. intensity 0..1 scales how far (default 0.7).",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "intensity": {"type": "number", "default": 0.7},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "blend",
            "description": "Crossfade-merge a second clip after a first one into a single file (stitching takes together). crossfade_ms controls the overlap; gap_ms inserts silence before the join.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path_a": {"type": "string"},
                    "audio_path_b": {"type": "string"},
                    "crossfade_ms": {"type": "number", "default": 200.0},
                    "gap_ms": {"type": "number", "default": 0.0},
                },
                "required": ["audio_path_a", "audio_path_b"],
            },
        },
    },
    # ── Audio Tags ────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "apply_audio_tags",
            "description": "Apply bracketed audio tags ([laughs], [sigh], [pause]) to TTS text and generate the combined audio. Tags are parsed, synthesized via DSP or sample library, and mixed with TTS segments.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "engine": {"type": "string"},
                    "voice": {"type": "string"},
                    "language": {"type": "string", "default": "en"},
                    "sample_rate": {"type": "integer", "default": 24000},
                    "crossfade_ms": {"type": "number", "default": 20.0},
                },
                "required": ["text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_audio_tags",
            "description": "List all supported audio tags with their categories, modifiers, and whether real human samples are available.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "sample_manifest",
            "description": "Get the vocal sample library manifest: which tags have real human recordings, their variants, and sample counts.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    # ── Emotion / Tone ───────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "emotion_tone",
            "description": "Post-process audio to shift its emotional tone. Applies pitch, energy, speed, and formant adjustments to make speech sound happier, sadder, angrier, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "emotion": {"type": "string", "default": "neutral"},
                    "intensity": {"type": "number", "default": 0.5},
                },
                "required": ["audio_path"],
            },
        },
    },
    # ── Breath / Pause ───────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "breath_pause",
            "description": "Add natural breath sounds and controlled pauses to TTS audio. Breath type can be inhale, exhale, or none.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "breath_type": {"type": "string", "default": "inhale"},
                    "pause_type": {"type": "string", "default": "natural"},
                    "duration_ms": {"type": "number", "default": 200.0},
                    "position_s": {"type": "number", "default": 0.0},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "adjust_pauses",
            "description": "Adjust the duration of existing pauses in audio (lengthen or shorten gaps between words).",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "scale": {"type": "number", "default": 1.0},
                    "min_pause_ms": {"type": "number", "default": 50.0},
                },
                "required": ["audio_path"],
            },
        },
    },
    # ── Editing ──────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "fade_in",
            "description": "Apply a fade-in to the start of an audio file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "duration_ms": {"type": "number", "default": 200.0},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fade_out",
            "description": "Apply a fade-out to the end of an audio file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "duration_ms": {"type": "number", "default": 200.0},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "splice",
            "description": "Keep only the region between start_ms and end_ms (trim the rest). Returns the trimmed audio file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "start_ms": {"type": "number", "default": 0.0},
                    "end_ms": {"type": "number", "default": 0.0},
                },
                "required": ["audio_path", "start_ms", "end_ms"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_region",
            "description": "Delete a region [start_ms, end_ms) from an audio file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "start_ms": {"type": "number", "default": 0.0},
                    "end_ms": {"type": "number", "default": 0.0},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "insert_silence",
            "description": "Insert silence into an audio file at a given time position.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "position_ms": {"type": "number", "default": 0.0},
                    "duration_ms": {"type": "number", "default": 500.0},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "trim_silence",
            "description": "Trim leading and trailing silence from an audio file with optional fade-out (ms).",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "threshold_db": {"type": "number", "default": -40.0},
                    "min_silence_ms": {"type": "integer", "default": 100},
                    "fade_ms": {"type": "number", "default": 0.0},
                },
                "required": ["audio_path"],
            },
        },
    },
    # ── Import / Plugins ─────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "preview_plugin_chain",
            "description": "Preview a plugin chain on an audio file — returns WAV audio bytes without saving. Use for auditioning effects before committing.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_path": {"type": "string"},
                    "chain": {"type": "array", "items": {"type": "object"}},
                },
                "required": ["audio_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "video_preview",
            "description": "Stream a local video file for in-app preview.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string"},
                },
                "required": ["file_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "audio_preview",
            "description": "Stream a local audio file (e.g. extracted from video) for preview.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string"},
                },
                "required": ["file_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "extract_audio",
            "description": "Extract the audio track from a video file. Returns the path to the extracted audio.",
            "parameters": {
                "type": "object",
                "properties": {
                    "video_path": {"type": "string"},
                    "sample_rate": {"type": "integer", "default": 48000},
                    "channels": {"type": "integer", "default": 1},
                },
                "required": ["video_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "convert_audio",
            "description": "Convert an audio file to a different format (wav, mp3, etc.). Optionally apply neural noise cleanup.",
            "parameters": {
                "type": "object",
                "properties": {
                    "input_path": {"type": "string"},
                    "target_format": {"type": "string", "default": "wav"},
                    "sample_rate": {"type": "integer", "default": 48000},
                    "channels": {"type": "integer", "default": 1},
                    "sanitize": {"type": "boolean", "default": False},
                },
                "required": ["input_path"],
            },
        },
    },
]
