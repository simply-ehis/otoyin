# 32 — STT Backends

PURPOSE: Speech-to-text model registry — Whisper, Parakeet, Qwen3-ASR, and other STT engines with multilingual support.
OWNS: STT backend loading/unloading, model selection, language detection, transcription pipeline.
READ-WHEN: You touch transcription, STT model loading, or language support.
KEY-FILES: backend/backends/stt/, backend/routes/transcription.py, backend/services/stt_factory.py
INVARIANTS: Parakeet and Qwen3-ASR are C++ backends (fast, multilingual); Whisper remains for English-only legacy; model selection is dynamic based on language.
GOTCHAS: Parakeet requires ONNX runtime; Qwen3-ASR requires transformer runtime. Both are heavier than Whisper but much more accurate for multilingual.
UPDATED: 2026-08-21

## Agent Callable

| Feature | MCP Tool | REST Endpoint | Key Files |
|---------|----------|---------------|-----------|
| Transcribe | `21labs.transcribe` | `POST /transcribe` | `backend/routes/transcription.py` |
| List STT models | `21labs.list_models` | `GET /models/status` | `backend/routes/models/status.py` |
| Load STT model | `21labs.models_load` | `POST /models/load` | `backend/routes/models/load_unload.py` |
| Unload STT model | `21labs.models_unload` | `POST /models/unload` | `backend/routes/models/load_unload.py` |

## STT Backend Comparison

| Backend | Languages | Speed | Accuracy | Size | Backend Type |
|---------|-----------|-------|----------|------|--------------|
| Whisper small.en | English | ★★★★★ | ★★★ | 461 MB | ONNX |
| Whisper medium.en | English | ★★★★ | ★★★★ | 1.5 GB | ONNX |
| **Parakeet** | **100+** | **★★★★★** | **★★★★★** | **1.2 GB** | **C++** |
| **Qwen3-ASR** | **50+** | **★★★★** | **★★★★★** | **2.4 GB** | **C++** |
| Whisper large-v3 | 100+ | ★★★ | ★★★★★ | 3.1 GB | ONNX |

### Recommended Model Selection

| Use Case | Recommended | Why |
|----------|-------------|-----|
| English dictation | Whisper small.en | Fast, accurate for English |
| Multilingual (top accuracy) | Parakeet | Best WER across languages, C++ speed |
| Multilingual (broadest) | Qwen3-ASR | 50+ languages, strong accuracy |
| Legacy English only | Whisper medium.en | Well-tested fallback |

## Language Support

### Parakeet (100+ languages)
- **Tier 1** (best accuracy): English, Chinese, Japanese, Korean, Spanish, French, German, Portuguese, Russian, Arabic
- **Tier 2** (good): Hindi, Thai, Vietnamese, Turkish, Polish, Dutch, Italian, Swedish, Norwegian, Danish
- **Tier 3** (acceptable): Most other languages with decent training data

### Qwen3-ASR (50+ languages)
- **Strengths**: Chinese, Japanese, Korean, Southeast Asian languages
- **Weaker**: Some European languages where Parakeet excels
- **Unique**: Better handling of code-switching (mixed languages in one clip)

## Backend Loading

### Dynamic Selection
```python
def select_stt_backend(language: str, available_models: list) -> str:
    """Select best STT backend for given language."""
    if language == "en" and "whisper-small.en" in available_models:
        return "whisper-small.en"  # Fast for English
    if "parakeet" in available_models:
        return "parakeet"  # Best multilingual
    if "qwen3-asr" in available_models:
        return "qwen3-asr"  # Broad coverage
    return "whisper-large-v3"  # Fallback
```

### GPU vs CPU
- **Parakeet**: GPU recommended (C++ CUDA kernels), CPU fallback available
- **Qwen3-ASR**: GPU recommended, CPU slower but works
- **Whisper**: Works well on CPU, GPU optional

## C++ Backend Integration

Both Parakeet and Qwen3-ASR are C++ backends for maximum performance:

| Aspect | C++ Backend | Python Backend |
|--------|-------------|----------------|
| Inference speed | ★★★★★ | ★★★ |
| Memory usage | ★★★★ | ★★★ |
| Model loading | Fast (compiled) | Slow (interpreted) |
| GPU utilization | ★★★★★ | ★★★ |
| Multilingual | ★★★★★ | ★★★★ |

### Backend Registration
```python
# In backend/backends/stt/__init__.py
STT_BACKENDS = {
    "whisper-small.en": WhisperSTTBackend,
    "whisper-medium.en": WhisperSTTBackend,
    "whisper-large-v3": WhisperSTTBackend,
    "parakeet": ParakeetSTTBackend,  # C++
    "qwen3-asr": Qwen3ASRBackend,   # C++
}
```
