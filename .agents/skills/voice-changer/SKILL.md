---
name: voice-changer
description: Probe the real-time, human-controlled voice changer's capabilities (pitch/formant/reverb/chorus ranges, latency). The agent only READS capabilities — it must never mutate the live audio graph. Use when asked what the voice changer can do or to report its settings.
---
# Voice Changer — Capabilities Probe

## Purpose
The Voice Changer is a **real-time, human-controlled** voice transformation
running live on the microphone (10 ms frames → effects chain → speakers). The
agent's only supported interaction is to **probe capabilities**; it must not
start, stop, or reconfigure the live graph.

## When to use
- User asks "what can the voice changer do?", "what are its pitch/formant ranges?", "what's the latency?".
- Reporting available effects/limits before a human drives the UI.

## Prerequisites
- Tool surface: MCP `21labs.voice_changer_capabilities` OR REST `GET /voice-changer/capabilities`.
- Live mode is human-controlled in `VoiceChangerView` (`/voice-changer`); the agent does not own it.

## Parameters / Schema (REAL values from `features.py`)
The probe takes **no parameters**. It returns:
| field | value | notes |
|-------|-------|-------|
| target_latency_ms | 50 | target round-trip latency |
| supported_effects | ["pitch_shift", "formant_shift", "reverb", "chorus"] | chain members |
| max_chain_length | 4 | at most 4 effects per chain |
| sample_rate | 48000 | processing rate |
| frame_size_ms | 10 | capture frame size |

UI control ranges (from `19-voice-changer.md`, for reporting only):
| control | range | step | default |
|---------|-------|------|---------|
| Pitch Shift | [-12, +12] semitones | 0.5 | 0 |
| Formant Shift | [-6, +6] semitones | 0.5 | 0 |
| Reverb Mix | [0.0, 1.0] | 0.01 | 0.3 |

## Agent procedure
1. Call `21labs.voice_changer_capabilities` (no args).
2. Report the returned ranges/effects to the user. Do **not** call any start/stop/mutate path.
3. If the user wants changes, instruct them to use the in-app Voice Changer UI.

## Worked example
```python
TWENTYLABS.voice_changer_capabilities()
# -> {"target_latency_ms":50,"supported_effects":["pitch_shift","formant_shift","reverb","chorus"],
#     "max_chain_length":4,"sample_rate":48000,"frame_size_ms":10}
```
REST:
```bash
curl http://localhost:17493/voice-changer/capabilities
```

## Pitfalls / Gotchas
- **Hard constraint (AGENTS.md): the agent may only PROBE.** It must NOT mutate the live voice-changer graph, start/stop it, or set sliders. All live control is human-driven in the app UI.
- `voice_changer_capabilities` is read-only; there is no MCP tool to alter the running chain.
- Effects live here are pitch_shift/formant_shift/reverb/chorus — a *subset* of the 10-effect chain in [effects-field-guide](../effects-field-guide/SKILL.md); do not assume EQ/compressor run live.
- `max_chain_length` is 4; longer chains are not a voice-changer feature.

## Cross-links
- [effects-field-guide](../effects-field-guide/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)

## Validation
- Probe returns JSON with `target_latency_ms`, `supported_effects`, `max_chain_length`, `sample_rate`, `frame_size_ms`.
- Confirm no audio generation occurred (capabilities endpoint is side-effect free).
