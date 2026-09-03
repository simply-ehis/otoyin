# About: Audio Studio Tab

> **PURPOSE:** Reference for the Audio Studio tab — multi-track recording, editing, and mixing.
> **OWNS:** Audio Studio, transport controls, track management
> **READ-WHEN:** Working on Audio Studio features, transport, track controls
> **KEY-FILES:** `AudioStudio.tsx`, `TransportControls.tsx`, `TransportBar.tsx`, `MonitorRecorder.tsx`, `TrackStripParts.tsx`, `audioStudio/useSessionManager.ts`, `audioStudio/useOfflineExport.ts`
> **INVARIANTS:** Session save/load via Ctrl+S/Ctrl+O; autosave exists
> **GOTCHAS:** Export+FX requires server-side bounce; plain Export is offline render
> **UPDATED:** 2026-08-18

## Overview

Audio Studio is a multi-track recording and editing environment with transport controls, markers, automation, and plugin support.

## Header Actions

| Button | Shortcut | Action |
|---|---|---|
| Save | Ctrl+S | Save session (amber dot = unsaved changes) |
| Paste | — | Paste clip from clipboard as new track |
| Load | Ctrl+O | Load saved session |
| Undo | Ctrl+Z | Undo last action |
| Redo | Ctrl+Y | Redo last undone action |
| Automation | — | Toggle automation lane visibility |
| Export | — | Export mixed audio (offline render) |
| Export+FX | — | Export with plugin effect chain (server bounce) |

## Transport Controls

| Button | Shortcut | Action |
|---|---|---|
| Skip to start | — | Reset to time 0 |
| Play/Pause | Space | Toggle playback |
| Stop | — | Stop playback |
| Loop | — | Toggle loop mode |
| Add marker | — | Add timeline marker at playhead |
| Record | R | Start/stop recording on selected track |

## Track Management

| Button | Action |
|---|---|
| + Track | Add new empty track |
| Import | Import audio file to selected track |
| MIDI | Add MIDI note (middle C) to selected track |

## Per-Track Controls

| Button | Action |
|---|---|
| M | Toggle track mute |
| S | Toggle track solo |
| F | Toggle spectrogram view |
| PL | Toggle plugin chain panel |
| K+ | Add automation keyframe |
| Kx | Clear all automation keyframes |
| XF | Toggle crossfade controls |
| Drag handle | Reorder tracks |
| Trash | Remove track (hover) |

## Monitor Recorder

| Button | Action |
|---|---|
| Mic | Start recording from monitor source |
| Square | Stop monitor recording |

## Agent Callable
- **MCP Tools:** `21labs.session_save`, `21labs.session_load`, `21labs.export_reaper_project`
- **REST Endpoints:** `POST /audio-studio/sessions`, `GET /audio-studio/sessions`, `GET /audio-studio/sessions/{id}`, `PUT /audio-studio/sessions/{id}`, `DELETE /audio-studio/sessions/{id}`, `POST /audio-studio/sessions/{id}/autosave-snapshot`, `POST /audio-studio/sessions/{id}/undo-autosave`, `POST /audio-studio/sessions/{id}/export-reaper`
- **Key Backend Files:** `backend/routes/audio_studio.py`, `backend/routes/_session_store.py`, `backend/services/daw_export.py`
- **Key Frontend Files:** `app/src/components/AudioStudio/AudioStudio.tsx`, `app/src/components/AudioStudio/TransportControls.tsx`, `app/src/components/AudioStudio/TransportBar.tsx`, `app/src/components/AudioStudio/MonitorRecorder.tsx`, `app/src/components/AudioStudio/audioStudio/TrackStripParts.tsx`
