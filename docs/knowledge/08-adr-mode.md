# 08 — ADR Mode

## ADRView at `/workspace/adr`
- **Component:** `ADRView` in `app/src/components/Workspace/ADRView.tsx`
- **What:** Automated Dialogue Replacement — guide track waveform, take list with thumbnails, record countdown, alignment controls.

## Guide Track Waveform
- **Empty state:** Radio icon with "Import a guide track to start ADR" message and Import Guide Track button
- **Loaded state:** Waveform bar visualization (100 bars), current/total time badge (e.g. "00:12.450 / 00:45.000")
- **Waveform rendering:** Random-height bars, peak regions highlighted with accent color

## Take List with Thumbnails
- **What:** List of recorded takes, each showing:
  - Take number (1, 2, 3...)
  - Duration (e.g. "00:03.452")
  - Waveform thumbnail (30-bar mini waveform)
  - Select indicator (highlighted when active)
- **Active take:** Click to select, accent border/background

## Record Countdown
- **What:** Pre-record countdown timer
- **State:** `countdown` state decrements from 3, 2, 1 before recording starts
- **Visual:** Timer icon with countdown number, pulsing red circle during recording
- **Controls:** Record button (Circle icon), stop when recording

## Alignment Controls
- **What:** Fine-tune take timing relative to guide track
- **Slider:** Offset in milliseconds (range displayed as `shiftMs`)
- **Controls:** Align button (AlignCenter icon), skip backward/forward buttons
- **Display:** Current shift value in ms

## Backend (ADR Engine)
- **Where:** `backend/services/adr.py`
- **Features:** Take alignment via cross-correlation, quality scoring (RMS + speech ratio + headroom), auto-select best take
- **Data model:** ADRSession, ADRLine, ADRTake

## Agent Callable
- **MCP Tools:** (none — ADR is UI-initiated)
- **REST Endpoints:** `POST /adr/sessions`, `GET /adr/sessions`, `GET /adr/sessions/{id}`, `DELETE /adr/sessions/{id}`, `POST /adr/sessions/{id}/guide`, `POST /adr/sessions/{id}/lines/{lineId}/takes`, `POST /adr/sessions/{id}/lines/{lineId}/select/{takeId}`, `POST /adr/align`, `POST /adr/score`, `POST /adr/auto-select`, `GET /adr/waveform/{takeId}`, `GET /adr/sessions/{id}/guide-waveform`
- **Key Backend Files:** `backend/services/adr.py`, `backend/routes/adr.py`
- **Key Frontend Files:** `app/src/components/Workspace/ADRView.tsx`
