# Media Stack Research — editor, instruments, recording (2026-09-05)

**Date:** 2026-09-05
**Status:** PLANNED — decision record; decisions not yet adopted (editor
`waveform-playlist` absent from app/package.json as of 2026-09-07).
**Last verified:** 2026-09-07

Three parallel deep-research tracks (fresh sources only, 2025-2026).
One-line verdicts first, phases after.

## Decisions

1. **Editor: adopt `naomiaro/waveform-playlist` (MIT, v14, active).**
   Multitrack clips, drag/trim/split, fades, Tone.js FX, WAV export,
   undo/redo, React starter — matches the need 1:1. Rule out in writing:
   Tracktion (JUCE C++, GPLv3-or-pay, not a web component), Audacity/
   Ardour/Zrythm(AGPL!)/LMMS/Mixxx (GPL monoliths, months to embed),
   openDAW/GridSound (AGPL), peaks.js (dead + LGPL), Superpowered
   (~$10k/yr, no timeline UI). Fallback: wavesurfer.js v7 (BSD, no
   multitrack core). Hybrid: keep our shell/transport/mixer + backend
   FX/export authority; swap only peak-render + clip geometry + gestures.
   Effort: 1–2 wk POC, 3–5 wk production.
2. **Instruments: better banks now, FluidSynth sidecar next, never VST.**
   - Phase 1 (days): MuseScore_General (MIT) + Salamander C5 Light
     (CC-BY) + GeneralUser GS v1.472-on-TinySoundFont (v2 needs
     FluidSynth to sound right); frontend audition via Tone Sampler.
   - Phase 2 (1–3 wk): FluidSynth CLI sidecar (LGPL, dynamic link) +
     curated CC0 core (VCSL/VSCO-2 CE/Osiris) rendered offline to WAV.
   - Never: VST hosting (nih-plug doesn't host; JUCE/Carla/DawDreamer
     GPL-taint), BBC/Sonatina/Arachno/Timbres bundles (proprietary or
     private-use-only), Pianobook redistribution (EULA forbids),
     sfizz (archived Jun 2026), Magenta DDSP (dead), TimGM6mb (GPLv2 —
     purge if present). Correction: FluidR3 is MIT, not GPL-tainted.
   - Rule for every future pack: "free for commercial *music*" ≠
     "shippable in a commercial *app*" — only CC0/CC-BY/MIT clears it.
3. **Recording: webview shim now (Win/Mac), native cpal input next.**
   - Root cause: mic is OS+webview-delegate gated, never Tauri-ACL gated.
     macOS ≈ works (plist present); Windows needs a
     `PermissionRequested→ALLOW` shim (WRY doesn't auto-grant mic);
     stock-distro Linux WebKitGTK cannot be made reliable — do not try.
   - Landed already: CSP `blob:/data:/media:` + `media-src` fix
     (tauri.conf.json), MP4/AAC MIME fallbacks + true recorder MIME on
     the blob (useAudioRecording).
   - Next: `mic_webview.rs` shim (copy lemonade's 3-way split), then
     native cpal input commands (16 kHz mono WAV → existing
     WS/transcribe), webview as fallback.
   - Voice chat is starved at the mic: VAD returns eternal silence with
     zero errors. Stage health-checks: mic RMS → VAD tone → STT known
     WAV → LLM ping → TTS bytes → cpal playback.

## What landed with this doc

- `tauri.conf.json` CSP media fix; `RECORDING_MIME_TYPE_MP4{,_PLAIN}`
  constants + chain + truthful blob MIME.
- Full evidence: the three research transcripts in-session 2026-09-05
  (editor / instruments / recording tracks with ranked sources).
