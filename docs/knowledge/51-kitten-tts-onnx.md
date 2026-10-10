---
PURPOSE: KittenTTS ONNX backend — the lightest-weight TTS engine in otoyin (lighter than Kokoro), torch-free, CPU-only.
OWNS: backend/backends/_kitten_tts_onnx.py, backend/backends/kitten_tts_onnx_backend.py, backend/backends/configs.py (kitten-tts-mini), registry.py (kitten_tts), protocols.py (TTS_ENGINES).
READ-WHEN: You touch the KittenTTS engine, its voices, checkpoint selection, or the "lighter than Kokoro" requirement.
KEY-FILES:
  - _kitten_tts_onnx.py — vendored ONNX pipeline: TextCleaner symbol table, _build_input_ids (phonemize->tokenize->wrap [0,...0]), KittenTTSOnnx session wrapper.
  - kitten_tts_onnx_backend.py — async wrapper; available_voices, generate(text, voice_prompt), create_voice_prompt (preset only, no clone), combine_voice_prompts (unsupported -> silent).
  - configs.py — ModelConfig kitten-tts-mini (size_mb=80, 8 preset voices, langs=[en]).
INVARIANTS:
  - ONNX-only: NO torch backend exists (factory raises ValueError if onnxruntime/assets absent). Registry mirrors moss_tts_nano's no-fallback path.
  - Checkpoint size selectable via env KITTEN_SIZE: mini (80M, default) / micro (40M) / nano (15M). All under KittenML org; same inference contract.
  - 8 preset voices only: Bella, Jasper, Luna, Bruno, Rosie, Hugo, Kiki, Leo (Leo = default expr-voice-5-m). NO cloning, NO voice mixing (combine_voice_prompts returns silence).
  - Native 24 kHz mono output — no resampling needed (project standard).
  - Phonemization uses espeak via `phonemizer` when importable; otherwise falls back to raw-text cleaning (graceful, logged). espeak is NOT a hard dependency.
  - Token contract: input_ids int64 [1,N] wrapped with 0 start/end; style float32 [1,256] selected by min(len(text), rows-1); speed float32 [1]. Output trimmed of trailing 5000 samples.
GOTCHAS:
  - `is_onnx_available()` only checks onnxruntime (Cheaper than Kokoro which also needs kokoro_onnx wheel). No sentencepiece needed.
  - Real audio requires the 80MB+ HF download (mini). Tests mock InferenceSession + numpy.load; they do NOT download weights.
   - Upstream `generate` default voice is expr-voice-5-m (Leo); we expose friendly names and resolve via config.json voice_aliases.
UPDATED: 2026-07-19
---

## Agent Callable
- **MCP Tools:** `21labs.speak` (uses kitten_tts engine)
- **REST Endpoints:** `POST /generate` (with `engine: "kitten_tts"`)
- **Key Backend Files:** `backend/backends/kitten_tts_onnx_backend.py`
- **Key Frontend Files:** `app/src/features/generate/Composer.tsx`