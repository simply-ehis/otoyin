---
name: multi-take-comping
description: Stack take lanes, select best regions, and assemble a composite clip via POST /comping/assemble — UI-driven; agent stages regions but human controls the live graph.
---
# Multi-Take Comping

## Purpose
Build a composite performance by stacking multiple take lanes and selecting the best region per time
segment, then stitching the chosen regions into one playable clip. Used for vocal/ADR/podcast comping.

## When to use
- Multiple recordings of the same passage need the best phrases combined.
- ADR lip-sync or podcast ad-lib comping. See ../dialogue-methodology/SKILL.md step 3.

## Prerequisites
- Engine/model: takes are recorded/imported WAV (mic via app `useAudioRecording`).
- Tool surface: REST `POST /comping/assemble` (backend/routes/comping.py). NO MCP comping tool —
  REST only.
- UI: client-side `MultiTakeCompingView`; agent may stage region selections but must NOT mutate the
  live audio graph.

## Parameters / Schema (backend/routes/comping.py)
`POST /comping/assemble` body `CompRequest`:
| field | type | default | notes |
|-------|------|---------|-------|
| segments | list[CompSegment] | — | assembled in order |
| sample_rate | int | 22050 | output sr |
| crossfade_ms | float | 0.0 | crossfade between segments |

`CompSegment`:
| field | type | default | notes |
|-------|------|---------|-------|
| start_ms | float | 0.0 | slice start |
| end_ms | float | — (required) | slice end |
| audio_base64 | str? | None | base64 WAV take; if absent → synthesized tone |
| tone_hz | float? | 440.0 | preview tone when no audio |
| sample_rate | int? | None | per-segment sr override |

## Agent procedure
1. Obtain take audio (base64 WAV) per selected region, with `start_ms`/`end_ms` slice bounds.
2. Build `segments` in the desired stitch order (each = one selected region).
3. Call `POST /comping/assemble` with `crossfade_ms` if you want smooth joins.
4. Return composite WAV to the human for preview. Do NOT auto-commit to live graph.

## Worked example
```bash
curl -X POST localhost:17493/comping/assemble -H 'content-type: application/json' -d '{
  "segments":[
    {"start_ms":0,"end_ms":1500,"audio_base64":"<wav1>"},
    {"start_ms":200,"end_ms":1800,"audio_base64":"<wav2>"}
  ],
  "sample_rate":22050,
  "crossfade_ms":50
}'
```

## Pitfalls / Gotchas
- **Preview tones.** With no `audio_base64`, the endpoint synthesizes a 440 Hz tone so "Play Comp"
  works end-to-end — these are NOT real takes. Always supply `audio_base64` for production.
- **Crossfade math.** Crossfade shortens output by one fade window (overlap-add of `fade` samples).
  Large `crossfade_ms` shrinks total length.
- **No MCP tool.** Agent must call REST directly; do not invent `21labs.comping_*`.
- Slices are in the *take's own* sample rate; mismatched `sample_rate` is resampled via linear interp.
- Live graph stays human-controlled (per AGENTS.md constraint).

## Cross-links
- [adr-mode](../adr-mode/SKILL.md)
- [dialogue-methodology](../dialogue-methodology/SKILL.md)
- [transcript-edit](../transcript-edit/SKILL.md)

## Validation
- Response `media_type` is `audio/wav` with concatenated (or crossfaded) samples.
- With real `audio_base64`, segment durations ≈ (end_ms − start_ms).
- Empty segments list → HTTP 400.
