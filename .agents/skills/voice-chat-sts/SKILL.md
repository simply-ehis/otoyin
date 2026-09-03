---
name: voice-chat-sts
description: Real-time Speech-to-Speech voice chat agent — VAD turn-taking, STT→LLM→TTS pipeline over WebSocket, barge-in, tool calling. Use when the user wants a spoken conversation with the assistant.
---
# Voice Chat STS (Speech-to-Speech)

## Purpose
Real-time voice agent: mic → Silero VAD → STT → LLM → TTS → speakers, over a
single WebSocket. Turn-taking is VAD-driven (no "push-to-talk"). Supports
barge-in (interrupt playback on new speech), streaming TTS for low latency, and
tool calling through voice.

## When to use
- User says "talk to the assistant", "voice chat", "have a conversation", or
  asks the agent a spoken question.
- The user wants the assistant to hear and respond aloud, not type.

## Prerequisites
- STT model downloaded: faster-whisper `base` or `turbo` (or whisper.cpp GGUF).
- LLM model downloaded: `planner-2b` (free default) or `planner-0.8b` (low-RAM fallback).
- TTS engine with streaming: Fish Speech, Zonos, or Kokoro.
- WebSocket endpoint: `ws://localhost:17493/voice-chat/ws`
- REST status: `GET /voice-chat/status` — returns session count, active flag.

## Pipeline (real, from `services/voice_chat.py`)
| stage | backend | notes |
|-------|---------|-------|
| VAD | Silero VAD v5 | threshold=0.3, min_speech=5 frames, min_silence=10 frames |
| STT | faster-whisper | 16 kHz mono input; barge-in cancels transcription on new speech |
| LLM | gguf_llm | jackrong Qwen3.5 via llama.cpp server; temperature default 0.7 |
| TTS | any streaming TTS | Kokoro (fast CPU), Fish Speech (multilingual), Zonos (emotion) |

Constants: `SAMPLE_RATE=16000`, `ENERGY_THRESHOLD=0.02`,
`SILENCE_FRAMES_TRIGGER=10`, `MIN_SPEECH_FRAMES=5`.

## WebSocket protocol
1. Client opens `ws://localhost:17493/voice-chat/ws`.
2. Send `{"type": "start", "language": "en", "system_prompt": "...", "stt_model": "base", "tts_engine": "kokoro"}`.
3. Server responds `{"type": "started", "session_id": "<uuid>"}`.
4. Send `{"type": "audio", "audio": [float, ...]}` — 16 kHz float32 array.
5. Server emits `{"type": "transcript", "text": "...", "partial": true/false}`.
6. Server emits `{"type": "audio", "audio": [float, ...]}` — TTS output chunk (24 kHz).
7. Send `{"type": "stop"}` to end the session.

## No-default-model policy
`create_session()` raises `MissingModelError` if a required model isn't cached.
The WebSocket handler catches it and sends:
```json
{"type": "error", "code": "missing_model", "message": "...", "recommended": "<pack_name>"}
```
The client should trigger a download of `recommended` before retrying, not
retry blindly.

## Pitfalls / Gotchas
- **Rate limit**: max 1 concurrent voice chat session (`get_voice_chat_limiter`).
  Excess connections receive `{"type": "error", "message": "session limit reached"}`.
- **Barge-in**: new speech audio cancels the current TTS playback mid-stream; the
  LLM response in flight is abandoned.
- **Partial transcripts**: emitted every 250 ms via `PARTIAL_TRANSCRIPT_INTERVAL`
  for live UI feedback; final transcript arrives as `partial: false`.
- **Offline only**: all backends are on-device; no cloud fallback.

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [tts-kokoro](../tts-kokoro/SKILL.md)
- [stt-whisper](../stt-whisper/SKILL.md)
- [llm-assistant](../llm-assistant/SKILL.md)

## Validation
- `GET /voice-chat/status` returns `{"sessions": 0, "active": false}`.
- Opening the WebSocket and sending `start` with all models cached returns
  `{"type": "started", "session_id": "..."}`.
- Missing model returns `{"type": "error", "code": "missing_model", "recommended": ...}`.
