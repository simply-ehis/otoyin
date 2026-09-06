# otoyin — Feature Catalog

> PURPOSE: Complete, accurate inventory of everything otoyin can do. Public-facing
> catalog for README, landing page, marketing, and docs.
> OWNS: repo root, README, landing page, pricing docs.
> READ-WHEN: describing the product, writing marketing, planning features,
> auditing the app against its claims.
> KEY-FILES: `backend/routes/` (77 route modules), `backend/backends/` (45 backend modules),
> `backend/mcp_server/tools/` (201 MCP tools), `app/src/components/` (260+ component files).
> INVARIANTS: every number below is verified against code (scan date 2026-08-21);
> update this file whenever the surface changes. Never claim a feature that is not
> shipped (mark roadmap items explicitly).
> UPDATED: 2026-08-21

**otoyin is an open-source AI voice studio.** The app is free. The editing,
mixing, effects, instruments, and every procedural tool are free forever.
Premium AI models — better voices, music generation, spatial audio — are
available in the marketplace. Pay once, own forever, works offline.

**Verified surface area:** 77 API route modules · 16 TTS engines · 4 STT engines ·
3 voice conversion engines · 3 music/SFX models · 1 local LLM · 201 MCP tools ·
204 assistant tools · 22 workspace views · 15 settings pages · 25+ effects · 7 DSP
synth engines · 6 content recipes.

---

## Quick start

1. **Models tab** — download a starter voice engine (Kokoro-82M is small and fast)
   plus Whisper for transcription.
2. **Voice Profiles** — pick a preset voice or clone one from a 10–30 s sample.
3. **Generate** — type text, pick profile + emotion, generate. Drag the result into
   the Audio Studio to edit, effect, mix, and export.

---

## 1. Voice generation (16 TTS engines)

| Feature | What it does | Where |
|---|---|---|
| Kokoro 82M | Fast, small, ONNX-preferred. Voice blending, 50+ preset voices, long-text chunking | Models tab |
| Fish Speech S1-mini | 0.5B, 13 languages, 44.1kHz, zero-shot voice cloning | Models tab |
| Zyphra Zonos | Premium expressive TTS with cloning | Models tab |
| StyleTTS2 | ONNX-preferred, torch fallback | Models tab |
| ChatTTS | Torch-only, CC-BY-NC (non-commercial) | Models tab |
| F5-TTS | ONNX-preferred, CC-BY-NC (non-commercial) | Models tab |
| Pocket-TTS | ONNX-preferred, torch fallback | Models tab |
| Parler-TTS Mini | Voice design via text, Apache-2.0 | Models tab |
| MOSS-TTS-Nano | ONNX-only, torch-free, multilingual zh/en | Models tab |
| KittenTTS (mini) | ONNX-only, lightest TTS engine, 8 preset voices | Models tab |
| NeuTTS-Air | GGUF, zero-shot clone | Models tab |
| NeuTTS-2E | GGUF, emotion-aware, 4 preset speakers | Models tab |
| Orpheus TTS 3B | GGUF, SNAC decoder, 8 voices, emotion tags | Models tab |
| Qwen3-TTS 1.7B | Subprocess one-shot, multilingual | Models tab |
| Bark Small (GGUF) | Subprocess one-shot, non-verbal sounds | Models tab |
| Voice cloning | Zero-shot clone from a short reference clip | Voice Profiles → Clone |
| Voice profiles | Preset, cloned, or designed voices with per-engine settings | Voice Profiles tab |
| Reference voice library | Bundled reference clips for cloning | Voice Profiles → Library |
| Emotion presets | Training-free DSP emotion coloring (happy/sad/angry/…) on any generation | Generate panel → Emotion |
| Personality mode | Optional LLM rewrite of prompts for expressive delivery | Generate panel |
| Audio tags | Bracketed tags in text (`[laughs]`, `[pause]`) rendered as real human samples | Generate panel |
| RVC voice conversion | Convert an existing recording to a downloaded RVC voice pack | Voice Profiles → Convert |
| BYOK cloud providers | Optional: bring your own API key/endpoint per domain (tts/music/sfx/vc/llm), encrypted at rest | Settings → API Keys |

## 2. Speech-to-Text (4 STT engines)

| Feature | What it does | Where |
|---|---|---|
| Whisper.cpp | GGML GGUF (tiny/base/large-v3), default STT | Transcribe / Captures |
| Faster-Whisper | CTranslate2 int8, fast CPU inference | Transcribe / Captures |
| Parakeet TDT 0.6B v3 | Native C++ (parakeet.cpp), 25 European languages | Transcribe / Captures |
| Qwen3-ASR 1.7B/0.6B | ONNX Runtime C++, 52 languages | Transcribe / Captures |
| Streaming STT | Live partial transcripts via WebSocket | Dictate / Captures |
| Speaker diarization | Silero VAD + Resemblyzer speaker identification | Diarize / Captures |

## 3. Voice conversion (3 engines)

| Feature | What it does | Where |
|---|---|---|
| RVC v2 | Pre-trained voice packs, file-based conversion | Voice Converter |
| Seed-VC | Zero-shot clone from reference audio, GPU-only | Voice Converter |
| OpenVoice | Zero-shot tone-color conversion, 6 languages, MIT | Voice Converter |

## 4. Audio Studio (editing)

| Feature | What it does | Where |
|---|---|---|
| Waveform editor | Non-destructive clip editing: trim, split, fade, gain, reverse, normalize, silence removal | Audio Studio |
| Pitch map | Piano-roll style pitch editing (C3–C5) with scale snapping | Audio Studio → Pitch Map |
| Effects chain | 25+ effects (EQ, compressor, reverb, delay, de-esser, chorus, distortion, pitch shift, formant shift, time stretch, gender swap, age shift, helium, vocoder, telephone, megaphone, underwater, whisper transform, auto-tune, spectral duck, multi-band pitch, resonant filter sweep, spectral repair, multi-mic phase, smart crossfade…), drag-sortable, enable/disable, presets | Effects tab / per-clip |
| Effect presets | Built-in presets (robotic, radio, echo chamber, deep voice, chipmunk, radio host, monster, whisper, cathedral/hall/room/plate reverb) + save/load/export/import | Effects tab |
| Spectrogram | Frequency-domain visualization | Audio Studio → Spectrogram |
| SMPTE timecode | Frame-accurate position display (multiple frame rates) | Studio toolbar |
| A/B comparison | Instant processed-vs-raw toggle | Audio Studio |
| Tape scrubber | Variable-speed scrubbing | Audio Studio |
| Crossfade | Equal-power crossfades between clips | Audio Studio |
| Audio clipboard | Copy/cut/paste audio segments across clips | Audio Studio |
| Versioning | Non-destructive undo/redo + version snapshots on every operation | everywhere |
| Transcription + subtitles | Word-level Whisper transcription, SRT/VTT export | Transcribe action |
| Transcript editing | Edit audio by editing its words (click-to-playhead, filler removal) | Transcript panel |
| Noise reduction | DeepFilterNet neural denoise (+ spectral gate) | Enhance/Cleanup |
| Audio enhance | LavaSR neural upscale to 48 kHz + denoise (`auto` mode) | Enhance panel |
| Loudness metering | Integrated/short-term LUFS + true peak | Meter panel |
| Import | Audio files + extract audio from video | Import modal |
| VST3/AU plugin scanning | Scan system plugin folders and list installed VST3/AU plugins (hosting: roadmap) | Plugins page |

## 5. Mixer & delivery

| Feature | What it does | Where |
|---|---|---|
| Multi-track mixer | Channel strips with VU meters, volume, mute/solo, pan, per-track FX, master output | Audio Studio → Mixer |
| Bus routing | Submixes + sidechain ducking | Mixer |
| Auto-duck | Speech automatically ducks music beds | Conversation/recipe |
| Mastering | Glue compression + limiting + LUFS normalization to broadcast targets | Master action |
| Platform export | One-tap presets: Spotify, YouTube, Audible, podcast, film, social | Export panel |
| Reaper export | Project renders to `.rpp` for DAW handoff | Export panel |
| Lottie export | Audio-reactive Lottie animation | Export panel |
| Audio bridge | Import/export audio between otoyin and other tools | Workspace |

## 6. Dialogue & long-form production

| Feature | What it does | Where |
|---|---|---|
| Stories | Multi-track story/episode editor: timeline ruler, clip items, crossfade handles, automation lanes, per-item fade/gain/trim/reorder | Stories tab |
| Audiobooks | Full audiobook pipeline: import EPUB/PDF, chapter management, multi-voice casting, utterance editor, LLM scripting, render to audio | Audiobooks tab |
| Conversation mode | Stage multi-speaker lines, auto-duck overlaps, auto-level to LUFS | Conversation tab |
| ADR mode | Acted Dialogue Replacement over picture: guide track, takes, scoring, alignment | ADR tab |
| Multi-take comping | Stack takes, pick best regions, assemble composite | Comping lanes |
| AI Audio Plan | Script → scene-based track/voice/music assignment blueprint | Audio Plan tab |
| Batch queue | Run many generations with status/cancel/retry | Batch panel |
| Content recipes | Proven pipelines per content type — podcast, audiobook, film dialogue+ADR, social short, voiceover ad, YouTube — end-to-end offline | Assistant / `run_recipe` |
| Video dubbing | Full pipeline: transcribe, translate, re-voice, mux. Multi-language target support | Dubbing tab |
| Translation | Text translation via local LLM, batch translate, language list | Assistant / MCP tools |

## 7. Real-time voice

| Feature | What it does | Where |
|---|---|---|
| Voice changer | Live mic pipeline: VAD → DeepFilter denoise → Whisper → TTS → LavaSR. Real-time pitch/formant shifting, sub-50 ms target latency | Voice Changer panel |
| Voice chat (STS) | Speech-to-speech voice agent: VAD turn-taking, STT→LLM→TTS pipeline, barge-in, tool calling, memory | Voice Chat panel |
| Dictate window | Floating always-on capture window (global hotkey chord), live STT transcription | Dictate |
| Streaming STT | Live partial transcripts | Dictate/Captures |
| Overdub | Record while playing, with vocal effects (de-esser, spectral de-noise) | Studio |

## 8. Music, SFX & instruments

| Feature | What it does | Where |
|---|---|---|
| 3 music/SFX models | ACE-Step 1.5 (music), HeartMuLa 3B (music), Stable Audio 3 Small SFX | Sound Studio / MCP `generate_music`/`generate_sfx` |
| SFX generation | One-shot sound effects from text | Sound Studio |
| Stem separation | Split mixes into stems (Demucs) | Sound Studio |
| GM instruments | Piano/bass/strings/brass/bells via offline SoundFont | Instruments |
| Drum machine | 16-step patterns from synthesized hits | Instruments |
| DSP synth | 7 offline synthesis engines (no AI): subtractive, FM, drum, chiptone, pluck, dialup, robot_speech | Synth tab |
| DSP effects | 11 classical effects: vocoder, bitcrush, distortion, tape, filter, delay, phaser, ringmod, reverb, robotize | Synth tab |
| Freesound browser | Search Freesound SFX with your own API key | Sounds panel |
| Procedural noise | Generated noise (white/pink/brown/blue/violet) | Sounds |
| YouTube download | Pull audio from YouTube URLs | Sounds panel |

## 9. Spatial audio

| Feature | What it does | Where |
|---|---|---|
| Binaural positioning | HRTF 3D placement (Steam Audio SDK, bundled SOFA) | Spatial panel |
| Doppler | Moving-source pitch/pan automation | Spatial panel |
| Convolution reverb | Impulse-response spaces | Spatial panel |

## 10. Agents & automation

| Feature | What it does | Where |
|---|---|---|
| In-app AI assistant | Local gguf_llm planner (jackrong Qwen3.5, llama.cpp) or your BYOK endpoint; 5 tabs: Chat, Projects, Plans, Assets, History. Calls 204 studio tools | Assistant panel |
| MCP server | 201 tools at `/mcp` for Claude Code, Cursor, Windsurf, VS Code | Settings → MCP page |
| Agent-voice bindings | Bind specific agents to specific voices; agents identified via `X-21labs-Client-Id` | Settings → MCP |
| Agent projects | Project management: sources, plans, context for multi-step agent work | Assistant → Projects |
| Workflow planner | Decompose complex tasks into ordered MCP tool calls, execute step-by-step | MCP tools |
| Scripting | Scriptable server functions | Settings → Scripting |
| Automation lanes | Volume/pan/pitch/FX over time + cue matrix with F-key hotkeys | Automation view |
| Agent skills | `.agents/skills/` — 44 active skills and methodology for AI agents producing pro output | repo |

## 11. System & quality-of-life

| Feature | What it does | Where |
|---|---|---|
| Model marketplace | Browse, purchase, and manage premium AI models. Per-model pricing ($7–$23) or discount packs ($31–$103). Pay once, own forever, works offline. | Store tab |
| Starter models (free) | Kokoro 82M + starter voices, KittenTTS, MOSS-TTS-Nano, Parler-TTS Mini, Whisper tiny/base, Moonshine EN, DeepFilterNet, LavaSR, Bark | Models tab |
| Model provider registry | Per-domain engine selection + BYOK endpoints | Models / Settings |
| Shortcuts | Keymaps for otoyin / Premiere / DaVinci / Pro Tools | Settings → Shortcuts |
| Standalone projects | Template-based project create/save/load (Blank, Dialogue, Podcast, Audiobook, Short Film) | Projects tab |
| Cross-tab audio bus | Route live audio between tabs + video preview monitor | Workspace |
| Session persistence | Audio Studio sessions survive restarts | Audio Studio |
| Community presets | Search/browse/import shared effect presets | Presets tab |
| Offers | Promotional offers with promo codes, claim tracking | Offers tab |
| What's New | Release notes with version highlights | What's New tab |
| Command palette | Ctrl+K navigation to any view or action | Global shortcut |
| Feature tour | Guided onboarding (6 steps): welcome, sidebar, generate, models, assistant, help | F1 / Help |
| Help center | Searchable feature catalog by category | F1 |
| 7 themes | System, Light, Dark, Otoyin, Stripe, Coastal Light, Mesh Dark | Settings → General |
| Telemetry | Opt-in, privacy-respecting usage toggle | Settings |
| Memory | The assistant remembers your project context across sessions | Assistant |
| i18n | Localized UI (en, zh-CN, zh-TW, ja) | Settings |

---

## Roadmap (explicitly not shipped)

- **VST3/AU hosting** — scanning + metadata works; loading/processing external
  binaries is not implemented (metadata-only).
- **Updater** — wired end-to-end in-tree (endpoints, signing, artifacts, E2E-verified
  against a faked update server); awaiting the first signed tagged release to
  serve real updates. See `docs/reports/2026-09-03-updater-audit.md`.

## Getting help

- **Assistant**: ask "what can I do with the mixer?" — the assistant knows the
  full tool catalog.
- **Knowledge docs**: `docs/knowledge/` (index: `00-index.md`) documents every
  tool and interface contract.
- **Agent-facing**: `.agents/skills/otoyin/SKILL.md` is the operating manual
  for external AI agents.
