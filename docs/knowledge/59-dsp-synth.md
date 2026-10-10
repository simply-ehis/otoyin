# DSP / Synth (Offline Pre-AI Synthesis)

PURPOSE: Offline "Synth / DSP" tab — pure DSP synthesis and classical effects, no AI models, no network.
OWNS: backend/routes/dsp.py, backend/services/dsp_synth.py, app/src/features/workspace/DspView.tsx
READ-WHEN: You add a synth/effect, change params, or touch the offline DSP endpoint contract.
KEY-FILES: backend/services/dsp_synth.py (wrappers), backend/routes/dsp.py (HTTP), clientStoriesA.ts (dspSynth/dspEffect/dspUpload/dspCapabilities)
INVARIANTS: Every sound is generated on-device with NumPy/SciPy via the `audio-dsp` library (MIT). No torch, no API, no cloud.
GOTCHAS: audio-dsp v0.1.10 API differs from its docs — see "Verified API facts" below. Functions that write files return None; read the file back. Vocoder/robotize return (L,R) tuples — _to_float flattens.
UPDATED: 2026-07-19

## Endpoints
- `GET /dsp/capabilities` → `{ synthesizers[], effects[], offline:true, ai:false, api:false }`
- `POST /dsp/synth` (JSON `SynthRequest`) → `audio/wav` blob. Fields: type, freq, duration, note, wave, cutoff, resonance, attack, decay, sustain, release, kind, text, algorithm, feedback.
- `POST /dsp/upload` (multipart `file`) → `{ audio_path, size }` (saved to captures dir; storage path returned).
- `POST /dsp/effect` (JSON `EffectRequest`) → `audio/wav` blob. Requires `audio_path` (from upload or any stored path). Fields: type, audio_path, carrier_freq, bits, drive, kind, cutoff, ftype, time, feedback, rate, depth, decay, wet, mod_freq.

## Frontend
- `DspView` (Workspace tab "Synth / DSP", icon `Cpu`, path `/workspace/dsp`). Badge: "Offline · No AI · No API".
- Two tabs: Synth (7 engines) and Effects (11 effects + upload-to-robotize).
- Client methods: `apiClient.dspCapabilities()`, `dspSynth(params)`, `dspUpload(file)`, `dspEffect(params)`.
- "Copy as Clip" writes a `kind:"dsp"` clip via `copyClip` (cross-tab clipboard) with measured duration.

## Synthesizers (offline)
1. subtractive — `SubtractiveSynth`; wave (sine/square/saw/triangle/pwm), cutoff, resonance, ADSR.
2. fm — `DX7FMSynth`; algorithm 1–5, feedback.
3. drum — `DrumSynth`; kick/snare/hihat/clap/tom/cymbal.
4. chiptone — deterministic square/triangle blip from a note name (audio-dsp `generate_blip` is random, so synthesized directly).
5. pluck — `pluck.generate_string_pluck` (writes file → read back, returns None).
6. dialup — `dialup_synth.generate_56k_dialup` (writes file → read back, returns None).
7. robot_speech — `speech.generate_default` (int16, no text arg) → ring-modulated robot voice.

## Effects (offline)
vocoder, bitcrush, distortion (fuzz/soft/hard/tube), tape, filter (lp/hp/bp), delay, phaser, pitch, ringmod, reverb (convolution w/ synth IR), robotize (carrier ringmod + bitcrush preset).
Note: audio-dsp exposes vocoder/bitcrush/distortion/tape/filter/delay/phaser/pitch_drift as module functions; reverb/ring_mod/lofi/glitch are NOT top-level, so reverb + ringmod are implemented as NumPy helpers in dsp_synth.py.

## Verified API facts (audio-dsp 0.1.10)
- `SubtractiveSynth(sample_rate=SR)` with settable properties (`osc_wave`, `filter_cutoff`, `filter_resonance`) then `.synthesize(freq, duration, attack, decay, sustain, release)`.
- `DX7FMSynth(sample_rate=SR).synthesize(freq, duration, algorithm)` — no init kwargs.
- `DrumSynth(sample_rate=SR).kick/snare/cymbal/clap/rim/tom(length=...)`.
- `pluck.generate_string_pluck(output_file, length, frequency)` returns None (writes file).
- `dialup_synth.generate_56k_dialup(filename, duration, sample_rate)` writes file, returns None.
- `speech.generate_default()` returns int16 (no text arg).
- `chip_tone.generate_blip()` returns int16 random (no note arg) — service synthesizes deterministic note.
- Effects are module functions (e.g. `vocoder(signal, sr, ...)`, `bitcrush_distortion(signal, gain, bits, mix)`, `distortion.<kind>_distortion`, `tape_saturation`, `filter_effect`, `delay`, `phaser_flanger`, `pitch_drift`).

## Agent Callable
- **MCP Tools:** `21labs.dsp_capabilities`, `21labs.dsp_synth`, `21labs.dsp_effect`
- **REST Endpoints:** `GET /dsp/capabilities`, `POST /dsp/synth`, `POST /dsp/effect`, `POST /dsp/upload`
- **Key Backend Files:** `backend/services/dsp_synth.py`, `backend/routes/dsp.py`
- **Key Frontend Files:** `app/src/features/workspace/DspView.tsx`
