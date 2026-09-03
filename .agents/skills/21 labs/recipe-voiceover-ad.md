# Recipe: Voiceover / Ad

## Goal
A commercial voiceover: intimate, bright, authoritative, mono WAV at voiceover spec, no music bed
unless the brief asks.

## Engine choice
- TTS: Chatterbox or Chatterbox Turbo for expressive reads; Kokoro for straight delivery.
- STT: not needed.

## Voice
- One profile; consider a personality prompt for brand tone.

## Production path
1. `generate_speech` with the spot script (include natural pauses).
2. Apply the forward chain (noise_gate → eq → compressor → deesser → light reverb) to the generation via `POST /effects/preview/{generation_id}` BEFORE `run_recipe` — see Processing path note (values in the Parameter table).
3. `run_recipe(segments=[{audio_path, effects?: {deesser, spectral_denoise}}], recipe="voiceover-ad")` masters the spot to
   **−12 LUFS mono**; the recipe's de-esser + the master chain keep the voice forward.

## Export
- Preset: **Voiceover** — WAV 24-bit, **−12 LUFS**, **stereo**.
- Hotter than podcast; that's intentional for promo.

## Caveats
- No music unless requested. If the brief wants a bed, route it in the mixer with sidechain duck and
  re-measure.

## Processing path
`run_recipe` applies ONLY `deesser`+`spectral_denoise` per segment + crossfade + master to the recipe LUFS target. It does NOT apply EQ, compressor, reverb, delay, chorus, distortion, noise_gate, or pitch/formant/time shifts. To get those, apply the `effects_chain` via `POST /effects/preview/{generation_id}` (or the generation's `effects_chain` array) BEFORE `run_recipe`.

## Parameter table
Tone-shaping `effects_chain` to apply per spot BEFORE `run_recipe` (start params from `effects-field-guide` / GROUNDING-PACK):
| order | effect | params | value | why |
|-------|--------|--------|-------|-----|
| 1 | eq | high_gain / low_gain | +3 dB / −2 dB | presence lift, voice forward |
| 2 | compressor | threshold/ratio/attack/release | −20 / 4 / 0.005 / 0.06 | control, forward |
| 3 | deesser | threshold_db/reduction_db/strength | −18 / −6 / 0.6 | tame sibilance |
| 4 | noise_gate | threshold | −40 dB | clean, bed-free VO |
| 5 | spectral_denoise | amount | 0.6 | clean capture |
| 6 | reverb | room_size/damping/wet | 0.3 / 0.4 / 0.15 | light plate-ish room |

## Cross-links
- [effects-field-guide](../effects-field-guide/SKILL.md)
- [mastering](../mastering/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)
- [batch-queue](../batch-queue/SKILL.md)
- [platform-export](../platform-export/SKILL.md)

## Reconciliation note
`run_recipe` masters to this recipe's LUFS target (see Processing path). The platform-export preset above is now set to the **same** LUFS target (reconciled in `backend/routes/platform_export.py`), so mastering then exporting keeps one consistent loudness — no double-normalization.
