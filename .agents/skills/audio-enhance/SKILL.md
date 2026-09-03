---
name: audio-enhance
description: Neural audio enhancement — Lavasr (audiosronnx) bandwidth extension + DeepFilterNet denoising. Batch or streaming. Degrades gracefully offline.
---
# Audio Enhance (Lavasr + DeepFilterNet)

## Purpose
Neural post-processing for noisy or low-bandwidth audio. Two layers:
1. **Lavasr** (via `audiosronnx`) — bandwidth extension, upsamples 8-48 kHz → 48 kHz.
2. **DeepFilterNet** (ONNX) — noise reduction / denoising.

Both are optional on-device models. If absent, enhancement degrades to pass-through
(logging a debug message) — never crashes.

## When to use
- User's recording has fan noise, static, or phone-call bandwidth.
- TTS output needs denoising before broadcast.
- Voice-changer output needs bandwidth extension.

## Prerequisites
- Models cached locally: `audiosronnx` package + Lavasr weights, `deepfilter-onnx`
  package + weights. Download size: ~50 MB combined.
- Tool surface: `POST /audio/enhance` (batch), `21labs.enhance_audio` (MCP).
- `POST /audio/voice-clean` for TTS-specific preset chain (denoise→de-ess→warmth EQ→dynamics).

## Parameters (REAL from `services/audio_enhancer.py`)
| param | values | default | notes |
|-------|--------|---------|-------|
| mode | `auto`, `lavasr`, `denoise` | `auto` | auto = lavasr + denoise |
| input | mono or stereo np.ndarray | — | converted to mono |
| sample_rate | 8000–48000 | — | input rate |

Output: `(enhanced_audio: np.ndarray, output_sample_rate: int)` — always 48 kHz.

### TTS voice-clean presets (`services/tts_enhancer.py`)
| preset | denoise | de-esser | warmth EQ | dynamics |
|--------|---------|----------|-----------|----------|
| light | ✓ | ✓ | ✓ | ✗ |
| medium | ✓ | ✓ | ✓ | ✓ |
| heavy | ✓ | ✓ | ✓ | ✓ (stronger) |

POST `/audio/voice-clean` takes `preset: "light"|"medium"|"heavy"` + `strength: 0–1`.

## Agent procedure
1. Ensure enhancement models downloaded: `21labs.models_download(model_name="lavasr")`.
2. Enhance a clip:
   - MCP: `21labs.enhance_audio(audio_base64=..., sample_rate=16000, mode="auto")`
   - REST: `POST /audio/enhance` with `{"audio": [...], "sample_rate": 16000, "mode": "auto"}`
3. For TTS cleanup: `POST /audio/voice-clean` with `{"generation_id": "...", "preset": "medium"}`.
4. If Lavasr is not installed, the call degrades gracefully (logs debug, returns
   input unchanged) — inform the user that bandwidth extension is unavailable.

## Pitfalls / Gotchas
- **Lavasr is CPU-only ONNX** — expect ~2-3× real-time on a modern desktop.
- **DeepFilterNet** requires 16 kHz input; the service auto-resamples if needed.
- **Streaming path**: `StreamingLavaSR` uses overlap-add for real-time voice-changers.
- **Not a noise gate**: DeepFilterNet removes stationary noise but won't fix clipping
  or loud background speech.
- **Degrade, don't crash**: if `audiosronnx` isn't installed, `enhance_audio(mode="lavasr")`
  raises `RuntimeError("audiosronnx is not installed")`. `mode="auto"` silently skips.

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [voice-changer-pipeline](../voice-changer-pipeline/SKILL.md)
- [tts-enhancer](../tts-enhancer/...) — if separate; otherwise covers the same chain

## Validation
- `POST /audio/enhance` with noisy 16 kHz input returns 48 kHz output.
- Missing Lavasr → call returns input unchanged (auto mode), debug log emitted.
- `POST /audio/voice-clean` applies denoise + de-ess + EQ to the generation's audio.
