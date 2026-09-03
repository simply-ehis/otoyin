# Recipe: Podcast / Multi-Host

## Goal
A multi-speaker podcast episode: distinct host/guest voices, clean levels, mono, ready for Spotify/etc.

## Engine choice
- TTS: a cloned profile per speaker (host + each guest). If no clone exists, use a distinct preset
  per speaker and note it. Expressive banter → Chatterbox; fast narration → Kokoro.
- STT: faster-whisper (only if you transcribe an uploaded reference).

## Voice
- One profile per speaker, resolved via `list_voices`. Give each a color-coded speaker badge in
  Conversation mode.

## Production path
1. For each line, `generate_speech` with that speaker's `voice_profile_id`; note the returned `generation_id` and `audio_path`.
2. Apply the tone-shaping `effects_chain` (EQ + compressor + optional reverb + noise_gate) to each generation via `POST /effects/preview/{generation_id}` — this is the ONLY way to get EQ/compressor/reverb (see Processing path note below; values in the Parameter table).
3. `run_recipe(segments=[{audio_path, effects?: {deesser, spectral_denoise}}], recipe="podcast", music_path=<optional bed>)`
   crossfades speakers, applies per-segment `deesser`+`spectral_denoise`, ducks the bed, and masters to **−16 LUFS mono**.
   (No `POST /conversation/render` exists — build the mixed episode with `run_recipe`.)

## Export
- Preset: **Podcast** — MP3, **−16 LUFS**, **stereo**.
- `run_recipe` already masters to target; run `measure_loudness` only if you want a second check.

## Caveats
- Mono by spec; do not upmix to stereo. If a speaker's engine is missing, fall back and tell the user.
- Keep raw generations; the render is non-destructive.

## Processing path
`run_recipe` applies ONLY `deesser`+`spectral_denoise` per segment + crossfade + master to the recipe LUFS target. It does NOT apply EQ, compressor, reverb, delay, chorus, distortion, noise_gate, or pitch/formant/time shifts. To get those, apply the `effects_chain` via `POST /effects/preview/{generation_id}` (or the generation's `effects_chain` array) BEFORE `run_recipe`.

## Parameter table
Tone-shaping `effects_chain` to apply per generation BEFORE `run_recipe` (start params from `effects-field-guide` / GROUNDING-PACK):
| order | effect | params | value | why |
|-------|--------|--------|-------|-----|
| 1 | eq | high_gain / low_gain | +3 dB / −2 dB | presence lift, trim boom |
| 2 | compressor | threshold/ratio/attack/release | −20 / 4 / 0.008 / 0.08 | tame loud peaks, glue hosts |
| 3 | noise_gate | threshold | −40 dB | cut between-word room (→ −30 to cut more) |
| 4 | deesser | threshold_db/reduction_db/strength | −18 / −6 / 0.6 | kill "s" hiss |
| 5 | spectral_denoise | amount | 0.7 | fan/AC removal (needs ~100 ms room tone) |
| 6 | reverb | room_size/damping/wet | 0.3 / 0.4 / 0.15 | small room, not cathedral |

## Cross-links
- [effects-field-guide](../effects-field-guide/SKILL.md)
- [mastering](../mastering/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)
- [conversation-mode](../conversation-mode/SKILL.md)
- [batch-queue](../batch-queue/SKILL.md)
- [platform-export](../platform-export/SKILL.md)

## Reconciliation note
`run_recipe` masters to this recipe's LUFS target (see Processing path). The platform-export preset above is now set to the **same** LUFS target (reconciled in `backend/routes/platform_export.py`), so mastering then exporting keeps one consistent loudness — no double-normalization.
