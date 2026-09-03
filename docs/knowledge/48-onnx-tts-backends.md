# ONNX TTS Backends (real, torch-free)

PURPOSE: The five TTS engines that run torch-free via ONNX Runtime in otoyin, how each is vendored, and the registration/availability contract the factory uses to pick ONNX-first then fall back to torch (or raise when there is no torch path).
OWNS: backend/backends/_f5_tts_onnx.py, backend/backends/f5_tts_onnx_backend.py, backend/backends/_pocket_tts_onnx.py, backend/backends/pocket_tts_onnx_backend.py, backend/backends/_styletts2_onnx.py, backend/backends/styletts2_onnx_backend.py, backend/backends/kokoro_onnx_backend.py, backend/backends/_moss_tts_nano_onnx.py, backend/backends/moss_tts_nano_onnx_backend.py
READ-WHEN: You add/edit an ONNX TTS backend, debug a wrong tensor shape, or change engine selection in __init__.py.
KEY-FILES: __init__.py (get_tts_backend_for_engine — ONNX-first dispatch), base.py (is_model_cached, model_load_progress), the *_onnx_backend.py wrappers, the _<model>_onnx.py vendored engines. Deep-dive on the MOSS engine + pipeline: docs/knowledge/49-moss-tts-nano-onnx.md.
INVARIANTS: Each ONNX backend is a thin async wrapper around a vendored `_<model>_onnx.py` engine that is a FAITHFUL port of upstream C++/Python source — no invented tensor names. `is_onnx_available()` gates the ONNX path. Four of the five (kokoro/f5_tts/pocket_tts/styletts2) fall back to a torch backend when the ONNX path is unavailable; MOSS-TTS-Nano has NO torch fallback and the factory raises a clear ValueError instead. Generation is weights-gated: import/availability is tested, not fake audio. Output convention is mono 24 kHz (matches load_audio/save_audio); MOSS natively emits 48 kHz stereo and the wrapper downmixes + resamples.
GOTCHAS: StyleTTS2 ONNX consumes PRECOMPUTED style/predictor embeddings (ref_s.bin/ref_p.bin) — the upstream runtime cannot derive them from arbitrary audio without the full torch model, so cloning needs those .bin files (or the bundled default speaker). Pocket-TTS and MOSS-TTS-Nano need `sentencepiece` (now declared in backend/requirements.txt) so `is_onnx_available()` returns False until it is installed. F5/Pocket/MOSS need vocab/tokenizer assets cached beside the .onnx. ChatTTS has NO vendored ONNX path — it is torch-only by design (no canonical pure-ONNX ChatTTS with verified I/O exists).
UPDATED: 2026-07-18

## The five ONNX backends

| Engine | Vendored engine | Upstream source | ONNX graphs | Availability gate | Torch fallback? |
|---|---|---|---|---|---|
| kokoro | (kokoro_onnx lib) | thewh1teagle/kokoro-onnx | kokoro-v1.0.onnx + voices-v1.0.bin | kokoro_onnx importable + files cached | yes |
| f5_tts | `_f5_tts_onnx.py` | DakeQQ/F5-TTS-ONNX | F5_Preprocess / F5_Transformer / F5_Decode | onnxruntime + jieba + pypinyin | yes |
| pocket_tts | `_pocket_tts_onnx.py` | KevinAHM/pocket-tts-onnx | mimi_encoder / text_conditioner / flow_lm_main / flow_lm_flow / mimi_decoder | onnxruntime + sentencepiece | yes |
| styletts2 | `_styletts2_onnx.py` | DDATT/StyleTTS2-onnx-cpp | plbert_simp / bert_encoder / final_simp | onnxruntime (+ espeak-ng for phonemizer) | yes |
| moss_tts_nano | `_moss_tts_nano_onnx.py` | OpenMOSS/MOSS-TTS-Nano (ort_cpu_runtime + onnx_tts_runtime) | prefill / decode_step / local_decoder / local_*_frame / codec_encode / codec_decode / codec_decode_step | onnxruntime + sentencepiece | **no — factory raises** |

## Vendoring rule (constitution)
Each `_<model>_onnx.py` is a verbatim port of the upstream inference path:
- F5: preprocess → transformer NFE Euler loop → decode, with the exact tensor names from huggingfacess/F5-TTS-ONNX + vocab.txt from SWivid/F5-TTS.
- Pocket-TTS: mimi encode → text condition → flow-LM AR loop (main+flow) → mimi decode, ported from KevinAHM/pocket-tts-onnx (int8/fp32 resolver).
- StyleTTS2: eSpeak IPA phonemize → plbert_simp → bert_encoder (transposed) → final_simp, ported from DDATT/StyleTTS2-onnx-cpp including the 174-entry IPA `_symbol_to_id` map and attention-mask logic.
- MOSS-TTS-Nano: SentencePiece tokenize → prefill (global_hidden + KV) → local AR frame decode loop → codec_decode, ported from OpenMOSS/MOSS-TTS-Nano with torchaudio replaced by soundfile+librosa for ref-audio encode. See 49-moss-tts-nano-onnx.md.

## Factory dispatch (ONNX-first)
`get_tts_backend_for_engine(engine)` tries the ONNX backend when `is_onnx_available()` is True AND `_is_model_cached()` passes; otherwise (for the four engines with a torch path) it lazy-imports the torch backend. The wrapper sets `is_onnx_available()` to False when a hard dependency (e.g. sentencepiece for Pocket-TTS/MOSS) is missing, forcing the torch fallback without raising. MOSS-TTS-Nano has no torch backend — when its ONNX path is unavailable the factory raises a ValueError instructing the user to install the ONNX assets.

## Quantization / precision (smart fallback)
All five ONNX engines resolve each graph through `_onnx_precision.resolve_session_path`, which picks the best precision available on disk in this order: **int8 → fp16 → fp32**. The chosen precision is logged with a warning so low-RAM hosts know what loaded. Upstream int8 availability today: only **Pocket-TTS** ships `_int8.onnx` for every graph. MOSS-TTS-Nano, StyleTTS2, F5-TTS, and Kokoro ship fp32 only, so they resolve to fp32 (no fp16 files exist upstream either). ORT CPU cannot *execute* fp16, so fp16 (if ever present) is upcast to fp32 at runtime — int8 is the only precision that actually cuts CPU cost + resident RAM. RAM estimates (CPU fp32, resident while loaded): Kokoro ~0.4 GB, F5 ~0.4 GB, StyleTTS2 ~0.5 GB, Pocket-TTS ~0.8–1.2 GB, MOSS-TTS-Nano ~1.5–2.5 GB (TTT net + codec net + 7 sessions). int8 roughly halves the weight-driven portion. Weights are fetched once from HF and cached; not bundled, not re-downloaded per use.

## Verification
- **Structural only**: no model weights are bundled, so tests assert imports succeed, `is_onnx_available()` returns the expected bool, the backend delegates to its vendored engine, and generate() is wired (not executed without weights).
- The smoke test `backend/tests/test_onnx_backend_registration.py` covers all five engines (MOSS via a dedicated test asserting the factory raises when assets are absent).

## Agent Callable
- **MCP Tools:** `21labs.speak` (uses ONNX backends when profile engine is kokoro/f5_tts/pocket_tts/styletts2)
- **REST Endpoints:** `POST /generate` (with `engine: "kokoro"|"f5_tts"|"pocket_tts"|"styletts2"`)
- **Key Backend Files:** `backend/backends/kokoro_onnx_backend.py`, `backend/backends/f5_tts_onnx_backend.py`, `backend/backends/pocket_tts_onnx_backend.py`, `backend/backends/styletts2_onnx_backend.py`, `backend/backends/protocols.py`
- **Key Frontend Files:** `app/src/components/Generation/EngineModelSelector.tsx`
