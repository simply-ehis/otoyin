---
PURPOSE: Cross-tab audio bus + Video Preview tab. Route any playing tab's audio as a live monitor/backing source in another tab; preview video with its audio on the shared WebAudio bus and extract the audio to Audio Studio. Record from any bus source directly into an AudioStudio track.
OWNS: app/src/lib/audio/audioBus.ts, app/src/lib/audio/sources.ts, app/src/components/AudioStudio/MonitorPicker.tsx, app/src/components/AudioStudio/MonitorRecorder.tsx, app/src/components/AudioStudio/TransportBar.tsx, app/src/components/Workspace/VideoPreviewView.tsx, app/src/lib/hooks/useMonitorStream.ts, backend/routes/extended_import.py (video-preview, audio-preview), app/src/lib/hooks/useAudioPlayer.ts (voiceover bus registration).
READ-WHEN: You touch cross-tab audio routing, the live monitor picker, the video tab, or the shared AudioContext bus.
KEY-FILES:
  - audioBus.ts — zustand store: registry of named AudioSource (each = GainNode + outputNode on the shared AudioContext), monitor selection, per-source volume/mute.
  - sources.ts — factory adapters: registerFileSource, registerMicSource, registerVideoSource, registerAssistantSource. All create nodes on the shared AudioContext from useAudioPlayer.getSharedContext().
  - MonitorPicker.tsx — reusable UI: lists live bus sources, selects one as monitor, per-source volume + mute, monitor-out volume.
  - TransportBar.tsx — reusable transport: play/pause/seek/cancel/volume driven by a media element.
  - useMonitorStream.ts — taps the monitored source's gainNode into a MediaStreamDestination; returns the MediaStream for recording.
  - MonitorRecorder.tsx — record-from-monitor component: MediaRecorder on useMonitorStream output, play/record/stop, feeds blob back to AudioStudio's handleRecordingComplete.
  - VideoPreviewView.tsx — new /workspace/video tab: video src = serverUrl/import/video-preview?file_path=..., registers the <video> as a bus source, TransportBar, "Extract audio to Audio Studio" calls extractAudioFromVideo then adds a Studio track.
  - extended_import.py — GET /import/video-preview + /import/audio-preview stream local files (same trust model as /audio/{id}: server-side absolute path, known extension only).
INVARIANTS:
  - Single shared AudioContext (useAudioPlayer.getSharedContext()) is the bus. Every MediaElementSource is created exactly once per element; sources unregister on unmount to avoid leaks/feedback.
  - Sources are human-labeled (Voiceover, Microphone, Video, Assistant) not raw tab IDs.
  - Monitor routes audio to ctx.destination through its own GainNode. MonitorRecorder taps the same gainNode into a MediaStreamDestination so you can record from any live source into a Studio track (non-destructive — the source keeps playing while recording).
  - Video tab and extracted audio use server-side file paths (desktop app: backend has FS access), consistent with ImportModal. No browser file-upload path is used.
  - Assistant-voice bus registration is intentionally deferred: assistant TTS playback is spread across multiple call sites; wiring it is a follow-up to avoid destabilizing existing playback.
GOTCHAS:
  - createMediaElementSource throws if called twice on the same element — guarded with try/catch; registration is best-effort.
  - System/loopback live monitoring has no standard web API; only mic (getUserMedia) is a true live stream today. System capture remains a record-to-blob flow (useSystemAudioCapture).
   - Video preview requires the backend route (extended_import) and a reachable serverUrl; in pure-web mode without the server, the video won't load.
UPDATED: 2026-07-19

## Agent Callable
- **MCP Tools:** `21labs.video_preview`, `21labs.audio_preview`, `21labs.extract_audio`, `21labs.list_import_formats`, `21labs.import_info`
- **REST Endpoints:** `GET /import/video-preview`, `GET /import/audio-preview`, `POST /import/extract-audio`, `GET /import/formats`, `GET /import/info`
- **Key Backend Files:** `backend/routes/extended_import.py`
- **Key Frontend Files:** `app/src/components/Workspace/VideoPreviewView.tsx`, `app/src/components/Workspace/YouTubeDownloadView.tsx`
