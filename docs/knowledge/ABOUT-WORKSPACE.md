# About: Workspace Tab

> **PURPOSE:** Reference for the Workspace tab — 24 specialized sub-views for advanced audio work.
> **OWNS:** Workspace layout, all 24 sub-views
> **READ-WHEN:** Working on workspace sub-views, adding new workspace features
> **KEY-FILES:** `WorkspaceLayout.tsx`, plus individual `Workspace/*.tsx` files
> **INVARIANTS:** Workspace is a container; each sub-view has its own controls
> **GOTCHAS:** Voice Changer and Voice Converter are separate routes, not workspace sub-tabs
> **UPDATED:** 2026-08-07

## Overview

The Workspace is a container with 24 specialized sub-tabs for advanced audio production work. Each sub-view has its own domain-specific controls.

## Sub-Tab Navigation

| Tab | Route | Purpose |
|---|---|---|
| Timeline | `/workspace` | Multi-track timeline editing |
| Pitch | `/workspace/pitch` | Pitch editing and visualization |
| Mixer | `/workspace/mixer` | Multi-track mixing console |
| Effects | `/workspace/effects` | Per-track effects chain editing |
| Studio | `/workspace/studio` | Studio recording interface |
| Voice Changer | `/voice-changer` | Real-time voice changing (separate route) |
| Voice Converter | `/voice-converter` | Voice conversion (separate route) |
| Synth / DSP | `/workspace/dsp` | Synthesizer and DSP tools |
| ADR | `/workspace/adr` | Automated dialogue replacement |
| Audio Plan | `/workspace/audio-plan` | Audio planning and scripting |
| Batch | `/workspace/batch` | Batch processing |
| Noise | `/workspace/noise-reduction` | Noise reduction |
| Enhance | `/workspace/audio-enhance` | Audio enhancement |
| Spectrogram | `/workspace/spectrogram` | Spectrogram visualization |
| Conversation | `/workspace/conversation` | Multi-speaker conversation mode |
| Export | `/workspace/export` | Export and format conversion |
| Transcript | `/workspace/transcript` | Transcript editing |
| Spatial | `/workspace/spatial` | 3D spatial audio (Steam Audio SDK) |
| Automation | `/workspace/automation` | Automation lane editing |
| Comping | `/workspace/comping` | Multi-take comping |
| Live Transcript | `/workspace/live-transcript` | Real-time transcription |
| Video | `/workspace/video` | Video preview and sync |
| Download | `/workspace/download` | Download manager |

## Notes

- Each sub-view is a separate component in `app/src/components/Workspace/`
- Some sub-views are stubs or partially implemented
- Voice Changer runs as a separate lightweight process on port 17494
- Spatial audio requires Steam Audio SDK (`data/steam-audio/phonon.dll`)

## Agent Callable
- **MCP Tools:** `21labs.bounce`, `21labs.bounce_preview`, `21labs.noise_reduce`, `21labs.normalize_audio`, `21labs.master_audio`, `21labs.separate_audio`, `21labs.analyze_loudness`, `21labs.spectrogram`, `21labs.dsp_capabilities`, `21labs.dsp_synth`, `21labs.dsp_effect`
- **REST Endpoints:** `POST /audio/bounce`, `POST /audio/bounce-preview`, `POST /audio/noise-reduce`, `POST /audio/normalize`, `POST /audio/master`, `POST /audio/separate`, `POST /audio/loudness`, `POST /audio/spectrogram`, `GET /dsp/capabilities`, `POST /dsp/synth`, `POST /dsp/effect`
- **Key Backend Files:** `backend/routes/audio.py`, `backend/routes/audio_processing.py`, `backend/routes/dsp.py`, `backend/services/mixer.py`, `backend/services/mastering.py`
- **Key Frontend Files:** `app/src/components/Workspace/WorkspaceLayout.tsx`, `app/src/components/Workspace/TimelineView.tsx`, `app/src/components/Workspace/MixerView.tsx`, `app/src/components/Workspace/EffectsView.tsx`, `app/src/components/Workspace/StudioView.tsx`, `app/src/components/Workspace/DspView.tsx`
