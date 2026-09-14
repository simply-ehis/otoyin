# 84 — Audio Recording (Visible UI)

PURPOSE: Where the record button lives and how a take becomes a capture.
OWNS: app/src/components/Recording/RecordAudioButton.tsx, app/src/lib/hooks/useAudioRecording.ts, backend/routes/captures.py
READ-WHEN: You add recording UI, debug mic permissions, or wire a new capture source.
KEY-FILES: app/src/components/Recording/RecordAudioButton.tsx, app/src/lib/hooks/useAudioRecording.ts, app/src/lib/audio/nativeMic.ts
INVARIANTS: Native sidecar first on Tauri, webview getUserMedia fallback; stop always uploads as source=recording.
GOTCHAS: Tauri webviews need OS mic permission + app restart; MediaRecorder MIME varies (webm/opus vs mp4/aac) — backend ffmpeg normalizes.
UPDATED: 2026-09-11

## UI
- `RecordAudioButton` in Library header, Generate header, and (via ActionBar session) Captures. Idle: "Record audio". Recording: pulsing timer + Stop. Uploading: disabled spinner. The fresh take auto-plays in the shared player.
- Captures tab keeps its full session UI (`useCaptureRecordingSession`); the button is the one-click shortcut for quick takes.

## Capture path
`useAudioRecording` (native cpal → getUserMedia) → Blob → `POST /captures` (`createCapture`, source=recording) → invalidate library/captures → `setAudioWithAutoPlay(captureAudioUrl)`.

## Permissions
- Browser: secure context (localhost/HTTPS) + mic grant.
- Tauri: OS Settings → Privacy → Microphone → restart app. `useAudioRecording` polls `mediaDevices` with backoff and surfaces a checklist error instead of hanging.

## Agent Callable
- **MCP Tools:** `21labs.transcribe` (transcribe the take), `21labs.list_captures`
- **REST:** `POST /captures`, `GET /captures/{id}/audio`, `GET /captures`
- **Key Files:** `app/src/components/Recording/RecordAudioButton.tsx`, `backend/routes/captures.py`
