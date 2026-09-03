# 44 - VC Light Tiers & Seed-VC ONNX Deferral

VERIFIED findings (2026-07-17) on the lightweight / ONNX voice-conversion question,
and the decision to defer an ONNX backend. Pairs with `42-rvc-voice-converter.md`
(RVC) and `43b-seed-vc.md` (Seed-VC).

## The ask
A VC path that is: under ~500MB RAM, no GPU, fast on CPU, and lighter than the
heavy Seed-VC torch stack.

## Verified facts
- `rvc-python` (our RVC backend's lib) pins `numpy<=1.23.5` + `fairseq==0.12.2`
  + `faiss-cpu==1.7.3` + `torch>=2.0.0`; its `omegaconf==2.0.6` dep has broken
  metadata on pip>=24.1. Installing it into the base app downgrades numpy and
  breaks the app — must stay in a side-venv. F0 methods exposed: only
  `harvest`, `crepe`, `rmvpe`, `pm`. NO `rmvpe_onnx` / ContentVec-ONNX option,
  so the F0 stage cannot be swapped through its public API.
- Seed-VC official: PyTorch only. Community ONNX export exists via
  `thewh1teagle/seed-vc-rs` (Rust + ONNX Runtime, reputable author). No official
  OpenVINO/NCNN builds.
- `seed-vc-rs` is a RUST CRATE, not a Python package. It replaces Python+torch
  at inference but still loads the SAME Seed-VC weights (DiT + content encoder +
  BigVGAN). ONNX Runtime drops the Python/torch runtime overhead, but the MODEL
  WEIGHTS are unchanged and dominate RAM.
- Seed-VC checkpoint sizes (from Plachta/Seed-VC):
  - `seed-uvit-tat-xlsr-tiny` — 25M, 22050 Hz — the ONLY one that fits <500MB
    total (weights + ONNX Runtime ~150-300MB) on CPU.
  - `seed-uvit-whisper-small-wavenet` — 98M, 22050 Hz — needs ~1-1.5GB.
  - `seed-uvit-whisper-base` (SVC) — 200M, 44100 Hz, `f0_condition=True` —
    needs ~1.5-2GB, GPU-recommended.
  - v2 `hubert-bsqvae-small` — 67M(CFM)+90M(AR).

## RAM reality (no GPU, CPU inference)
- Seed-VC tiny-ONNX via `onnxruntime`: ~300-500MB (only the 25M model qualifies).
- Seed-VC 98M/200M ONNX: ~1-2GB — NOT a <500MB path.
- RVC (rvc_python, torch): ~3-5GB, needs side-venv; not <500MB.
- TinyVC (`uthree/tinyvc`): <400MB CPU, no GPU, but weak quality, separate lib.

## Decision (deferred)
Do NOT build an ONNX backend now. Rationale:
- `rvc_python` F0 is not swappable; full ONNX RVC = from-scratch rewrite.
- Seed-VC ONNX = real feature (export 4 components to ONNX once via torch, then
  infer via `onnxruntime` which is ALREADY installed at 1.27.0). Light only for
  the 25M tiny model.
- `seed-vc-rs` = separate Rust implementation; wiring into the Python/FastAPI
  backend needs a subprocess or PyO3 sidecar + Rust toolchain — high risk,
  conflicts with AGENTS.md "Tauri IPC only" pattern.

## Future path (when picked up)
- (A) Python ONNX backend `backends/seed_vc_onnx_backend.py`: export Seed-VC
  (start 25M tiny) to ONNX, infer via `onnxruntime`. Adding the 200M size after
  is ~30min (config + download entry + f0_condition=True). Second MODEL SIZE is
  easy; the second IMPLEMENTATION (Rust crate) is a separate multi-hour build.
- Keep `onnxruntime` (present) as the inference runtime; torch only at export time.

## GOTCHAS
- "Pure ONNX, no torch" for Seed-VC means no torch at INFERENCE; you still need
  torch ONCE to export the .pth to .onnx. The model weights' RAM cost is fixed.
- The 200M singing model cannot hit <500MB regardless of runtime. Only the 25M
  tiny model meets the light target.
- Do not install `rvc-python` into the base env (numpy downgrade breaks app).
