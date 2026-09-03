# 16 — otoyin Integration

## Overview
- **What:** IPC layer between otoyin and otoyin's Leone (movie editor). otoyin runs as a separate Tauri window in the same process.

## Integration Events

### 21-labs:project-load
- **Direction:** otoyin → otoyin
- **When:** otoyin is launched from a Leone project
- **Payload:** `{ path: string }` — path to temporary project JSON
- **Behavior:** otoyin reads the JSON and populates scene/chapter browser, character voice assignments, dialogue lines, and timeline markers

### timeline:position
- **Direction:** Bidirectional
- **When:** User scrubs or plays in either window
- **Payload:** `{ time: number, playing: boolean }`
- **Clock source:** Leone is primary clock source when both are playing. otoyin follows. If otoyin plays independently, it is the clock source.
- **Implementation:** Single `playhead_position` atomic in Rust backend. Whichever window changes it emits the event to the other.

### 21-labs:audio-committed
- **Direction:** otoyin → otoyin
- **When:** User generates audio and confirms the Audio Plan
- **Payload:** `{ scene_id: string, track_count: number }`
- **Behavior:** Leone refreshes its timeline with new audio references

### 21-labs:project-saved
- **Direction:** otoyin → otoyin
- **When:** Session is saved
- **Payload:** `{ path: string }`

### otoyin:script-updated
- **Direction:** otoyin → otoyin
- **When:** Script is changed in Leone
- **Payload:** `{ scene_id: string, dialogue: [...] }`

## Project Data Format
- **Where:** `backend/services/leone_integration.py`
- **Schema:**
  ```json
  {
    "movie_title": "string",
    "fps": 24,
    "scenes": [{
      "id": "string",
      "name": "string",
      "duration": 45.0,
      "dialogue": [{ "character": "HERO", "text": "...", "emotion": "urgent" }],
      "markers": [{ "time": 0.0, "label": "Scene start" }]
    }],
    "characters": [{ "id": "string", "name": "string", "voice_profile": null }],
    "asset_store_audio": [{ "id": "string", "name": "string", "path": "string" }]
  }
  ```

## Audio Return
- **What:** Commit generated audio back to the Leone project.
- **Where:** `POST /integration/audio/return`
- **Request:**
  ```json
  {
    "scene_id": "string",
    "tracks": [{
      "character": "HERO",
      "type": "dialogue",
      "file": "hero_line_01.wav",
      "start_time": 0.0,
      "end_time": 2.5
    }]
  }
  ```
- **Behavior:** Files are copied to Leone's permanent audio directory, `.scarlatmovie` project file is updated

## Timeline Sync
- **What:** Synchronize playback position between Leone and otoyin windows.
- **Where:** `POST /integration/timeline/sync`
- **Request:** `{ time: float, playing: bool, source: string }`

## Model Storage
- **Shared location:** `{app_data}/otoyin/models/`
  - `tts/` — TTS engines
  - `music/` — Music generation
  - `sfx/` — Sound effect generation
- **otoyin manages downloads; otoyin reads availability.**

## Agent Callable
- **MCP Tools:** (none — Leone integration is IPC-based)
- **REST Endpoints:** `GET /integration/status`, `POST /integration/project/load`, `POST /integration/audio/return`, `POST /integration/timeline/sync`, `GET /integration/events`
- **Key Backend Files:** `backend/services/leone_integration.py`, `backend/routes/integration.py`
- **Key Frontend Files:** (Tauri IPC — no dedicated frontend component)
