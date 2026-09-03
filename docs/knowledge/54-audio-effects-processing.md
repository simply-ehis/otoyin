# Audio Effects + Noise Reduction Processing

PURPOSE: How otoyin applies DSP effects chains and denoises audio on-device.
OWNS: services/effects_chain.py (AudioEffectsChain, 16 effect types), services/effects.py (primitives), services/effects_extended.py (de-esser, spectral denoise, character FX), services/noise_reduction.py (DeepFilterNet).
READ-WHEN: Touching effect DSP, the effects chain, /audio/effects endpoints, noise-reduce, or assistant reduce_noise/noise_reduce.
KEY-FILES: services/effects_chain.py, services/effects_extended.py, services/noise_reduction.py, routes/features.py, routes/assistant_tools/tools_audio_prim.py
INVARIANTS: apply_chain is sequential (each effect consumes previous output); unknown effect type is warned + skipped (NOT fatal); a failing effect raises (caught by caller). All processors are numpy/CPU, offline.
GOTCHAS: Several "reverb"/"chorus"/"delay" implementations are simplified single-tap approximations, NOT the true parallel wet/dry graphs used in the frontend AudioStudio buildEffectChain. Noise reduction is DeepFilterNet (torch or ONNX), with RNNoise name kept only as a backwards-compat alias.
UPDATED: 2026-07-19

## Effect chain registry (services/effects_chain.py:28)
16 effect types map to `_apply_*` methods: pitch_shift, formant_shift, time_stretch, reverb, delay, chorus, distortion, eq, compressor, noise_gate, sidechain_duck, silence_removal, normalize, deesser, spectral_denoise. `apply_chain` (line 46) iterates in order, skipping `enabled=False`, copies audio per step into `audio_history` (debug), warns on unknown type, and RE-RAISES on any effect exception (caller decides failure handling).

## Primitive / extended DSP
- `effects.py` — core pitch_shift (phase-vocoder), time_stretch, reverb (shared primitive).
- `effects_extended.py` — `apply_deesser`, `apply_spectral_denoise` (wired via `_apply_deesser`/`_apply_spectral_denoise`), plus character FX: gender_swap, age_shift, helium, vocoder, telephone, robot, etc. Lazy-imports primitives to avoid scipy/numpy import cost at module load.
- De-esser and spectral denoise are the "real" processors; the in-chain reverb/chorus/delay below are lightweight approximations.

## Noise reduction (services/noise_reduction.py)
- `reduce_noise_deepfilternet(audio, sr, vad_threshold=0.5)` — PREFERS ONNX Runtime (torch-free) when `is_onnx_available() and _is_model_cached()`, with automatic fallback to torch `df.enhance()` on any exception. Torch-free path is the offline-friendly default.
- `reduce_noise_rnnoise` is a BACKWARDS-COMPAT ALIAS = `reduce_noise_deepfilternet` (line 38). The legacy RNNoise engine is gone; routes/features.py and assistant tools still call the old name.
- `estimate_noise_profile` — frame-energy heuristic (20ms frames, <0.001 RMS = noise) for UI SNR preview. Cheap, no model.

## Observations (audit findings — for later judgement, NO code change yet)
1. **`_apply_reverb` is a single-delay tap, not reverb** (effects_chain.py:101-125). It sums dry + ONE delayed copy at `decay = 0.5*damping`, then truncates to input length. No feedback tail, no multi-tap, no diffusion. Audibly a "slap" not a room. (The frontend AudioStudio `buildEffectChain` was FIXED earlier this session to true parallel wet/dry — the backend chain did NOT get the same fix and diverges in behavior between app UI and assistant/REST paths.)
2. **Dead code in `_apply_noise_gate`** (effects_chain.py:230): `int(attack * sample_rate)` — computes a value and discards it. `attack` is parsed but never used; the gate uses only `release`. Attack is silently ignored. (Minor, but a real no-op.)
3. **`_apply_chorus` can exceed unity and clip** (effects_chain.py:151): `audio*(1+modulator)*mix` with `modulator = sin(...)*depth` and `depth` default 0.002 → factor up to ~1.002*mix; with mix=0.5 the wet term peaks ~0.501. Not severe, but combined with the `(1-mix)` dry term the sum can approach/exceed 1.0 at peaks → `np.clip` saves it but chorusing is partly clipped.
4. **`_apply_delay` applies feedback unconditionally** (effects_chain.py:139): `delayed[:len]* (1 + feedback)` — feedback is mixed into the single echo even when it should only feed a recirculating tail. A single echo with gain >1 (feedback>0) risks loudness boost; no multi-tap recirculation. Semantics differ from a real feedback delay.
5. **`apply_chain` stores full `audio_history` copies** (effects_chain.py:58) for every enabled effect. For long audio + many effects this is N full-length float32 copies held in a list that is never returned/used by callers — pure memory overhead. Candidate for removal (or debug-only behind a flag).
6. **Noise-reduction `vad_threshold` is accepted but unused on the ONNX path**: `reduce_noise_deepfilternet` takes `vad_threshold` but forwards nothing to `clean_audio_onnx` (which ignores it). The param only matters on the torch path via `df.enhance`. Assistant tool passes `vad_threshold` — it is silently a no-op on the default ONNX engine. Worth documenting or threading through.
7. **Formant shift is approximate** (effects_chain.py:74-95): FFT frequency-axis scaling also moves pitch (author's own comment admits this). Pitch-independent formant shifting would need LPC. Acceptable for a creative tool, but "formant_shift" naming over-promises vs. a true source-filter shift.
8. **Effect failures are fatal to the whole chain** (effects_chain.py:61-63): a single effect raising aborts the entire `apply_chain`, so a later effect can't run if an earlier one throws. Callers (generation `_save_generate`, /audio/effects endpoint) generally catch and report failure — but a partially-processed file is discarded rather than returned dry.

## Why this matters
The backend `AudioEffectsChain` (used by REST `/audio/effects`, assistant `apply_effects`, and generate-with-effects) and the frontend `buildEffectChain` (used by the in-app AudioStudio) implement DIFFERENT reverb/delay math. Same "reverb" preset can sound different depending on whether the user clicks the UI knob vs. asks the assistant. Observation #1 is the most consequential for audio consistency.

## Agent Callable
- **MCP Tools:** `21labs.noise_reduce`, `21labs.normalize_audio`, `21labs.master_audio`, `21labs.compress_audio`, `21labs.duck_audio`, `21labs.silence_removal`, `21labs.separate_audio`, `21labs.fade_in`, `21labs.fade_out`, `21labs.splice`, `21labs.delete_region`, `21labs.insert_silence`, `21labs.trim_silence`, `21labs.emotion_tone`, `21labs.breath_pause`, `21labs.adjust_pauses`
- **REST Endpoints:** `POST /audio/noise-reduce`, `POST /audio/normalize`, `POST /audio/master`, `POST /audio/compress`, `POST /audio/duck`, `POST /audio/silence-removal`, `POST /audio/separate`, `POST /audio/fade-in`, `POST /audio/fade-out`, `POST /audio/splice`, `POST /audio/delete-region`, `POST /audio/insert-silence`, `POST /audio/trim-silence`, `POST /audio/emotion-tone`, `POST /audio/breath-pause`, `POST /audio/adjust-pauses`
- **Key Backend Files:** `backend/services/effects.py`, `backend/services/effects_extended.py`, `backend/services/noise_reduction.py`, `backend/services/mastering.py`, `backend/services/loudness.py`, `backend/routes/audio_processing.py`, `backend/routes/audio_effects.py`
- **Key Frontend Files:** `app/src/components/Workspace/EffectsView.tsx`, `app/src/components/Workspace/AudioEnhanceView.tsx`
