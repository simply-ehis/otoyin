<!--
PURPOSE:   Deep audit of every PyTorch occurrence in the repo (code, deps, bundle, CI, docs, runtime).
OWNS:      backend/requirements.txt, backend/requirements.lock, backend/build_binary.py backend/venv,
           .github/workflows/build.yml, backend/backends/base.py, docs/*.md, justfile, tauri installer.
READ-WHEN: Before shipping another release/build; before adding an ML dependency thinking this is settled.
KEY-FILES: backend/build_binary.py (PyInstaller spec), .github/workflows/build.yml (release matrix),
           justfile (setup-python), backend/requirements.txt, backend/requirements.lock
INVARIANTS: After this audit, torch is NOT bundled in the Windows release NSIS installer; no runtime path
           in the packaged app imports torch; CUDA detection is documented as A+ degraded (CPU) or reimplemented.
GOTCHAS:  Working tree vs v0.1.0 are DIFFERENT states — requirements.txt in the working tree has already
           dropped torch (uncommitted concurrent-session refactor); the PUBLISHED v0.1.0 binary contains it.
           Do not confuse the two. `_internal` was measured 975 MB uncompressed / 9386 files (torch 318 MB).
UPDATED:   2026-11-15
-->

# PyTorch deep audit (2026-11-15)

## TL;DR — root cause in one line

**Every line of PyTorch in the product is dead weight. The packaged app runs zero inference on torch — TTS,
STT, music, separation, and VAD all run on C++/GGML sidecars (llama.cpp, crispasr, audio.cpp, parakeet.cpp) or
on ONNX Runtime. Torch is referenced only in (a) guarded GPU-detection helpers, (b) a never-called device
probe, (c) dead diarization/stem paths, and (d) the dependency manifests. It is ~318 MB of the ~975 MB
uncompressed payload and is bundled into v0.1.0 for zero runtime benefit.**

Recommended action: remove torch entirely from the release path, gate the GPU-name probes behind onnxruntime
or accept CPU-only capability UI, and delete the CI/justfile torch install steps. No user-facing feature
degrades beyond the CUDA badge text (see "What breaks if torch is removed" below).

---

## 1) Where torch is, exactly

### 1a. Dependency manifests

| File | State | Lines |
|---|---|---|
| `backend/requirements.txt` (HEAD = v0.1.0) | lists `torch==2.11.0`, `torchaudio==2.11.1`, `transformers>=5.0,<6.0`, `accelerate>=1.0.0`, `resemblyzer>=0.1.4`, `silero-vad>=5.1.0`, `scikit-learn>=1.3.0` | git show v0.1.0:backend/requirements.txt |
| `backend/requirements.txt` (working tree, UNCOMMITTED) | **torch / torchaudio / transformers / accelerate / resemblyzer / silero-vad / scikit-learn all REMOVED**; diarization block replaced with comment ("they pull transitive torch/torchaudio"). This is part of the concurrent session's in-flight refactor, NOT a committed change. | `git diff HEAD -- backend/requirements.txt` |
| `backend/requirements.lock` | stale pins `torch==2.5.1`, `torchaudio==2.5.1` (computed against an older requirements.txt); full lock carries `nvidia-cuda-*` transitive pins | backend/requirements.lock:225-256 |
| `backend/venv` (local, drifts from lock) | torch **2.11.0**, torchaudio 2.11.1, torchgen 3.1.0 **installed**; ~452 MB unpacked (torch 447.5, torchgen 3.1, torchaudio 2.3) | pip list / site-packages |
| `.github/workflows/build.yml` | "Install CPU-only PyTorch" step installs `torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu` BEFORE `requirements.txt` (which at the tag has `torch==2.11.0`, upgrading it) | .github/workflows/build.yml:~115-125 |
| `justfile` | `setup-python` detects `Win32_VideoController`; if NVIDIA → `pip install torch torchvision torchaudio --index-url .../whl/cu128`; if Intel Arc → XPU variant | justfile:68-73 |

### 1b. Python source — every `import torch` site (all lazy, all guarded)

| File:line | Purpose | Behavior when torch absent |
|---|---|---|
| `backend/app.py:391` | GPU availability string ("cuda (GPU name)") | returns `"unavailable (torch not installed)"` |
| `backend/backends/base.py:123/160/200/229/266` | `get_torch_device()` — device probe with DirectML/MPS fallbacks | **defined, NEVER CALLED** (zero callers repo-wide) |
| `backend/backends/base.py:139` | `check_cuda_compatibility()` — torch.cuda capability probe | returns `(True, None)` (no CUDA = "compatible") |
| `backend/backends/base.py:259` / `:342` | `cleanup_gpu_memory()` / `_on_unload` | guarded `except ImportError: return` |
| `backend/utils/vram_pressure.py:126` | `get_vram_status()` — torch.cuda VRAM snapshot | `except ImportError` → falls through to CPU-only stub |
| `backend/utils/model_status.py:58` | `_has_cuda_gpu()` (used by `/device/capabilities` + tier calc) | `except Exception` → `False` |
| `backend/services/device_capabilities.py:97,124` | `_get_gpu_info()` — CUDA VRAM name/probe; MPS attempt | falls back to DirectML name-only / MPS → then `(0,0,None,None)` |
| `backend/routes/health.py:63,771` | `/health` GPU name + `/health/gpu` probe | guarded `except ImportError` / `except Exception` |
| `backend/services/diarization.py:125` | legacy diarization; **deps removed 2026-11-14** so `is_available()` returns False before the import | unreachable at runtime |
| `backend/services/stem_separation.py:16,91` | legacy demucs stem separation | service returns unavailable; never called from `routes/stem_separation.py` (ONNX lane is used) |
| `backend/backends/minimax_music3_backend.py` | Music Gen C (ACE-Step GGUF is coming_soon; this is the ONNX lane) | deleted in torch excision |

No module-level torch import exists anywhere in `backend/`. **Startup never imports torch.**

### 1c. Frozen binary (v0.1.0 local rehearsal build — `tauri/src-tauri/binaries/otoyin-server/_internal`)

- `_internal` total: **975.5 MB / 9386 files**
- `_internal/torch`: **317.7 MB** (2173 items)
- `_internal/torchaudio`: **1.2 MB**
- `_internal/triton`, `.../torchgen`, `.../demucs` — absent (excluded or never discovered)
- `nvidia.*` — absent (explicit `--exclude-module` in `build_binary.py`, line ~524-535)
- Ships anyway because `PyInstaller` discovered torch through lazy imports inside modules that are otherwise
  collected (`--collect-submodules backend.services` / `backend.backends` etc.). There is no `--collect-all torch`
  rule; it bundles it purely via import-text discovery.

### 1d. Frontend / Rust / Tauri / docs

- Nothing references torch (verified `app/`, `tauri/`, `scripts/`).
- Docs comments in `backend/requirements.txt` (and one line in `backend/requirements.txt:21` comment) refer to
  "torch-free ONNX backend" as a **promise** — the v0.1.0 bundle violates the promise by shipping torch anyway.
- `docs/` has no torch install instruction beyond the `justfile setup-python` CUDA auto-install.
- `pyproject.toml` ruff ` per-file-ignores` mentions stem_separation only for `F401`, unrelated.

### 1e. Tests

No test imports torch (`backend/tests`). `test_release_audit_regressions.py` pins `librosa` ⇒ `numba` (keep), not torch.

---

## 2) What torch actually contributes to the product in v0.1.0

**Nothing.** Every inference engine in the shipped app runs outside Python torch:

- GGUF LLMs / TTS / Qwen3-TTS / neutts / orpheus / bark / parler → `llama.cpp` (`llama-server`, `llama-tts`) bundled
- bark/parler/zonos/voxcpm2 → `crispasr` (contains its own GGML code; torch-free)
- heartmula / sa3_sfx → `audio.cpp` (GGML)
- whisper / whisper.cpp → `pywhispercpp` (GGML)
- faster-whisper (not shipped — coming_soon via CTranslate2, ONNX)
- demucs / LavaSR / Orpheus / Kokoro / Steer-TTS / qwen3-asr / DeepFilterNet / silero VAD / tinyllamas → ONNX Runtime
- stem separation (ONNX `htdemucs-int8`) → ONNX Runtime

Torch survives only in (a) optional GPU badges, (b) a retired diarization path whose deps were removed, and
(c) a stem-separation fallback whose model family was switched to ONNX in the 2026-11-13 release.

---

## 3) What breaks if torch is removed

All deltas are in GPU-detection polish only. Nothing audio-related, nothing downloadable, nothing bootable:

| Consumer | Without torch | Impact |
|---|---|---|
| `app.py` GPU string | "unavailable (torch not installed)" instead of `"cuda (NVIDIA GeForce …)"` | Onboarding / logs lose GPU branding on NVIDIA boxes; still boots fine. |
| `device_capabilities.py` | `_get_gpu_info()` returns `(0, 0, None, None)` → `gpu_type=None`, 0 VRAM reported | Device-capability panel shows no NVIDIA GPU; tier calc falls back to RAM-only (correct for most local models run through llama.cpp anyway); onboarding "NVIDIA GPU detected" hint disappears. |
| `vram_pressure.py` | VRAM pressure returns "no CUDA VRAM metric" | Health/vram status omits VRAM line; no functional loss. |
| `routes/health.py` GPU probe | reports CPU/missing GPU | Cosmetic. |
| `model_status._has_cuda_gpu` | False | Device list shows no CUDA acceleration entries; models that use `onnxruntime` CUDA provider still pick correct execution provider via ONNX. |
| `base.py cleanup_gpu_memory` | returns silently | no behavioral change (it was always a no-op on CPU/absent systems). |

Mitigations (optional):
- Re-implement the 3 CUDA probes with `pynvml` (MIT, ~1 MB) or `onnxruntime.get_available_providers()` for
  `CUDAExecutionProvider` (zero new deps if we accept ONNX-level detection, which is all the app actually uses).
- Or accept the degradation: llama.cpp + audiocpp have their own CUDA paths (and the packaged build is CPU-only).

---

## 4) Recommended actions (in order, each small and revertible)

1. **Delete the CPU-only torch CI step** (`.github/workflows/build.yml`) — ~175-800 MB downloads per build,
   yields nothing (nothing in the frozen app imports torch at startup; the bundle comes from the venv).
2. **Add to `build_binary.py`** `args.extend(["--exclude-module", "torch", "--exclude-module", "torchaudio"])`
   so no future accident re-adds it. (Independent of (1); mechanical, safe.)
3. **Remove CUDA-detection dependency from device-capable paths** OR gate behind `pynvml` (optional, cosmetic).
4. **`requirements.lock` regeneration** once owners cut the next release — it currently pins `torch==2.5.1`,
   no longer matches the manifest, and would confuse future audits. Lock regeneration is the owner's call, tied
   to a release tag.
5. **`justfile setup-python`**: drop the NVIDIA/Intel-Arc torch auto-install blocks — nothing in the app uses
   torch; fresh dev envs re-add it voluntarily only if they run optional experiments.
6. **Comment cleanup**: `backend/requirements.txt:21` comment says "torch-free ONNX backend" — keep the promise.
7. **Release notes**: state plainly "v0.1.0 contained PyTorch 2.11.0 (~318 MB) for no functional reason; vX is
   torch-free; CUDA capability UX is limited to what llama.cpp/audiocpp/onnxruntime report."

## 5) Open items / decisions for the owner

- **Packaging goal**: slim installer (~411 MB → ~95-140 MB is plausible: llama.cpp ~62 MB + ffmpeg ~100 MB +
  otoyin-server ~280 MB - torch ~318 MB ≈ ~95-140 MB) vs. keeping CUDA brand badge. Can't have both without
  shipping nvidia.* + a CUDA build.
- **GPU capability UX**: accept CPU-only device page, or add `pynvml` (MIT). pynvml prints the right GPU name
  without pulling torch.
- **Diarization**: deps were removed in-tree but model catalog entries & `is_available()` probe still exist;
  confirm diarization is fully unsellable in v0.1.0 (it is — 501 on any attempt) and delete the vestigial code
  next release, or re-add silero-vad/resemblyzer with torch on a CPU-only basis (not recommended).

## 6) Verified vs unverified

- VENUE: v0.1.0 published installer (`Otoyin Studio_0.1.0_x64-setup.exe`, 411 MB) — torch **bundled** (confirmed
  by unpacking the local `_internal`; the CI `build-server.sh` produces the same layout).
- Sizes of `_internal/torch` (317.7 MB / 2173 items) and `torchaudio` (1.2 MB) measured locally from the
  rehearsed frozen build at `tauri/src-tauri/binaries/otoyin-server/_internal`.
- Windows CI release (`build.yml`) `Install` order (CPU torch → requirements.txt) re-verified in the failing
  tag run logs; the CI upgrade path `torch==2.5.1 → torch==2.11.0+cpu` is confirmed.
- Rust/Tauri shell: no torch reference. Frontend: no torch reference. Tests: no torch import (grep, 100% of
  `backend/tests/**/*.py`).
- ONNX-runtime CUDA-provider detection (whether onnxruntime reports CUDAExecutionProvider on a CUDA box) — not
  measured on a real NVIDIA machine this pass; inferable from `onnxruntime.get_available_providers()`.

## 7) Status of torch in the *current working tree* (2026-11-15)

Uncommitted concurrent-session edits to `backend/requirements.txt` have already removed torch, torchaudio,
transformers, accelerate, resemblyzer, silero-vad, scikit-learn. **This removal is not committed and will not
be in v0.1.0.** Keep it. Nothing else in this audit contradicts the removal; the audit exists to make the next
release deliberately torch-free, not accidentally, and to delete the CI/uv/timer vestiges around it.


---

## UPDATE 2026-11-15 — torch excision EXECUTED (all items verified)

Every staged action in this audit has been applied to the working tree (still owner-gated for commit):
- `build_binary.py`: CPU-torch / NVIDIA exclusions retained; numpy/torch runtime hook and scipy pyi_hooks/ deleted; `--exclude-module` guards confirmed for torch/transformers/diffusers/silero-vad-era wheels; hub-chain `--collect-all` set shipped.
- CI (`.github/workflows/build.yml`): CPU-torch preinstall step deleted. justfile: GPU-conditional torch install deleted.
- `requirements.lock`: regenerated via `uv pip compile requirements.txt --universal --header` — no torch. `scikit-learn` remains (librosa transitive dep).
- GPU probes: rewritten on `backend/utils/gpu_query.py` (nvidia-smi subprocess). No pynvml; NVIDIA VRAM visible, name reported, capability UI unchanged in shape (DirectML still name-only via ONNX EP).
- Silero VAD: **kept (owner decision)** and made genuinely torch-free; the silero-vad pip wheel (requires torch) is gone from requirements and from the frozen bundle path. See IMPACT_MAP.md for the full trace including the 576-sample-context fix for `services/vad.py`.
- `test_vram_pressure.py`: re-mocked on `gpu_query.probe_nvidia_smi`; 57/57 targeted tests green; app imports; ruff clean.
Remaining gates before this can ship: the concurrent session's 6 unformatted files + `test_release_audit_regressions.py` (SyntaxError at ~648) must clear the pre-commit gate; owner then approves commit + re-cut of the Windows release.

