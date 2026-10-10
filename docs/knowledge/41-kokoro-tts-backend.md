# Kokoro TTS Backend

PURPOSE: How the Kokoro-82M TTS engine works (torch + ONNX variants), its 50 voices, voice blending/custom packs, and the long-text chunking + timeout fix that prevents server hangs.
OWNS: backend/backends/kokoro_backend.py, backend/backends/kokoro_onnx_backend.py, backend/utils/chunked_tts.py, backend/venv/Lib/site-packages/kokoro/pipeline.py
READ-WHEN: You touch Kokoro generation, add/edit voices, debug a stuck/hung TTS generation, or wire a new TTS engine.
KEY-FILES: kokoro_backend.py (torch generate/_generate_chunk), kokoro_onnx_backend.py (ONNX generate/_generate_chunk), chunked_tts.py (split_text_into_chunks), __init__.py (ModelConfig + TTS_ENGINES + engine selection)
INVARIANTS: Kokoro is CPU-only here (GPU: None); output is mono 24kHz float32; voice is selected by `preset_voice_id` in the voice_prompt dict. The ONNX variant is preferred when `kokoro_onnx` is installed AND its model files are cached; otherwise the torch backend is used (lazy import).
GOTCHAS: KPipeline only splits input on newlines, so a long paragraph is fed whole to misaki G2P and can STALL — always pre-split into short sentence chunks. A Python worker thread cannot be force-killed, so the per-chunk timeout skips the chunk but the thread lingers. The ONNX `lang` code is BCP-47-ish (`en-us`/`es`/`fr`/`ja`/...), NOT the single-char `a/e/f` torch map. ONNX CRITICAL: `kokoro_onnx.Kokoro.create()` sends `input_ids` as int32 + `speed` as int32, which this model rejects — `KokoroONNXBackend._infer_chunk` drives the session directly with int64 ids + float32 style/speed. The combined `voices-v1.0.bin` lives ONLY on the GitHub release, not the HF `Heliosoph` repo.
UPDATED: 2026-07-17

## How Kokoro works (the model side)
- **KModel** (`kokoro/model.py`): a small ~82M-param AR transformer. It ingests phoneme tokens and predicts acoustic features (durations + mel-style frames) autoregressively, then a **vocoder (ISTFTNet / iSTFT)** converts those frames to a 24kHz waveform. Apache-2.0, runs on CPU in roughly realtime on capable machines.
- **G2P (grapheme→phoneme)**: `misaki` (`en.G2P` for a/b, `espeak` fallback for other langs). It phonemizes text, then `en_tokenize` chunks by phoneme count (≤510 phonemes per inference call). This G2P step is what occasionally **stalls on rare inputs** — the root of the old "generation hangs forever" bug.
- **One KPipeline per language** (`pipeline.py`): reuses a single shared KModel across languages. `lang_code` maps ISO → Kokoro code (`en→a`, `es→e`, `fr→f`, `hi→h`, `it→i`, `pt→p`, `ja→j`, `zh→z`).

## Voices (50 built-in)
`KOKORO_VOICES` (kokoro_backend.py) lists 50 preset packs across languages/genders:
American & British English (af_*/am_*/bf_*/bm_*), Spanish (ef_*/em_*), French (ff_siwis), Hindi (hf_*/hm_*), Italian (if_*/im_*), Japanese (jf_*/jm_*), Portuguese (pf_*/pm_*), Chinese (zf_*). List them at runtime via `GET /profiles/presets/kokoro`.

### Adding MORE voices than the 50 presets
1. **Voice blending (no files):** pass a comma-separated list to `voice=`, e.g. `af_bella,af_sky`. `KPipeline.load_voice` averages the style vectors (`pipeline.py:157`), giving an infinite palette of blended voices. Same mechanism works for any mix of two+ presets.
2. **Custom `.pt` voice packs:** `load_single_voice` (pipeline.py:136) accepts a filename ending in `.pt` (a Kokoro `VoicePack` tensor). Community/fine-tuned packs can be dropped in and referenced by path. otoyin's `KokoroTTSBackend.create_voice_prompt` currently always falls back to the default preset for "cloned" profiles — wiring a custom `.pt` into the profile system (accept `preset_voice_id` as a `.pt` path) is the small change needed to expose this.
3. **Other TTS engines:** the registry (`backends/__init__.py`) already supports Qwen, LuxTTS, Chatterbox(+Turbo), TADA, Fish Speech, Piper, XTTSv2 — each with its own voice/persona model. Swap `engine=` to use them.

## Long-text chunking + timeout fix (2026-07-15)
**Problem:** `KPipeline.__call__` splits only on `\n` (pipeline.py:356). A multi-sentence paragraph was fed whole to G2P, which could hang; the server's serial generation worker had no timeout, so one bad line pinned the queue forever (the failure seen during the podcast E2E test).

**Fix (kokoro_backend.py `generate`):**
- Pre-split input with `split_text_into_chunks(text, KOKORO_CHUNK_MAX_CHARS=250)` (sentence/clause boundaries) so each Kokoro call is one short sentence.
- Each chunk runs via `_generate_chunk` → `asyncio.wait_for(asyncio.to_thread(...), timeout=...)`:
  - `KOKORO_CHUNK_TIMEOUT = 120s` per chunk (multi-chunk path),
  - `KOKORO_SINGLE_TIMEOUT = 300s` for a single short sentence.
- A chunk that times out (`TimeoutError`) or errors is **skipped and logged**; remaining chunks are crossfaded back together (`KOKORO_CROSSFADE_MS=50`). A fully failed request returns 1s silence instead of hanging.
- Verified: a single hung sentence now raises `TimeoutError` (no infinite hang); a multi-chunk text skips the bad chunk and returns the rest.

**Caveat:** a stalled Python worker thread cannot be force-killed, so it lingers until it naturally exits. Under normal load chunks finish in well under a second, so thread-pool exhaustion is not a practical concern; a process-isolated worker would be the guaranteed-kill upgrade if needed.

## Performance note
On this machine (CPU only) a short sentence took ~25s (model load included on first call). That is unusually slow for Kokoro (normally near-realtime) and is environment-specific (no GPU, int/CPU kernels). Generation is gated by the serial task queue, so long texts are generated one chunk at a time.

## ONNX variant (torch-free, preferred) — 2026-07-17 VERIFIED
Plan A Tier-1 swap: run Kokoro entirely on `onnxruntime` via `kokoro-onnx`
(`thewh1teagle/kokoro-onnx`) so the torch dependency is not needed for TTS.
Implemented in `backend/backends/kokoro_onnx_backend.py`
(`KokoroONNXBackend`). **Verified working end-to-end on this host** (registry
resolves to `KokoroONNXBackend`; generation produces clean 24kHz audio;
`torch` is NOT imported at generation time).

- **Selection:** `get_tts_backend_for_engine("kokoro")` (backends/__init__.py)
  returns `KokoroONNXBackend` when `kokoro_onnx` is importable AND its model
  files are cached; otherwise it falls back to the torch `KokoroTTSBackend`.
  This keeps the torch backend as a zero-regression fallback.
- **Model files:**
  - `kokoro-v1.0.onnx` (311 MB) — from the HF mirror
    `Heliosoph/kokoro-v1.0-onnx` (an exact re-host of the official
    `thewh1teagle/kokoro-onnx` release). Resolved via `hf_hub_download`.
  - `voices-v1.0.bin` (28 MB) — the **single combined** voice bank. This file
    is ONLY published on the GitHub release
    (`thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin`);
    the `Heliosoph` HF repo does NOT contain it. The backend downloads it on
    demand into the same HF cache namespace
    (`.../snapshots/onnx-voices/voices-v1.0.bin`) and reuses it offline.
  - Do NOT use `onnx-community/Kokoro-82M-v1.0-ONNX` — it ships per-voice
    `.bin` files, not the combined `voices-v1.0.bin` the `kokoro_onnx` library
    needs via `np.load`.
- **CRITICAL GOTCHA — dtype bug:** `kokoro_onnx`'s `Kokoro.create()` passes
  `input_ids` as a Python list (→ int32) and `speed` as int32, which this model
  build rejects (`input_ids` must be **int64**, `style`/`speed` must be
  **float32**). `KokoroONNXBackend` therefore drives the ONNX session directly
  in `_infer_chunk` (reusing the library's `.tokenizer` + `.voices` +
  `.sess`), building `{"input_ids": int64, "style": float32[1,256], "speed":
  float32[1]}` with `tokens = [[0, *tokens, 0]]`. Using `k.create()` raises
  `INVALID_ARGUMENT: Unexpected input data type (int32 vs float)`.
- **G2P:** misaki/espeak runs inside `kokoro_onnx` (torch-free). `lang` uses
  BCP-47-ish codes via `ONNX_LANG_MAP` (`en→en-us`, etc.); the torch
  single-char map does NOT apply.
- **Resilience:** reuses `split_text_into_chunks`, `concatenate_audio_chunks`
  and the identical per-chunk `asyncio.wait_for` timeout/graceful-skip as the
  torch backend, so long-text handling is unchanged.
- **Parity note:** true SNR parity vs the torch backend requires the torch
  `kokoro-v1_0.pth` model (not currently cached here), so a quantitative A/B
  is still pending. The ONNX output is verified as valid, intelligible,
  non-clipping speech at the correct 24kHz/float32 spec.

## Performance note
On this machine (CPU only) a short sentence took ~25s (model load included on first call). That is unusually slow for Kokoro (normally near-realtime) and is environment-specific (no GPU, int/CPU kernels). Generation is gated by the serial task queue, so long texts are generated one chunk at a time.

## Agent Callable
- **MCP Tools:** `21labs.speak` (uses kokoro engine when profile is kokoro-based)
- **REST Endpoints:** `GET /profiles/presets/kokoro`, `POST /generate` (with `engine: "kokoro"`)
- **Key Backend Files:** `backend/backends/kokoro_backend.py`, `backend/backends/kokoro_onnx_backend.py`, `backend/utils/chunked_tts.py`
- **Key Frontend Files:** `app/src/features/generate/Composer.tsx`
