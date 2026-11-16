# Knowledge Index

PURPOSE: One-line catalog of every otoyin tool/interface knowledge doc.
OWNS: docs/knowledge/*
READ-WHEN: You touch a backend interface, an MCP tool, or need the contract for a model engine.
KEY-FILES: backend/backends/__init__.py, backend/mcp_server/tools/, backend/routes/assistant_tools/
INVARIANTS: Every tool/function shipped must have a doc listed here; headers are greppable 7-line blocks.
GOTCHAS: Protocols are runtime_checkable (existence, not signature) — factories are the real contract. 00-index was stale (listed 3 docs); this rebuild catalogs all 50+.
UPDATED: 2026-09-11

### Ops & integrity (2026-09-11 fix pass)
- [82-model-integrity.md](82-model-integrity.md) — SHA-256 sidecars, dedup, marketplace-only manifest gate, download/verify/activate/delete contracts.
- [83-audio-playback.md](83-audio-playback.md) — Shared player, WaveSurfer + native fallback, autoplay policy, troubleshooting.
- [84-audio-recording.md](84-audio-recording.md) — Visible RecordAudioButton, native-vs-webview mic paths, capture upload.
- [85-theme-switching.md](85-theme-switching.md) — Full-coverage light/dark/special tokens, `light`-class invariant.
- [87-voice-design-offerings.md](87-voice-design-offerings.md) — All-model offerings menu, grouped accent/nationality + style pickers, shared options module.
- [86-marketplace-utilities.md](86-marketplace-utilities.md) — Utilities shelf at the bottom, pack collapse, category ordering.
- [90-audit-fixes-2026-10.md](90-audit-fixes-2026-10.md) - 2026-10-14 production audit: fixed findings (undo, playback, SSE, server lifecycle) + deferral reasons.
- [91-app-folder-models-and-staged-startup.md](91-app-folder-models-and-staged-startup.md) - 2026-10-14 model storage in data/models/ only (HF cache cleared, never read), tiered backend startup, default window geometry, title-bar controls.
- [92-except-and-overflow-audit.md](92-except-and-overflow-audit.md) - 2026-10-14 broad-except audit (497 blocks classified, 60 true swallowers -> 15) + overflow-pattern scan findings.
- [93-hidden-tabs.md](93-hidden-tabs.md) - Hide tabs without deleting them: tab registry + v2 hiddenTabs store, router beforeLoad guard, Settings → Workspace screen.
- [94-onboarding.md](94-onboarding.md) - First-launch wizard: welcome → use-case cards (registry-driven tabs enabled + model space) → setup (get a voice) → generate + listen; Skip on every step; Re-run from Settings → Workspace.
- [95-settings-schema.md](95-settings-schema.md) - Settings §5 slice S1: typed settings schema persisted to settings.json via Tauri settings_read/settings_write commands; theme migrated from uiStore localStorage onto the schema; atomic writes, defaults, clamping.
- [96-agent-harness.md](96-agent-harness.md) - Agent harness in-app driver: typed command registry (commandRegistry.ts), registry-driven assistantCommands, RootLayout mounts the listener. Commands discoverable via getFunctionSchemas() for agent tool calling.
- [97-updater.md](97-updater.md) - §6 updater (stable-only): UpdateBanner (AppFrame) with available/ready/error states, job-aware Restart disable, offline-safe auto-check (20 s + daily); usePostUpdateNotice one-time What's new toast; export/import settings backup (§5 S4). Live update flow NOT verified.

## Master Agent-Callable Reference

Every knowledge doc should have an `## Agent Callable` section with exact MCP tool names, REST endpoints, and file paths. This table maps features → MCP tools → REST endpoints → key files.

### TTS Generation
| Feature | MCP Tool | REST Endpoint | Key Files |
|---------|----------|---------------|-----------|
| Generate speech | `21labs.speak` | `POST /generate` | `backend/services/generation.py`, `backend/routes/generations.py` |
| List profiles | `21labs.list_profiles` | `GET /profiles` | `backend/services/profiles.py`, `backend/routes/profiles.py` |
| List models | `21labs.list_models` | `GET /models/status` | `backend/routes/models/status.py` |
| List captures | `21labs.list_captures` | `GET /captures` | `backend/routes/captures.py` |
| Transcribe | `21labs.transcribe` | `POST /transcribe` | `backend/routes/transcription.py` |
| Speaker diarize | `21labs.diarize` | `POST /diarize` | `backend/services/diarization.py`, `backend/routes/diarization.py` |
| SFX generation | `21labs.generate_sfx` | `POST /generate/sfx` | `backend/routes/generate.py` |
| Music generation | `21labs.generate_music` | `POST /generate/music` | `backend/routes/generate.py` |
| Bounce/mix | `21labs.bounce` | `POST /audio/bounce` | `backend/routes/audio.py`, `backend/services/mixer.py` |
| Bounce preview | `21labs.bounce_preview` | `POST /audio/bounce-preview` | `backend/routes/audio.py` |
| Run recipe | `21labs.run_recipe` | `POST /recipe/run` | `backend/services/recipe_runner.py`, `backend/routes/recipe.py` |
| Export Reaper | `21labs.export_reaper_project` | `POST /audio-studio/sessions/{id}/export-reaper` | `backend/services/daw_export.py` |
| Export subtitles | `21labs.export_subtitles` | `POST /transcription/export-subtitles` | `backend/services/subtitles.py` |

### Audio Processing
| Feature | MCP Tool | REST Endpoint | Key Files |
|---------|----------|---------------|-----------|
| Noise reduce | `21labs.noise_reduce` | `POST /audio/noise-reduce` | `backend/services/noise_reduction.py` |
| Normalize | `21labs.normalize_audio` | `POST /audio/normalize` | `backend/services/loudness.py` |
| Master | `21labs.master_audio` | `POST /audio/master` | `backend/services/mastering.py` |
| Compress | `21labs.compress_audio` | `POST /audio/compress` | `backend/routes/audio_processing.py` |
| Duck | `21labs.duck_audio` | `POST /audio/duck` | `backend/routes/audio_processing.py` |
| Silence removal | `21labs.silence_removal` | `POST /audio/silence-removal` | `backend/routes/audio_processing.py` |
| Loudness analysis | `21labs.analyze_loudness` | `POST /audio/loudness` | `backend/services/loudness.py` |
| Stem separation | `21labs.separate_audio` | `POST /audio/separate` | `backend/services/stem_separation.py` |
| Spectrogram | `21labs.spectrogram` | `POST /audio/spectrogram` | `backend/routes/spectrogram.py` |
| Fade in | `21labs.fade_in` | `POST /audio/fade-in` | `backend/routes/audio_effects.py` |
| Fade out | `21labs.fade_out` | `POST /audio/fade-out` | `backend/routes/audio_effects.py` |
| Splice | `21labs.splice` | `POST /audio/splice` | `backend/routes/audio_effects.py` |
| Delete region | `21labs.delete_region` | `POST /audio/delete-region` | `backend/routes/audio_effects.py` |
| Insert silence | `21labs.insert_silence` | `POST /audio/insert-silence` | `backend/routes/audio_effects.py` |
| Trim silence | `21labs.trim_silence` | `POST /audio/trim-silence` | `backend/routes/audio_effects.py` |
| Emotion/tone | `21labs.emotion_tone` | `POST /audio/emotion-tone` | `backend/services/emotion_tone.py` |
| Breath/pause | `21labs.breath_pause` | `POST /audio/breath-pause` | `backend/services/breath_pause.py` |
| Adjust pauses | `21labs.adjust_pauses` | `POST /audio/adjust-pauses` | `backend/routes/audio_effects.py` |
| Audio tags | `21labs.apply_audio_tags` | `POST /audio/apply-tags` | `backend/services/audio_tags.py` |
| List audio tags | `21labs.list_audio_tags` | `GET /audio/tags` | `backend/services/audio_tags.py` |
| Sample manifest | `21labs.sample_manifest` | `GET /audio/sample-manifest` | `backend/services/audio_sample_library.py` |
| Time stretch | — | `POST /audio/time-stretch` | `backend/services/effects_extended.py` |
| Blend | `21labs.blend` | `POST /audio/blend` (query params) | `backend/services/audio_edit.py`, `backend/routes/audio_pipeline/processing.py` |
| Effect chain | `21labs.apply_effects` | `POST /audio/effect-chain` (JSON body; unknown types 400) | `backend/services/effects.py`, `backend/routes/audio_pipeline/processing.py` |
| Shout to whisper | — | `POST /audio/shout-to-whisper` | `backend/services/effects_extended.py` |

### Instruments & DSP
| Feature | MCP Tool | REST Endpoint | Key Files |
|---------|----------|---------------|-----------|
| GM instrument | `21labs.play_gm_instrument` | `POST /instruments/gm` | `backend/services/gm_instrument.py` |
| Drum machine | `21labs.play_drum_machine` | `POST /instruments/drum-machine` | `backend/services/drum_machine.py` |
| Piano note | `21labs.play_piano_note` | `POST /instruments/piano` | `backend/services/instruments.py` |
| Synth note | `21labs.play_synth_note` | `POST /instruments/synth` | `backend/services/instruments.py` |
| Drum pad | `21labs.play_drum_pad` | `POST /instruments/drum` | `backend/services/instruments.py` |
| Noise gen | `21labs.generate_noise` | `POST /instruments/noise` | `backend/services/instruments.py` |
| DSP capabilities | `21labs.dsp_capabilities` | `GET /dsp/capabilities` | `backend/routes/dsp.py` |
| DSP synth | `21labs.dsp_synth` | `POST /dsp/synth` | `backend/services/dsp_synth.py` |
| DSP effect | `21labs.dsp_effect` | `POST /dsp/effect` | `backend/services/dsp_synth.py` |

### Spatial & Effects
| Feature | MCP Tool | REST Endpoint | Key Files |
|---------|----------|---------------|-----------|
| Spatial binaural | `21labs.spatial_binaural` | `POST /spatial/apply-binaural` | `backend/services/steam_audio.py` |
| Spatial convolution | `21labs.spatial_convolution` | `POST /spatial/apply-convolution` | `backend/services/steam_audio.py` |
| Spatial doppler | `21labs.spatial_doppler` | `POST /spatial/apply-doppler` | `backend/services/steam_audio.py` |
| Spatial render | `21labs.spatial_render` | `POST /spatial/render` | `backend/services/steam_audio.py` |
| List spatial presets | `21labs.list_spatial_presets` | `GET /spatial/presets` | `backend/routes/spatial.py` |
| List convolution presets | `21labs.list_convolution_presets` | `GET /spatial/convolution-presets` | `backend/routes/spatial.py` |
| Spatial status | `21labs.spatial_status` | `GET /spatial/status` | `backend/routes/spatial.py` |
| Available effects | — | `GET /effects/available` | `backend/routes/effects.py` |
| Effect presets | — | `GET /effects/presets` | `backend/routes/effects.py` |
| Preview effects | — | `POST /effects/preview/{id}` | `backend/routes/effects.py` |
| Export preset | `21labs.export_preset` | `POST /presets/export` | `backend/routes/features.py` |
| Import preset | `21labs.import_preset` | `POST /presets/import` | `backend/routes/features.py` |
| Built-in presets | `21labs.list_builtin_presets` | `GET /presets/builtin` | `backend/routes/features.py` |
| Community presets | `21labs.list_community_presets` | `GET /community-presets` | `backend/routes/phase2.py` |
| Community categories | `21labs.list_community_preset_categories` | `GET /community-presets/categories` | `backend/routes/phase2.py` |

### Voice & Profiles
| Feature | MCP Tool | REST Endpoint | Key Files |
|---------|----------|---------------|-----------|
| Voice changer caps | `21labs.voice_changer_capabilities` | `GET /voice-changer/capabilities` | `backend/routes/features.py` |
| List voice packs | `21labs.list_voice_packs` | `GET /voice-packs` | `backend/routes/voice_convert.py` |
| Convert voice | `21labs.convert_voice` | `POST /voice-convert` | `backend/routes/voice_convert.py` |
| Search Freesound | `21labs.search_freesound` | `GET /sounds/search` | `backend/services/freesound.py` |
| Download Freesound | `21labs.download_freesound` | `POST /sounds/download/{id}` | `backend/services/freesound.py` |

### Batch & Conversation
| Feature | MCP Tool | REST Endpoint | Key Files |
|---------|----------|---------------|-----------|
| List batch jobs | `21labs.list_batch_jobs` | `GET /batch/jobs` | `backend/services/batch.py` |
| Get batch job | `21labs.get_batch_job` | `GET /batch/jobs/{id}` | `backend/services/batch.py` |
| Create batch job | `21labs.create_batch_job` | `POST /batch/jobs` | `backend/services/batch.py` |
| Cancel batch job | `21labs.cancel_batch_job` | `POST /batch/jobs/{id}/cancel` | `backend/services/batch.py` |
| Conversation presets | `21labs.list_conversation_presets` | `GET /conversation/presets` | `backend/routes/conversation.py` |
| Auto duck | `21labs.conversation_auto_duck` | `POST /conversation/auto-duck` | `backend/routes/conversation.py` |
| Auto level | `21labs.conversation_auto_level` | `POST /conversation/auto-level` | `backend/routes/conversation.py` |

### Import & Plugins
| Feature | MCP Tool | REST Endpoint | Key Files |
|---------|----------|---------------|-----------|
| Plugin chain preview | `21labs.preview_plugin_chain` | `POST /plugins/preview` | `backend/routes/phase2.py` |
| List plugins | `21labs.list_plugins` | `GET /plugins/list` | `backend/routes/phase2.py` |
| Plugin status | `21labs.plugin_status` | `GET /plugins/status` | `backend/routes/phase2.py` |
| Plugin scan | `21labs.plugins_scan` | `POST /plugins/scan` | `backend/routes/phase2.py` |
| Plugin process | `21labs.plugins_process` | `POST /plugins/process` | `backend/routes/phase2.py` |
| Install marketplace plugin | — | `POST /marketplace/plugins/install` | `backend/routes/plugins_marketplace.py`, `backend/services/plugin_install.py` |
| List marketplace plugins | — | `GET /marketplace/plugins` | `backend/routes/plugins_marketplace.py` |
| Enable/disable marketplace plugin | — | `POST /marketplace/plugins/{id}/enable|disable` | `backend/routes/plugins_marketplace.py` |
| Uninstall marketplace plugin | — | `DELETE /marketplace/plugins/{id}` | `backend/routes/plugins_marketplace.py` |
| Approve external-app launch | — | `POST /marketplace/plugins/{id}/approve-external` | `backend/routes/plugins_marketplace.py`, `backend/services/plugin_install.py` |
| Launch external-app (linking layer) | — | `POST /marketplace/plugins/{id}/launch-external` | `backend/routes/plugins_marketplace.py`, `backend/services/plugin_install.py` |
| Video preview | `21labs.video_preview` | `GET /import/video-preview` | `backend/routes/extended_import.py` |
| Audio preview | `21labs.audio_preview` | `GET /import/audio-preview` | `backend/routes/extended_import.py` |
| Extract audio | `21labs.extract_audio` | `POST /import/extract-audio` | `backend/routes/extended_import.py` |
| Convert audio | `21labs.convert_audio` | `POST /import/convert` | `backend/routes/extended_import.py` |
| Import formats | `21labs.list_import_formats` | `GET /import/formats` | `backend/routes/extended_import.py` |
| Import info | `21labs.import_info` | `GET /import/info` | `backend/routes/extended_import.py` |

### Models & System
| Feature | MCP Tool | REST Endpoint | Key Files |
|---------|----------|---------------|-----------|
| Models list | `21labs.models_list` | `GET /models/status` | `backend/routes/models/status.py` |
| Model cache dir | `21labs.model_cache_dir` | `GET /models/cache-dir` | `backend/routes/models/cache.py` |
| Model progress | `21labs.model_progress` | `GET /models/progress/{name}` | `backend/routes/models/load_unload.py` |
| Models download | `21labs.models_download` | `POST /models/download` | `backend/routes/models/download.py` |
| Models load | `21labs.models_load` | `POST /models/load` | `backend/routes/models/load_unload.py` |
| Models unload | `21labs.models_unload` | `POST /models/unload` | `backend/routes/models/load_unload.py` |
| Session save | `21labs.session_save` | `POST /session/save` | `backend/routes/features.py` |
| Session load | `21labs.session_load` | `POST /session/load` | `backend/routes/features.py` |
| Telemetry status | `21labs.telemetry_status` | `GET /telemetry/status` | `backend/routes/phase2.py` |
| Telemetry toggle | `21labs.telemetry_toggle` | `POST /telemetry/toggle` | `backend/routes/phase2.py` |
| CUDA status | `21labs.cuda_status` | `GET /backend/cuda-status` | `backend/routes/cuda.py` |
| CUDA download | `21labs.cuda_download` | `POST /backend/download-cuda` | `backend/routes/cuda.py` |
| App help | `21labs.app_help` | `GET /help/search` | `backend/routes/help.py` |
| Scripting functions | `21labs.list_scripting_functions` | `GET /scripting/functions` | `backend/routes/scripting.py` |
| Scripting execute | `21labs.scripting_execute` | `POST /scripting/execute` | `backend/routes/scripting.py` |

### Stories & Projects
| Feature | MCP Tool | REST Endpoint | Key Files |
|---------|----------|---------------|-----------|
| List stories | `21labs.list_stories` | `GET /stories` | `backend/routes/stories.py` |
| Get story | `21labs.get_story` | `GET /stories/{id}` | `backend/routes/stories.py` |
| Create story | `21labs.create_story` | `POST /stories` | `backend/routes/stories.py` |
| Export story audio | `21labs.export_story_audio` | `GET /stories/{id}/export-audio` | `backend/routes/stories.py` |
| List project templates | `21labs.list_project_templates` | `GET /project/templates` | `backend/routes/standalone.py` |
| Create project | `21labs.create_project` | `POST /project/create` | `backend/routes/standalone.py` |
| Save project | `21labs.save_project` | `POST /project/save` | `backend/routes/standalone.py` |
| Load project | `21labs.load_project` | `POST /project/load` | `backend/routes/standalone.py` |
| Import script | `21labs.import_script` | `POST /project/import-script` | `backend/routes/standalone.py` |
| List channels | `21labs.list_channels` | `GET /channels` | `backend/routes/channels.py` |
| Get channel | `21labs.get_channel` | `GET /channels/{id}` | `backend/routes/channels.py` |
| Get channel voices | `21labs.get_channel_voices` | `GET /channels/{id}/voices` | `backend/routes/channels.py` |
| Create channel | `21labs.create_channel` | `POST /channels` | `backend/routes/channels.py` |

### Misc
| Feature | MCP Tool | REST Endpoint | Key Files |
|---------|----------|---------------|-----------|
| Generation version audio | `21labs.generation_version_audio` | `GET /audio/version/{id}` | `backend/routes/generations.py` |
| Captures refine | `21labs.captures_refine` | `POST /captures/{id}/refine` | `backend/routes/captures.py` |
| Captures retranscribe | `21labs.captures_retranscribe` | `POST /captures/{id}/retranscribe` | `backend/routes/captures.py` |
| Plan workflow | `21labs.plan_workflow` | — | `backend/services/workflow.py`, `backend/mcp_server/tools/workflow.py` |
| Execute plan | `21labs.execute_plan` | — | `backend/services/workflow.py`, `backend/mcp_server/tools/workflow.py` |
| Plan templates | `21labs.plan_templates` | — | `backend/services/workflow.py`, `backend/mcp_server/tools/workflow.py` |

### Frontend Routes (UI pages)
| Route | Component | File |
|-------|-----------|------|
| `/` | `MainEditor` | `app/src/features/generate/GeneratePage.tsx` |
| `/stories` | `StoriesTab` | `app/src/features/stories/StoriesTab.tsx` |
| `/voices` | `VoicesTab` | `app/src/features/voices/VoicesTab.tsx` |
| `/captures` | `CapturesTab` | `app/src/features/captures/CapturesTab.tsx` |
| `/effects` | `EffectsTab` | `app/src/features/effects/EffectsTab.tsx` |
| `/models` | redirect -> `StorePage` | `app/src/features/store/StorePage.tsx` |
| `/audio-studio` | `AudioStudio` | `app/src/features/audioStudio/AudioStudio.tsx` |
| `/voice-changer` | `VoiceChangerView` | `app/src/features/workspace/VoiceChangerView.tsx` |
| `/voice-converter` | `VoiceConverterView` | `app/src/features/workspace/VoiceConverterView.tsx` |
| `/sounds` | `SoundEffectsView` | `app/src/features/workspace/SoundEffectsView.tsx` |
| `/projects` | `StandaloneProjectPage` | `app/src/features/content/StandaloneProjectPage.tsx` |
| `/store` | `StorePage` | `app/src/features/store/StorePage.tsx` |
| `/workspace/timeline` | `TimelineView` | `app/src/features/workspace/TimelineView.tsx` |
| `/workspace/pitch` | `PitchMapView` | `app/src/features/workspace/PitchMapView.tsx` |
| `/workspace/mixer` | `MixerView` | `app/src/features/workspace/MixerView.tsx` |
| `/workspace/effects` | `EffectsView` | `app/src/features/effects/EffectsTab.tsx` |
| `/workspace/studio` | `StudioView` | `app/src/features/workspace/StudioView.tsx` |
| `/workspace/dsp` | `DspView` | `app/src/features/workspace/DspView.tsx` |
| `/workspace/adr` | `ADRView` | `app/src/features/workspace/adr/ADRView.tsx` |
| `/workspace/audio-plan` | `AudioPlanView` | `app/src/features/workspace/AudioPlanView.tsx` |
| `/workspace/batch` | `BatchQueueView` | `app/src/features/workspace/BatchQueueView.tsx` |
| `/workspace/noise-reduction` | `NoiseReductionView` | `app/src/features/workspace/NoiseReductionView.tsx` |
| `/workspace/audio-enhance` | `AudioEnhanceView` | `app/src/features/workspace/AudioEnhanceView.tsx` |
| `/workspace/vocal-isolation` | `VocalIsolationView` | `app/src/features/workspace/VocalIsolationView.tsx` |
| `/workspace/spectrogram` | `SpectrogramView` | `app/src/features/workspace/SpectrogramView.tsx` |
| `/workspace/conversation` | `ConversationView` | `app/src/features/workspace/ConversationView.tsx` |
| `/workspace/export` | `PlatformExportView` | `app/src/features/workspace/PlatformExportView.tsx` |
| `/workspace/transcript` | `TranscriptEditView` | `app/src/features/workspace/TranscriptEditView.tsx` |
| `/workspace/spatial` | `SpatialView` | `app/src/features/workspace/SpatialView.tsx` |
| `/workspace/automation` | `AutomationView` | `app/src/features/workspace/AutomationView.tsx` |
| `/workspace/comping` | `MultiTakeCompingView` | `app/src/features/workspace/MultiTakeCompingView.tsx` |
| `/workspace/diarize` | `DiarizationView` | `DiarizationView.tsx` |
| `/workspace/live-transcript` | `LiveTranscriptView` | `app/src/features/workspace/LiveTranscriptView.tsx` |
| `/workspace/video` | `VideoPreviewView` | `app/src/features/workspace/VideoPreviewView.tsx` |
| `/workspace/download` | `YouTubeDownloadView` | `app/src/features/workspace/YouTubeDownloadView.tsx` |
| `/settings/` | `GeneralPage` | `app/src/features/settings/GeneralPage.tsx` |
| `/settings/generation` | `GenerationPage` | `app/src/features/settings/GenerationPage.tsx` |
| `/settings/captures` | `CapturesPage` | `app/src/features/settings/CapturesPage.tsx` |
| `/settings/mcp` | `MCPPage` | `app/src/features/settings/MCPPage.tsx` |
| `/settings/gpu` | `GpuPage` | `app/src/features/settings/GpuPage.tsx` |
| `/settings/logs` | `LogsPage` | `app/src/features/settings/LogsPage.tsx` |
| `/settings/about` | `AboutPage` | `app/src/features/settings/AboutPage.tsx` |
| `/settings/shortcuts` | `ShortcutsPage` | `app/src/features/settings/ShortcutsPage.tsx` |
| `/settings/scripting` | `ScriptingPage` | `app/src/features/settings/ScriptingPage.tsx` |
| `/settings/plugins` | `PluginsPage` | `app/src/features/settings/PluginsPage.tsx` |
| `/settings/api-keys` | `ApiKeysPage` | `app/src/features/settings/ApiKeysPage.tsx` |

### Zustand Stores
| Store | Hook | File |
|-------|------|------|
| Server | `useServerStore` | `app/src/stores/serverStore.ts` |
| Player | `usePlayerStore` | `app/src/stores/playerStore.ts` |
| UI | `useUIStore` | `app/src/stores/uiStore.ts` |
| Story | `useStoryStore` | `app/src/stores/storyStore.ts` |
| Effects | `useEffectsStore` | `app/src/stores/effectsStore.ts` |
| Generation | `useGenerationStore` | `app/src/stores/generationStore.ts` |
| Content | `useContentStore` | `app/src/stores/contentStore.ts` |
| Log | `useLogStore` | `app/src/stores/logStore.ts` |
| Clipboard | `useClipboardStore` | `app/src/stores/clipboardStore.ts` |
| Voice Chat | `useVoiceChatStore` | `app/src/stores/voiceChatStore.ts` |
| Voice Changer | `useVoiceChangerStore` | `app/src/stores/voiceChangerStore.ts` |

---

## Knowledge Docs by Category

### Core studio
- [01-voice-studio.md](01-voice-studio.md) — TTS generation, voice profiles, engine selection.
- [02-waveform-editor.md](02-waveform-editor.md) — Waveform editing, clip ops, pitch map surface.
- [03-pitch-map.md](03-pitch-map.md) — Piano-roll pitch map (C3–C5), pitch correction.
- [04-voice-effects.md](04-voice-effects.md) — Effects chain, presets, drag-sort, enable/disable.
- [05-sound-studio.md](05-sound-studio.md) — Instruments/SFX/Noise generation, sound studio tabs.
- [06-mixer.md](06-mixer.md) — Multi-track mixer: VU, mute/solo, pan, bus routing, sidechain duck.
- [07-audio-plan.md](07-audio-plan.md) — AI Audio Plan: automatic scene-based track assignment.
- [08-adr-mode.md](08-adr-mode.md) — ADR: sessions, guide tracks, takes, scoring.
- [09-session-management.md](09-session-management.md) — DAW session save/load/persist.
- [10-batch-processing.md](10-batch-processing.md) — Batch queue + scripting (see also agent workflow notes).
- [11-noise-reduction.md](11-noise-reduction.md) — RNNoise / VAD noise reduction.
- [12-loudness-metering.md](12-loudness-metering.md) — LUFS measurement, true-peak.
- [13-preset-sharing.md](13-preset-sharing.md) — Effect preset save/load/export/import.
- [14-voice-profiles.md](14-voice-profiles.md) — Voice cloning, profile samples, channels.
- [15-mcp-integration.md](15-mcp-integration.md) — MCP server mount + client bindings.
- [16-leone-integration.md](16-leone-integration.md) — otoyin/Leone Tauri IPC.
- [17-agent-skills.md](17-agent-skills.md) — shared executable workflow skills for the assistant and MCP.
- [17-settings.md](17-settings.md) — App + server settings.
- [18-model-downloads.md](18-model-downloads.md) — Model registry, download/load/unload, CUDA.
- [41-kokoro-tts-backend.md](41-kokoro-tts-backend.md) — Kokoro-82M: how it works, 50 voices, blending/custom packs, long-text chunk+timeout fix.
- [48-onnx-tts-backends.md](48-onnx-tts-backends.md) — The four real torch-free ONNX TTS backends (kokoro, f5_tts, pocket_tts, styletts2): vendored sources, factory ONNX-first dispatch, verification contract. ChatTTS is torch-only by design.
- [49-moss-tts-nano-onnx.md](49-moss-tts-nano-onnx.md) — MOSS-TTS-Nano: torch-free zero-shot clone engine via ONNX Runtime (48k stereo -> 24k mono). Gated on sentencepiece+onnxruntime; no torch fallback.
- [50-byok-model-providers.md](50-byok-model-providers.md) — True-BYOK: arbitrary cloud endpoint + key per domain (tts/music/sfx/vc/llm), Fernet-encrypted at rest, REST CRUD.
- [51-kitten-tts-onnx.md](51-kitten-tts-onnx.md) — KittenTTS ONNX: lightest TTS (lighter than Kokoro), torch-free CPU-only, 8 preset voices, 24kHz, KITTEN_SIZE selectable.
- [19-voice-changer.md](19-voice-changer.md) — Real-time voice changer, capabilities probe.
- [20-legacy-tools.md](20-legacy-tools.md) — Deprecated/legacy endpoints.
- [21-conversation-mode.md](21-conversation-mode.md) — Multi-speaker conversation/podcast, auto-duck, level-match.
- [22-platform-export.md](22-platform-export.md) — Platform export presets + LUFS targets.
- [23-transcript-edit.md](23-transcript-edit.md) — Transcript-driven editing, click-to-playhead.
- [24-spatial-audio.md](24-spatial-audio.md) — Binaural/doppler/convolution spatial.
- [42-rvc-voice-converter.md](42-rvc-voice-converter.md) — RVC v2 file-based voice conversion to a downloaded pack.
- [43-freesound-sfx.md](43-freesound-sfx.md) — Freesound API SFX browser (user API key, cached previews).
- [43b-seed-vc.md](43b-seed-vc.md) — Seed-VC zero-shot voice clone from a reference clip (optional).
- [44-vc-light-tiers-onnx.md](44-vc-light-tiers-onnx.md) — Light VC tiers verified; ONNX backend deferred (rvc_python F0 not swappable, Seed-VC ONNX needs export).
- [45-steam-audio-integration.md](45-steam-audio-integration.md) — Steam Audio SDK: real HRTF binaural LIVE via bundled SOFA dataset; NumPy DSP fallback for convolution/doppler; verified directional output.
- [25-automation-cues.md](25-automation-cues.md) — Automation lanes, keyframes, cue matrix.
- [26-multi-take-comping.md](26-multi-take-comping.md) — Multi-take comping lanes.
- [27-new-effects.md](27-new-effects.md) — Extended effects catalog (25+).
- [28-voice-clone.md](28-voice-clone.md) — One-click voice clone: upload audio → extract voice profile → use immediately. Auto-transcribe, auto-detect engine.
- [29-streaming-playback.md](29-streaming-playback.md) — Real-time chunk-based TTS playback: play audio as soon as first chunk completes, sequential queue, assembled audio switch.
- [30-quality-ratings.md](30-quality-ratings.md) — 10-star quality scoring per model in marketplace, categorized by domain (TTS/STT/LLM/Music/SFX).
- [31-cancellation-ui.md](31-cancellation-ui.md) — Generation cancellation UI: cancel button in history + editor, backend CancelledError handling.
- [32-stt-backends.md](32-stt-backends.md) — STT model registry: Whisper, Parakeet, Qwen3-ASR with multilingual support, C++ backends.
- [36-feature-completeness.md](36-feature-completeness.md) — Feature completeness audit: 55 features across 7 categories, 100% wired to backend + MCP + frontend.
- [backend-music-interface.md](backend-music-interface.md) — `MusicBackend` protocol + factory (Stable Audio).
- [errors.md](errors.md) — Error shapes and handling.
- [mcp-audio-orchestration.md](mcp-audio-orchestration.md) — The 10 MCP tools for audio orchestration.
- [PLUGIN_SYSTEM.md](PLUGIN_SYSTEM.md) — Marketplace plugin install/verify/launch + bundle authoring (`build_plugin_bundle.py`, `just plugin-bundle`) + external-app linking layer.
- [UPGRADE_PATH.md](UPGRADE_PATH.md) — Consolidation roadmap, payment/license flow, and consolidation checklist for the plugin & marketplace system.
- [TOOL-REFERENCE.md](TOOL-REFERENCE.md) — In-app assistant tool catalog (prompt base lives in backend/agents/instructions.py).
- [59-dsp-synth.md](59-dsp-synth.md) — Offline "Synth / DSP" tab: pure NumPy/SciPy synthesis + classical effects (audio-dsp lib), no AI/API.

### Agent knowledge
- [33-agent-operating-guide.md](33-agent-operating-guide.md) — How any AI operates the app via tools.
- [34-content-recipes.md](34-content-recipes.md) — Content-type recipe index + reusable template.
- [35-dialogue-methodology.md](35-dialogue-methodology.md) — How real dialogue is built (ADR + conversation + comping).
- [37-professional-finishing.md](37-professional-finishing.md) — De-esser, spectral de-noise, mastering, stem separation, real-time overdub.
- [38-recipe-runner-and-interchange.md](38-recipe-runner-and-interchange.md) — run_recipe, music beds, Reaper export, Voice Changer commands.
- [39-gm-instruments.md](39-gm-instruments.md) — General-MIDI instrument rendering + 16-step drum machine (offline SoundFont).
- [instruments-router.md](instruments-router.md) — Index/router for all instrument skills (procedural, GM, drum-machine).
- [45-agent-manifest.md](45-agent-manifest.md) — Unified agent prompt + canonical tool schema; assistant↔MCP tool-parity report.
- [46-llm-context.md](46-llm-context.md) — RAM-aware LLM context window (n_ctx) formula, user override, generation max_tokens cap.
- [47-assistant-settings.md](47-assistant-settings.md) — Persistent agent settings (context/token override, memory/thinking toggles); user override beats RAM default with warning.
- [40-loudness-and-subtitles.md](40-loudness-and-subtitles.md) — analyze_loudness (LUFS) + export_subtitles (SRT/VTT).
- [mcp-tools-extended.md](mcp-tools-extended.md) — Extended MCP tool catalog (Phase 3 wiring).
- [70-custom-skills.md](70-custom-skills.md) — User-created agent skills: create, manage, wire into assistant.
- [71-quick-start.md](71-quick-start.md) — Getting started: model download, first generation, key concepts.
- [72-keyboard-shortcuts.md](72-keyboard-shortcuts.md) — Complete keyboard shortcut reference for all tabs.
- [73-voice-chat-guide.md](73-voice-chat-guide.md) — Real-time voice chat: setup, latency, barge-in, troubleshooting.
- [74-api-reference.md](74-api-reference.md) — Complete REST API reference for external integrators.
- [75-audio-library.md](75-audio-library.md) — Unified Audio Library: browse, tag, batch-manage all clips.
- [76-effects-pipeline.md](76-effects-pipeline.md) — Two effects paths: effects_chain (single-clip) vs recipe_runner (multi-track).
- [77-notifications.md](77-notifications.md) — Push-style notices: remote `GET /v1/notices` merged into bundled announcements at startup; admin `POST /v1/notices/admin`; offline-first.
- [78-component-lineage.md](78-component-lineage.md) — Recovery map after archive/ deletion: pre/post-repair component text via git objects (`630b6f9`, `ba07d00`), never recreate archive/.
- [79-encoding-repairs.md](79-encoding-repairs.md) — Repair method for corrupted files + round-trip verification (HEAD-blob refix, per-glyph corruption-source proof), taxonomy, gotchas.
- [80-powershell-redirect-corruption.md](80-powershell-redirect-corruption.md) — The valid-UTF-8 corruption class byte gates miss (PowerShell `>` redirect): mechanism, script-run detection heuristic, surgical repair recipe.
- [81-waveform-playlist-adapter.md](81-waveform-playlist-adapter.md) — StoryTrackEditor's waveform-playlist v15 adapter: authority split (playlist paints, otoyin owns audio/gestures), engine zoom-ladder constraint, pointer bridge, ms↔sample mapping.

### Audit info docs
- [52-cross-tab-clip-linkage.md](52-cross-tab-clip-linkage.md) — Cross-tab clip linkage (copy/paste linked clips) + per-tab autosave & compulsory Save.
- [53-cross-tab-audio-video.md](53-cross-tab-audio-video.md) — Cross-tab audio bus + Video Preview tab: route live audio across tabs, monitor picker, video extract-to-studio.
- [53-generation-pipeline.md](53-generation-pipeline.md) — TTS orchestration: run_generation modes, chunking, serial queue, cloud BYOK, status/SSE.
- [54-audio-effects-processing.md](54-audio-effects-processing.md) — AudioEffectsChain (16 effects), noise reduction (DeepFilterNet), and the backend-vs-frontend reverb/delay divergence.
- [55-stories-adr.md](55-stories-adr.md) — Stories timeline (non-destructive edits, export) + ADR sessions/guides/takes.
- [56-assistant-agent.md](56-assistant-agent.md) — Assistant LLM paths (local GGUF planner via llama.cpp server + cloud), tool loop, execute_tool guard, agent manifest + parity report.
- [57-frontend-audiostudio-generation.md](57-frontend-audiostudio-generation.md) — AudioStudio zustand store, buildEffectChain FX, generation submit + profile-sync gating.
- [58-frontend-state-routing.md](58-frontend-state-routing.md) — 9 zustand stores, useAudioPlayer shared AudioContext, TanStack Router lazy routes.
- [59-audio-joining-merging.md](59-audio-joining-merging.md) — How clips combine: backend numpy mixer (buses/pan/peak-norm), Web Audio DAW graph, recipe crossfade+duck, mastering (compressor/limiter/LUFS/stereo), EQ frequency tuning.
- [60-editing-primitives-and-story-pan.md](60-editing-primitives-and-story-pan.md) — Per-story-item stereo pan (DB→export) + audio editing primitives (copy/cut/paste, time-stretch, shout→whisper, blend) for humans and the agent.
- [61-core-model-audit.md](61-core-model-audit.md) — Core model/runtime audit (torch section superseded 2026-11-15: PyTorch removed entirely; see TORCH_AUDIT.md).
- [62-audio-tags.md](62-audio-tags.md) — Universal audio tags: bracketed tags ([pause], [laughs shy]) parsed from TTS text, real human samples loaded from library, works on any engine.
- [63-pocket-emo.md](63-pocket-emo.md) — Pocket-TTS + EmoShift: 6 emotion steering vectors (27KB) injected into transformer layer 5. Happy/sad/angry/fear/disgust/neutral.
- [65-voice-chat.md](65-voice-chat.md) — Real-time speech-to-speech voice agent: VAD→STT→LLM→TTS pipeline, tool calling, barge-in, streaming, memory, OpenAI Realtime endpoint, observability.

### Tab-specific About docs
- [ABOUT-GENERATE.md](ABOUT-GENERATE.md) — Generate tab: TTS creation, history, controls, keyboard shortcuts.
- [ABOUT-WORKSPACE.md](ABOUT-WORKSPACE.md) — Workspace tab: 24 specialized sub-views for advanced audio work.
- [ABOUT-AUDIO-STUDIO.md](ABOUT-AUDIO-STUDIO.md) — Audio Studio: multi-track recording, transport, track controls.
- [ABOUT-STORIES.md](ABOUT-STORIES.md) — Stories: long-form audio composition, clip editing, timeline.
- [ABOUT-CAPTURES.md](ABOUT-CAPTURES.md) — Captures: transcription, dictation, speech-to-text.
- [ABOUT-VOICES.md](ABOUT-VOICES.md) — Voices: voice profile creation and management.
- [ABOUT-EFFECTS.md](ABOUT-EFFECTS.md) — Effects: effects chain preset management.
- [ABOUT-MODELS.md](ABOUT-MODELS.md) — Models: model download, management, and status.
- [ABOUT-SETTINGS.md](ABOUT-SETTINGS.md) — Settings: 14 sub-tabs for app/server configuration.
- [ABOUT-ASSISTANT.md](ABOUT-ASSISTANT.md) — AI Assistant: chat-based helper with tool access.
- [BUTTON-REFERENCE.md](BUTTON-REFERENCE.md) — Complete UI action catalog: every button across all tabs.

## Core studio
- [01-voice-studio.md](01-voice-studio.md) — TTS generation, voice profiles, engine selection.
- [02-waveform-editor.md](02-waveform-editor.md) — Waveform editing, clip ops, pitch map surface.
- [03-pitch-map.md](03-pitch-map.md) — Piano-roll pitch map (C3–C5), pitch correction.
- [04-voice-effects.md](04-voice-effects.md) — Effects chain, presets, drag-sort, enable/disable.
- [05-sound-studio.md](05-sound-studio.md) — Instruments/SFX/Noise generation, sound studio tabs.
- [06-mixer.md](06-mixer.md) — Multi-track mixer: VU, mute/solo, pan, bus routing, sidechain duck.
- [07-audio-plan.md](07-audio-plan.md) — AI Audio Plan: automatic scene-based track assignment.
- [08-adr-mode.md](08-adr-mode.md) — ADR: sessions, guide tracks, takes, scoring.
- [09-session-management.md](09-session-management.md) — DAW session save/load/persist.
- [10-batch-processing.md](10-batch-processing.md) — Batch queue + scripting (see also agent workflow notes).
- [11-noise-reduction.md](11-noise-reduction.md) — RNNoise / VAD noise reduction.
- [12-loudness-metering.md](12-loudness-metering.md) — LUFS measurement, true-peak.
- [13-preset-sharing.md](13-preset-sharing.md) — Effect preset save/load/export/import.
- [14-voice-profiles.md](14-voice-profiles.md) — Voice cloning, profile samples, channels.
- [15-mcp-integration.md](15-mcp-integration.md) — MCP server mount + client bindings.
- [16-leone-integration.md](16-leone-integration.md) — otoyin/Leone Tauri IPC.
- [17-settings.md](17-settings.md) — App + server settings.
- [18-model-downloads.md](18-model-downloads.md) — Model registry, download/load/unload, CUDA.
- [41-kokoro-tts-backend.md](41-kokoro-tts-backend.md) — Kokoro-82M: how it works, 50 voices, blending/custom packs, long-text chunk+timeout fix.
- [48-onnx-tts-backends.md](48-onnx-tts-backends.md) — The four real torch-free ONNX TTS backends (kokoro, f5_tts, pocket_tts, styletts2): vendored sources, factory ONNX-first dispatch, verification contract. ChatTTS is torch-only by design.
- [49-moss-tts-nano-onnx.md](49-moss-tts-nano-onnx.md) — MOSS-TTS-Nano: torch-free zero-shot clone engine via ONNX Runtime (48k stereo -> 24k mono). Gated on sentencepiece+onnxruntime; no torch fallback.
- [50-byok-model-providers.md](50-byok-model-providers.md) — True-BYOK: arbitrary cloud endpoint + key per domain (tts/music/sfx/vc/llm), Fernet-encrypted at rest, REST CRUD.
- [51-kitten-tts-onnx.md](51-kitten-tts-onnx.md) — KittenTTS ONNX: lightest TTS (lighter than Kokoro), torch-free CPU-only, 8 preset voices, 24kHz, KITTEN_SIZE selectable.
- [19-voice-changer.md](19-voice-changer.md) — Real-time voice changer, capabilities probe.
- [20-legacy-tools.md](20-legacy-tools.md) — Deprecated/legacy endpoints.
- [21-conversation-mode.md](21-conversation-mode.md) — Multi-speaker conversation/podcast, auto-duck, level-match.
- [22-platform-export.md](22-platform-export.md) — Platform export presets + LUFS targets.
- [23-transcript-edit.md](23-transcript-edit.md) — Transcript-driven editing, click-to-playhead.
- [24-spatial-audio.md](24-spatial-audio.md) — Binaural/doppler/convolution spatial.
- [42-rvc-voice-converter.md](42-rvc-voice-converter.md) — RVC v2 file-based voice conversion to a downloaded pack.
- [43-freesound-sfx.md](43-freesound-sfx.md) — Freesound API SFX browser (user API key, cached previews).
- [43b-seed-vc.md](43b-seed-vc.md) — Seed-VC zero-shot voice clone from a reference clip (optional).
- [44-vc-light-tiers-onnx.md](44-vc-light-tiers-onnx.md) — Light VC tiers verified; ONNX backend deferred (rvc_python F0 not swappable, Seed-VC ONNX needs export).
- [45-steam-audio-integration.md](45-steam-audio-integration.md) — Steam Audio SDK: real HRTF binaural LIVE via bundled SOFA dataset; NumPy DSP fallback for convolution/doppler; verified directional output.
- [25-automation-cues.md](25-automation-cues.md) — Automation lanes, keyframes, cue matrix.
- [26-multi-take-comping.md](26-multi-take-comping.md) — Multi-take comping lanes.
- [27-new-effects.md](27-new-effects.md) — Extended effects catalog (25+).
- [28-voice-clone.md](28-voice-clone.md) — One-click voice clone: upload audio → extract voice profile → use immediately. Auto-transcribe, auto-detect engine.
- [29-streaming-playback.md](29-streaming-playback.md) — Real-time chunk-based TTS playback: play audio as soon as first chunk completes, sequential queue, assembled audio switch.
- [30-quality-ratings.md](30-quality-ratings.md) — 10-star quality scoring per model in marketplace, categorized by domain (TTS/STT/LLM/Music/SFX).
- [31-cancellation-ui.md](31-cancellation-ui.md) — Generation cancellation UI: cancel button in history + editor, backend CancelledError handling.
- [32-stt-backends.md](32-stt-backends.md) — STT model registry: Whisper, Parakeet, Qwen3-ASR with multilingual support, C++ backends.
- [88-takes-pipeline.md](88-takes-pipeline.md) — Local takes pipeline (words+speakers+YAMNet events) with Scribe-shaped JSON, packed view, highlights, chapters; video-use-compatible.
- [89-store-test-mode.md](89-store-test-mode.md) — Payment-free test copy: bundled flag unlocks every Store product (frozen-only, env for dev); test identity via tauri.test.conf.json; `just build-test`.
- [36-feature-completeness.md](36-feature-completeness.md) — Feature completeness audit: 55 features across 7 categories, 100% wired to backend + MCP + frontend.
- [backend-music-interface.md](backend-music-interface.md) — `MusicBackend` protocol + factory (Stable Audio).
- [errors.md](errors.md) — Error shapes and handling.
- [mcp-audio-orchestration.md](mcp-audio-orchestration.md) — The 10 MCP tools for audio orchestration.
- [PLUGIN_SYSTEM.md](PLUGIN_SYSTEM.md) — Marketplace plugin install/verify/launch + bundle authoring (`build_plugin_bundle.py`, `just plugin-bundle`) + external-app linking layer.
- [UPGRADE_PATH.md](UPGRADE_PATH.md) — Consolidation roadmap, payment/license flow, and consolidation checklist for the plugin & marketplace system.
- [TOOL-REFERENCE.md](TOOL-REFERENCE.md) — In-app assistant tool catalog (prompt base lives in backend/agents/instructions.py).
- [59-dsp-synth.md](59-dsp-synth.md) — Offline "Synth / DSP" tab: pure NumPy/SciPy synthesis + classical effects (audio-dsp lib), no AI/API.

## Phase 2 feature docs (completed — archived 2026-08-17)
- ~~phase2-index.md~~ — **Archived** (`archive/phase2-index.md`): Phase 2 knowledge doc index.
- ~~phase2-standalone.md~~ — **Archived** (`archive/phase2-standalone.md`): StandaloneProjectPage: templates, create/save/load.
- ~~phase2-import.md~~ — **Archived** (`archive/phase2-import.md`): ImportModal: audio + video audio extraction.
- ~~phase2-shortcuts.md~~ — **Archived** (`archive/phase2-shortcuts.md`): ShortcutsPage: keymaps (otoyin/Premiere/DaVinci/Pro Tools).
- ~~phase2-plugins.md~~ — **Archived** (`archive/phase2-plugins.md`): VST3/AU hosting deferred (stub backend).
- ~~phase2-scripting.md~~ — **Archived** (`archive/phase2-scripting.md`): ScriptingPage: function list + execute.
- ~~phase2-timecode.md~~ — **Archived** (`archive/phase2-timecode.md`): TimecodeDisplay: SMPTE + frame rates.
- ~~phase2-spectrogram.md~~ — **Archived** (`archive/phase2-spectrogram.md`): SpectrogramView: intensity visualization.
- ~~phase2-community.md~~ — **Archived** (`archive/phase2-community.md`): CommunityPresetsPage: search/browse/import.
- ~~phase2-telemetry.md~~ — **Archived** (`archive/phase2-telemetry.md`): TelemetryPage: enable/disable + privacy.
- ~~phase2-lottie.md~~ — **Archived** (`archive/phase2-lottie.md`): LottieExportPage: audio → Lottie.
- ~~phase2-tapescrub.md~~ — **Archived** (`archive/phase2-tapescrub.md`): TapeScrubber: variable-speed scrub.
- ~~phase2-abcomparison.md~~ — **Archived** (`archive/phase2-abcomparison.md`): ABComparison: processed vs raw toggle.
- [53-cross-tab-audio-video.md](53-cross-tab-audio-video.md) — Cross-tab audio bus + Video Preview tab: route live audio across tabs, monitor picker, video extract-to-studio.

## Agent knowledge (NEW — this plan)
- [33-agent-operating-guide.md](33-agent-operating-guide.md) — How any AI operates the app via tools.
- [34-content-recipes.md](34-content-recipes.md) — Content-type recipe index + reusable template.
- [35-dialogue-methodology.md](35-dialogue-methodology.md) — How real dialogue is built (ADR + conversation + comping).
- ~~36-missing-features-inventory.md~~ — **Archived** (`archive/36-missing-features-inventory.md`): all 16 features are now wired to assistant + MCP.
- [37-professional-finishing.md](37-professional-finishing.md) — De-esser, spectral de-noise, mastering, stem separation, real-time overdub.
- [38-recipe-runner-and-interchange.md](38-recipe-runner-and-interchange.md) — run_recipe, music beds, Reaper export, Voice Changer commands.
- [39-gm-instruments.md](39-gm-instruments.md) — General-MIDI instrument rendering + 16-step drum machine (offline SoundFont).
- [instruments-router.md](instruments-router.md) — Index/router for all instrument skills (procedural, GM, drum-machine).
- [45-agent-manifest.md](45-agent-manifest.md) — Unified agent prompt + canonical tool schema; assistant↔MCP tool-parity report.
- [46-llm-context.md](46-llm-context.md) — RAM-aware LLM context window (n_ctx) formula, user override, generation max_tokens cap.
- [47-assistant-settings.md](47-assistant-settings.md) — Persistent agent settings (context/token override, memory/thinking toggles); user override beats RAM default with warning.
- [40-loudness-and-subtitles.md](40-loudness-and-subtitles.md) — analyze_loudness (LUFS) + export_subtitles (SRT/VTT).
- [mcp-tools-extended.md](mcp-tools-extended.md) — Extended MCP tool catalog (Phase 3 wiring).

## Production docs
- [FEATURES.md](../FEATURES.md) — User-facing feature catalog by workspace (with agent tool mapping); mirrored as app_features.json for Help Center + agent knowledge.
- [USE_CASES.md](../USE_CASES.md) — 7 user personas with workflow scenarios + cross-persona matrix.
- [DEPLOYMENT_TEST_PLAN.md](../DEPLOYMENT_TEST_PLAN.md) — 12-section pre-release smoke-test checklist.
- [AUDIO_PRODUCTION_GUIDE.md](../AUDIO_PRODUCTION_GUIDE.md) — Loudness standards, effects chains by use case, mix architecture, recipe templates.

## Phases 0–7 feature docs (completed — archived 2026-08-17)
- ~~phase0-api-dynamization.md~~ — **Archived** (`archive/phase0-api-dynamization.md`): Centralized config: `get_server_base_url()` / `get_server_host()` / `get_server_port()`, env var support.
- ~~phase1-onnx-device-strategy.md~~ — **Archived** (`archive/phase1-onnx-device-strategy.md`): GPU detection, `bin/setup-onnx.ps1`, recorded provider resolution.
- ~~phase2-api-keys-manager.md~~ — **Archived** (`archive/phase2-api-keys-manager.md`): Unified model_providers CRUD, Fernet encryption, ApiKeysPage settings UI.
- ~~phase3-headless-voice-changer.md~~ — **Archived** (`archive/phase3-headless-voice-changer.md`): `backend/voice_changer/` package, subprocess lifecycle, OpenAI-Realtime WS protocol.
- ~~phase4-lavasr-streaming.md~~ — **Archived** (`archive/phase4-lavasr-streaming.md`): `StreamingLavaSR`: sliding window, overlap-add crossfade, 16k→48k.
- ~~phase5-emotion-tags-tier1.md~~ — **Archived** (`archive/phase5-emotion-tags-tier1.md`): `EMOTION_PRESETS` dict, `apply_emotion_dsp()`, emotion selector in UI.
- ~~phase7-ui-polish.md~~ — **Archived** (`archive/phase7-ui-polish.md`): Settings two-column, sidebar collapsible, darker palette, pulse animations, logo CSS breath.

## Audit info docs (2026-07-19 — operation walkthroughs + observations + dependency audits)
- [53-generation-pipeline.md](53-generation-pipeline.md) — TTS orchestration: run_generation modes, chunking, serial queue, cloud BYOK, status/SSE.
- [54-audio-effects-processing.md](54-audio-effects-processing.md) — AudioEffectsChain (16 effects), noise reduction (DeepFilterNet), and the backend-vs-frontend reverb/delay divergence.
- [55-stories-adr.md](55-stories-adr.md) — Stories timeline (non-destructive edits, export) + ADR sessions/guides/takes.
- [56-assistant-agent.md](56-assistant-agent.md) — Assistant LLM paths (local GGUF planner via llama.cpp server + cloud), tool loop, execute_tool guard, agent manifest + parity report.
- [knowledge/56-assistant-agent.md](../knowledge/56-assistant-agent.md) — On-device assistant stack: LiquidAI LFM2.5 planner family (2.6B free default, 8B-A1B / Ling-3.0-tiny paid MoE, Bonsai 2 27B $80) on llama.cpp server.exe; BYOK keys free; RAM-aware context sizing (docs/knowledge/46-llm-context.md).
- [57-frontend-audiostudio-generation.md](57-frontend-audiostudio-generation.md) — AudioStudio zustand store, buildEffectChain FX, generation submit + profile-sync gating.
- [58-frontend-state-routing.md](58-frontend-state-routing.md) — 9 zustand stores, useAudioPlayer shared AudioContext, TanStack Router lazy routes.
- [59-audio-joining-merging.md](59-audio-joining-merging.md) — How clips combine: backend numpy mixer (buses/pan/peak-norm), Web Audio DAW graph, recipe crossfade+duck, mastering (compressor/limiter/LUFS/stereo), EQ frequency tuning.
- [60-editing-primitives-and-story-pan.md](60-editing-primitives-and-story-pan.md) — Per-story-item stereo pan (DB→export) + audio editing primitives (copy/cut/paste, time-stretch, shout→whisper, blend) for humans and the agent.
- [61-core-model-audit.md](61-core-model-audit.md) — Core model/runtime audit (torch section superseded 2026-11-15: PyTorch removed entirely; see TORCH_AUDIT.md).
- [62-audio-tags.md](62-audio-tags.md) — Universal audio tags: bracketed tags ([pause], [laughs shy]) parsed from TTS text, real human samples loaded from library, works on any engine.
- [63-pocket-emo.md](63-pocket-emo.md) — Pocket-TTS + EmoShift: 6 emotion steering vectors (27KB) injected into transformer layer 5. Happy/sad/angry/fear/disgust/neutral.
- [64-tts-enhancer-cleaner.md](../64-tts-enhancer-cleaner.md) — Post-TTS audio enhancer + voice cleaner (denoise → de-ess → warmth EQ → dynamics → ambience). **Phase 1 DONE (2026-08-17)**: `services/tts_enhancer.py`, `voice_clean` flag + endpoint + UI toggle + tests; Phase 2 (per-engine defaults, A/B tuning) remains.
- [65-voice-chat.md](65-voice-chat.md) — Real-time speech-to-speech voice agent: VAD→STT→LLM→TTS pipeline, tool calling, barge-in, streaming, memory, OpenAI Realtime endpoint, observability.
- [66-video-dubbing.md](66-video-dubbing.md) — Video dubbing pipeline: transcribe → translate → re-voice → mux. MCP tools for dub_video/dub_status/dub_cancel/dub_download/dub_preview/dub_languages.
- [67-audiobook-pipeline.md](67-audiobook-pipeline.md) — Audiobook production: EPUB/PDF import, multi-voice casting, chapter management, LLM script editing, render to audio. 10 MCP tools.
- [68-translation-service.md](68-translation-service.md) — Text translation via local LLM. MCP tools: translate_text, translate_batch, translate_languages. Used by dubbing pipeline.
- [69-marketplace-store.md](69-marketplace-store.md) — Model marketplace: catalog browsing, entitlements, download, paid/free filtering. Ed25519-signed offline licensing.

## Tab-specific About docs (NEW — documentation pass)
- [ABOUT-GENERATE.md](ABOUT-GENERATE.md) — Generate tab: TTS creation, history, controls, keyboard shortcuts.
- [ABOUT-WORKSPACE.md](ABOUT-WORKSPACE.md) — Workspace tab: 24 specialized sub-views for advanced audio work.
- [ABOUT-AUDIO-STUDIO.md](ABOUT-AUDIO-STUDIO.md) — Audio Studio: multi-track recording, transport, track controls.
- [ABOUT-STORIES.md](ABOUT-STORIES.md) — Stories: long-form audio composition, clip editing, timeline.
- [ABOUT-CAPTURES.md](ABOUT-CAPTURES.md) — Captures: transcription, dictation, speech-to-text.
- [ABOUT-VOICES.md](ABOUT-VOICES.md) — Voices: voice profile creation and management.
- [ABOUT-EFFECTS.md](ABOUT-EFFECTS.md) — Effects: effects chain preset management.
- [ABOUT-MODELS.md](ABOUT-MODELS.md) — Models: model download, management, and status.
- [ABOUT-SETTINGS.md](ABOUT-SETTINGS.md) — Settings: 14 sub-tabs for app/server configuration.
- [ABOUT-ASSISTANT.md](ABOUT-ASSISTANT.md) — AI Assistant: chat-based helper with tool access.
- [BUTTON-REFERENCE.md](BUTTON-REFERENCE.md) — Complete UI action catalog: every button across all tabs.

- [98-onboarding-models-agent.md](98-onboarding-models-agent.md) - 2026-11-12 onboarding steps 3-4: models for your picks (recommended pack, RAM + disk-space check via sysinfo, explicit Install only) and assistant/coding-agent step (GGUF planner / provider+key / MCP one-liner). Planner compat hard-block on low-RAM hosts.
- [99-espeak-ng-runtime-assets.md](99-espeak-ng-runtime-assets.md) - eSpeak-ng on-demand download for audiocpp TTS phonemization: shared DLL + data fetched at first install of any eSpeak-dependent engine; one shared asset for all.
- [93-acp-coding-agents.md](93-acp-coding-agents.md) - Otoyin as ACP client: hidden coding-agent CLI subprocess, registry-driven detection of 46 ACP harnesses + custom commands, SSE chat + persisted session history under Settings.
