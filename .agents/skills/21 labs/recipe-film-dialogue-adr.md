# Recipe: Film / TV Dialogue + ADR

## Goal
Acted, picture-locked dialogue for film/TV: a guide track, multiple takes per line, a scored best
take, synced to timeline, delivered in a surround-capable master.

## Engine choice
- TTS: a cloned dialogue profile per character. ADR is about matching an actor's performance, so
  prefer a clone of the on-set voice over a preset.
- STT: faster-whisper only to transcribe the guide/reference.

## Voice
- One character profile per `character` field in the ADR lines.

## Production path
1. `POST /adr/sessions` with lines: `character`, `original_text`, `target_duration_ms`, `fps`.
2. `POST /adr/sessions/{id}/guide` (or `/guide-path`) → upload the reference/guide track.
3. `POST /adr/sessions/{id}/lines/{line_id}/takes` → record or upload actor takes.
4. `POST /adr/score` → quality score per take; `POST /adr/auto-select` → best take per line.
5. `POST /adr/sessions/{id}/lines/{line_id}/select/{take_id}` → lock the chosen take.
6. `POST /adr/align` → sync to the timeline.
7. Apply per-take tone cleanup (EQ + compressor + deesser + light denoise) via `POST /effects/preview/{generation_id}` BEFORE final — see Processing path note (values in the Parameter table).
8. `run_recipe(segments=[{audio_path, effects?: {deesser, spectral_denoise}}], recipe="film-dialogue-adr")` masters the
   selected takes to **−24 LUFS 5.1** (or stereo) for a theatrical bed.

## Export
- Preset: **Movie Audio** — WAV 24-bit, **−24 LUFS**, **stereo** (the preset outputs stereo; 5.1 is not produced by it).
- Verify loudness; dialogue should sit under the music/FX bed.

## Caveats
- A guide track must exist before scoring. If the clone is missing, say so; do not substitute a
  random preset and claim it matches the actor.
- ADR live control (timeline/comping) is human-driven; the agent stages takes and selects, not the
  live audio graph.

## Processing path
`run_recipe` applies ONLY `deesser`+`spectral_denoise` per segment + crossfade + master to the recipe LUFS target. It does NOT apply EQ, compressor, reverb, delay, chorus, distortion, noise_gate, or pitch/formant/time shifts. To get those on a take, apply the `effects_chain` via `POST /effects/preview/{generation_id}` (or the generation's `effects_chain` array) BEFORE `run_recipe`.

## Parameter table
Tone-shaping `effects_chain` to apply per take BEFORE `run_recipe` (start params from `effects-field-guide` / GROUNDING-PACK):
| order | effect | params | value | why |
|-------|--------|--------|-------|-----|
| 1 | eq | high_gain / low_gain | +2 dB / −2 dB | subtle presence, trim low rumble |
| 2 | compressor | threshold/ratio/attack/release | −24 / 2 / 0.01 / 0.15 | gentle catch, theatrical dynamics |
| 3 | noise_gate | threshold | −45 dB | cut set noise (→ −35 to cut more) |
| 4 | deesser | threshold_db/reduction_db/strength | −18 / −6 / 0.6 | tame sibilance |
| 5 | spectral_denoise | amount | 0.5 | light location-noise removal |
| 6 | reverb | room_size/damping/wet | 0.2 / 0.5 / 0.10 | tiny space, keep ADR dry |

## Cross-links
- [effects-field-guide](../effects-field-guide/SKILL.md)
- [mastering](../mastering/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)
- [adr-mode](../adr-mode/SKILL.md)
- [batch-queue](../batch-queue/SKILL.md)
- [platform-export](../platform-export/SKILL.md)

## Reconciliation note
`run_recipe` masters to this recipe's LUFS target (see Processing path). The platform-export preset above is now set to the **same** LUFS target (reconciled in `backend/routes/platform_export.py`), so mastering then exporting keeps one consistent loudness — no double-normalization.
