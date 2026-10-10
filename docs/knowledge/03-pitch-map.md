# 03 — Pitch Map

## PitchMapView at `/workspace/pitch`
- **Component:** `PitchMapView` in `app/src/features/workspace/PitchMapView.tsx`
- **What:** Piano roll visualization with pitch detection, scale snapping, and MIDI note display. C3–C5 keyboard range (MIDI 48–84).

## Piano Roll Keyboard
- **Range:** C3 (MIDI 48) to C5 (MIDI 84) — 3 octaves
- **Key display:** White/black keys with note labels (C, C#, D, ...)
- **Key height:** 14px per key, black keys at 65% height
- **Empty state:** Shows PianoKeys icon with "Analyze audio to view pitch map" message and disabled Analyze Audio button

## Pitch Contour Visualization
- Pitch contour line drawn across time on the piano roll grid
- Time axis with 1-second interval markers
- Horizontal grid lines at each MIDI note for reference

## Scale Selector
- **Options:** Major, Minor, Pentatonic, Chromatic
- **Where:** Select dropdown in the top toolbar
- **Default:** Chromatic

## Snap Toggle
- **Button:** "Snap ON" / "Snap OFF" toggle
- **Behavior:** When enabled, detected pitches snap to nearest note in the selected scale
- **Visual feedback:** Accent-style button when enabled, ghost when disabled

## YIN Pitch Detection (Backend)
- **What:** Detect fundamental frequency (F0) using YIN algorithm
- **Where:** `POST /audio/pitch-analysis`, `labs21-shared-audio/src/pitch.rs`
- **Returns:** Array of `PitchSegment` with frequency, confidence, MIDI note, note name
- **Algorithm:** Frame size 2048, hop size 512, threshold 0.15

## Agent Callable
- **MCP Tools:** (none — pitch analysis is backend-only)
- **REST Endpoints:** `POST /audio/pitch-analysis`
- **Key Backend Files:** `backend/routes/pitch.py`
- **Key Frontend Files:** `app/src/features/workspace/PitchMapView.tsx`
