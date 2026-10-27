# Otoyin — App Features

User-facing catalog of everything Otoyin can do, organized by workspace.
Every feature lists where to find it in the app and (where relevant) which
assistant/MCP tool drives it — the same catalog is mirrored in
`backend/data/app_features.json` so the in-app Help Center and the AI
assistant can answer "what can this app do?" questions.

**Otoyin is an offline-first AI voice studio.** Everything runs on your
machine — no cloud account, no per-character billing, no script leaves your
computer unless you configure a BYOK cloud provider yourself.

---

## Quick start

1. **Models tab** — download a starter voice engine (Kokoro-82M is small and
   fast) plus Whisper for transcription.
2. **Voice Profiles** — pick a preset voice or clone one from a 10-30 s sample.
3. **Generate** — type text, pick profile + emotion, generate. Drag the result
   into the Audio Studio to edit, effect, mix, and export.

---

## 1. Voice generation

| Feature | What it does | Where | Agent tool |
|---|---|---|---|
| 13 TTS engines | Kokoro 82M, Fish Speech S1-mini, Zyphra Zonos, StyleTTS2, ChatTTS, F5-TTS, Pocket-TTS, Parler-TTS Mini, MOSS-TTS-Nano, KittenTTS, NeuTTS-Air, NeuTTS-2E, Orpheus 3B | Models tab | `list_models`, `speak` |
| Voice cloning | Zero-shot clone from a short reference clip (Fish Speech, Zonos, StyleTTS2, F5-TTS, Pocket-TTS…) | Voice Profiles → Clone | `create_profile` |
| Voice profiles | Preset or cloned voices with per-engine settings | Voice Profiles tab | `list_profiles` |
| Reference voice library | Bundled celebrity/public-figure reference clips for cloning (incl. Twenty One Pilots: Tyler Joseph, Josh Dun) | Voice Profiles → Library | `list_reference_voices` |
| Emotion presets | Training-free DSP emotion coloring (happy/sad/angry/…) on any generation | Generate panel → Emotion | `speak(emotion=…)` |
| Audio tags | Bracketed tags in text (`[laughs]`, `[pause]`) rendered as real human samples | Generate panel | documented in text input |
| RVC voice conversion | Convert an existing recording to a downloaded RVC voice pack | Voice Profiles → Convert | `voice_convert` |
| BYOK cloud providers | Optional: bring your own API key/endpoint per domain (tts/music/sfx/vc/llm), encrypted at rest | Settings → API Keys | REST `/model-providers` |

## 2. Audio Studio (editing)

| Feature | What it does | Where | Agent tool |
|---|---|---|---|
| Waveform editor | Non-destructive clip editing: trim, split, fade, gain, reverse, normalize | Audio Studio | audio tools |
| Pitch map | Piano-roll style pitch editing (C3–C5) | Audio Studio → Pitch Map | — (UI-driven) |
| Effects chain | 25+ effects (EQ, compressor, reverb, delay, de-esser, chorus…), drag-sortable, presets | Effects tab / per-clip | `apply_effect`, presets |
| Spectrogram | Frequency-domain visualization | Audio Studio → Spectrogram | — |
| SMPTE timecode | Frame-accurate position display (multiple frame rates) | Studio toolbar | — |
| A/B comparison | Instant processed-vs-raw toggle | Audio Studio | — |
| Tape scrubber | Variable-speed scrubbing | Audio Studio | — |
| Transcription + subtitles | Word-level Whisper transcription, SRT/VTT export | Transcribe action | `transcribe`, `export_subtitles` |
| Transcript editing | Edit audio by editing its words (click-to-playhead, filler removal) | Transcript panel | `transcript_edit` |
| Noise reduction | DeepFilterNet neural denoise (+ spectral gate) | Enhance/Cleanup | `clean_audio` |
| Audio enhance | LavaSR neural upscale to 48 kHz + denoise (`auto` mode) | Enhance panel | `enhance_audio` |
| Loudness metering | Integrated/short-term LUFS + true peak | Meter panel | `analyze_loudness` |
| Enhance A/B + save | Compare original vs enhanced and save enhanced to library | Enhance panel | `enhance_audio` |
| Timeline waveform | Waveform peaks, zoom control, playhead-ready bars | Timeline | — |
| Import | Audio files + extract audio from video | Import modal | `import_audio` |

## 3. Mixer & delivery

| Feature | What it does | Where | Agent tool |
|---|---|---|---|
| Multi-track mixer | VU meters, mute/solo, pan, per-track FX, bus routing | Audio Studio → Mixer | `mixer_*` |
| Auto-duck | Speech automatically ducks music beds | Conversation/recipe | `run_recipe` |
| Mastering | Glue compression + limiting + LUFS normalization to broadcast targets | Master action | `master` |
| Platform export | One-tap presets: Spotify, YouTube, Audible, podcast, film, social | Export panel | `platform_export` |
| Reaper export | Project renders to `.rpp` for handoff | Export panel | `run_recipe` |
| Lottie export | Audio-reactive Lottie animation | Export panel | REST `/lottie` |
| Video floating player + mux | Floating video player with mux audio+video endpoint/UI | Video tab | REST `/mux` |

## 4. Dialogue & long-form production

| Feature | What it does | Where | Agent tool |
|---|---|---|---|
| Stories | Audiobook/chapter sequencing: per-item fade/gain/trim/reorder, one mixed WAV out | Stories tab | `story_*` |
| Conversation mode | Stage multi-speaker lines, auto-duck overlaps, auto-level to LUFS | Conversation tab | `conversation_*` |
| ADR mode | Acted Dialogue Replacement over picture: guide track, takes, scoring, lock | ADR tab | `adr_*` |
| ADR auto-label speakers | Auto-label speakers from guide audio via diarization | ADR tab | `adr_*` |
| Dubbing download | Download dubbed video | Dubbing tab | `dub_*` |
| Multi-take comping | Stack takes, pick best regions, assemble composite | Comping lanes | `POST /comping/assemble` |
| AI Audio Plan | Script → scene-based track/voice/music assignment blueprint | Audio Plan tab | `audio_plan` |
| Batch queue | Run many generations with status/cancel/retry | Batch panel | `POST /batch/jobs` |
| Content recipes | Proven pipelines per content type (podcast, audiobook, ad, short…) | assistant skills | `run_recipe` |

## 5. Real-time voice

| Feature | What it does | Where | Agent tool |
|---|---|---|---|
| Voice changer | Live mic pipeline: VAD → DeepFilter denoise → Whisper → TTS → LavaSR | Voice Changer panel | capability probe only (human-controlled) |
| Voice chat (STS) | Speech-to-speech voice agent: talk to the assistant, it answers in voice with barge-in | Voice Chat panel | WebSocket `/voice-chat/ws` |
| Dictate window | Floating always-on capture window (global hotkey chord) | Dictate | captures API |
| Streaming STT | Live partial transcripts | Dictate/Captures | `streaming_stt` |

## 6. Music, SFX & instruments

| Feature | What it does | Where | Agent tool |
|---|---|---|
| SFX generation | One-shot sound effects from text (Stable Audio Open) | Sound Studio | `generate_sfx` |
| Music generation | Generate music from prompt (ACE-Step, HeartMuLa, MiniMax, Stable Audio) | Music Generator | `generate_music` |
| Music composer | Compose lyrics + beats as markdown, export | Music tab | — |
| Songwriter tab | Import beats, playback, send to studio/timeline | Songwriter tab | — |
| GM instruments | Piano/bass/strings/brass/bells via offline SoundFont | Instruments | `play_*` instrument tools |
| Drum machine | 16-step patterns from synthesized hits | Instruments | `drum_pattern` |
| DSP synth | Pure offline synthesis (no AI): waveforms, classical effects | Synth tab | `dsp_*` |
| Freesound browser | Search Freesound SFX with your own API key | Sounds panel | `freesound_*` |

## 7. Spatial audio

| Feature | What it does | Where | Agent tool |
|---|---|---|---|
| Binaural positioning | HRTF 3D placement (Steam Audio SDK, bundled SOFA) | Spatial panel | `spatial_*` |
| Doppler | Moving-source pitch/pan automation | Spatial panel | `spatial_*` |
| Convolution reverb | Impulse-response spaces | Spatial panel | `spatial_*` |

## 8. Agents & automation

| Feature | What it does | Where | Agent tool |
|---|---|---|---|
| In-app AI assistant | Local gguf_llm planner (jackrong Qwen3.5, llama.cpp) or your BYOK endpoint; calls 128 studio tools | Assistant panel | — |
| MCP server | 111 tools exposed at `/mcp` for Claude Code, Cursor, etc. | Settings → MCP page | `Otoyin.*` |
| Scripting | Scriptable server functions | Settings → Scripting | `scripting_*` |
| Automation lanes | Volume/pan/pitch/FX over time + cue matrix | Automation view | `automation_*` |
| Agent skills | `.agents/skills/` — recipes and methodology for AI agents producing pro output | repo | skills |

## 9. System & quality-of-life

| Feature | What it does | Where |
|---|---|---|
| Model manager | Download/load/unload/delete models, CUDA/ONNX device strategy | Models tab |
| Shortcuts | Keymaps for Otoyin / Premiere / DaVinci / Pro Tools | Settings → Shortcuts |
| Standalone projects | Template-based project create/save/load | Projects |
| Cross-tab audio bus | Route live audio between tabs + video preview monitor | Workspace |
| Community presets | Search/browse/import shared effect presets | Presets |
| Telemetry | Opt-in, privacy-respecting usage toggle | Settings |
| Non-destructive edits | Undo/redo + versions on every operation | everywhere |

---

<!-- FEATURE-CATALOG:BEGIN (generated — keep in sync with backend/data/app_features.json; enforced by backend/tests/test_help_catalog.py) -->
<!-- TTS engines, Voice cloning, Voice profiles, Reference voice library, Emotion presets, Audio tags, RVC voice conversion, BYOK cloud providers, Waveform editor, Pitch map, Effects chain, Spectrogram, SMPTE timecode, A/B comparison, Tape scrubber, Transcription + subtitles, Transcript editing, Noise reduction, Audio enhance, Loudness metering, Import, Multi-track mixer, Auto-duck, Mastering, Platform export, Reaper export, Lottie export, Stories, Conversation mode, ADR mode, ADR auto-label speakers, Dubbing download, Multi-take comping, AI Audio Plan, Batch queue, Content recipes, Voice changer, Voice chat (STS), Dictate window, Streaming STT, Music generation, Music composer, Songwriter tab, SFX generation, Bark non-verbals, GM instruments, Drum machine, DSP synth, Freesound browser, Binaural positioning, Doppler, Convolution reverb, Timeline waveform, Video floating player + mux, Enhance A/B + save, In-app AI assistant, MCP server, Scripting, Automation lanes, Agent skills, Model manager, Shortcuts, Standalone projects, Cross-tab audio bus, Community presets, Telemetry, Non-destructive edits -->
<!-- FEATURE-CATALOG:END -->

## Getting help

- **Assistant**: ask "what can I do with the mixer?" — the assistant knows
  this catalog and the tool surface.
- **Knowledge docs**: `docs/knowledge/` (index: `00-index.md`) documents every
  tool and interface contract.
- **Agent-facing**: `.agents/skills/otoyin/SKILL.md` is the operating manual
  for external AI agents.

> In-app Help Center with search + first-run tour: planned — see
> `docs/knowledge/archive/full-fix-upgrade-plan.md` Phase 8.
