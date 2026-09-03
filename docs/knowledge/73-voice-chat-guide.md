# Voice Chat (Real-Time Speech-to-Speech)

> **PURPOSE** — How the real-time voice chat agent works, configuration, and troubleshooting.
> **OWNS** — The voice chat pipeline (VAD → STT → LLM → TTS → speakers).
> **READ-WHEN** — Setting up voice chat, debugging latency, or configuring the voice agent.

## Overview

Voice Chat is a real-time speech-to-speech conversation mode. You speak into your mic, the app transcribes your speech, sends it to an LLM, generates a spoken response, and plays it back — all in a continuous loop.

## How it works

```
Mic → VAD (silence detection) → STT (Whisper) → LLM (local or cloud) → TTS (Kokoro/Chatterbox) → Speakers
```

Each stage runs in sequence:
1. **VAD** detects when you start/stop speaking (energy-based, no cloud)
2. **STT** transcribes your speech to text (faster-whisper, local)
3. **LLM** generates a response (local GGUF or cloud API)
4. **TTS** renders the response to audio (any installed engine)
5. Audio plays through your speakers

## Configuration

Open the Voice Chat settings (gear icon in the voice chat overlay):

| Setting | Options | Default | Description |
|---------|---------|---------|-------------|
| **Model** | Local GGUF / Cloud API | Local | LLM for response generation |
| **Voice** | Any voice profile | Current | TTS voice for responses |
| **TTS Engine** | Kokoro, Chatterbox, etc. | Kokoro | Which engine renders responses |
| **VAD Sensitivity** | Low / Medium / High | Medium | How easily speech is detected |
| **System Prompt** | Free text | Default assistant | Custom instructions for the LLM |
| **Max Response Length** | 50-500 tokens | 200 | Limit response length for faster turns |

## Latency breakdown

| Stage | Typical time | Bottleneck |
|-------|-------------|------------|
| VAD detection | ~50ms | Negligible |
| STT (Whisper base) | ~200-500ms | CPU/GPU |
| LLM generation | ~500-2000ms | Model size, tokens |
| TTS (Kokoro) | ~100-300ms | CPU |
| Audio playback | ~50ms | Buffer size |
| **Total round-trip** | **~1-3 seconds** | |

## Tips for lower latency

1. **Use a small LLM** — 0.8B or 2B models respond much faster than 4B+
2. **Use Kokoro TTS** — it's the fastest local engine
3. **Keep responses short** — set max tokens to 100-150
4. **Use a local model** — cloud adds ~200-500ms network latency
5. **Close other apps** — free up CPU/RAM for the pipeline

## Barge-in

You can interrupt the assistant while it's speaking. Just start talking — the VAD will detect your voice and stop the current playback. This is called "barge-in" and is enabled by default.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| No audio detected | VAD sensitivity too low | Increase sensitivity in settings |
| Assistant doesn't stop when I talk | Barge-in disabled | Enable barge-in in voice chat settings |
| Responses are too slow | Large LLM or cloud model | Switch to a smaller local model |
| Audio sounds robotic | Wrong TTS engine | Try Kokoro or Chatterbox |
| "Model not found" error | TTS model not downloaded | Download the model in Settings → Models |
| Conversation feels stilted | System prompt too restrictive | Simplify the system prompt |

## Privacy

Everything runs locally on your device. No audio is sent to any cloud service (unless you explicitly configure a cloud LLM). The VAD, STT, and TTS stages are all on-device.

## Relationship to other features

- **Voice Chat** = real-time streaming conversation
- **Generate tab** = one-shot TTS (not conversational)
- **Captures tab** = manual recording + transcription
- **Assistant panel** = text-based chat (no audio I/O)
