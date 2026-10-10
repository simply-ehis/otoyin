# 17 — Settings

## General Settings
- **Where:** `app/src/features/settings/GeneralPage.tsx`
- **Documentation link:** `docs.otoyin.app/21-labs`

## Server Settings
- **Where:** `app/src/features/settings/GeneralPage.tsx` (connection + backend port rows)
- **Features:** Server connection status, URL configuration, serving-port setting with save-and-restart, health check

## Audio Settings
- **Where:** channel/device selection under the audio features (`app/src/features/`)
- **Features:** Audio input/output device selection, channel configuration

## Model Management
- **Where:** Marketplace Store (`app/src/features/store/`)
- **Features:** Download status, storage usage, model descriptions

## Accessibility Settings
- **Where:** `backend/routes/health.py` → accessibility permission checks
- **macOS:** `check_accessibility_permission`, `open_accessibility_settings`
- **Input monitoring:** `check_input_monitoring_permission`, `open_input_monitoring_settings`

## Hotkey Configuration
- **Where:** `app/src/features/settings/ShortcutsPage.tsx`
- **Rust:** `enable_hotkey`, `disable_hotkey`, `update_chord_bindings`

## Agent Callable
- **MCP Tools:** `21labs.cuda_status`, `21labs.cuda_download`, `21labs.telemetry_status`, `21labs.telemetry_toggle`
- **REST Endpoints:** `GET /settings/captures`, `PUT /settings/captures`, `GET /settings/generation`, `PUT /settings/generation`, `GET /settings/assistant`, `PUT /settings/assistant`, `POST /settings/assistant/reload-planner`, `GET /settings/server`, `PUT /settings/server`, `GET /health`, `GET /backend/cuda-status`, `POST /backend/download-cuda`, `GET /telemetry/status`, `POST /telemetry/toggle`
- **Key Backend Files:** `backend/routes/settings.py`, `backend/routes/health.py`, `backend/routes/cuda.py`, `backend/routes/phase2.py`, `backend/services/settings.py`
- **Key Frontend Files:** `app/src/features/settings/GeneralPage.tsx`, `app/src/features/settings/GenerationPage.tsx`, `app/src/features/settings/CapturesPage.tsx`, `app/src/features/settings/GpuPage.tsx`, `app/src/features/settings/MCPPage.tsx`, `app/src/features/settings/ApiKeysPage.tsx`, `app/src/features/assistant/AssistantSettings.tsx`, `app/src/stores/serverStore.ts`
- **Deferred-apply contract:** planner `context_tokens` / `kv_quant` / `gpu_layers` take effect at llama-server load only. `GET /settings/assistant` reports live (`planner_loaded`, `loaded_*`) vs effective values; the UI shows a reload notice with a one-click `reload-planner` (stateless unload — next chat reloads). Serving `port` (`GET/PUT /settings/server`, persisted in `app_settings`) takes effect after backend restart; launchers resolve CLI flag > env > persisted setting > 17493 (`backend/main.py:resolve_server_port`), and the Tauri sidecar tracks the port in state for spawn/probes/URLs (`server.rs:current_port`).
