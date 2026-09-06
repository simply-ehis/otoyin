# Build Summary

otoyin is a multi-platform desktop application for professional audio post-production. Forked from Voicebox (MIT, 21k+ stars), extended with a full DAW-style editor, pitch correction, voice effects chain, live voice changer, ADR mode, and otoyin integration.

## Tech Stack

- **Frontend:** React 18, TypeScript, TanStack Router, Tailwind CSS 4, Framer Motion, Zustand
- **Backend:** Python 3.11+, FastAPI, PyTorch, MLX (Apple Silicon), faster-whisper (CTranslate2), llama-cpp / GGUF (LFM2.5 LLM)
- **Desktop:** Tauri v2 (Rust), multi-window IPC
- **Audio:** wavesurfer.js, RNNoise, pedalboard, librosa
- **Build system:** Vite, Bun workspaces, PyInstaller

## Project Structure

- `app/` — React frontend application (Tauri desktop)
- `web/` — Web build variant (browser)
- `backend/` — Python FastAPI backend server
- `tauri/` — Tauri desktop shell (Rust)
- `landing/` — Marketing landing page (Next.js)
- `docs/` — Documentation site (Fumadocs)
- `data/` — User-generated data

## Requirements

- Node.js 18+
- Python 3.11+ (3.12+ preferred)
- Rust (for Tauri builds)
- Windows: Visual Studio 2022 Build Tools
- macOS: Xcode Command Line Tools

## Build Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install JS dependencies |
| `just setup-python` | Create venv + install Python deps |
| `just dev` | Run backend + Tauri desktop |
| `just dev-web` | Run backend + web app |
| `just build` | Build server binary + Tauri app |
| `just build-web` | Build web frontend |
| `just test` | Run Python tests |

## Architecture

Three layers:
1. **Voicebox Foundation** — Tauri+Rust shell, DAW timeline, 11 TTS engines, voice cloning (MIT, inherited)
2. **otoyin Sidecar** — Waveform editing, pitch map, effects chain, instruments, ADR, session management, batch queue (built)
3. **otoyin Integration** — Tauri IPC events, timeline sync, project data exchange, audio return

## Model Backends (all on-device)

| Modality | Protocol | Factory | Engines |
|----------|----------|---------|---------|
| TTS | `TTSBackend` | `get_tts_backend()` | Qwen3-TTS, Kokoro, Piper, XTTS v2, Chatterbox, Chatterbox Turbo, LuxTTS, Fish Speech, Hume TADA, Qwen CustomVoice, MLX/PyTorch |
| STT | `STTBackend` | `get_stt_backend()` | faster-whisper (transformers-Whisper fallback) |
| LLM | `LLMBackend` | `get_llm_backend()` | LFM2.5 (230M / 350M / 1.2B-Instruct, q4_K_M) + LFM2-700M |
| Music / SFX | `MusicBackend` | `get_music_backend()` | ACE-Step (song), Stable Audio Open (SFX); Bark for non-verbal sounds |

## Agent Control (MCP)

The FastAPI process also mounts an MCP server at `/mcp` (Streamable HTTP). Registered
tools (110 total, `21labs.*` namespace) let an LM agent drive the whole app: `21labs.speak`, `.transcribe`,
`.list_captures`, `.list_profiles`, `.generate_music`, `.generate_sfx`,
`.generate_sound`, `.list_sounds`, `.list_models`, `.bounce`, `.run_recipe`,
`.master_audio`, `.arrange_music`, `.conversation_auto_duck`. The `21labs-mcp`
shim bridges stdio clients (Claude/Cursor) to the HTTP endpoint.
