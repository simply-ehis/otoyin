---
name: loudness-metering
description: Measure and interpret LUFS loudness + true-peak for a stored clip before/after mastering; use when an agent must "check the loudness", "verify LUFS target", or report integrated/short-term/true-peak numbers.
---
# Loudness Metering

## Purpose
otoyin measures perceived loudness offline with the ITU-R BS.1770-4 K-weighting
algorithm and reports integrated LUFS, true-peak, RMS, crest factor, and loudness
range. This is the control surface for confirming a master actually hit its platform
target. All measurement is non-destructive (numpy-only, no file mutation).

## When to use
- User asks "what is the LUFS / how loud is this clip?"
- Before/after `master_audio` or `run_recipe` to confirm delivered level.
- Validating a platform export hit its target within tolerance.

## Prerequisites
- Tool surface: MCP `21labs.analyze_loudness` OR REST `POST /audio/loudness` / `POST /audio/analyze-loudness`.
- Inputs: a stored clip path (storage-relative). Path is resolved/storage-checked; traversal rejected; missing file → 404.

## Parameters / Schema (REAL ranges from code)
| param | range | default | notes |
|-------|-------|---------|-------|
| integrated_lufs | -70..0 | — | BS.1770-4 gated integrated loudness |
| true_peak_dbtp | -70..0 | — | peak converted to dBTP (see Pitfall) |
| rms_level | 0.0–1.0 | — | linear RMS (measure_loudness only) |
| rms_db | -inf..0 | — | 20·log10(rms) (analyze_loudness only) |
| crest_factor_db | — | — | peak_db − rms_db |
| loudness_range_lu | ≥0 | — | 10th–95th pct spread of 400 ms blocks |
| duration_seconds | >0 | — | clip length |

`measure_loudness(audio, sr)` returns `integrated_lufs, true_peak_dbtp, rms_level,
duration_seconds, blocks_measured, blocks_after_gate`.
`analyze_loudness(audio, sr)` adds `rms_db, crest_factor_db, loudness_range_lu`.

## Agent procedure
1. Generate/load a clip to a storage path.
2. Call `21labs.analyze_loudness(audio_path)` → full report JSON.
   REST: `POST /audio/analyze-loudness?audio_path=<path>` (QUERY param, not body).
   Or `POST /audio/loudness` (JSON body `{audio_path}`) for the lighter measure report.
3. Compare `integrated_lufs` to the target; re-run after `master_audio` to confirm.

## Worked example
```bash
curl -X POST "http://localhost:17493/audio/analyze-loudness?audio_path=gen_abc123.wav"
# → {"integrated_lufs":-15.1,"true_peak_dbtp":-1.2,"rms_db":-19.3,
#     "crest_factor_db":18.1,"loudness_range_lu":3.4,"duration_seconds":42.7}
```
MCP: `21labs.analyze_loudness(audio_path="gen_abc123.wav")`

## Integrated vs short-term vs true-peak
- **Integrated LUFS** — gated loudness over the whole file (absolute gate −70 LU,
  relative gate −10 LU rel). This is the number platforms match.
- **Short-term / momentary** — 3 s / 400 ms sliding windows (exposed by the Rust
  `LufsMeter` in `labs21-shared-audio/src/lufs.rs` for live UI meters; Python
  `analyze_loudness` reports the spread via `loudness_range_lu`).
- **True peak (dBTP)** — peak after 4× oversampling; the limiter in `mastering.py`
  clips to `true_peak_db` to avoid inter-sample clipping on D/A conversion.

## ±1 LUFS tolerance rule
Streaming platforms re-normalize within ~±1 LU of their target (e.g. Spotify −14).
otoyin's `master_audio` applies an exact gain (`gain_db = target − integrated`),
so the re-measured result lands within numerical precision of target. Treat ±1 LU as
the acceptance band when hand-checking; the code does NOT hard-enforce a tolerance.
`recipe_run` re-measures and returns `integrated_lufs` so you can confirm.

## Pitfalls / Gotchas
- `analyze_loudness` is a QUERY param (`?audio_path=`) — sending a JSON body → 422.
- `measure_loudness`'s `true_peak_dbtp` is the **sample peak** (max |x|, no
  oversampling), NOT the oversampled true peak. The mastering limiter uses 4×
  oversampling. For true-peak safety, trust `master_audio`/`run_recipe` output, not
  `measure_loudness.true_peak_dbtp`.
- Empty/silent audio returns −70.0 placeholders.

## Cross-links
- [mastering](../mastering/SKILL.md)
- [platform-export](../platform-export/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)

## Validation
- Re-measure the mastered file; `integrated_lufs` should equal `target_lufs` within
  ~±0.3 LU. Confirm `true_peak_db` ceiling was not exceeded by the limiter.
