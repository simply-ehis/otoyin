# Backend Performance & Porting Plan (Part 2)

## 3. Python Runtime to Rust Porting

### Problem
- App ships full Python runtime (PyInstaller bundle, 500MB+)
- Python process uses 60-80% CPU on this laptop
- PyInstaller bundle includes entire standard library + all dependencies
- Memory overhead: Python interpreter + GC + GIL contention

### Phase A: Identify Python-Heavy Paths
- Profile with py-spy or cProfile to identify hot paths
- Likely culprits: torch inference, onnxruntime, whisper (CTranslate2), audio processing

### Phase B: Port Critical Paths to Rust
- TTS inference: Port to llama.cpp via Rust FFI (llama-cpp-rs crate) - Rust native
- STT inference: Port to whisper.cpp / sherpa-onnx via Rust FFI - remove Python wrapper
- Audio processing: Port to Rust using symphonia or rodio crates
- Effects: Port to Rust using pedalboard via FFI (or pure Rust audio effects crates)
- API server: Replace FastAPI/uvicorn with axum (Rust) - async, high performance

### Phase C: Reduce Python Footprint
- Remove PyTorch dependency for TTS/STT paths where ONNX/GGUF alternatives exist — BUT keep PyTorch for VC models AND TTS models that require torch (voice conversion and some TTS backends require torch; cannot be avoided)
- Remove Python numpy/scipy where Rust equivalents exist (use Rust audio libraries)
- Use PyInstaller --exclude-module to strip unused modules
- Target: reduce bundle from 500MB+ to <100MB for builds without torch-dependent models; builds with VC or torch-based TTS retain PyTorch

### Phase D: Full Native Backend (Long-term) — Prefer Rust
- Rewrite backend in Rust (Tauri already uses Rust, no new toolchain needed):
  - llama.cpp via Rust FFI (llama-cpp-rs crate) for LLM/TTS inference
  - whisper.cpp / sherpa-onnx via Rust FFI for STT
  - axum (Rust) for HTTP server (async, high performance)
  - serde_json for JSON
  - rusqlite for database
- Use C/C++ libraries via FFI only where no Rust crate exists (llama.cpp is C++ natively — that's fine as an external lib, just not our own code)
- Frontend communicates via HTTP/WebSocket (no change needed)
- Rust advantages: memory safety, async/await, single binary, Tauri integration, no GC overhead

### Architecture Comparison

| Component | Current (Python) | Target (Rust + FFI) |
|-----------|-----------------|---------------------|
| HTTP Server | FastAPI + uvicorn | axum (Rust) |
| TTS | Python + torch/onnx | llama.cpp via Rust FFI (ONNX/GGUF); torch retained for torch-based TTS |
| STT | Python + whisper/sherpa | whisper.cpp / sherpa via FFI |
| Effects | Python + pedalboard | pedalboard via FFI |
| Database | SQLAlchemy + SQLite | rusqlite (Rust) |
| Model Mgmt | Python + huggingface_hub | Rust HTTP client (reqwest) |
| Memory | 500MB-2GB | 50-200MB |
| CPU | 60-80% (Python GIL) | 5-20% (native) |
| Startup | 3-11s | <1s |
| Bundle Size | 500MB+ | <100MB |

### Implementation Order (Revised)

1. Week 1: Lazy engine imports + engine-needed detection (Python, quick win)
2. Week 2: Cold start server pattern for GGUF models (Python, medium effort)
3. Week 3: Profile Python hot paths with py-spy (identify top offenders)
4. Week 4: Port STT to sherpa-onnx via Rust FFI (remove Python wrapper)
5. Week 5: Port TTS to llama.cpp via Rust FFI (remove torch/onnx Python)
6. Week 6: Port audio processing + effects to Rust
7. Week 7: Port HTTP server to Rust (axum, Tauri sidecar)
8. Week 8: Remove Python runtime entirely, bundle as native binary

### Quick Wins (can do immediately in Python)
1. Lazy import torch/onnx/sherpa only when needed
2. Add engine-needed detection (skip loading if no models use it)
3. Cold start llama.cpp server with 0 models
4. Use --exclude-module in PyInstaller to strip unused modules
5. Profile with py-spy to identify actual hot paths

### Key Insight
The solution is not to optimize Python - it is to replace Python with native code where it matters most (inference, audio processing, HTTP serving). The frontend (React/TypeScript) stays unchanged since it communicates via HTTP/WebSocket regardless of backend language.
