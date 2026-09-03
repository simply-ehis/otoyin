# Audio Joining / Merging / Frequency Tuning

PURPOSE: Every path in otoyin that COMBINES multiple audio sources into one — timeline mixing, DAW bounce, recipe concat, conversation layering, and the frequency/mastering tools applied during merge.
OWNS: services/mixer.py (numpy mix engine), services/mastering.py (compressor/limiter/LUFS/stereo), services/recipe_runner.py (crossfade concat + duck), services/effects_chain.py (eq/compressor/spectral), routes/mixer.py (story→mix), components/AudioStudio/AudioStudio.tsx (Web Audio real-time graph), components/AudioStudio/audioStudio/renderMidiToBuffer.ts.
READ-WHEN: Touching multi-track mixing, bounce/export, crossfade, ducking, EQ, mastering, or "how do two clips become one".
KEY-FILES: services/mixer.py, services/mastering.py, services/recipe_runner.py, components/AudioStudio/AudioStudio.tsx
INVARIANTS: Two distinct merge engines exist — (A) OFFLINE numpy (backend: mixer.py, recipe_runner.py, story export) and (B) REAL-TIME Web Audio graph (frontend AudioStudio). They use DIFFERENT math (see GOTCHAS). All merges are sample-accurate by index; clips placed at start_sample = start_time_ms/1000*sr. Final stage is always a peak/clip guard or LUFS normalize.
GOTCHAS: Backend mixer.py hard-codes sample_rate=48000 (routes/mixer.py:36) then OVERWRITES it with the first track's sr — inconsistent. Stereo panning is equal-power (sqrt). The backend reverb/delay (effects_chain) are single-tap approximations vs the frontend parallel wet/dry (see 54/57).
UPDATED: 2026-07-19 (fixes applied)

## A. Offline numpy mixing (backend)

### services/mixer.py — the core "join" engine
- `TrackConfig` (volume, pan, muted, solo, bus_id, effects_chain) + `BusConfig` + `MixerState`.
- `pan_stereo(audio, pan)`: equal-power law — `left=audio*sqrt(0.5*(1-pan))`, `right=audio*sqrt(0.5*(1+pan))`. pan ∈ [-1,1].
- `mix_tracks(track_data, sr, total_samples)` → (left, right) float32 zero buffers. For each track: skip if muted, or if ANY track is solo and this isn't solo; apply per-track effects_chain; multiply by volume; pan; ADD into left/right at `start_sample` (caller passes pre-offset audio? No — here tracks are full-length, summed in place). Summation = plain additive mixing (no automatic gain compensation).
- `mix_with_buses(...)`: same, but tracks with `bus_id` sum into a bus buffer; bus applies its own effects_chain + volume + pan; then buses + direct tracks sum into master; master multiplied by `master_volume`; finally a HARD PEAK NORMALIZE if peak>1.0 (divide both channels by peak). This is the only auto-level step in the raw mixer.

### routes/mixer.py — story → mix preview
- Loads each StoryItem's generation WAV, downmixes to mono (`mean(axis=1)`), resolves `sr` (HARD-CODED 48000 then overwritten by first track's sr — bug-prone if tracks differ), applies trim via `audio[trim_start : len-trim_end]`, builds TrackConfig from item.volume + item.effects_chain, places at `start_sample = start_time_ms/1000*sr`.
- `total_samples = max(longest placed end, sr*60)` (min 60s buffer). Calls `mix_with_buses`, stacks to stereo, writes WAV, streams back. Note: NO per-track pan set from story item (pan defaults 0) — story mix is mono-summed then centered.

### services/recipe_runner.py — segment concat + ducked music bed
- Pipeline: load each segment (downmix mono) → per-segment de-esser / spectral_denoise → `_crossfade_concat` (sequential, with `gap_ms` silence between segments + `fade_ms` equal-power fade in/out each segment, then concatenate).
- Optional music bed: load music, resample to speech sr via `scipy.signal.resample`, pad both to max length, build a duck `env` = 1.0 everywhere EXCEPT where `|speech| > 0.5*peak` → env=0.15 there; bed = music*env*0.6; `speech = speech_padded + bed`. (Simple energy-gated duck, not a sidechain detector.)
- Final: `master_audio(...)` to recipe LUFS target (-16 podcast, -18 audiobook, -24 film/ADR, -12 voiceover, -14 social/youtube).

## B. Real-time Web Audio graph (frontend AudioStudio)
- AudioStudio.tsx builds a live graph per play (lines 458-519): for each track (skip muted / non-solo): `BufferSource → trackGain(volume) → crossfadeGain → [effectChain] → StereoPanner(pan) → masterGain`.
- `source.playbackRate = playbackSpeed` (timeline speed). `source.start(0, startOffset)` (seek).
- Crossfade: `crossfadeGain` ramps 1→0.0001 over `xfOut` at END (outgoing), and 0.0001→1 over `xfIn` at START (incoming from a track targeting this one). Pairwise fade, not a global bus crossfade.
- MIDI tracks: `renderMidiToBuffer(ctx, midiNotes, duration)` synthesizes the buffer first (see 57). Multi-channel (>2ch) buffers bypass the panner and go straight to masterGain.
- masterGain → analyser → destination. All tracks sum at masterGain (Web Audio does the additive mix + clipping natively; masterGain=1 so overload possible → browser soft-clips).

## Frequency tuning + final merge glue (mastering.py)
`master_audio(audio, sr, target_lufs, true_peak_db, width)` — the "tuning" chain applied at the END of offline merges:
1. `_broadband_compressor` — per-channel broadband (full-band) compressor: peak-following envelope with attack/release coeffs, gain reduction `(1-1/ratio)` above threshold. Glue, not frequency-specific.
2. `_true_peak_limiter` — 4x oversampled peak detect, scales to `ceiling_db` (-1 dBTP default). Prevents inter-sample peaks.
3. LUFS normalize — measures integrated LUFS (`_measure_integrated_lufs`, mono downmix), gains to `target_lufs`.
4. `_true_peak_limiter` AGAIN (post-normalize).
5. `_stereo_widener` (optional, width≠0) — mid/side: `mid=(L+R)/2`, `side=(L-R)/2 * (1+width)`, rebuild L/R. width clipped to [-1,1].
- EQ (frequency-specific tuning) is NOT in mastering — it's a per-track effect: `AudioEffectsChain._apply_eq` = 3-band Butterworth (low<200Hz, mid~1kHz, high>3kHz) via scipy `filtfilt`, gain in /6 steps. Applied during mix (track or bus effects_chain), not at master.

## Conversation / podcast layering (routes/conversation.py)
- `ConversationLine` has `track`, `start_offset_ms`, `overlap_ms`, `start_mode` (relative_to_previous / absolute). Lines placed on tracks by time; the actual mixing reuses the same mixer.py path (tracks summed). `conversation_auto_duck` / `conversation_auto_level` (assistant tools) compute gain envelopes / level-match lines to a target LUFS BEFORE mixing.

## Observations (audit findings — for later judgement, NO code change yet)
1. **Two merge engines, two results** (GOTCHAS): backend `mix_with_buses` (numpy additive + peak-norm) vs frontend Web Audio graph (native sum + browser clip). A Story exported via `/mixer/preview` (backend) can sound different from playing it in the AudioStudio DAW (frontend), especially with effects (backend reverb/delay are single-tap, frontend are parallel). Same divergence as 54/57.
2. **`routes/mixer.py:36` hard-codes 48000 then overwrites with first track sr** — if tracks have different sample rates (e.g. one 24k gen + one 48k import), later tracks are summed at the FIRST track's rate with NO resample. Mixed-rate tracks will be pitch/length wrong. Should resample all to a common sr.
3. **No automatic gain compensation in the raw mixer** — `mix_tracks`/`mix_with_buses` just add. Only `mix_with_buses` peak-normalizes (and only if >1.0). N tracks at full volume can clip before normalization; peak-norm then lowers EVERYTHING (including quiet tracks). A user with 5 loud tracks gets a quiet, squashed mix. Consider pre-mix gain staging or a sum limiter.
4. **Story mix ignores per-item pan** (routes/mixer.py builds TrackConfig without pan) — all story items are centered. If the UI lets users pan story items, the export drops it.
5. **Recipe duck is energy-gated, not sidechain** (recipe_runner.py:96-101) — env=0.15 whenever speech exceeds 50% of its own peak. This ducks music even during soft speech breaths and doesn't duck during actual loud speech proportionally. A real sidechain (as in `_apply_sidechain_duck` / conversation_auto_duck) would be smoother.
6. **Mastering compressor is broadband (full-band)** — no multiband. Fine for speech glue, but "tuning" low end vs highs equally. EQ (per-track) is the only frequency-specific control, and it's not in the master chain.
7. **`_stereo_widener` can EXCEED full scale** — `side*(1+width)` with width up to 1.0 doubles side; mid+side can exceed [-1,1] before the final clip. Clipped, but a wide master could pump. Acceptable with the final clip.
8. **Crossfade in frontend is pairwise track→target** — if 3 tracks crossfade in a chain, each pair fades independently; no global timeline crossfade. Longer crossfades on adjacent tracks can overlap oddly. Verify against UI expectations.

## FIXES APPLIED (2026-07-19)
Findings #2, #3, #5, and the FX half of #1 were fixed (user approved "fix all"):
- **#2 Sample-rate bug** (routes/mixer.py): tracks now load at native SR, then all are resampled to a common rate (48000, or max native if higher) before mixing. No more mis-pitch on mixed-rate stories.
- **#3 Gain staging** (services/mixer.py `mix_with_buses`): added equal-power headroom `1/sqrt(active_tracks)` applied before the sum, so N full-scale tracks no longer clip-then-squash. Final peak-normalize remains as a safety net.
- **#1 FX consistency** (services/effects_chain.py `_apply_reverb`/`_apply_delay`): reverb now uses true parallel wet/dry convolution (full tail preserved via `fftconvolve` mode="full", IR from new `make_impulse_response` in effects_extended.py); delay now uses parallel wet/dry with a stable feedback tap. Matches the frontend AudioStudio `buildEffectChain` so assistant/REST export and in-DAW sound identical. (Frontend-vs-backend *graph* difference for plain sum still exists; that's the DAW play path, not the export path.)
- **#5 Recipe duck** (services/recipe_runner.py): replaced the energy-gate hard duck with a real sidechain envelope (threshold -30dB, duck -12dB, 120ms release) driven by the speech — mirrors `_apply_sidechain_duck`. Music now fades under voice smoothly instead of gating on peaks.
- **#4 (pan) NOT fixed**: StoryItem DB model has no `pan` column (only track/volume/fades/gain_db). Adding pan would require a schema migration — out of scope for this pass. Documented as a known limitation, not a regression.

Verification: tests/test_mixer.py (7 tests: SR unify, gain staging, reverb tail, delay echo, mute/solo) + tests/test_recipe_and_daw.py sidechain test — 12 new/updated tests pass. ruff clean on all changed files.

## Agent Callable
- **MCP Tools:** `21labs.bounce`, `21labs.bounce_preview`, `21labs.master_audio`, `21labs.run_recipe`
- **REST Endpoints:** `POST /audio/bounce`, `POST /audio/bounce-preview`, `POST /audio/master`, `POST /recipe/run`
- **Key Backend Files:** `backend/services/mixer.py`, `backend/services/mastering.py`, `backend/services/recipe_runner.py`, `backend/routes/audio.py`
- **Key Frontend Files:** `app/src/components/Workspace/MixerView.tsx`, `app/src/stores/playerStore.ts`
