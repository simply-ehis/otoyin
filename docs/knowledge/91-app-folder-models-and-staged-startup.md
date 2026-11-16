# 91 — App-folder model storage + staged startup + window controls

PURPOSE: Why the app's own `data/models/` folder is the single source of truth for model weights (the HuggingFace cache is a transient download buffer), and how startup is tiered so the app is usable instantly.
OWNS: `backend/services/model_files.py` (install/resolve/clear helpers), `backend/routes/models/download.py` (install branches), `backend/app.py` (staged startup tiers), `tauri/src-tauri/src/window_state.rs` (default-view geometry), `app/src/layouts/TitleBarDragRegion.tsx` (window controls), `app/src/router.tsx` (non-blocking boot gate)
READ-WHEN: A model fails to load, a download lands in the wrong place, the HF cache reappears after installs, startup feels slow, or the window opens with an unexpected size.
KEY-FILES: `backend/services/model_files.py`, `backend/app.py`, `tauri/src-tauri/src/window_state.rs`, `app/src/layouts/TitleBarDragRegion.tsx`, `app/src/router.tsx`
INVARIANTS: The HF cache is NEVER read as a fallback — after install, `data/models/` is the only copy and the cache entry (file AND blob) is deleted; readiness (`_signal_ready`) fires after DB + queue + worker only; the main window always opens at the default size (saved geometry is tracked but not restored); the frameless shell gets close/minimize/maximize buttons on Windows.
GOTCHAS: `hf_hub_download`'s `local_dir=` nests the repo filename underneath it — `local_dir` must be the dir the filename nests to, never the file's parent, or path-like filenames double-nest and callers find nothing. `.cache/huggingface/` inside the destination is the hub's resumable bookkeeping and must be left alone. Engines whose third-party loader takes a repo id (NeuTTS, Kokoro-torch, pocket-tts) cannot be forced to a local dir; their `_is_model_cached` checks the app folder and the library's own cache use is documented as library-managed.
UPDATED: 2026-11-16

## Model storage: app folder only

`backend/services/model_files.py` is the one seam between "download from
HuggingFace" and "read a model". Nothing else in the app reads the HF cache.

| Helper | Used by | Effect |
|---|---|---|
| `is_model_installed(repo, file)` | every `_is_model_cached()` | app-folder existence check |
| `install_model_file(repo, file)` | install branches, on-demand loads | downloads straight into `data/models/<slug>/` via `hf_hub_download(local_dir=<slug dir>)` — `local_dir` is the nest root, so path-like filenames (`speaker_embeddings/v2/*.npy`, `Stable-Audio-3-Small-SFX-GGUF/*.gguf`) land at `_app_model_path(repo, file)` exactly (fixed 2026-11-16; passing the file's parent dir double-nested them) |
| `install_model_file_to(repo, file, dest)` | whisper / faster-whisper / moonshine | `local_dir` = `dest` with the filename's parts stripped; `dest` must end with the repo filename or it raises `ValueError` |
| `install_snapshot(repo)` | whole-repo engines (stable-audio, generic) | `snapshot_download(local_dir=data/models/<slug>/)` — no copy step, no HF cache content |
| `resolve_model_file(repo, file)` | runtime loaders | app folder first, install if missing |
| `is_snapshot_installed(repo)` | whole-repo status checks | any weight file under the slug dir |

Two pre-existing bugs this removed: `force_offline_if_cached=True` was
being passed to `hf_hub_download` as if it were a parameter (it is not —
every one of those calls raised `TypeError`), and several backends left
their weights in the HF cache while reading them straight out of it.

### What stays library-managed

`NeuTTS`, `Kokoro(torch)`, `PocketTTS(torch)` and `KittenTTS` receive a
repo id and resolve internally. Their `_is_model_cached()` still checks
the app folder so the Models tab is truthful; the loader's own cache use
is marked in a comment at each call site. If those libraries ever accept
local directories, converting them is a three-line change per backend.

## Staged startup (`backend/app.py`)

| Tier | Fires | Work |
|---|---|---|
| Core (instant) | before readiness | DB init, queue, batch worker → `_signal_ready()` |
| Tier 1 | +2 s | `/health` snapshot warm-up (torch/CUDA import ≈5-9 s, in a thread) |
| Tier 2 | +4 s | stale-state cleanup (data-dir scan) + profile/generation counts |

Voice-changer is **not** spawned at boot — `routes/voice_chat.py` calls
`ensure_vc_spawned()` on first WebSocket connect. The frontend renders
its shell immediately and shows a one-line status while the backend
warms up (`router.tsx` no longer blocks the router on `boot.ready`), so
there is no blank window. A `startup_failed` status still takes over the
content area with the restart button.

Verified: `/health/ready` answers ~2 s after process start while the
torch warm-up continues in the background.

## Window

`apply_startup_geometry` always applies `default_size` + centering; the
saved `window-state.json` is still written on move/resize/close (tracked
for a future restore opt-in) but never restored. `load_saved` and
`rect_visible` are kept with `#[allow(dead_code)]`.

`TitleBarDragRegion.tsx` renders minimize/maximize/close buttons on
Windows (macOS keeps native traffic lights) wired to the Tauri window
API. Close flows through the existing Rust `CloseRequested` handler,
which stops the backend before destroying the window.

## Marketplace

Demucs HTDemucs is listed in `marketplace_catalog.py` (`demucs_onnx`,
free, utilities, 316 MB) and installs into the app folder like every
other model.

## Invisible subprocesses (no console windows)

Windows console binaries opened a visible terminal window on every model
load, one-shot CLI call and even at app launch. `backend/utils/hidden_subprocess.py`
now owns the flag:

| Helper | Replaces |
|---|---|
| `popen_hidden(args, **kw)` | `subprocess.Popen` + `creationflags=CREATE_NO_WINDOW` |
| `run_hidden(args, **kw)` | `subprocess.run` + same |
| `popen_kwargs()` | for call sites that build their own command |

All 38 production spawn sites route through it (llama-server, crispasr,
s2, parakeet, ffmpeg/ffprobe, the model venv scripts, the voice-changer
and the backend itself). The Rust shell got the same treatment in
`server.rs`: `CREATE_NO_WINDOW` on both backend spawns (launch +
auto-restart) and on the `tasklist`/`taskkill` probes — without it
`otoyin-server.exe` flashed a console window at every app start.

Tests and `build_binary.py` intentionally keep plain `subprocess` (a build
visible in a terminal is a feature, and tests assert on it).

## Model-operations audit (2026-10-14)

Real defects found and fixed in the same pass:

- **HIGH — delete freed nothing.** `DELETE /models/{name}` removed
  `~/.cache/huggingface/hub/models--...`, but installs live in
  `data/models/`. Every delete for a non-special-cased engine reported
  "cache already gone" while the weights stayed on disk — no space
  freed, model still installed. Now deletes the app-folder slug dir
  *and* the legacy cache dir (`model_files.delete_model_files`), so
  upgrades from the old layout actually reclaim disk; a directory that
  survives (Windows file lock) is reported, not hidden.
- **HIGH — quantization re-quantized everything.**
  `_quantize_onnx_if_needed(model_dir=models_root)` globbed `*.onnx`
  recursively across the whole models dir, so downloading one quantized
  model rewrote every unrelated model's graph into duplicate
  `.int8.onnx` copies (yamnet, deepfilter, kokoro variants — minutes of
  CPU, hundreds of MB of dead files). Now scoped to the directories this
  model actually installed into. Its "already quantized" check also never
  fired (`Path.suffix` is only the last extension, so it could never
  equal `.int8.onnx`) — that produced `<name>.int8.int8.onnx`; it now
  matches the `.int8.` segment.
- **MEDIUM — integrity baseline was blind.**
  `model_integrity._iter_weight_files()` looked in the HF cache, so after
  the app-folder switch it found zero files for most models: the SHA-256
  sidecar was empty and `GET /models/verify` was meaningless. Now hashes
  `data/models/<slug>/` (legacy cache as fallback). Verified end-to-end:
  snapshot → verify passes → tampered file flips `ok` to False.
- **MEDIUM — interrupted downloads leaked `.incomplete` files.** The
  cancel and failure handlers only logged, leaving the partial download in
  the HF cache — and nothing reads that cache any more, so a cancelled 3 GB
  model left 3 GB of junk that grew on every retry. Both paths now call
  `_discard_partial_download()`.
- **LOW — installs are now atomic** (temp + `os.replace`), so a failed or
  cancelled copy can't leave a truncated file that later passes
  `is_model_installed()` and crashes the loader with a parse error.
- **Startup regression test updated** for the staged contract: the warm-up
  must run *after* readiness (in a background tier, off the event loop).
