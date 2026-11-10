# Speed, Effects & Streaming Plan

## 1. Speed Up to First Audio (Streaming TTS/STT)

### Current State
- TTS backends generate full audio before returning (batch mode)
- STT backends process full audio before returning transcription
- Frontend waits for complete response before playback

### Plan
- Streaming TTS: Add SSE/WebSocket endpoints for backends that support it (Kokoro, Pocket-TTS, Orpheus, Qwen3-TTS). Return audio chunks as generated; frontend plays first chunk while rest streams.
- Streaming STT: Moonshine and Parakeet already support streaming. Add streaming endpoints for Whisper/Faster-Whisper using chunked processing.
- Frontend: Use MediaSource Extensions (MSE) or Web Audio API streaming. Fall back to batch for non-streaming backends.
- First-audio latency target: <500ms for TTS, <1s for STT

### Files to modify
- backend/backends/protocols.py — add stream() method
- backend/backends/kokoro_backend.py, pocket_tts_backend.py, orpheus_backend.py — implement streaming
- backend/api/routes/tts.py, backend/api/routes/stt.py — add SSE endpoints
- app/src/features/voices/ — streaming playback
- app/src/lib/api/client.ts — streaming response handling

## 2. Global Speed Increase (Model Loading & Inference)

### Current State
- Models load on first use (lazy loading)
- No model caching/prefetching
- ONNX models use default execution provider
- GGUF models use subprocess per generation

### Plan
- Model preloading: Load default model on app startup in background thread
- ONNX optimization: CPUExecutionProvider + arena_extend_strategy + graph_optimization_level: ORT_ENABLE_ALL
- GGUF optimization: --n-gpu-layers auto-detection; persistent server process instead of subprocess per call
- Quantization: Prefer Q4_K_M for GGUF; INT4 for ONNX where available
- Model loading tags: Add preload_priority (0-3) to ModelConfig; load high-priority models first
- Parallel loading: Load TTS and STT models concurrently on startup

### Files to modify
- backend/backends/protocols.py — add preload_priority to ModelConfig
- backend/backends/configs/*.py — set preload priorities
- backend/backends/base.py — implement preload + caching
- backend/main.py — startup model preloading
