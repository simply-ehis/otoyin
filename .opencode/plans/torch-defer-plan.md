# Torch Deferral + ONNX/GGUF Backend Wiring Plan

## Phase 1: Defer Torch Imports at Startup ✅

### Changes to `backend/app.py`
- **Removed GPU probe** (`_get_gpu_snapshot()`) from `_bg_checks()` — deferred to first `/health` request via lazy double-checked lock cache
- **Removed STT self-check** from `_bg_checks()` — deferred to first STT use
- **Moved `_signal_ready()`** BEFORE lifecycle registration so server accepts requests immediately
- **Kept only model manifest reconciliation** in `_bg_checks()` (fast, no torch)

### Result
- Server boots in ~5 seconds instead of hanging/OOMing
- GPU probe runs lazily on first `/health` request
- Lifecycle registration deferred to first model use

## Phase 2: ONNX/GGUF Backends ✅

### New Backend Files Created
| File | Engine | Runtime | Size | Status |
|------|--------|---------|------|--------|
| `backends/zonos_gguf_backend.py` | `zonos_gguf` | CrispASR CLI | 872MB Q4_K | ✅ |
| `backends/parler_tts_gguf_backend.py` | `parler_tts_gguf` | CrispASR CLI | 900MB Q4_K | ✅ |
| `backends/rvc_onnx_backend.py` | `rvc_onnx` | ONNX Runtime | 120MB | ✅ |
| `backends/openvoice_onnx_backend.py` | `openvoice_onnx` | ONNX Runtime | 161MB | ✅ |
| `backends/acestep_gguf_backend.py` | `acestep_gguf` | acestep.cpp CLI | 7.7GB Q8_0 | ✅ |

### Config Changes
- `backends/configs/tts.py`: Added `_get_tts_gguf_configs()` with Zonos GGUF + Parler TTS GGUF
- `backends/configs/vc.py`: Added `_get_rvc_onnx_configs()` + `_get_openvoice_onnx_configs()`
- `backends/configs/__init__.py`: Added GGUF/ONNX configs to `get_all_model_configs()` and `get_tts_model_configs()`

### Registry Changes
- `backends/registry.py`: Added 2 TTS entries (`zonos_gguf`, `parler_tts_gguf`) to `ENGINE_REGISTRY`
- `backends/registry.py`: Added all 5 new engines to `_subprocess_engines` (skip VRAM check)
- `backends/registry.py`: Added `acestep_gguf` to `get_music_backend()`
- `backends/configs/__init__.py`: Added `rvc_onnx` + `openvoice_onnx` to `get_vc_backend()`

### Verified
- All 5 backends import without torch
- Server boots with 79 routers, 83 routes, zero torch at startup
- 68 total model configs (up from 59)
- Ruff clean on all new/modified files

## Architecture Summary

### ONNX/GGUF Strategy
```
BEFORE (torch-only):
  Zonos → torch 2GB
  Parler → torch 1.5GB
  RVC → torch 1.2GB
  OpenVoice → torch 800MB
  AceStep → torch 10GB
  Total: ~15.5GB torch overhead

AFTER (ONNX/GGUF preferred):
  Zonos → CrispASR CLI (872MB GGUF, no torch)
  Parler → CrispASR CLI (900MB GGUF, no torch)
  RVC → ONNX Runtime (120MB, no torch)
  OpenVoice → ONNX Runtime (161MB, no torch)
  AceStep → acestep.cpp CLI (7.7GB GGUF, no torch)
  Total: ~9.7GB, zero torch at startup
```

### Fallback Chain
- ONNX/GGUF backends are preferred (fast, small, no GPU)
- Torch fallback available for engines that need it (Seed-VC, MiniMax Music3)
- Each backend self-gates on model availability at load time

## Next Steps
1. Start dev servers and test full app flow
2. Verify ONNX/GGUF backends produce quality output
3. Add UI indicators for GGUF/ONNX vs torch variants in Model Downloads
