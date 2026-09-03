# Recipe: Social / Short

## Goal
A punchy sub-60s clip for TikTok / Reels / Shorts: bright voice, tight dynamics, mono, loud enough
to be heard on a phone speaker.

## Engine choice
- TTS: Chatterbox Turbo or Kokoro for speed; expressive hook → Chatterbox.
- SFX: Stable Audio Open for a transition or sting.

## Voice
- One profile; lean bright and intimate.

## Production path
1. `generate_speech` with a short, hook-first script.
2. Apply the bright/tight chain (noise_gate → eq → compressor → deesser → small reverb) to the generation via `POST /effects/preview/{generation_id}` BEFORE `run_recipe` — see Processing path note (values in the Parameter table).
3. Drop a Stable Audio SFX sting at the open/close via the mixer or Stories.
4. `run_recipe(segments=[{audio_path, effects?: {deesser, spectral_denoise}}], recipe="social-short")` masters the clip to
   **−14 LUFS mono** for feed loudness; pass `deesser` in the segment `effects` to tame sibilance.

## Export
- Preset: **Social Media** — MP3, **−14 LUFS**, **stereo**.
- Loud but not clipping; true-peak limit is applied by the preset.

## Caveats
- Keep it short. If the brief is longer, propose a split into parts. Mono by spec.

## Processing path
`run_recipe` applies ONLY `deesser`+`spectral_denoise` per segment + crossfade + master to the recipe LUFS target. It does NOT apply EQ, compressor, reverb, delay, chorus, distortion, noise_gate, or pitch/formant/time shifts. To get those, apply the `effects_chain` via `POST /effects/preview/{generation_id}` (or the generation's `effects_chain` array) BEFORE `run_recipe`.

## Parameter table
Tone-shaping `effects_chain` to apply per clip BEFORE `run_recipe` (start params from `effects-field-guide` / GROUNDING-PACK):
| order | effect | params | value | why |
|-------|--------|--------|-------|-----|
| 1 | eq | high_gain / low_gain | +4 dB / −3 dB | brightness for phone speaker |
| 2 | compressor | threshold/ratio/attack/release | −18 / 6 / 0.003 / 0.05 | fast, aggressive, loud |
| 3 | noise_gate | threshold | −35 dB | tight, cut dead air |
| 4 | deesser | threshold_db/reduction_db/strength | −18 / −6 / 0.7 | sibilance on bright chain |
| 5 | spectral_denoise | amount | 0.7 | clean phone playback |
| 6 | reverb | room_size/damping/wet | 0.2 / 0.5 / 0.10 | tiny space |

## Cross-links
- [effects-field-guide](../effects-field-guide/SKILL.md)
- [mastering](../mastering/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)
- [stories-mode](../stories-mode/SKILL.md)
- [batch-queue](../batch-queue/SKILL.md)
- [platform-export](../platform-export/SKILL.md)

## Reconciliation note
`run_recipe` masters to this recipe's LUFS target (see Processing path). The platform-export preset above is now set to the **same** LUFS target (reconciled in `backend/routes/platform_export.py`), so mastering then exporting keeps one consistent loudness — no double-normalization.
