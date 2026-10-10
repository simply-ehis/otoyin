---
name: mastering
description: Master a finished mix or run a content recipe to a broadcast-grade LUFS/true-peak target; use when an agent must "master", "finish", "make a podcast/audiobook/ad", or apply glue compression + limiting + LUFS normalize.
---
# Mastering & Recipe Runner

## Purpose
Two non-destructive finishing paths turn raw generated clips into delivery-ready audio:
`master_audio` (single mix → LUFS target) and `run_recipe` (multi-segment → cleanup →
crossfade → optional ducked music → master). Both run offline and return a NEW export;
the source is never overwritten.

## When to use
- "Master this to −14 LUFS" / "make it broadcast-ready".
- "Build a podcast/audiobook/ad/social clip from these segments" → `run_recipe`.
- After generating speech, before platform export.

## Prerequisites
- Tool surface: MCP `21labs.master_audio`, `21labs.run_recipe`,
  `21labs.normalize_audio`, `21labs.separate_audio` (stem separation).
- REST: `POST /audio/master`, `POST /recipe/run`, `POST /audio/normalize`, `POST /audio/separate`.
- `separate_audio` needs Demucs (optional/heavy); absent → clear error, never a fake result.

## Parameters / Schema (REAL ranges from code)
`master_audio(audio_path, target_lufs=-14.0, true_peak_db=-1.0, width=0.0)`
| param | range | default | notes |
|-------|-------|---------|-------|
| target_lufs | -70..0 | -14.0 | LUFS normalize target |
| true_peak_db | [-3.0,0] | -1.0 | limiter ceiling (dBTP) |
| width | -1.0..1.0 | 0.0 | >0 widen, <0 narrow; needs stereo |

`run_recipe(segments, recipe, music_path?, target_lufs?, gap_ms=250)`
| param | range | default | notes |
|-------|-------|---------|-------|
| recipe | see table | podcast | picks LUFS if target_lufs=None |
| gap_ms | int ms | 250 | speaker gap + crossfade pad |
| fade_ms | fixed | 120 | internal crossfade length |

### Recipe LUFS targets (`RECIPE_TARGETS`)
| recipe | target LUFS |
|--------|-------------|
| podcast | -16.0 |
| audiobook | -18.0 |
| film-dialogue-adr | -24.0 |
| voiceover-ad | -12.0 |
| social-short | -14.0 |
| youtube | -14.0 |

The recipe path preserves the input channel layout; it does not upmix to stereo or 5.1.

## Agent procedure (run_recipe REAL pipeline)
`backend/services/recipe_runner.py::recipe_run`:
1. **Per-segment cleanup** — for each `{"audio_path", "effects"}`, downmix to mono,
   then apply `deesser` / `spectral_denoise` if listed in `effects`.
2. **Crossfade concat** — `_crossfade_concat` inserts a `gap_ms` silence between
   segments and applies a 120 ms linear fade in/out when seg > 2×fade.
3. **Optional music duck** — if `music_path`, resample to speech sr, pad to length,
   build envelope: threshold −30 dB, duck to −12 dB with 120 ms release; bed = music×env×0.6;
   sum with speech.
4. **Master** — `master_audio(speech, sr, target_lufs=target, true_peak_db)` (target =
   `target_lufs` or `RECIPE_TARGETS[recipe]`, default −14).
5. **Re-measure + export** — `measure_loudness` → returns `integrated_lufs`; write WAV
   to exports dir.

## master_audio pipeline (`backend/services/mastering.py`)
glue broadband compressor (threshold −18 dB, ratio 2, attack 5 ms, release 120 ms)
→ true-peak limiter (4× oversample, ceiling `true_peak_db`) → LUFS normalize (gain =
`target_lufs − integrated`) → true-peak limiter again → optional stereo widener → clip.

## Worked example
```bash
curl -X POST http://localhost:17493/recipe/run -H 'Content-Type: application/json' -d '{
  "segments":[{"audio_path":"gen_a.wav","effects":[{"type":"deesser"}]},
              {"audio_path":"gen_b.wav","effects":[{"type":"spectral_denoise","params":{"amount":0.7}}]}],
  "recipe":"podcast","music_path":"bed.wav","gap_ms":250}'
# → {"output_path":"recipe_podcast_....wav","target_lufs":-16.0,"integrated_lufs":-15.9,...}
```
MCP: `21labs.run_recipe(segments=[...], recipe="podcast", music_path="bed.wav")`
MCP: `21labs.master_audio(audio_path="mix.wav", target_lufs=-14.0, true_peak_db=-1.0)`

## Pitfalls / Gotchas
- `21labs.run_recipe` omits `true_peak_db`, but `POST /recipe/run` accepts it (default −1.0). Use REST for a non-default ceiling.
- `run_recipe` applies ONLY `deesser`+`spectral_denoise` per segment + crossfade +
  master. The 10-effect chain (eq/compressor/reverb/etc.) is a SEPARATE path
  (`POST /effects/preview/{id}`); apply it BEFORE `run_recipe` if needed.
- `separate_audio` returns ONE stem per call (vocals/drums/bass/other) — call twice
  for vocals + backing.
- `width` is ignored on mono output.

## Cross-links
- [loudness-metering](../loudness-metering/SKILL.md)
- [noise-reduction](../noise-reduction/SKILL.md)
- [platform-export](../platform-export/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)

## Validation
- `run_recipe` returns `integrated_lufs`; re-check with `21labs.analyze_loudness`.
- Confirm true-peak ceiling not exceeded (see loudness-metering Pitfall on sample peak).
