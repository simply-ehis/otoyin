# Recipe: Audiobook

## Goal
A long-form, single-narrator audiobook with consistent tone and (where the text calls for it)
distinct character voices, delivered as lossless stereo at audiobook spec.

## Engine choice
- TTS: one cloned narrator profile for the through-line. Character voices = separate profiles used
  only on dialogue lines (sequence them in Stories per chapter).
- STT: not needed.

## Voice
- One narrator profile; character profiles assigned per chapter/section.

## Production path
1. Split the book into chapter generations (use the batch queue for many chapters).
2. For each chapter: `generate_speech` with the narrator profile; character lines use their profile.
3. Apply the light tone chain (noise_gate → eq → compressor → subtle reverb) to each generation via `POST /effects/preview/{generation_id}` BEFORE `run_recipe` — see Processing path note (values in the Parameter table).
4. Sequence chapters in Stories for fades between sections; apply per-item gain/trim.
5. `run_recipe(segments=[{audio_path, effects?: {deesser, spectral_denoise}}], recipe="audiobook")` masters all chapters to
   **−18 LUFS stereo** for consistent loudness across the book. Pass `deesser`/`spectral_denoise`
   per segment for cleanup.

## Export
- Preset: **Audiobook** — MP3, **−18 LUFS**, **mono**.
- Verify each chapter; identical LUFS across the whole book matters more than any single clip.

## Caveats
- Long-form: keep every chapter generation; never overwrite. Use versioning if a retake is needed.
- Pacing is human taste; the agent stages the chain, the user approves the read.

## Processing path
`run_recipe` applies ONLY `deesser`+`spectral_denoise` per segment + crossfade + master to the recipe LUFS target. It does NOT apply EQ, compressor, reverb, delay, chorus, distortion, noise_gate, or pitch/formant/time shifts. To get those, apply the `effects_chain` via `POST /effects/preview/{generation_id}` (or the generation's `effects_chain` array) BEFORE `run_recipe`.

## Parameter table
Tone-shaping `effects_chain` to apply per chapter/clip BEFORE `run_recipe` (start params from `effects-field-guide` / GROUNDING-PACK):
| order | effect | params | value | why |
|-------|--------|--------|-------|-----|
| 1 | eq | high_gain / low_gain | +2 dB / −2 dB | warmth + presence for long listen |
| 2 | compressor | threshold/ratio/attack/release | −22 / 3 / 0.01 / 0.12 | gentle glue, no pumping |
| 3 | noise_gate | threshold | −45 dB | cut room between sentences |
| 4 | deesser | threshold_db/reduction_db/strength | −18 / −6 / 0.6 | sibilance over long takes |
| 5 | spectral_denoise | amount | 0.6 | consistent noise floor |
| 6 | reverb | room_size/damping/wet | 0.25 / 0.4 / 0.12 | subtle room, not cathedral |

## Cross-links
- [effects-field-guide](../effects-field-guide/SKILL.md)
- [mastering](../mastering/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)
- [stories-mode](../stories-mode/SKILL.md)
- [batch-queue](../batch-queue/SKILL.md)
- [platform-export](../platform-export/SKILL.md)

## Reconciliation note
`run_recipe` masters to this recipe's LUFS target (see Processing path). The platform-export preset above is now set to the **same** LUFS target (reconciled in `backend/routes/platform_export.py`), so mastering then exporting keeps one consistent loudness — no double-normalization.
