---
name: voice-changer-pipeline
description: Backend voice-changer real-time pipeline — mic → VAD → denoise → transcribe → synthesize → enhance → speakers. Runs in a background thread (CPU-bound).
---
# Voice Changer Pipeline

## Purpose
The server-side real-time voice transformation pipeline that powers the in-app
Voice Changer. Transforms live mic input: capture → VAD → denoise → STT → LLM
(refactor) → TTS (cloned voice) → enhance → playback. All on-device.

> This is the backend pipeline. For the agent-facing capabilities probe (what
> effects exist, latency, sample rate), see [voice-changer](../voice-changer/SKILL.md).

## When to use
- Debugging why the voice changer output is delayed, garbled, or silent.
- Understanding the processing stages and where latency is added.
- Integrating a new TTS or denoising stage into the chain.

## Prerequisites
- Backend: `backend/voice_changer/pipeline.py` + `backend/voice_changer/server.py`.
- Endpoint: `POST /voice-changer/process` (REST, for testing) or the live
  VoiceChangerView (`/voice-changer`) for real-time mic.

## Pipeline stages (REAL from `pipeline.py:1`)
| stage | module | notes |
|-------|--------|-------|
| 1. Capture | Web Audio / Mic | 10 ms frames, 48 kHz |
| 2. VAD | Silero VAD | gate on speech presence |
| 3. Denoise | DeepFilterNet / spectral | clean mic noise |
| 4. Transcribe | faster-whisper | mic speech → text |
| 5. LLM | gguf_llm | optional: rewrite/modify text (e.g. "speak like a pirate") |
| 6. Synthesize | TTS engine | cloned voice, real-time-capable |
| 7. Enhance | tts_enhancer | post-synthesis cleanup |
| 8. Playback | Web Audio | low-latency |

## Config (`PipelineConfig` from `pipeline.py:29`)
| field | default | notes |
|-------|---------|-------|
| input_sample_rate | 48000 | |
| output_sample_rate | 48000 | |
| frame_size_ms | 10 | |
| vad_threshold | 0.3 | Silero VAD |
| target_latency_ms | 50 | round-trip budget |
| max_chain_length | 4 | effect chain limit |

## Agent procedure
- The agent only probes capabilities via `21labs.voice_changer_capabilities`
  (or `GET /voice-changer/capabilities`). It must NOT start/stop/reconfigure
  the live graph (per AGENTS.md hard constraint).
- For pipeline diagnostics, inspect `POST /voice-changer/process` with a test
  buffer to trace each stage.

## Pitfalls / Gotchas
- **CPU-bound**: `VoiceChangerPipeline.process_chunk()` is synchronous — called
  in a background thread to avoid blocking the event loop. Thread-pool size
  is capped; exceeding it drops frames.
- **Silence path**: when VAD detects silence, the pipeline outputs silence
  with exponentially-decaying energy, not hard-cut — avoids clicks.
- **Windows temp files**: the denoise stage uses `NamedTemporaryFile(delete=False)`
  + `os.unlink` in `finally` to avoid file-lock errors on Windows.
- **Warm-up**: first 200–500 ms of a session has higher latency as models load;
  this is one-shot (not every frame).

## Cross-links
- [voice-changer](../voice-changer/SKILL.md) — capabilities probe
- [engine-atlas](../engine-atlas/SKILL.md)
- [audio-enhance](../audio-enhance/SKILL.md) — enhancement stage
- [stt-whisper](../stt-whisper/SKILL.md) — transcription stage

## Validation
- `GET /voice-changer/capabilities` returns latency, effects, sample rate.
- `POST /voice-changer/process` with a test buffer returns enhanced audio.
- VAD correctly gates silence (no output for quiet input).
