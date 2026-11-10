# Backend Performance & Porting Plan (Part 1)

## 1. Engine Loading Logic (Lazy Engine Init)

### Problem
- PyTorch, ONNX Runtime, Sherpa-ONNX imported/initialized at startup even when no models use them
- Importing torch takes ~3-5s and loads CUDA/cuDNN DLLs
- These imports happen even when only GGUF models are used

### Plan
- Lazy import pattern: wrap heavy engine imports in functions called only when needed
- Engine registration guard: before loading any model, check if engine is available AND if any installed model uses it
- Backend module lazy loading: only import backend modules when their model is actually loaded
- Dependency check: at startup, scan installed models and only initialize engines that are needed

### Files to modify
- backend/backends/base.py — lazy engine loading
- backend/backends/configs/*.py — add engine dependency tags
- backend/app.py — startup engine detection

### Expected Impact
- Startup time: 3s to <1s when no torch models installed
- Memory: 0 bytes for unused engines (vs 500MB-2GB currently)
- CPU: No torch/CUDA initialization overhead

## 2. Cold Start Server Pattern

### Problem
- Backend starts with all services initialized
- Model servers (llama.cpp) spawned on first use, adding latency
- No warm server ready to accept model loads

### Plan
- Cold start servers: Start lightweight server processes at backend startup with NO model loaded
- Model hot-swap: When a model is requested, load it into the already-running server
- Server pool: Maintain warm server processes ready to accept models
- Use llama-server (llama.cpp HTTP server) which supports model swapping via API

### Architecture
Backend starts -> spawns llama-server (port 8080, no model)
User requests TTS -> send model path to llama-server -> model loads in <1s
User requests STT -> send model path to sherpa server -> model loads in <1s

### Files to modify
- backend/backends/gguf_runner.py — persistent server process
- backend/backends/gguf_server_backend.py — server management
- backend/backends/base.py — server pool management
- backend/app.py — startup server initialization

### Expected Impact
- First model load: 5-10s to 1-2s (no server startup overhead)
- Subsequent model loads: 1-2s to 0.5-1s (server already warm)
