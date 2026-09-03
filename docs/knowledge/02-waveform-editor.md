# 02 — Waveform Editor

## TimelineView at `/workspace`
- **Component:** `TimelineView` in `app/src/components/Workspace/TimelineView.tsx`
- **What:** Main multi-track timeline with transport controls, waveform display, track list, and import/scrub capabilities.

## Transport Controls
- Play/Pause (`Play`/`Pause` icons), Stop (`Square`), Record (`Circle` with red dot), Loop toggle (`Repeat`)
- Current time display in `MM:SS.mmm` format
- Skip forward/backward buttons

## Waveform Display Area
- Visual waveform bars rendered per track (120 bars with random height simulation)
- Peak bars highlighted with accent color
- Scrollable track area with per-track waveform visualization

## Track List
- Each track shows: name, mute button (`M`), solo button (`S`), volume indicator
- Mute toggles track silence (highlighted red when active)
- Solo isolates track playback (highlighted yellow when active)
- Mock tracks: Voice 1, Voice 2, BG Music

## ImportModal
- **What:** Audio file import dialog wired into TimelineView via `ImportModal` component
- **Where:** `app/src/components/Import/ImportModal.tsx`
- **Triggered by:** Upload button in TimelineView toolbar
- **Supports:** Audio file import (M4A/AAC/AIFF/WAV/MP3) and video audio extraction (MP4/MOV)
- **Options:** Sample rate selection (44100/48000/96000), channel mode (mono/stereo)
- **Format info:** Displays duration, codec, sample rate, channels on file selection

## TapeScrubber
- **What:** Variable-speed waveform scrubber wired into TimelineView
- **Where:** `app/src/components/TapeScrubber/TapeScrubber.tsx`
- **Controls:** Slider for position seek, speed control (0.1x–4x), nudge backward/forward buttons
- **Display:** Current time and duration in `MM:SS:FF` format, speed multiplier indicator
- **Behavior:** Pauses playback on scrub start, resumes on scrub end

## Editing Tools (Backend)
- Trim, split, duplicate, delete, volume, fade, gain, normalize, reverse, silence removal, regenerate, version picker
- **Where:** `app/src/components/StoriesTab/StoryTrackEditor.tsx` (legacy StoriesTab)
- **API endpoints:** `PUT /stories/{id}/items/{id}/trim`, `POST /stories/{id}/items/{id}/split`, etc.

## Agent Callable
- **MCP Tools:** `21labs.splice`, `21labs.delete_region`, `21labs.trim_silence`, `21labs.fade_in`, `21labs.fade_out`, `21labs.insert_silence`
- **REST Endpoints:** `PUT /stories/{id}/items/{itemId}/trim`, `POST /stories/{id}/items/{itemId}/split`, `POST /stories/{id}/items/{itemId}/duplicate`, `POST /audio/splice`, `POST /audio/delete-region`, `POST /audio/insert-silence`, `POST /audio/trim-silence`
- **Key Backend Files:** `backend/routes/stories.py`, `backend/routes/audio_effects.py`, `backend/services/stories/processing.py`
- **Key Frontend Files:** `app/src/components/Workspace/TimelineView.tsx`, `app/src/components/StoriesTab/StoryTrackEditor.tsx`, `app/src/components/Workspace/InlineWaveformEditor.tsx`, `app/src/stores/storyStore.ts`
