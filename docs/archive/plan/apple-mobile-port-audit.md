PURPOSE: Apple/mobile port audit for the otoyin zip and repo.
OWNS: macOS, iOS, and Android feasibility boundaries for the desktop-first Tauri app.
READ-WHEN: planning MacBook, iOS, or Android local-model work.
KEY-FILES: tauri/src-tauri/tauri.conf.json, tauri/src-tauri/Cargo.toml, justfile, docs/plan/mac-port-prompt.md.
INVARIANTS: no secrets, model weights, signing keys, or generated build outputs belong in the zip; desktop behavior stays unchanged until the Mac proves parity.
GOTCHAS: there is no tauri/gen/apple project yet; the backend is a Python/FastAPI sidecar; iOS cannot run normal PyInstaller/llama-server sidecars; Android local models need a different backend architecture.
UPDATED: 2026-09-24

# Apple + Mobile Port Audit

## Zip audit

The current `otoyin-mac-port.zip` is clean:

- 32.2 MB, 1797 entries, valid ZIP.
- No `.env`, `.key`, `.pem`, `.onnx`, node_modules, Cargo `target/`, or model weights.
- Includes the Mac handoff prompt, README/FEATURES, Rust/Tauri config, backend build script, and GeneralUser GS SoundFont.
- Largest file is the 30.82 MB SoundFont bank; all other files are small source/config files.

## macOS / MacBook status

The MacBook port is the realistic first Apple target.

- The repo already has `[unix]` recipes in `justfile` for venv setup, backend dev, server build, MCP shim build, and Tauri build.
- `tauri/src-tauri/Cargo.toml` has macOS dependencies for `screencapturekit`, `objc`, and `core-foundation-sys`.
- Windows-only Rust paths are `cfg(windows)`-gated.
- `tauri.conf.json` still declares `targets: ["nsis"]`; on the MacBook, change locally to `dmg` or pass `--bundles dmg` without committing a Windows regression.
- The Python backend sidecar must be built for `aarch64-apple-darwin` and staged as `otoyin-server-aarch64-apple-darwin`.
- Model weights are not in the zip; download them on the Mac after setup.

Use `docs/plan/mac-port-prompt.md` for the MacBook build pass.

## iOS status

iOS is not build-ready today.

- There is no `tauri/gen/apple` project in the repo/zip, so `tauri ios init` has not been run.
- The desktop app expects a Python/FastAPI sidecar (`otoyin-server`) plus desktop-oriented native modules; iOS cannot run the normal PyInstaller server or `llama-server` sidecar.
- iOS local generation must be implemented as native/Rust/ONNX/Core ML/Metal-compatible paths or a remote/local-network backend bridge.
- A first iOS milestone should be a read/write project browser + remote-backend client, not full local generation.

## Android status

Android local generation is possible, but not by shipping the current Python sidecar.

Good first local Android subset:

- ONNX/ggml/gguf engines with Android-friendly runtimes: Whisper tiny/base via whisper.cpp, Kokoro/Pocket-TTS ONNX, small Piper-style voices, RMVPE/effects only if memory permits.
- Simple DSP: fades, gain, pan, basic EQ, compression, export/mix.

Not first-pass Android:

- Seed-VC, Demucs heavy models, full music models, 7B+ LLMs, full voice changer pipeline, PyInstaller backend.

Architecture needed for Android:

1. Generate `tauri android init` project.
2. Replace Python sidecar startup with an in-process Rust or Kotlin/ONNX Runtime mobile backend.
3. Add an Android model pack/downloader for arm64 ONNX/GGUF files.
4. Gate engines by device RAM/storage and expose only supported engines.

## Recommended order

1. MacBook desktop parity: build server + DMG, fix macOS-specific failures.
2. MacBook model smoke tests: Kokoro/Whisper tiny/one music or SFX engine.
3. iOS shell: project list, settings, and remote-backend bridge.
4. Android shell: same project UX with a tiny local ONNX/ggml engine.
