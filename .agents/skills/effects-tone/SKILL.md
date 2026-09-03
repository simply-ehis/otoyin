---
name: effects-tone
description: EQ (3-band shelving), pitch_shift, formant_shift, time_stretch reference for otoyin — real ranges, the shelving caveat, and the true "presence lift" mapping.
---
# Effects — Tone (EQ, Pitch, Formant, Time)

## Purpose
Timbre/tonal shaping for voice: a 3-band **EQ**, plus **pitch_shift**,
**formant_shift**, and **time_stretch**. All are part of the 10-effect chain and
applied via the effects_chain path — NOT by `run_recipe`.

## When to use
- Brighten/darken a voice, add "presence", cut muddiness.
- Change perceived pitch or voice age without changing speed (formant + pitch).
- Speed up/slow down without pitch change.

## Path reminder (gotcha #1)
Apply via `POST /effects/preview/{generation_id}` (assistant `apply_effects`) or
`POST /generations/{generation_id}/versions/apply-effects`. `run_recipe` ignores
these. Chain entry: `{"type":"eq"|"pitch_shift"|"formant_shift"|"time_stretch","enabled":true,"params":{...}}`.

## Parameters (REAL, `plugins.py`)
| effect | param | range | default |
|--------|-------|-------|---------|
| eq | low_gain | [-12,12] dB | 0 |
| eq | mid_gain | [-12,12] dB | 0 |
| eq | high_gain | [-12,12] dB | 0 |
| pitch_shift | semitones | [-12,12] | 0 |
| formant_shift | shift_factor | [0.5,2.0] | 1.0 |
| time_stretch | factor | [0.5,2.0] | 1.0 |

## EQ is SHELVING, not peaking (important)
`effects_chain._apply_eq` uses 2nd-order Butterworth filters with fixed crossovers:
- **low_gain** → lowpass at **200 Hz** (shelves everything below 200 Hz).
- **mid_gain** → bandpass centered at **1000 Hz**.
- **high_gain** → highpass at **3000 Hz** (shelves everything above 3 kHz).

So `high_gain` is a high-**shelf** from 3 kHz upward, not a narrow peaking bell.

### The REAL "presence lift" mapping
Old docs loosely say "boost presence". There is no dedicated presence band; the
closest real control is **`high_gain`**, which raises the 3 kHz-and-up shelf.
Use `high_gain` **+2 to +4 dB** for a brightness/presence lift. (If you need a
tighter 2–5 kHz presence bump specifically, the shelf from 3 kHz is the practical
proxy — note anything above 3 kHz rises together.)

## pitch / formant / time
- **pitch_shift** (semitones ±12): shifts pitch, keeps duration. For a chipmunk
  sound use +7; monster/deep voice use -5.
- **formant_shift** (0.5–2.0): scales the spectral envelope. >1 brightens
  (younger/smaller), <1 darkens (older/larger). Pitch-independent-ish.
- **time_stretch** (0.5–2.0): 0.5 = half speed, 2.0 = double speed; pitch preserved.

## Worked example (presence lift + slight depth)
```bash
curl -X POST "http://localhost:17493/effects/preview/{generation_id}" \
  -H "Content-Type: application/json" \
  -d '{"effects_chain":[
    {"type":"eq","enabled":true,"params":{"low_gain":-3,"mid_gain":0,"high_gain":3}},
    {"type":"formant_shift","enabled":true,"params":{"shift_factor":1.1}}
  ]}'
```
Cuts boom below 200 Hz, lifts presence (3 kHz+ shelf +3 dB), slightly brightens formants.

## Pitfalls
- Treating `mid_gain` as a peaking EQ — it is a 1 kHz bandpass shelf, not a tight Bell.
- Expecting `high_gain` to only touch 2–5 kHz — it shelves everything above 3 kHz.
- `formant_shift` = 1.0 or ≤0 is a no-op (skipped in code).
- These effects are NOT applied by `run_recipe`.

## Cross-links
- [effects-field-guide](../../effects-field-guide/SKILL.md)
- [effects-dynamics](../../effects-dynamics/SKILL.md)

## Validation
- A/B preview: brighter/open voice at +3 high_gain; no phasey artifacts from formant shift.
