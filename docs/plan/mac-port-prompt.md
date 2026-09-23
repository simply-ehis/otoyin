PURPOSE: Handoff prompt for porting the otoyin working tree to macOS on a MacBook.
OWNS: nothing in-repo (transfer artifact guide); the zip it describes lives outside the repo.
READ-WHEN: setting up the Mac port; verifying the Mac build.
KEY-FILES: justfile ([unix] recipes), tauri/src-tauri/tauri.conf.json, backend/requirements.txt, backend/build_binary.py, .env.example.
INVARIANTS: no keys or .env travel with the zip; signing/notarization is out of scope for the port pass; behavior parity, not new features.
GOTCHAS: Win32-only Rust paths are cfg-gated (audio_win, window-state work-area); Python must be 3.12 (not 3.13+); model weights are NOT in the zip.
UPDATED: 2026-09-23

# Mac Port Prompt (paste to the agent on the MacBook)

You are porting the otoyin working tree (unzip: `otoyin-mac-port.zip`) to
macOS. Goal: `just dev` runs (backend + Tauri shell) and `cargo tauri build`
produces a working DMG. Behavior parity only — no new features, no
refactors, no Apple signing/notarization in this pass.

## 0. Read first
- `README.md`, `FEATURES.md` (product scope), `DEPLOY.md` (3 deployable units + env reference)
- `justfile` — use the `[unix]` recipes only; ignore every `[windows]` block
- `backend/requirements.txt` + `docs/knowledge/82-model-integrity.md` (if present)

## 1. Environment (Apple Silicon MacBook)
- Xcode Command Line Tools, Homebrew, Rust stable (`rustup`), Python **3.12**
  (not 3.13+ — ML wheels break; the justfile warns), Node 20, `ffmpeg`.
- Never use `backend/venv/Scripts/*` paths from docs — on macOS the venv
  lives at `backend/venv/bin/python`.
- Python deps: `just setup-python`. If torch misbehaves, CPU-only torch is
  fine for the port pass (all shipped engines have ONNX/CPU paths; CUDA and
  Intel-XPU blocks are Windows-only — skip them).
- JS deps: `npm install` (npm only — no bun/pnpm anywhere).

## 2. Windows-isms to adapt (do not copy blindly)
- **Rust**: `tauri/src-tauri/src/audio_win.rs` and the `#[cfg(windows)]`
  work-area branch in `src/window_state.rs` are already cfg-gated — verify
  they compile out (`cargo check` must be clean). macOS audio capture lives
  in `audio_mac.rs` (screencapturekit) — keep as-is unless it fails to build.
- **Bundling**: `tauri.conf.json` targets `nsis` — switch the local test
  target to `dmg` (do NOT touch the updater `endpoints`/`pubkey` block).
  NSIS/WiX sections stay for Windows; add nothing signed.
- **Sidecars**: externalBin naming is per-target-triple
  (`*-aarch64-apple-darwin` for Apple Silicon). `just build-server` stages
  them; confirm the staged names match `rustc --print host-tuple` on the Mac.
- **Shell scripts**: any `.bat`/PowerShell helper has a `.sh` or justfile
  equivalent — use it. Line endings: checkout with `core.autocrlf=input`.
- **VST3 plugin paths, registry reads, Win32 API calls**: search for
  `cfg(windows)` and `windows::` — every hit must have a non-Windows path
  (skip gracefully if none exists; log loudly, never crash boot).
- **llama.cpp server**: the assistant LLM runs on the llama.cpp `server`
  binary (gguf_llm backend). Build or fetch the macOS arm64 binary and point
  the backend config at it; CPU fallback is acceptable for the port pass.
- **whisper.cpp / transcribe binaries**: macOS arm64 builds; same sidecar
  pattern as Windows.

## 3. Verify (in order, stop on red)
1. `just setup-python` completes (venv + base requirements).
2. `backend/venv/bin/python -m pytest backend/tests/test_gm_instrument.py backend/tests/test_diarization_words.py -q` (fast, no weights needed for most).
3. `cargo check --manifest-path tauri/src-tauri/Cargo.toml` clean.
4. `npm run build --workspace=@otoyin/app` (vite build warning-free-ish).
5. `just dev` (or `tauri dev`): window opens sized inside the work area,
   backend sidecar spawns, `/health` 200.
6. `cargo tauri build --bundles dmg`: installer completes, app launches
   from `/Applications` (or `open` the .app), backend spawns.

## 4. Explicitly out of scope
- Apple Developer signing, notarization, entitlements hardening.
- New features, refactors, dependency upgrades (pin what works).
- Never commit or transmit keys, `.env` files, or model weights.
- The `marketplace/` deploy (Vercel+Neon) is server-side and OS-independent.

## 5. Report back
- What failed, exact error + file:line, and the fix (or the blocker if
  unfixable locally). Keep fixes minimal and macOS-gated (`#[cfg(target_os
  = "macos")]`) — do not alter Windows behavior.
