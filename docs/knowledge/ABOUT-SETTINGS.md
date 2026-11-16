# About: Settings Tab

> **PURPOSE:** Reference for the Settings tab — settings sub-tabs for app/server configuration.
> **OWNS:** Settings navigation, all sub-tab pages
> **READ-WHEN:** Working on settings, configuration, API keys, MCP setup
> **KEY-FILES:** `ServerTab.tsx`, `GeneralPage.tsx`, `ApiKeysPage.tsx`, `SettingsLayout.tsx`
> **INVARIANTS:** settings sub-tabs; some are Tauri-only (GPU, Logs)
> **GOTCHAS:** GPU and Logs tabs only visible in Tauri desktop mode
> **UPDATED:** 2026-08-07

## Overview

Settings has the sub-tabs listed below for configuring the application and backend server.

## Settings Navigation

| Tab | Route | Description |
|---|---|---|
| General | `/settings` | Server URL, updates, network, docs links |
| Generation | `/settings/generation` | Default TTS/music/STT/LLM engines, generation params |
| Captures | `/settings/captures` | STT configuration, capture settings |
| MCP | `/settings/mcp` | MCP server configuration |
| Coding Agents | `/settings/coding-agents` | Connect local ACP coding agents, run hidden sessions, browse history (see `93-acp-coding-agents.md`) |
| GPU | `/settings/gpu` | GPU/device selection (Tauri only) |
| Logs | `/settings/logs` | Server logs viewer (Tauri only) |
| Shortcuts | `/settings/shortcuts` | Keyboard shortcut configuration |
| Timecode | `/settings/timecode` | Timecode display format |
| Scripting | `/settings/scripting` | Scripting API configuration |
| Plugins | `/settings/plugins` | VST3/plugin hosting |
| Lottie Export | `/settings/lottie-export` | Lottie animation export settings |
| Telemetry | `/settings/telemetry` | Opt-in telemetry settings |
| API Keys | `/settings/api-keys` | API key management (BYOK) |
| About | `/settings/about` | App version, credits |

## General Page

| Button | Action |
|---|---|
| Save (server URL) | Save updated server URL |
| Documentation | Open docs.21labs.app |
| Discord | Open Discord invite |
| Keep Server Running | Toggle server persistence |
| Network Access | Toggle remote/local mode |
| Check for Updates | Check new version |
| Download Update | Download available update |
| Restart and Install | Restart app and install update |

## API Keys Page

| Button | Action |
|---|---|
| + Add (per domain) | Add new API key provider |
| Set as default | Set provider as default for domain |
| Delete | Delete provider configuration |
| Save | Save new provider |
| Cancel | Cancel adding provider |

### Supported Domains

- OpenAI
- ElevenLabs
- Anthropic
- FreeSound
- STT (speech-to-text)

## Agent Callable
- **MCP Tools:** `21labs.cuda_status`, `21labs.cuda_download`, `21labs.telemetry_status`, `21labs.telemetry_toggle`
- **REST Endpoints:** `GET /settings/captures`, `PUT /settings/captures`, `GET /settings/generation`, `PUT /settings/generation`, `GET /settings/assistant`, `PUT /settings/assistant`, `GET /health`, `GET /backend/cuda-status`, `POST /backend/download-cuda`
- **Key Backend Files:** `backend/routes/settings.py`, `backend/routes/health.py`, `backend/routes/cuda.py`, `backend/services/settings.py`
- **Key Frontend Files:** `app/src/features/settings/GeneralPage.tsx`, `app/src/features/settings/GenerationPage.tsx`, `app/src/features/settings/CapturesPage.tsx`, `app/src/features/settings/GpuPage.tsx`, `app/src/features/settings/MCPPage.tsx`, `app/src/features/settings/CodingAgentsPage.tsx`, `app/src/features/settings/ApiKeysPage.tsx`
