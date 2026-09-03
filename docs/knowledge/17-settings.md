# 17 — Settings

## General Settings
- **Where:** `app/src/components/ServerTab/GeneralPage.tsx`
- **Documentation link:** `docs.otoyin.app/21-labs`

## Server Settings
- **Where:** `app/src/components/ServerTab/ServerTabPage.tsx`
- **Features:** Server connection status, URL configuration, health check

## Audio Settings
- **Where:** `app/src/components/ServerTab/AudioChannelsPage.tsx`
- **Features:** Audio input/output device selection, channel configuration

## Model Management
- **Where:** `app/src/components/ServerSettings/ModelManagement.tsx`
- **Features:** Download status, storage usage, model descriptions

## Accessibility Settings
- **Where:** `backend/routes/health.py` → accessibility permission checks
- **macOS:** `check_accessibility_permission`, `open_accessibility_settings`
- **Input monitoring:** `check_input_monitoring_permission`, `open_input_monitoring_settings`

## Hotkey Configuration
- **Where:** `app/src/components/ServerTab/HotkeySettings.tsx` (if exists)
- **Rust:** `enable_hotkey`, `disable_hotkey`, `update_chord_bindings`

## Agent Callable
- **MCP Tools:** `21labs.cuda_status`, `21labs.cuda_download`, `21labs.telemetry_status`, `21labs.telemetry_toggle`
- **REST Endpoints:** `GET /settings/captures`, `PUT /settings/captures`, `GET /settings/generation`, `PUT /settings/generation`, `GET /settings/assistant`, `PUT /settings/assistant`, `GET /health`, `GET /backend/cuda-status`, `POST /backend/download-cuda`, `GET /telemetry/status`, `POST /telemetry/toggle`
- **Key Backend Files:** `backend/routes/settings.py`, `backend/routes/health.py`, `backend/routes/cuda.py`, `backend/routes/phase2.py`, `backend/services/settings.py`
- **Key Frontend Files:** `app/src/components/ServerTab/GeneralPage.tsx`, `app/src/components/ServerTab/GenerationPage.tsx`, `app/src/components/ServerTab/CapturesPage.tsx`, `app/src/components/ServerTab/GpuPage.tsx`, `app/src/components/ServerTab/MCPPage.tsx`, `app/src/components/ServerTab/ApiKeysPage.tsx`, `app/src/stores/serverStore.ts`
