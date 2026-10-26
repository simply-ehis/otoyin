# Bidirectional name mapping: MCP tool names ↔ ENDPOINT_MAP keys.
# MCP uses dotted names like "21labs.list_batch_jobs"; ENDPOINT_MAP uses
# bare names like "list_batch_jobs".  Some tools have completely different
# names across surfaces (e.g. "21labs.speak" ↔ "generate_speech").
#
# Auto-populated from naming convention + explicit overrides below.
NAME_MAP: dict[str, str] = {}  # mcp_name → endpoint_key (and reverse)


def _build_name_map() -> dict[str, str]:
    """Build bidirectional name map from MCP names to ENDPOINT_MAP keys."""
    result: dict[str, str] = {}

    # 1. Convention-based: "21labs.foo_bar" → "foo_bar"
    # Only create entries for keys that actually exist in ENDPOINT_MAP.
    for key in ENDPOINT_MAP:
        mcp_name = f"21labs.{key}"
        result[mcp_name] = key
    # Self-references for bare-name lookups
    for key in ENDPOINT_MAP:
        result[key] = key

    # 2. Explicit overrides for non-conventional names
    _overrides = {
        # speech.py tools that call services directly
        "21labs.speak": "generate_speech",
        "21labs.transcribe": "transcribe",
        "21labs.list_captures": "list_captures",
        "21labs.list_profiles": "list_voices",
        "21labs.list_preset_voices": "list_preset_voices",
        "21labs.create_profile": "create_profile",
        "21labs.delete_profile": "delete_profile",
        "21labs.get_profile": "get_profile",
        "21labs.update_profile": "update_profile",
        "21labs.add_profile_sample": "add_profile_sample",
        "21labs.list_profile_samples": "list_profile_samples",
        "21labs.clone_voice": "clone_voice",
        "21labs.diarize": "transcribe",  # diarize extends transcribe
        "21labs.voice_changer_status": "voice_changer_status",
        "21labs.voice_changer_effects": "voice_changer_effects",
        # generation.py custom tools
        "21labs.generate_music": "generate_music",  # routes to the music endpoint, not TTS
        "21labs.generate_sfx": "generate_sfx",
        "21labs.bounce": "bounce_preview",
        "21labs.list_models": "list_models",
        # workflow.py tools
        "21labs.execute_plan": "execute_plan",
        "21labs.plan_workflow": "plan_workflow",
        "21labs.plan_templates": "plan_templates",
        # SDK models list
        "21labs.list_sdk_models": "list_models",
    }
    result.update({k: v for k, v in _overrides.items() if v is not None})

    return result


# Endpoint template per tool. Templates may contain {param} placeholders that
# are filled from the tool args (and removed from the JSON body).
ENDPOINT_MAP = {
    "generate_speech": "/generate",
    "apply_effects": "/effects/preview/{generation_id}",
    "list_voices": "/profiles",
    "list_effects": "/effects/available",
    "export_audio": "/export/apply-preset",
    "measure_loudness": "/audio/analyze-loudness",
    "transcribe": "/transcribe/path",
    "list_captures": "/captures",
    "generate_sfx": "/generate/sfx",
    "generate_music": "/generate/music",  # distinct music-generation endpoint
    "analyze_pitch": "/audio/pitch-analysis",
    "spatial_binaural": "/spatial/apply-binaural",
    "spatial_doppler": "/spatial/apply-doppler",
    "spatial_convolution": "/spatial/apply-convolution",
    "spatial_render": "/spatial/render",
    "list_models": "/models/status",
    # Voice profiles
    "list_preset_voices": "/profiles/preset-voices",
    "create_profile": "/profiles",
    "get_profile": "/profiles/{profile_id}",
    "update_profile": "/profiles/{profile_id}",
    "delete_profile": "/profiles/{profile_id}",
    "add_profile_sample": "/profiles/{profile_id}/samples",
    "list_profile_samples": "/profiles/{profile_id}/samples",
    "clone_voice": "/profiles",
    # Voice changer
    "voice_changer_status": "/voice-changer/status",
    "voice_changer_effects": "/voice-changer/effects",
    # ADR
    "adr_create_session": "/adr/sessions",
    "adr_list_sessions": "/adr/sessions",
    "adr_get_session": "/adr/sessions/{session_id}",
    "adr_upload_guide": "/adr/sessions/{session_id}/guide",
    "adr_upload_take": "/adr/sessions/{session_id}/lines/{line_id}/takes",
    "adr_select_take": "/adr/sessions/{session_id}/lines/{line_id}/select/{take_id}",
    "adr_auto_select": "/adr/auto-select",
    # Audio Studio
    "studio_save_session": "/audio-studio/sessions",
    "studio_load_session": "/audio-studio/sessions/{session_id}",
    "studio_list_sessions": "/audio-studio/sessions",
    # Conversation / dialogue
    "list_conversation_presets": "/conversation/presets",
    "conversation_auto_duck": "/conversation/auto-duck",
    "conversation_auto_level": "/conversation/auto-level",
    # Batch queue
    "list_batch_jobs": "/batch/jobs",
    "get_batch_job": "/batch/jobs/{job_id}",
    "create_batch_job": "/batch/jobs",
    "cancel_batch_job": "/batch/jobs/{job_id}/cancel",
    # Custom skills
    "list_custom_skills": "/skills",
    # Community presets / preset sharing
    "list_community_presets": "/community-presets",
    "list_community_preset_categories": "/community-presets/categories",
    "list_builtin_presets": "/presets/builtin",
    "export_preset": "/presets/export",
    "import_preset": "/presets/import",
    # Voice changer
    "voice_changer_capabilities": "/voice-changer/capabilities",
    # Audio channels
    "list_channels": "/channels",
    "get_channel": "/channels/{channel_id}",
    "get_channel_voices": "/channels/{channel_id}/voices",
    "create_channel": "/channels",
    # Stories
    "list_stories": "/stories",
    "get_story": "/stories/{story_id}",
    "create_story": "/stories",
    "export_story_audio": "/stories/{story_id}/export-audio",
    # Standalone project
    "list_project_templates": "/project/templates",
    "create_project": "/project/create",
    "save_project": "/project/save",
    "load_project": "/project/load",
    "import_script": "/project/import-script",
    # Plugins / scripting
    "list_plugins": "/plugins/list",
    "plugin_status": "/plugins/status",
    "plugins_scan": "/plugins/scan",
    "plugins_process": "/plugins/process",
    "list_scripting_functions": "/scripting/functions",
    "scripting_execute": "/scripting/execute",
    # Audio primitives
    "spectrogram": "/audio/spectrogram",
    "noise_reduce": "/audio/noise-reduce",
    "normalize_audio": "/audio/normalize",
    "compress_audio": "/audio/compress",
    "duck_audio": "/audio/duck",
    "silence_removal": "/audio/silence-removal",
    "bounce_preview": "/audio/bounce-preview",
    # Editing primitives
    "copy_segment": "/audio/copy",
    "cut_segment": "/audio/cut",
    "paste_segment": "/audio/paste",
    "time_stretch": "/audio/time-stretch",
    "shout_to_whisper": "/audio/shout-to-whisper",
    "blend": "/audio/blend",
    # Captures / versions
    "captures_refine": "/captures/{capture_id}/refine",
    "captures_retranscribe": "/captures/{capture_id}/retranscribe",
    "capture_words": "/captures/{capture_id}/words",
    "capture_chapters": "/captures/{capture_id}/chapters",
    "generation_version_audio": "/audio/version/{version_id}",
    # Models lifecycle
    "model_cache_dir": "/models/cache-dir",
    "model_progress": "/models/progress/{model_name}",
    "models_download": "/models/download",
    "models_load": "/models/load",
    "models_unload": "/models/unload",
    # Session / telemetry / GPU / import
    "session_save": "/session/save",
    "session_load": "/session/load",
    "telemetry_status": "/telemetry/status",
    "telemetry_toggle": "/telemetry/toggle",
    "cuda_status": "/backend/cuda-status",
    "cuda_download": "/backend/download-cuda",
    "list_import_formats": "/import/formats",
    "import_info": "/import/info",
    # Professional finishing
    "master_audio": "/audio/master",
    "separate_audio": "/audio/separate",
    "run_recipe": "/recipe/run",
    "export_reaper_project": "/audio-studio/sessions/{session_id}/export-reaper",
    # Phase 6 instruments + studio tools
    "play_gm_instrument": "/instruments/gm",
    "play_drum_machine": "/instruments/drum-machine",
    "play_gm_pattern": "/instruments/gm-pattern",
    "play_piano_note": "/instruments/piano",
    "play_synth_note": "/instruments/synth",
    "play_drum_pad": "/instruments/drum",
    "generate_noise": "/instruments/noise",
    "analyze_loudness": "/audio/analyze-loudness",
    "export_subtitles": "/transcription/export-subtitles",
    # Audio Tags
    "apply_audio_tags": "/audio/apply-tags",
    "list_audio_tags": "/audio/tags",
    "sample_manifest": "/audio/sample-manifest",
    # Emotion / Tone
    "emotion_tone": "/audio/emotion-tone",
    # Breath / Pause
    "breath_pause": "/audio/breath-pause",
    "adjust_pauses": "/audio/adjust-pauses",
    # Editing (inline waveform)
    "fade_in": "/audio/fade-in",
    "fade_out": "/audio/fade-out",
    "splice": "/audio/splice",
    "delete_region": "/audio/delete-region",
    "insert_silence": "/audio/insert-silence",
    "trim_silence": "/audio/trim-silence",
    # Import / Plugins
    "preview_plugin_chain": "/plugins/preview",
    "video_preview": "/import/video-preview",
    "audio_preview": "/import/audio-preview",
    "extract_audio": "/import/extract-audio",
    "convert_audio": "/import/convert",
    # Audiobooks
    "list_audiobooks": "/audiobooks",
    "get_audiobook": "/audiobooks/{book_id}",
    "render_audiobook": "/audiobooks/{book_id}/render",
    "export_audiobook": "/audiobooks/{book_id}/export",
    # Comping sessions
    "comping_list_sessions": "/comping/sessions",
    "comping_save_session": "/comping/sessions",
    "comping_load_session": "/comping/sessions/{session_id}",
    # Mixer
    "mixer_preview": "/mixer/preview",
    # Translate
    "translate_text": "/translate",
    "translate_batch": "/translate/batch",
    "translate_languages": "/translate/languages",
    # ── New: file I/O tools ──────────────────────────────
    "read_file": "/files/read",
    "read_pdf": "/files/read-pdf",
    "read_epub": "/files/read-epub",
    "transcribe_file": "/files/transcribe",
    "compact_text": "/files/compact",
    "list_supported_files": "/files/list-supported",
    "validate_file": "/files/validate",
    # Project workspaces / plans / asset acquisition
    "list_projects": "/projects",
    "create_agent_project": "/projects",
    "get_project": "/projects/{project_id}",
    "get_project_context": "/projects/{project_id}/context",
    "list_project_sources": "/projects/{project_id}/sources",
    "add_project_source": "/projects/{project_id}/sources",
    "list_project_plans": "/projects/{project_id}/plans",
    "create_plan": "/projects/{project_id}/plans",
    "get_plan": "/projects/{project_id}/plans/{plan_id}",
    "acquire_search": "/acquire/search",
    "acquire_download": "/acquire/download",
    # ── New: wired from MCP _rest() calls ─────────────────────────────
    # ADR
    "adr_align": "/adr/align",
    "adr_guide_audio": "/adr/guide-audio/{session_id}",
    "adr_guide_waveform": "/adr/sessions/{session_id}/guide-waveform",
    "adr_score": "/adr/score",
    "adr_take_audio": "/adr/audio/{take_id}",
    "adr_upload_guide_path": "/adr/sessions/{session_id}/guide-path",
    "adr_upload_takes_path": "/adr/sessions/{session_id}/lines/{line_id}/takes-path",
    "adr_waveform": "/adr/waveform/{take_id}",
    # Audio Studio + Voice Changer mutations are deliberately not mapped here:
    # those six tools are CLIENT_COMMAND_TOOLS (UI store setters drive the live
    # editor / audio graph). REST routes exist for direct API callers only.
    # Audiobooks
    "add_audiobook_cast": "/audiobooks/{book_id}/cast",
    "add_audiobook_chapter": "/audiobooks/{book_id}/chapters",
    "create_audiobook": "/audiobooks",
    "import_audiobook": "/audiobooks/import-path",
    "list_audiobook_utterances": "/audiobooks/{book_id}/chapters/{chapter_id}/utterances",
    "parse_audiobook_script": "/audiobooks/{book_id}/chapters/{chapter_id}/parse-script",
    "render_audiobook_chapter": "/audiobooks/{book_id}/render",
    # Batch
    "batch_create_from_list": "/batch/jobs/bulk",
    "batch_job_items": "/batch/jobs/{job_id}/items",
    "batch_job_progress": "/batch/jobs/{job_id}/progress",
    "batch_job_retry": "/batch/jobs/{job_id}/retry",
    # DSP
    "dsp_capabilities": "/dsp/capabilities",
    "dsp_effect": "/dsp/effect",
    "dsp_synth": "/dsp/synth",
    # Dubbing
    "dub_cancel": "/dubbing/cancel/{job_id}",
    "dub_download": "/dubbing/download/{job_id}",
    "dub_languages": "/dubbing/languages",
    "dub_preview": "/dubbing/preview",
    "dub_status": "/dubbing/job/{job_id}",
    "dub_video": "/dubbing/dub",
    # Export
    "apply_export_preset": "/export/apply-preset",
    "list_export_presets": "/export/presets",
    # Reference voices
    "get_reference_voice": "/reference-voices/{voice_id}",
    "list_reference_voices": "/reference-voices",
    "reference_voice_audio": "/reference-voices/{voice_id}/audio",
    "reload_reference_voices": "/reference-voices/reload",
    "use_reference_voice": "/reference-voices/{voice_id}/use",
    # Spatial
    "list_convolution_presets": "/spatial/convolution-presets",
    "list_spatial_presets": "/spatial/presets",
    "spatial_status": "/spatial/status",
    # Sounds / Freesound
    "download_freesound": "/sounds/download/{sound_id}",
    "search_freesound": "/sounds/search",
    # Voice packs
    "list_voice_packs": "/voice-packs",
    # Voice converter
    "convert_voice": "/voice-convert",
    # Models
    "models_list": "/models/status",
    # Help
    "app_help": "/help/search",
    # Agent workflow skills
    "list_skills": "/assistant/skills",
    # Workflow
    "plan_workflow": "/workflow/plan",
    "execute_plan": "/workflow/execute",
    "plan_templates": "/workflow/templates",
}

# HTTP method per tool (defaults to POST).
TOOL_METHODS = {
    "list_preset_voices": "GET",
    "get_profile": "GET",
    "list_profile_samples": "GET",
    "update_profile": "PUT",
    "delete_profile": "DELETE",
    "add_audiobook_cast": "PUT",
    "export_story_audio": "GET",
    "voice_changer_status": "GET",
    "voice_changer_effects": "GET",
    "list_voices": "GET",
    "list_effects": "GET",
    "list_captures": "GET",
    "list_models": "GET",
    "adr_list_sessions": "GET",
    "adr_get_session": "GET",
    "studio_load_session": "GET",
    "studio_list_sessions": "GET",
    "list_conversation_presets": "GET",
    "list_batch_jobs": "GET",
    "get_batch_job": "GET",
    "list_community_presets": "GET",
    "list_community_preset_categories": "GET",
    "list_builtin_presets": "GET",
    "voice_changer_capabilities": "GET",
    "list_channels": "GET",
    "get_channel": "GET",
    "get_channel_voices": "GET",
    "list_stories": "GET",
    "get_story": "GET",
    "list_audiobooks": "GET",
    "get_audiobook": "GET",
    "export_audiobook": "GET",
    "comping_list_sessions": "GET",
    "comping_load_session": "GET",
    "translate_languages": "GET",
    "list_project_templates": "GET",
    "list_plugins": "GET",
    "plugin_status": "GET",
    "list_scripting_functions": "GET",
    "model_cache_dir": "GET",
    "model_progress": "GET",
    "telemetry_status": "GET",
    "cuda_status": "GET",
    "list_import_formats": "GET",
    "import_info": "GET",
    "generation_version_audio": "GET",
    "capture_words": "GET",
    "capture_chapters": "GET",
    "list_audio_tags": "GET",
    "sample_manifest": "GET",
    "video_preview": "GET",
    "audio_preview": "GET",
    "list_projects": "GET",
    "get_project": "GET",
    "get_project_context": "GET",
    "list_project_sources": "GET",
    "list_project_plans": "GET",
    "get_plan": "GET",
    # New: wired from MCP _rest() calls
    "adr_guide_audio": "GET",
    "adr_guide_waveform": "GET",
    "adr_take_audio": "GET",
    "adr_waveform": "GET",
    "batch_job_items": "GET",
    "batch_job_progress": "GET",
    "dsp_capabilities": "GET",
    "dub_download": "GET",
    "dub_languages": "GET",
    "dub_status": "GET",
    "get_reference_voice": "GET",
    "list_audiobook_utterances": "GET",
    "list_convolution_presets": "GET",
    "list_export_presets": "GET",
    "list_reference_voices": "GET",
    "list_spatial_presets": "GET",
    "list_voice_packs": "GET",
    "models_list": "GET",
    "reference_voice_audio": "GET",
    "search_freesound": "GET",
    "spatial_status": "GET",
    "app_help": "GET",
    "list_skills": "GET",
    "plan_templates": "GET",
}

# Tools that drive the browser UI instead of calling a backend endpoint.
# The stream layer emits a `command` SSE event for these rather than executing
# an HTTP call. Kept to the lower-risk surface: navigation, profile selection,
# Audio Studio store setters, and Voice Changer store setters — the live audio
# graph is driven by the UI, never directly by the model (AGENTS.md invariant).
# The equivalent REST endpoints under /audio-studio and /voice-changer remain
# available to MCP/API callers, who have no UI session to drive.
CLIENT_COMMAND_TOOLS = {
    "ui_navigate",
    "ui_set_voice_profile",
    "studio_add_track",
    "studio_set_master_volume",
    "studio_import_session",
    "voice_changer_enable",
    "voice_changer_set_preset",
    "voice_changer_set_profile",
}

# POST endpoints that expect args as query parameters (not a JSON body). The
# default tool executor POSTs JSON; these are sent with `params=` instead so
# FastAPI's query-parameter parsing accepts them.
QUERY_POST_TOOLS = {
    "normalize_audio",
    "compress_audio",
    "duck_audio",
    "silence_removal",
    "copy_segment",
    "cut_segment",
    "paste_segment",
    "time_stretch",
    "shout_to_whisper",
    "blend",
    "cancel_batch_job",
    "plugins_scan",
    "cuda_download",
    "captures_refine",
    "captures_retranscribe",
    "master_audio",
    "separate_audio",
    "analyze_loudness",
}

# Build the bidirectional name map at import time
NAME_MAP = _build_name_map()
