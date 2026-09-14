---
name: audio-record-play
description: Record microphone audio visibly and play any clip reliably (WaveSurfer + fallback). Use when a user wants to "record audio", "capture a take", or "play this clip".
---
# Audio Record & Play

## Purpose
One visible path for capture → upload → playback, surviving webview codec gaps.

## When to use
- "Record audio" / "capture my voice" / "dictate this"
- Playback is silent or the waveform is empty
- User can't find the recorder

## Agent procedure

### 1. Point at the visible button
Library header and Generate header both carry **Record audio** (pulsing timer + Stop while recording). Captures tab has the full session UI. Never send users into dialogs.

### 2. Record
```
UI: Record audio → speak → Stop
MCP: (user-driven; agent stages) 21labs.transcribe(audio_path="<take>")
```
Native sidecar first on Tauri, webview fallback otherwise. Takes auto-upload as `source=recording` captures and auto-play.

### 3. Play
```
MCP: 21labs.speak(profile_id="<id>", text="...") → GET /audio/{generation_id}
UI: shared AudioPlayer (bottom bar)
```
If WaveSurfer decode fails the player auto-switches to native `<audio controls>` — that is success, not an error.

### 4. Troubleshoot
- No mic: OS Privacy → Microphone → restart app (Tauri) or allow mic in browser.
- Silent playback: check volume/mute, channel devices, then Close player + replay.
- Backend down: BackendStatusBanner shows "Backend is starting" — wait, don't spam retries.

## Pitfalls / Gotchas
- Autoplay needs a prior gesture; SSE auto-play only fires when the player is idle.
- Blob MIME varies (webm/mp4/wav) — backend normalizes, don't transcode client-side.

## Cross-links
- `transcription-subtitles` — transcribe the take
- `noise-reduction` — clean the take
- `troubleshooting` — backend-down triage

## Validation
- New capture appears in Library + Captures; player shows duration > 0 and plays audibly.
