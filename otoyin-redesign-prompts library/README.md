# Otoyin

**The audio studio you actually own.**

Otoyin is a desktop application for professional audio post-production,
powered by AI you run yourself. Multi-engine text-to-speech, voice cloning,
waveform editing, mixing, spatial audio, and agent integration — in one app,
on your machine, under your control. The app is free and open-source, start
to finish. Premium AI models live in the marketplace: pay once, own forever,
run offline, no subscription creeping onto your card every month.

---

## Why Otoyin

- **Open-source app** — All editing, effects, mixing, instruments, presets,
  tools, and the MCP server are free forever.
- **Premium models** — Better voices, music generation, spatial audio via
  the marketplace. Pay once, no subscription.
- **Offline-first** — Everything runs on your machine. No data leaves your
  device unless you configure a BYOK provider.
- **Agent-ready** — Built-in MCP server (201 tools) for AI agent
  integration. Works with Claude Code, Cursor, Windsurf, VS Code.
- **Cross-platform** — Windows, macOS, Linux via Tauri.

---

## Features at a glance

| Category | Highlights |
|---|---|
| **TTS & Voice** | 15 engines (Kokoro, Fish Speech, Zonos, StyleTTS2, Qwen3-TTS, Orpheus 3B…), voice cloning, emotion tags, voice profiles |
| **STT & Transcription** | 4 engines (Whisper.cpp, Faster-Whisper, Parakeet TDT, Qwen3-ASR), streaming STT, speaker diarization |
| **Voice Conversion** | RVC v2, Seed-VC, OpenVoice — zero-shot and pre-trained voice conversion |
| **Audio Editing** | Waveform editor, pitch map (piano roll), 25+ effects, transcript-driven editing, spectrogram, audio clipboard |
| **Mixing** | Multi-track mixer with VU meters, bus routing, auto-duck, mastering to broadcast LUFS |
| **Dialogue** | Stories (multi-track editor), Audiobooks (EPUB/PDF import + multi-voice cast), Conversation mode (podcast), ADR, multi-take comping |
| **Dubbing** | Full video dubbing pipeline: transcribe, translate, re-voice, mux |
| **Real-time** | Live voice changer (sub-50ms), speech-to-speech voice chat, streaming STT, dictate window |
| **Music & SFX** | 5 engines (Stable Audio, ACE-Step, HeartMuLa, MiniMax Music), drum machine, GM instruments, 7 DSP synth engines |
| **Spatial** | 3D binaural, Doppler, convolution reverb (Steam Audio SDK) |
| **Agents** | 204-tool in-app assistant, 201 MCP tools, workflow planner, automation lanes, content recipes |
| **Marketplace** | Model catalog with premium AI models. Pay once, own forever, no subscription. |

> **Full inventory:** see [FEATURES.md](FEATURES.md) — every capability verified against code.

---

## Pricing

**The app is free. The models are paid.**

| What | Cost |
|---|---|
| Otoyin app (all features) | Free, open-source |
| Starter models (Kokoro, KittenTTS, Whisper tiny/base, etc.) | Free |
| Premium models (StyleTTS2, Qwen3-TTS, CosyVoice2, Zonos, Orpheus, ACE-Step, etc.) | $7–$23 each |
| Discount packs (Pro Voice, Studio, Music, Creator Bundle) | $31–$103 |
| Student/indie discount | 30% off |

Pay once, own forever, works offline. No subscription. See
[docs/MARKETPLACE_PLAN.md](docs/MARKETPLACE_PLAN.md) for full pricing.

---

## Getting started

### Prerequisites

- **Node.js 18+** or **Bun >= 1.0.0** (recommended)
- **Python 3.11+** (3.12+ preferred)
- **Rust** (for Tauri desktop builds)
- **just** command runner (optional — `cargo install just` or `brew install just`)
- **Windows:** Visual Studio 2022 Build Tools (for Rust compilation)

### Quick start

```bash
# 1. Install JS dependencies
bun install

# 2. Set up Python venv + backend deps
just setup-python

# 3. Run the full app (backend + Tauri desktop)
just dev

# Or run in the browser (no Tauri needed):
just dev-web
```

### Manual setup

```bash
# Backend
python -m venv backend/venv
backend/venv/Scripts/activate    # Windows
source backend/venv/bin/activate # macOS/Linux
pip install -r backend/requirements.txt

# Frontend
bun install

# Start backend
uvicorn backend.main:app --reload --port 17493

# Start frontend (in a separate terminal)
cd app && bun run dev          # Tauri desktop
# OR
cd web && bun run dev          # Web browser
```

### Commands

| Command | What it does |
|---------|-------------|
| `just dev` | Start backend + Tauri desktop |
| `just dev-backend` | Start Python backend only |
| `just dev-frontend` | Start Tauri app (backend must be running) |
| `just dev-web` | Start backend + web app (no Tauri) |
| `just setup` | Full setup (venv + JS deps) |
| `just test` | Run Python tests |
| `just build` | Build server binary + Tauri app |
| `just check` | Run all lint/format checks |

> **In progress:** the frontend stack (React → a leaner alternative) and the
> package manager (bun → npm) are both being migrated as part of an active
> redesign. This section reflects what works *today*; it'll be updated the
> moment that migration lands — see the internal `otoyin-agent-prompts`
> pack for the roadmap if you're picking up that work.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Tauri Desktop Shell (Rust)                         │
│  ┌───────────────────────────────────────────────┐  │
│  │  React Frontend (TypeScript + Tailwind)       │  │
│  │  16 tabs · 22 workspace views · 15 settings  │  │
│  │  260+ components · 13 Zustand stores          │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Python Backend (FastAPI + SQLAlchemy)         │  │
│  │  77 route modules · 85 service modules        │  │
│  │  16 TTS · 4 STT · 3 VC · 3 music · 1 LLM    │  │
│  │  MCP server (201 tools) · Voice changer (WS) │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Data Layer (SQLite + file storage)           │  │
│  │  generations · voice_profiles · channels       │  │
│  │  audiobooks · model_providers (encrypted)     │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Project structure

```
otoyin/
├── app/          — React frontend (Tauri desktop)
├── web/          — React frontend (browser variant)
├── landing/      — Marketing landing page (Next.js + Three.js)
├── backend/      — Python FastAPI server
│   ├── backends/ — TTS/STT/VC/Music engine integrations (45 modules)
│   ├── routes/   — HTTP API routes (77 modules)
│   ├── services/ — Business logic (85 modules)
│   └── database/ — SQLite ORM
├── tauri/        — Tauri desktop shell (Rust)
├── docs/         — Documentation + knowledge base
│   └── knowledge/ — Per-tool docs + TOOL-REFERENCE.md (204 assistant / 201 MCP tools)
├── .agents/skills/ — active agent skills (see folder for current set)
└── data/         — User-generated data (voices, projects)
```

---

## API

- **TOOL-REFERENCE.md** — the in-app assistant's 204-tool catalog with system prompt, recipes, and app map.
- **mcp-tools-extended.md** — the 201 MCP tools and how to connect external agents.
- **REST API** — 77 route modules on port 17493. See `backend/routes/` for the full surface.

---

## Platform notes

- **Windows:** GPU auto-detection handles NVIDIA CUDA, Intel Arc XPU, and CPU fallback. Use `check-env.bat` to verify your Rust build environment.
- **macOS (Apple Silicon):** Optimized via on-device backends. All engines run native.
- **Linux:** Ensure `webkit2gtk` is installed for Tauri builds.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, code style, and PR process.

## License

See [LICENSE](LICENSE) for details.
