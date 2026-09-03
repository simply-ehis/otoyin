# Recipe: YouTube / Long-Form Explainer

## Goal
A faceless or hosted YouTube video narration: clear host voice over a ducked music bed, with an
intro/outro, delivered mono at social spec (YouTube normalizes loudness anyway, but −14 LUFS keeps
it competitive).

## Engine choice
- TTS: a cloned host profile (consistency across the channel). Music: Stable Audio Open for a bed
  that fits the mood (ACE-Step removed) and for stings.
- STT: faster-whisper only if re-using an uploaded clip.

## Voice
- One host profile; personality prompt optional for a casual channel tone.

## Production path
1. Script the narration; split into sections (intro, body, outro).
2. `generate_speech` per section with the host profile.
3. Apply the host tone chain (eq → compressor → deesser → noise_gate) to each voice generation via `POST /effects/preview/{generation_id}` BEFORE `run_recipe` — see Processing path note (values in the Parameter table).
4. `generate_sfx` a bed (genre/mood matching the channel; loop or stitch as needed).
5. Sequence in Stories or the DAW: voice tracks + music bed; apply auto-duck so the bed dips under
   voice (Conversation mode auto-duck, or manual sidechain in the mixer).
6. Intro/outro stings via Stable Audio SFX.
7. `run_recipe(segments=[{audio_path, effects?: {deesser, spectral_denoise}}], recipe="youtube", music_path=<bed>)` masters
   the full episode to **−14 LUFS** and ducks the bed under the voice in one pass.

## Export
- Preset: **Social Media** — MP3, **−14 LUFS**, **stereo** (YouTube will re-normalize; this
  keeps it close).
- For a hosted (talking-head) version, keep stereo and the same −14 LUFS target.

## Caveats
- Music must duck under voice; a flat bed buries the host. Verify the duck before export.
- Long-form: use the batch queue for many sections, not blocking calls.

## Processing path
`run_recipe` applies ONLY `deesser`+`spectral_denoise` per segment + crossfade + master to the recipe LUFS target. It does NOT apply EQ, compressor, reverb, delay, chorus, distortion, noise_gate, or pitch/formant/time shifts. To get those on the host voice, apply the `effects_chain` via `POST /effects/preview/{generation_id}` (or the generation's `effects_chain` array) BEFORE `run_recipe`.

## Parameter table
Tone-shaping `effects_chain` for the HOST voice BEFORE `run_recipe` (start params from `effects-field-guide` / GROUNDING-PACK):
| order | effect | params | value | why |
|-------|--------|--------|-------|-----|
| 1 | eq | high_gain / low_gain | +3 dB / −2 dB | host presence |
| 2 | compressor | threshold/ratio/attack/release | −20 / 4 / 0.005 / 0.08 | control host dynamics |
| 3 | noise_gate | threshold | −40 dB | cut room |
| 4 | deesser | threshold_db/reduction_db/strength | −18 / −6 / 0.6 | sibilance |
| 5 | spectral_denoise | amount | 0.6 | clean capture |
| 6 | reverb | room_size/damping/wet | 0.25 / 0.45 / 0.12 | subtle space |

## Cross-links
- [effects-field-guide](../effects-field-guide/SKILL.md)
- [mastering](../mastering/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)
- [conversation-mode](../conversation-mode/SKILL.md)
- [batch-queue](../batch-queue/SKILL.md)
- [platform-export](../platform-export/SKILL.md)

## Reconciliation note
`run_recipe` masters to this recipe's LUFS target (see Processing path). The platform-export preset above is now set to the **same** LUFS target (reconciled in `backend/routes/platform_export.py`), so mastering then exporting keeps one consistent loudness — no double-normalization.
