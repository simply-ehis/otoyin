# 25 — Automation Lanes & Cue Matrix

Parameter automation with keyframe curves and hotkey-triggered cue points.

## Route

`/workspace/automation` — AutomationView

## Architecture

### Backend (`backend/routes/automation.py`)

- `GET /automation/parameters` — List automatable parameters (volume, pan, pitch, effects, etc.).
- `GET /automation/crossfade-curves` — List available crossfade curves (linear, logarithmic, exponential, equal_power).
- `POST /automation/interpolate` — Interpolate automation points into a smooth envelope using selected curve.

### Frontend (`AutomationView.tsx`)

- Lane selector: volume, pan, pitch, effects (color-coded)
- Point editor: add, remove, and adjust automation points
- Curve selector for interpolation
- Cue grid: 16 cue slots with F-key hotkeys (F1–F12 + extended)
- Interpolate button to generate smooth envelope from points

## Automation Lanes

| Lane | Color | Parameter Range |
|------|-------|-----------------|
| volume | Green | 0.0 – 1.0 |
| pan | Blue | -1.0 (left) – 1.0 (right) |
| pitch | Purple | -12.0 – +12.0 semitones |
| effects | Amber | 0.0 – 1.0 (effect mix) |

## Crossfade Curves

- **linear** — Straight line between points
- **logarithmic** — Quick rise, slow finish
- **exponential** — Slow rise, quick finish
- **equal_power** — Constant perceived loudness during crossfade

## Cue Matrix

16 cue slots, each assignable to a timestamp and label. Triggered via F-key hotkeys during playback for live performance or A/B testing.

## Agent Callable
- **MCP Tools:** (none — automation is UI-initiated)
- **REST Endpoints:** `GET /automation/parameters`, `GET /automation/crossfade-curves`, `POST /automation/interpolate`
- **Key Backend Files:** `backend/routes/automation.py`
- **Key Frontend Files:** `app/src/components/Workspace/AutomationView.tsx`, `app/src/stores/storyStore.ts`
