---
name: effects-space
description: Reverb, delay, and 3D spatial audio (binaural/doppler/convolution) reference for otoyin — real ranges and the effects_chain vs spatial route split.
---
# Effects — Space (Reverb, Delay, Spatial)

## Purpose
Add depth and environment: **reverb** and **delay** (10-effect chain) plus a
dedicated **spatial audio** subsystem (binaural panning, Doppler, convolution IRs).
Reverb/delay go through the effects_chain path; spatial audio is its own route set.

## When to use
- Small room vs plate reverb for audiobook/voiceover.
- Echo/slap via delay.
- Place voices in a 3D soundstage, binaural headphone mix, or convolve with a room IR.

## Path reminder (gotcha #1)
Reverb & delay: apply via `POST /effects/preview/{generation_id}` (assistant
`apply_effects`) or `POST /generations/{generation_id}/versions/apply-effects`.
`run_recipe` does NOT apply them. Chain entry:
`{"type":"reverb"|"delay","enabled":true,"params":{...}}`.

Spatial audio: **separate endpoints** under `backend/routes/spatial.py` — not the
effects chain.

## Parameters — reverb (REAL, `plugins.py`)
| param | range | default |
|-------|-------|---------|
| room_size | [0,1] | 0.5 |
| damping | [0,1] | 0.5 |
| wet | [0,1] | 0.3 |

`effects_chain._apply_reverb`: a single feedback tap at `0.02 * room_size` s, decay
`0.5*damping`, dry/wet split by `wet`. Not a true convolution reverb.

## Parameters — delay (REAL)
| param | range | default |
|-------|-------|---------|
| delay_ms | [10,1000] | 200 |
| feedback | [0,0.9] | 0.4 |
| mix | [0,1] | 0.3 |

## Voiceover vs audiobook starting points
- **Audiobook (small, intimate room):** reverb `room_size 0.2–0.3`, `damping 0.5`, `wet 0.15`.
- **Voiceover / radio (plate-style, larger):** reverb `room_size 0.6–0.8`, `damping 0.3`, `wet 0.25–0.3`. Preset `reverb_plate` exists in the new-effects set.
- **Slap echo:** delay `delay_ms 120–250`, `feedback 0.3`, `mix 0.25`.

## Spatial audio (`backend/routes/spatial.py`)
| endpoint | purpose |
|----------|---------|
| `GET /spatial/presets` | environments: car_interior, coffee_shop, bedroom, church, studio_booth |
| `GET /spatial/convolution-presets` | IRs: room, hall, cathedral, plate |
| `POST /spatial/render` | apply positioning + environment convolution to sources |
| `POST /spatial/binaural` | stereo mix → binaural HRTF-like panning |

Model: each source has (x,y) on a 400×300 stage, listener at center (200,150).
Distance → gain attenuation; angle → stereo pan; Doppler intensity scales
frequency shift by velocity. Environments: studio_booth = dead/no reflections;
church = large/long tail; car_interior = small/dry/low-freq resonance.

## Worked example
```bash
# 10-effect reverb on a clip (effects_chain path)
curl -X POST "http://localhost:17493/effects/preview/{generation_id}" \
  -H "Content-Type: application/json" \
  -d '{"effects_chain":[
    {"type":"reverb","enabled":true,"params":{"room_size":0.25,"damping":0.5,"wet":0.15}}
  ]}'

# Binaural fold-down of a finished stereo mix (spatial route)
curl -X POST "http://localhost:17493/spatial/binaural" -H "..." -d '{"audio_path":"..."}'
```

## Pitfalls
- `room_size` is a normalized 0–1 knob, not seconds; 1.0 ≠ "1 second".
- Reverb/delay are NOT in `run_recipe`; apply before recipe.
- Convolution IR presets need the IR assets present; verify before calling.

## Cross-links
- [effects-field-guide](../../effects-field-guide/SKILL.md)
- [mastering](../../mastering/SKILL.md)

## Validation
- Reverb: subtle room sense, no washy tail drowning consonants.
- Binaural: clear left/right source placement on headphones.
