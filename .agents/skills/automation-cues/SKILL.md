---
name: automation-cues
description: Drive parameter automation lanes (volume/pan/pitch/effects) and crossfade-curve interpolation, plus the live cue matrix; use when an agent must "automate volume/pan over time", "interpolate an envelope", or "set up cue points".
---
# Automation Lanes & Cue Matrix

## Purpose
`backend/routes/automation.py` exposes the automatable parameter catalog, the available
crossfade curves, and a point→envelope interpolator. The 16-slot cue matrix is a
front-end performance surface (F-key hotkeys) with NO persistence endpoint — see
Pitfalls. All offline, non-destructive (envelopes are computed, not applied to files
here).

## When to use
- "Ramp volume/pan from A to B over the clip".
- "Build a smooth automation envelope from keyframes".
- "Pick a crossfade curve for a transition".

## Prerequisites
- Tool surface: REST only — `GET /automation/parameters`,
  `GET /automation/crossfade-curves`, `POST /automation/interpolate`. (No MCP tool.)
- Cue matrix is UI-only (AutomationView); no backend persist endpoint exists.

## Parameters / Schema (REAL from `AUTOMATION_PARAMS`)
| parameter | min | max | default |
|-----------|-----|-----|---------|
| volume | 0.0 | 2.0 | 1.0 |
| pan | -1.0 | 1.0 | 0.0 |
| mute | 0 | 1 | 0 |
| pitch | -12.0 | 12.0 | 0.0 |
| reverb | 0.0 | 1.0 | 0.0 |
| delay | 0.0 | 1.0 | 0.0 |
| eq_low | -12.0 | 12.0 | 0.0 |
| eq_mid | -12.0 | 12.0 | 0.0 |
| eq_high | -12.0 | 12.0 | 0.0 |
| distortion | 0.0 | 1.0 | 0.0 |
| chorus | 0.0 | 1.0 | 0.0 |

### Crossfade curves (`CROSSFADE_CURVES`)
`linear` (straight), `logarithmic` (fast start/slow end), `exponential`
(slow start/fast end), `equal_power` (no perceived dip).

### Interpolation (`InterpolationRequest`)
`points: List[[x, y]]` (keyframes, x in samples/units), `curve: str` (default `linear`).
`POST /automation/interpolate` → `{envelope: [[x,y],...]}` sampled per integer x step.

## Agent procedure
1. `GET /automation/parameters` → confirm the lane name + its min/max/default.
2. Build keyframes as `[[x0,y0],[x1,y1],...]` in the lane's value range.
3. `POST /automation/interpolate` `{points, curve}` → smooth envelope.
4. Apply the envelope to the clip via the 10-effect/automation path in the UI, or feed
   `[[time,value]]` to the mixer/DAW export (`export_reaper_project`).

## Worked example
```bash
curl -X POST http://localhost:17493/automation/interpolate -H 'Content-Type: application/json' \
  -d '{"points":[[0,0.0],[10,1.0],[20,0.3]],"curve":"equal_power"}'
# → {"envelope":[[0,0.0],[1,0.156],...[20,0.3]]}
```

## Cue matrix (frontend)
16 slots (4×4) in AutomationView; each slot → timestamp + label + optional hotkey
(F1–F12 + extended) / `midi_note`. Triggered live during playback for A/B or performance.
Backend defines `CueGridCell`/`CueMatrix` models but NO endpoint saves them.

## Pitfalls / Gotchas
- **No backend persistence for cues.** The cue matrix is UI state only; nothing in
  `automation.py` stores/loads a cue grid. Don't promise server-side cue recall.
- Interpolation `x` steps are integer (`int(x1-x0)`); uneven/non-monotonic x may produce
  gaps or reordering — supply sorted, evenly-spaced keyframes.
- `pitch` lane is ±12 st (semitones) — matches the `pitch_shift` effect range.
- `volume` max is 2.0 (not 1.0) — envelopes may exceed unity; downstream limiting applies.

## Cross-links
- [effects-field-guide](../effects-field-guide/SKILL.md)
- [mastering](../mastering/SKILL.md)
- [loudness-metering](../loudness-metering/SKILL.md)

## Validation
- Re-run `interpolate` with `linear` and compare to `equal_power`; equal_power should
  preserve perceived level (midpoint ≈ geometric mean, not arithmetic).
- Verify keyframe endpoints survive unchanged in the returned envelope.
