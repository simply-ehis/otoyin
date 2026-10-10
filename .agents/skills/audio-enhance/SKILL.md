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
- Tool surface: REST `POST /audio/enhance`; there is no `21labs.enhance_audio` MCP tool.
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
1. Use locally installed enhancement packages; enhancement weights are not Store model downloads.
2. Enhance a stored clip:
   - REST: `POST /audio/enhance` with `{"audio_path": "<stored path>", "mode": "auto"}`
3. For TTS cleanup: `POST /audio/voice-clean` with `{"audio_path": "<stored path>", "preset": "medium", "strength": 1.0}`.
4. `auto` skips unavailable stages; explicitly requesting unavailable `lavasr` raises, and a failed explicit `denoise` re-raises.

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

## Validation
- `POST /audio/enhance` with noisy input returns enhanced audio.
- Missing Lavasr → `auto`-mode call returns input unchanged, debug log emitted.
- `POST /audio/voice-clean` applies denoise + de-ess + EQ to the stored audio.
