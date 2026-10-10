# Core Model / Runtime Audit

PURPOSE: Audit otoyin's pre-installed/core pieces (the "always there" deps + bundled model artifacts) for version staleness and better alternatives — items already confirmed ONNX-first (DeepFilterNet, Kokoro) plus Whisper/STT, spaCy G2P, the LLM runtime, and the shared ML runtime underneath.
OWNS: backend/requirements.txt, backend/build_binary.py, backend/backends/whisper_cpp_backend.py, backend/backends/kokoro_backend.py (+ kokoro_onnx_backend.py), backend/services/{deepfilter_cleanup,deepfilter_onnx,noise_reduction}.py, backend/backends/lfm_gguf_backend.py, backend/utils/platform_detect.py, docs/knowledge/48-onnx-tts-backends.md.
READ-WHEN: You change requirements, the frozen-binary wheel collection, the STT model choice, the LLM inference engine, or add/remove a torch-free ONNX backend.
KEY-FILES: backend/requirements.txt (pins), backend/build_binary.py (frozen-binary bundling), backend/services/noise_reduction.py (DeepFilterNet ONNX-first dispatch via deepfilter_onnx → deepfilter_cleanup fallback), backend/utils/platform_detect.py (backend selection), docs/knowledge/48-onnx-tts-backends.md (ONNX-first dispatch contract).
INVARIANTS: Everything stays offline/on-device, CPU-first, torch is OPTIONAL — the torch-free ONNX path is the preferred default for denoise + ONNX TTS, never the other way around. Anything that breaks the ONNX path must fail loud, not silently degrade.
GOTCHAS: torch and torchaudio MUST ship as a matched minor pair (e.g. torch 2.5.1 ↔ torchaudio 2.5.1) — loose floors let the resolver mismatch them. numpy is capped `<2.0` because DeepFilterNet 0.5.6's transitive deps require it, which in turn constrains the torch floor (newer torch wheels often expect numpy>=2 unless the CPU/index wheel is used). llama-cpp-python is a C-extension that bundles llama.cpp — its floor matters for GGUF feature parity, not ABI compat. onnxruntime is imported in 15+ files but was undeclared here before this audit (now fixed in backend/requirements.txt).
UPDATED: 2026-08-01

Scope: "pre-installed / core" = things the app declares, bundles, or assumes present at install. Excludes the per-engine downloadable TTS/VC *model weights* (those live in the configs catalog and were reviewed separately under item #1 of WHATS_NEXT.md). Findings below are ordered by impact.

## Findings

| # | Piece | Declared at | Pin | Latest | Status | Better alternative? | Action |
|---|-------|-------------|-----|--------|--------|---------------------|--------|
| 1 | pywhispercpp (STT via whisper.cpp) | backend/requirements.txt:18 | `pywhispercpp>=1.5.0` | 1.5.0 (2026-05-30) | Current | openai-whisper / faster-whisper both drag in PyTorch (heavier, worse for offline CPU) — pywhispercpp is the right call | None. Quality note: default model is `tiny.en` (~75MB); `base.en`/`small.en` add real accuracy if the STT picker exposed a size selector — flag to product, no dep change |
| 2 | DeepFilterNet (speech denoiser) | backend/requirements.txt:101 | `deepfilternet==0.5.6` | 0.5.6 (2023-08-31) | Current | RNNoise (obsolete — DF replaced it here); noisereduce (spectral gating, non-neural) | None. App already prefers the DeepFilterNet3 ONNX path (`soniqo/DeepFilterNet3-ONNX`, `services/deepfilter_onnx.py`) over the torch path (`deepfilter_cleanup.py`); the latter needs the `torchaudio.backend` shim in deepfilter_cleanup.py:22 |
| 3 | spaCy `en_core_web_sm` (G2P support for misaki) | backend/requirements.txt:73 + bundled in build_binary.py:239-244 | wheel `en_core_web_sm-3.8.0` | spaCy lib 3.8.14; `sm` model 3.8.0 is the latest `sm` release for the 3.8 series | Current/bundled | spaCy is overkill vs a lighter tokenizer, but misaki.en expects its pipelines — replacing it would require re-verifying all G2P languages | None. Note: the spaCy *library* itself is pulled in transitively (via kokoro/misaki) and is NOT pinned — minor hygiene gap, not a staleness risk |
| 4 | Kokoro (torch TTS) + misaki (G2P) | backend/requirements.txt:69-78 | `kokoro>=0.9.4`, `misaki[en,ja,zh]>=0.9.4` | kokoro 0.9.4 (latest on the `kokoro` PyPI pkg); misaki 0.9.4 | Current | `kokoro-tts` (v2.3.1, different author) is a CLI fork, NOT a drop-in — its import namespace is `kokoro_tts`, so switching would break `from kokoro import KPipeline` in kokoro_backend.py. App prefers Kokoro ONNX anyway | None |
| 5 | torch / torchaudio (ML framework) | backend/requirements.txt:10-11 | `torch>=2.2.0`, `torchaudio>=2.2.0` | 2.13.0 (2026-07-08) | Stale floor + conflict | No lighter alternative for the torch-dependent engines (StyleTTS2, ChatTTS, F5-TTS torch path, etc.) | Recommend: pin a matched pair (e.g. `torch==2.5.1` / `torchaudio==2.5.1`) and keep `numpy<2.0` until DeepFilterNet moves. Needs install + test matrix — see Proposals |
| 6 | llama-cpp-python (local LLM infer) | backend/requirements.txt:107 | `llama-cpp-python>=0.3.0` | 0.3.34 (2026-07-12) | Stale floor | No alternative for on-device GGUF LLM infer here | Recommend: tighten to `>=0.3.18,<0.4.0` (modern llama.cpp, still stable `Llama(...)` API). Needs install verification — see Proposals |
| 7 | ONNX Runtime (shared torch-free runtime) | **was undeclared** | — | 1.28.0 (2026-07-25); docs assumed "1.27.0 already installed" | Gap (fixed) | None — it IS the right runtime for the torch-free path | **Applied**: declared `onnxruntime>=1.17.0` in backend/requirements.txt:91 |
| 8 | SentencePiece (ONNX tokenizers) | backend/requirements.txt:89 | `sentencepiece>=0.2.0` | 0.2.x | Current | None | None (precedent for why onnxruntime should be declared too — now is) |
| 9 | LFM2.5 / LFM2 GGUF weights (downloaded, not pre-installed) | backend/backends/configs.py:470-511 | catalog: LFM2.5-230M/350M/1.2B, LFM2-700M (Q4_K_M) | LiquidAI ships newer LFM2.5-3B-Instruct GGUF upstream | Out of audit scope (downloadable weights) | If a larger local LLM is wanted, verify LFM2.5-3B GGUF RAM budget before adding to catalog | Flag as a separate catalog task |

## Applied change — #7 (onnxruntime)

**What**: Added `onnxruntime>=1.17.0` to `backend/requirements.txt` (immediately after the existing `sentencepiece` declaration, matching house style — loose floor, no upper bound).

**Why it's safe**: ONNX Runtime is already imported in 15+ files (`deepfilter_onnx.py:31/51`, `kokoro_onnx_backend.py`, `f5_tts_onnx_backend.py:37`, `pocket_tts_onnx_backend.py:39`, `styletts2_onnx_backend.py:41`, `moss_tts_nano_onnx_backend.py:41`, `kitten_tts_onnx_backend.py:35`, `neutts_backend.py:77`, `stem_separation_onnx.py:25/42`, `_pocket_tts_onnx.py:27`, `_moss_tts_nano_onnx.py:30`, `_f5_tts_onnx.py:26`, `_styletts2_onnx.py:262`, `_kitten_tts_onnx.py:104`) and gated by `is_onnx_available()` throughout. It was already effectively a required dep (the ONNX backends are the *preferred* path in the factory dispatch documented at docs/knowledge/48-onnx-tts-backends.md:29), it just wasn't declared — so fresh installs were silently falling back to torch (or failing for MOSS-TTS-Nano, which has no torch path). The knowledge doc 48 already treats this as an implicit assumption ("is_onnx_available() gates the ONNX path"); 44-vc-light-tiers-onnx.md even wrote "onnxruntime which is ALREADY installed at 1.27.0" as if manually installed. Declaring it makes the assumption explicit. Standard `InferenceSession` API is stable across the 1.17–1.28 range; minimal deps; wide compatibility. Windows-AMD GPU users can still add `onnxruntime-directml` separately (optional, not declared — matches the lazy-import design).

**What changed**: only `backend/requirements.txt` (one new block). No runtime code, no logic, no tensor contract.

## Applied (2026-08-01)

- **#5 torch/torchaudio**: the unpinned floors let pip resolver mismatch `torch`/`torchaudio` minors (ABI-coupled) and pick old torch while torchaudio is new. The `numpy>=1.24.0,<2.0` cap (forced by DeepFilterNet 0.5.6) further constrains this. Applied: `torch==2.5.1` + `torchaudio==2.5.1` (a matched, well-tested CPU pair from late 2024; compatible with the `numpy<2.0` cap and `transformers<=4.57.6`). 2.5.1 is post-2.2 but conservatively older than 2.13, reducing the chance of bumping into the numpy<2 / transformers cap conflict, yet new enough for all on-device engines.
- **#6 llama-cpp-python**: `0.3.0` (2023) bundles a llama.cpp missing GGUF-v3 polish and the Metal/DirectML perf fixes that matter for the LFM2.5 GGUF catalog (configs.py:472-511). The LFM backend only uses `Llama(model_path, n_ctx, verbose)` (`lfm_gguf_backend.py:175`) — an API stable since 0.3.0. Applied: `llama-cpp-python>=0.3.18,<0.4.0`.

## Alternatives considered & rejected

- Replacing pywhispercpp with `whisper.cpp` (the Rust/Python `whispercpp` package): identical runtime, extra indirection. pywhispercpp 1.5.0 is current and wraps whisper.cpp directly — no win.
- Replacing DeepFilterNet with `noisereduce` (spectral gating): lower quality, no deep-filtering. DF is the state-of-the-art offline denoiser and the app already has it ONNX-first. Rejected.
- Swapping the `kokoro` PyPI package for `kokoro-tts`: rejected — different import namespace (`kokoro_tts` vs `kokoro`), and the app already prefers the `kokoro-onnx` backend.
- Adding `onnxruntime-gpu`: rejected for the shared dep — the app is offline/CPU-first by design and already has the CPU EP path; GPU EP is opt-in per-session via the MLX/CUDA path in `platform_detect.py`, not a requirements change.

## Evidence sources

- PyPI versions (live, via web): pywhispercpp 1.5.0, deepfilternet 0.5.6, kokoro 0.9.4, misaki 0.9.4, spacy 3.8.14, torch 2.13.0, onnxruntime 1.28.0 (deps.dev default 1.27.0), llama-cpp-python 0.3.34.
- GitHub releases: confirmed DeepFilterNet 0.5.6 is the last release on the `0.5.x` track (2023-08-31); spaCy `en_core_web_sm-3.8.0` is the latest `sm` wheel (3.8.1 only shipped for `en_core_web_hftrf`).
- Codebase: `is_onnx_available()` gating (deepfilter_onnx.py:29, kitten_tts_onnx_backend.py:33, moss_tts_nano_onnx_backend.py:39, etc.); ONNX-first factory dispatch (docs/knowledge/48-onnx-tts-backends.md:29; registry.py:320/374); LFM GGUF API surface (lfm_gguf_backend.py:175); STT default + model table (whisper_cpp_backend.py:24-29); spaCy bundling (build_binary.py:236-244).

## Next

- Install-verify the torch and llama-cpp-python proposals before applying (#5, #6).
- Decide the STT model-size question (tiny.en vs base.en/small.en picker) as a product call, separate from deps.
- Consider adding `LFM2.5-3B-Instruct` GGUF to the LLM catalog (#9) if a larger local model is in scope.
- **FUTURE UPGRADE**: Replace `llama-cpp-python` Python binding with `llama-server.exe` subprocess. Prebuilt Vulkan binary already at `Downloads/llama-b10107-bin-win-vulkan-x64/`. Benefits: no C build dependency, process isolation, standard OpenAI API, upgradeable independently. Needs testing for Orpheus custom tokens (`<custom_token_XXXX>` via `/v1/completions`).

## Agent Callable
- **MCP Tools:** `21labs.models_list`, `21labs.cuda_status`
- **REST Endpoints:** `GET /models/status`, `GET /backend/cuda-status`
- **Key Backend Files:** `backend/requirements.txt`, `backend/backends/whisper_cpp_backend.py`, `backend/backends/kokoro_backend.py`, `backend/services/deepfilter_onnx.py`, `backend/backends/gguf_server_backend.py`
- **Key Frontend Files:** `app/src/features/store/StorePage.tsx`
