# 05 — Sound Studio

## StudioView at `/workspace/studio`
- **Component:** `StudioView` in `app/src/components/Workspace/StudioView.tsx`
- **What:** 3 sub-tabs for generating audio content beyond TTS: Instruments, SFX, Noise.

## Instruments Tab
- **Piano Keyboard:** Interactive keys (MIDI 60–72), white/black key rendering, click to play note
- **Drum Pads:** 16 pads (Kick, Snare, Hi-Hat, Clap, Tom, Rim, Crash, Ride, Shaker, Tambourine, Cowbell, Claves, Conga, Bongo, Triangle, Splash) in 4x4 grid
- **Synth Controls:** Waveform selector (sine, sawtooth, square, triangle, noise), ADSR envelope sliders (attack/decay/sustain/release)
- **Drum Machine:** Render a 1-bar drum loop from synthesized hits

## SFX Tab
- **What:** Text-prompt sound effect generation via Stable Audio Open
- **Input:** Textarea for describing desired sound effect
- **Button:** "Generate with Stable Audio Open" (disabled when prompt empty)
- **Backend:** `POST /generate/sfx` with prompt, duration

## Noise Tab
- **What:** Procedural noise generation
- **Input:** Type selector (White, Pink, Brown, Blue, Violet noise)
- **Button:** "Generate"
- **Backend:** `POST /instruments/noise` with noise_type, duration, amplitude

## Removed tabs
- **Music (ACE-Step text-prompt generation) and Bark (non-verbal sound tags) were removed
  2026-08.** Music/SFX bed generation now goes through `POST /generate/sfx` (Stable Audio Open).
  Freesound browsing lives in `Workspace/SoundEffectsView.tsx`.

## Agent Callable
- **MCP Tools:** `21labs.generate_sfx`, `21labs.generate_music`, `21labs.play_piano_note`, `21labs.play_synth_note`, `21labs.play_drum_pad`, `21labs.generate_noise`
- **REST Endpoints:** `POST /generate/sfx`, `POST /generate/music`, `POST /instruments/piano`, `POST /instruments/synth`, `POST /instruments/drum`, `POST /instruments/noise`, `GET /dsp/capabilities`, `POST /dsp/synth`, `POST /dsp/effect`
- **Key Backend Files:** `backend/routes/generate.py`, `backend/routes/instruments.py`, `backend/routes/dsp.py`, `backend/services/instruments.py`, `backend/services/dsp_synth.py`
- **Key Frontend Files:** `app/src/components/Workspace/StudioView.tsx`, `app/src/components/Workspace/SoundEffectsView.tsx`, `app/src/components/Workspace/DspView.tsx`