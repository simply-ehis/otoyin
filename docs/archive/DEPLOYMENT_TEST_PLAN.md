# Otoyin — Deployment Smoke-Test Plan

PURPOSE: Pre-release checklist verifying core user flows work end-to-end.
OWNS: docs/DEPLOYMENT_TEST_PLAN.md
READ-WHEN: Before any release, hotfix, or major feature merge.
KEY-FILES: docs/CLARITY_CAPABILITIES.md, docs/knowledge/00-index.md
INVARIANTS: Every test must pass on a fresh install (no pre-cached models assumed).
GOTCHAS: Some tests require model downloads (first run). Mark as N/A if testing offline without cache.
UPDATED: 2026-07-19

---

## Prerequisites
- Fresh install or clean cache (`~/.cache/TWENTYLABS/` cleared)
- Backend running: `python -m uvicorn backend.main:app --host 127.0.0.1 --port 17493`
- Frontend running: `cd tauri && npm run dev` or Tauri desktop build
- No other audio apps holding exclusive device access

---

## 1. Startup & Health (2 min)

| # | Step | Expected | Pass? |
|---|---|---|---|
| 1.1 | Launch app (Tauri or web) | Loading screen with rotating messages | |
| 1.2 | Wait for server ready | UI transitions to main workspace | |
| 1.3 | Check `/health` endpoint | `{"status":"healthy","model_loaded":...,"gpu_available":...}` | |
| 1.4 | Open Settings → verify server URL | Shows correct host:port | |

## 2. TTS Generation (5 min)

| # | Step | Expected | Pass? |
|---|---|---|---|
| 2.1 | Open Voice Studio → select engine (Kokoro) | Engine loads without error | |
| 2.2 | Type "Hello world" → Generate | Audio waveform appears, playback works | |
| 2.3 | Switch engine to KittenTTS → Generate | Lighter engine, faster generation | |
| 2.4 | Open Captures tab → find the generation | Entry exists with waveform + text | |
| 2.5 | Click play on capture | Audio plays through shared bus | |

## 3. Audio Studio (5 min)

| # | Step | Expected | Pass? |
|---|---|---|---|
| 3.1 | Open Audio Studio → Add Track | Track appears with default name/color | |
| 3.2 | Drag audio from Captures to track | Audio loads, waveform renders | |
| 3.3 | Play/Pause/Seek transport controls | Transport responds, playhead moves | |
| 3.4 | Mute/Solo a track | Audio mutes/unmutes correctly | |
| 3.5 | Adjust volume slider | Volume changes in real-time | |
| 3.6 | Add second track, adjust pan | Stereo panning audible | |
| 3.7 | Undo (Ctrl+Z) / Redo (Ctrl+Y) | All state restores (tracks, submixes, markers) | |

## 4. Effects Chain (3 min)

| # | Step | Expected | Pass? |
|---|---|---|---|
| 4.1 | Select a track → open Effects panel | Effects list appears | |
| 4.2 | Add Reverb effect | Effect added to chain | |
| 4.3 | Adjust reverb parameters | Audio preview updates | |
| 4.4 | Toggle effect enable/disable | Bypass works correctly | |
| 4.5 | Add Compressor after Reverb | Chain order preserved | |

## 5. Music/SFX Generation (3 min)

| # | Step | Expected | Pass? |
|---|---|---|
| 5.1 | Open Sound Studio → SFX tab | UI ready | |
| 5.2 | Type prompt → Generate SFX | Audio generated (may take 30-60s) | |
| 5.3 | Open Noise tab → generate | Noise clip generated | |
| 5.4 | Open Instruments tab → play a key | Note plays | |

## 6. Mixer (3 min)

| # | Step | Expected | Pass? |
|---|---|---|---|
| 6.1 | Open Mixer → see 2+ tracks | Channel strips rendered | |
| 6.2 | Adjust fader on track 1 | Volume changes | |
| 6.3 | Pan knob left/right | Stereo image shifts | |
| 6.4 | Toggle Mute button | Track mutes | |
| 6.5 | Toggle Solo button | Only soloed track audible | |
| 6.6 | VU meters react to playback | Meters animate with signal | |

## 7. Assistant / AI Agent (3 min)

| # | Step | Expected | Pass? |
|---|---|---|---|
| 7.1 | Open Assistant panel | Chat interface appears | |
| 7.2 | Type "Generate a short greeting" | Assistant responds, triggers TTS | |
| 7.3 | Ask "What engines are available?" | Lists available TTS engines | |
| 7.4 | Ask "Master this audio to -14 LUFS" | Runs mastering, returns result | |

## 8. Video Preview (2 min)

| # | Step | Expected | Pass? |
|---|---|---|---|
| 8.1 | Open Video Preview tab (workspace/video) | Video player loads | |
| 8.2 | Load a video file | Video plays, audio registers on bus | |
| 8.3 | Click "Extract audio to Audio Studio" | Audio track created in Audio Studio | |
| 8.4 | Monitor Picker shows video source | Source listed, volume adjustable | |

## 9. Cross-Tab Audio Bus (2 min)

| # | Step | Expected | Pass? |
|---|---|---|---|
| 9.1 | Open Monitor Picker in Audio Studio | Live sources listed | |
| 9.2 | Select a source to monitor | Audio routes to monitor output | |
| 9.3 | Adjust per-source volume | Volume changes for selected source | |
| 9.4 | Mute a source | Source mutes independently | |

## 10. ADR Mode (2 min)

| # | Step | Expected | Pass? |
|---|---|---|---|
| 10.1 | Open ADR tab | Session list appears | |
| 10.2 | Create new ADR session | Session created | |
| 10.3 | Load guide track | Guide audio plays | |
| 10.4 | Record a take | Take recorded and listed | |

## 11. BYOK / Cloud Providers (2 min)

| # | Step | Expected | Pass? |
|---|---|---|---|
| 11.1 | Open Model Providers settings | Empty list or existing providers | |
| 11.2 | Add a BYOK provider (e.g., OpenAI TTS) | Provider saved (key encrypted) | |
| 11.3 | Generate TTS via cloud provider | Audio generated via cloud endpoint | |
| 11.4 | Remove provider | Provider deleted, key wiped | |

## 12. Export & Platform (1 min)

| # | Step | Expected | Pass? |
|---|---|---|---|
| 12.1 | Export a clip as WAV | File downloads correctly | |
| 12.2 | Export with platform preset (YouTube) | LUFS normalized to -14 | |
| 12.3 | Export subtitles (SRT) | SRT file with timestamps | |

---

## Quick Smoke (30-second pass/fail)

If time is limited, run only these:
1. App starts and shows workspace → **PASS/FAIL**
2. "Hello world" TTS generates and plays → **PASS/FAIL**
3. Audio Studio add track + play transport → **PASS/FAIL**
4. Effects chain adds and enables an effect → **PASS/FAIL**
5. Assistant responds to a prompt → **PASS/FAIL**

---

## Known Issues at Scan Time (2026-07-19)
- `AudioPlayer.tsx` subscribes to entire `usePlayerStore()` — may cause re-render storms on rapid state changes (not blocking, but perf concern).
- `useStreamingSTT.ts` uses deprecated `ScriptProcessorNode` — works but will need `AudioWorkletNode` migration eventually.
- Automation cue-matrix buttons are inert (UI only, no backend wiring).
- MIDI keyboard UI only adds middle-C; no full-keyboard input.
- System/loopback has no live streaming API — registered as source but no capture pipeline.
