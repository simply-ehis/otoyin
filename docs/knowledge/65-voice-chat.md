# Voice Chat — Speech-to-Speech Agent

PURPOSE: Real-time voice agent pipeline (VAD→STT→LLM→TTS) with tool calling, barge-in, streaming, memory, and OpenAI Realtime-compatible endpoint.
OWNS: backend/services/vad.py, backend/services/voice_chat.py, backend/routes/voice_chat.py, backend/routes/realtime.py, backend/services/observability.py, app/src/stores/voiceChatStore.ts, app/src/components/VoiceChat/
READ-WHEN: Touching voice chat pipeline, VAD, voice agent, real-time speech, tool confirmation, or OpenAI Realtime protocol.
KEY-FILES: backend/services/vad.py (Silero VAD), backend/services/voice_chat.py (pipeline core), backend/routes/voice_chat.py (WebSocket), backend/routes/realtime.py (OpenAI Realtime), backend/services/observability.py (metrics), app/src/stores/voiceChatStore.ts (frontend state), app/src/features/voiceChat/VoiceChatOverlay.tsx (UI)
INVARIANTS: All audio 16kHz mono float32 PCM; VAD singleton per process; barge-in cancels playback; tool confirmation waits up to 30s; rate limiter enforces global/per-client/concurrent limits; partial transcripts best-effort.
GOTCHAS: SQLAlchemy 1.4 vs 2.0 mismatch in models.py blocks test imports (pre-existing); route processing uses asyncio.create_task to allow confirm_tool/deny_tool during LLM call; MockWebSocket raises Exception("Connection closed") on empty queue.
UPDATED: 2026-08-05

## Architecture

```
Client (WebSocket) ──→ voice_chat.py route ──→ voice_chat.py service
                          │                        │
                          │   VAD (Silero v5)       │
                          │   ↓                     │
                          │   STT (whisper/qwen)    │
                          │   ↓                     │
                          │   LLM (tool calling)    │
                          │   ↓                     │
                          │   TTS (qwen/kokoro)     │
                          │   ↓                     │
                          ←── response ──────────────
```

## Pipeline Steps

1. **VAD** (`backend/services/vad.py`): Silero v5 with energy fallback. Detects speech start/end. `_model_load_failed` flag prevents slow retry loop.
2. **STT** (`_transcribe_audio`): Transcribes accumulated audio buffer. Sends partial transcripts every ~250ms during speech.
3. **LLM** (`_generate_llm_response`): Generates response with optional tool calling. Destructive/confirmation tools prompt user before executing.
4. **TTS** (`_synthesize_speech` / `_synthesize_speech_streaming`): Converts text to audio. Streaming yields base64 PCM chunks.

## WebSocket Protocol

**Client → Server:**
- `start` — Initialize session (language, system_prompt, stt_model, tts_engine, enable_tools)
- `audio` — Send audio chunk (base64 float32 PCM array)
- `cancel` — Cancel current response (barge-in)
- `confirm_tool` / `deny_tool` — Respond to tool confirmation prompt
- `end` — End session

**Server → Client:**
- `started` — Session created (session_id)
- `speech_started` / `speech_ended` — VAD events
- `partial_transcript` — Live transcription during speech
- `processing` — LLM/TTS processing started
- `response` — Final response (text, response, audio, audio_chunks)
- `audio_delta` — Streaming audio chunk
- `audio_done` — Streaming complete
- `tool_confirmation` — Tool needs user approval (tool_name, tool_args, reason)
- `error` — Error message
- `ended` — Session ended

## OpenAI Realtime Endpoint

`backend/routes/realtime.py` — Compatible with OpenAI Realtime API clients. Translates between Realtime protocol and voice_chat service.

## Observability

`backend/services/observability.py` — Lightweight in-process metrics:
- Per-session and global counters (STT/LLM/TTS calls, errors, barge-ins, tool confirms/denials)
- Timing (avg ms per pipeline step)
- Endpoint: `GET /voice-chat/metrics`

## Tool Confirmation Flow

When the LLM calls a destructive or confirmation-required tool:
1. `_execute_tool_call` creates an `asyncio.Future` on the session
2. Route sends `tool_confirmation` message to client
3. Route continues receiving WebSocket messages while awaiting the future
4. Client sends `confirm_tool` or `deny_tool`
5. Future resolves, tool either executes or returns denial to LLM
6. Timeout after 30s = denial

## Rate Limiting

`backend/services/rate_limiter.py` — `RateLimiter` class:
- Global session limit (10)
- Per-client session limit (2)
- Concurrent processing limit (3)
- Rate limits: 0.5s voice, 0.3s realtime

## Frontend

- `voiceChatStore.ts` — Zustand store: WebSocket, mic capture, reconnection, audio levels, tool confirmation state
- `VoiceChatOverlay.tsx` — Mic button, audio-reactive waveform, live/partial transcript, settings, history, tool confirmation UI, mobile responsive
- `VoiceChatSettings.tsx` — STT/TTS/LLM provider/model selection, persisted via VoiceChatSettings table
- `ConversationHistoryBrowser.tsx` — Browse/delete past voice conversations

## Tests

- `test_vad.py` — 9 tests (VAD detection, energy fallback, singleton)
- `test_voice_chat.py` — 22 tests (session mgmt, energy, tool confirmation, processing)
- `test_voice_chat_e2e.py` — 11 tests (full session lifecycle, realtime protocol)
- `test_realtime.py` — 17 tests (Realtime protocol format, inbound messages, state)
- `test_observability.py` — 15 tests (metrics, recording, timers)

## Agent Callable
- **MCP Tools:** (voice chat is a WebSocket session, not individual MCP calls)
- **REST Endpoints:** `GET /voice-chat/status`, `GET /voice-chat/sessions`, `GET /voice-chat/metrics`, WebSocket: `ws(s)://{host}/voice-chat/ws`
- **Key Backend Files:** `backend/services/voice_chat.py`, `backend/services/vad.py`, `backend/routes/voice_chat.py`, `backend/routes/realtime.py`
- **Key Frontend Files:** `app/src/features/voiceChat/VoiceChatOverlay.tsx`, `app/src/features/voiceChat/VoiceChatSettings.tsx`, `app/src/features/voiceChat/ConversationHistoryBrowser.tsx`, `app/src/stores/voiceChatStore.ts`
