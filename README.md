# Otoyin

**Open-source AI voice studio. Premium models. No subscription.**

Otoyin is a desktop application for professional audio post-production powered by AI.
Multi-engine TTS, voice cloning, waveform editing, mixing, spatial audio, video
dubbing, podcast dialogue, and agent integration. The app is free and open-source.
Premium AI models are available in the marketplace — pay once, own forever, works offline.

Built by 21labs. Everything runs on-device; no data leaves your machine unless you
configure a BYOK provider.

---

## Why Otoyin

- **Open-source app** — All editing, effects, mixing, instruments, dubbing, dialogue tools, and the MCP server are free forever.
- **Premium models** — Better voices, music generation, advanced STT via the marketplace. Pay once, no subscription.
- **Offline-first** — Every engine runs locally (GGUF/ONNX/CPU-first). No cloud dependency for core features.
- **Agent-ready** — 202-tool MCP server plus an in-app assistant backed by a skill catalog, user custom skills, 78 dev-time skill packs and 113 knowledge docs. Works with Claude Code, Cursor, Windsurf, VS Code.
- **Cross-platform** — Windows, macOS, Linux via Tauri (macOS port in progress).

---

## Features at a glance

| Category | Highlights |
|---|---|
| **TTS & Voice** | 13-engine runtime (Kokoro, Pocket-TTS, Zonos, Qwen3-TTS, Fish S2 Pro, VoxCPM2, Moss Nano, Parler, KittenTTS, Bark, NeuTTS…), zero-shot cloning, emotion tags, voice profiles, reference-voice shelf |
| **STT & Transcription** | 5 families / 17 models (Whisper.cpp, Faster-Whisper, Moonshine incl. streaming, Parakeet 25-lang, Qwen3-ASR 52-lang), word timestamps, speaker diarization |
| **Voice Conversion** | RVC v2 packs, Seed-VC zero-shot, OpenVoice tone-color, NeuTTS/Orpheus pipelines |
| **Takes pipeline** | Capture → word-aligned packed transcript (Scribe-shaped JSON) → chapters + highlights → video-use interop (`/captures/{id}/words`, `/chapters`) |
| **Audio Editing** | Waveform editor, pitch map, 28 effects + cleanup suite, transcript-driven editing, spectrogram, audio clipboard |
| **Mixing & Mastering** | Multi-track mixer with VU meters, bus routing, auto-duck, broadcast LUFS mastering, platform export presets |
| **Dialogue** | Stories multi-track editor, audiobooks (EPUB/PDF + multi-voice cast), Conversation podcast mode, ADR, multi-take comping |
| **Dubbing** | Full video pipeline: transcribe, translate, re-voice, mux |
| **Real-time** | Live voice changer, speech-to-speech chat, streaming STT, floating dictate window with auto-paste |
| **Music & SFX** | ACE-Step, HeartMuLa, MiniMax Music 3, Stable Audio (Open + 3 Small), drum machine, GM SoundFonts, procedural instruments, songwriter composer (lyrics + beats), Freesound cloud SFX |
| **Spatial & Enhance** | 3D binaural/Doppler/convolution (Steam Audio), Demucs vocal isolation, neural enhancement + denoising with A/B compare |
| **Agents** | In-app assistant (on-device LLM), 222 MCP tools, batch queue, content recipes, automation lanes, floating video player |
| **Marketplace** | Model catalog with premium AI models. Pay once, own forever, no subscription. |

> **Full inventory:** see [FEATURES.md](FEATURES.md) — every capability verified against code.

---

## Pricing

**The app is free. The models are paid.**

| What | Cost |
|---|---|
| Otoyin app (all features) | Free, open-source |
| Starter models (Kokoro, KittenTTS, Whisper tiny/base, Moonshine, etc.) | Free |
| Premium models (Zonos, Qwen3-TTS, Fish S2 Pro, VoxCPM2, ACE-Step, etc.) | Priced per model |
| Discount packs (Pro Voice, Studio, Music, Creator Bundle) | Bundled pricing |
| Student/indie discount | 30% off |

Pay once, own forever, works offline. No subscription. See [docs/MARKETPLACE_PLAN.md](docs/MARKETPLACE_PLAN.md) for full pricing.

---

## Getting started

```bash
just setup          # Python venv + JS deps (Windows/macOS/Linux recipes)
just dev            # backend + Tauri shell
just dev-backend    # backend only (FastAPI on :17493)
```

Requires Python 3.12, Node 20, Rust stable. First launch downloads starter
models automatically; premium models come from the in-app marketplace.

---

## Architecture

- **Frontend** — React + TypeScript Tauri app (`app/`), 22 feature areas, 9 locales.
- **Backend** — FastAPI sidecar (`backend/`, 540+ endpoints) bundling every engine; ships as one binary.
- **Agents** — MCP server at `/mcp` (202 tools) + in-app assistant driven by an on-device LLM (llama.cpp sidecar).
- **Updates** — Signed Tauri updater (minisign rotation, staged rollout); adaptive window that fits your work area and remembers its size.

---

## Docs

- [FEATURES.md](FEATURES.md) — complete capability inventory
- [docs/](docs/) — knowledge base (113 docs): engine guides, workflows, troubleshooting
- [docs/OWNER_BLOCKERS.md](docs/OWNER_BLOCKERS.md) — launch checklist status
- [DEPLOY.md](DEPLOY.md) — the three deployable units (desktop, marketplace, web)
