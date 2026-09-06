# Updater — Audit & Hardening Note

**Date:** 2026-09-03
**Prompt:** `otoyin-redesign-prompts/09-updater-hardening.md`
**Verdict (updated 2026-09-04):** the update channel is now **wired end-to-end**
(Rust plugin + shell, endpoints, pubkey, updater artifacts, CI signing +
`latest.json` release manifest) — but **unreleased**: no signed release has been
cut yet. The Rust engine commands (§5) are now **implemented** and compile clean
on the Windows host; remaining verification is per-OS runtime testing on a real
artifact (see §5).

## 1. What exists (and is good)

- `app/src/hooks/useAutoUpdater.tsx` — complete UX flow: check on mount → "Update Available" toast → download progress (MB + %) → "Restart Now" → destructive error toast on failure. All toasts use `duration: Infinity` (persistent, deliberate). The 5 `eslint-disable` exemptions are exactly as `docs/reports/XXX_TODO_AUDIT.md` documented (timer callbacks + stable setters) — **do not "fix" them**.
- `tauri/src/platform/updater.ts` — `PlatformUpdater` wrapper over `@tauri-apps/plugin-updater` (`check()`, download, relaunch via `@tauri-apps/plugin-process`); clean status object (`UpdateStatus`) with `downloadedBytes/totalBytes/downloadProgress/error`.
- `@tauri-apps/plugin-updater` is a `tauri/package.json` dependency.

## 2. What's missing (the channel is dead in the current tree)

| Check | Finding |
|---|---|
| Rust plugin registered | ✅ `tauri-plugin-updater = "2"` added (desktop targets) and registered under `#[cfg(desktop)]` in the new `tauri/src-tauri/src/lib.rs`; `cargo check` is green. The shell also registers dialog/fs/shell/process. |
| `tauri.conf.json` updater config | ✅ `plugins.updater` present — GitHub Releases static endpoint + Ed25519 `pubkey`. **2026-09-05:** the original bootstrap pubkey was invalid (base64 of 32 raw bytes — not a minisign box, the plugin would reject every signature); regenerated the pair with `tauri signer generate` (dev key at `tauri/src-tauri/.tauri-updater.key`, gitignored) and wrote the proper box into the conf. Still rotate before first public release. |
| Updater artifacts | ✅ `bundle.createUpdaterArtifacts: true`; the tag workflow signs with `TAURI_SIGNING_PRIVATE_KEY` and uploads `.sig`/updater bundles + a generated `latest.json` (`.github/scripts/build_update_manifest.py`). |
| Versioning scheme | ⚠ `version: "0.1.0"` everywhere; needs a real scheme before the first release channel is cut. |
| Existing-user path | ⚠ Rebrand coordination: bundle identifier is still `com.21labs.app` (documented in `RENAME_LOG.md` as deferred). Changing it later breaks update matching for installed copies — sequence the identifier change with the first updater release, or keep the identifier and change only display names. |

## 3. UX gaps (once the channel is wired)

- The flow is **toast-based**. Per the design system (08 + `desktop-ui-feedback-messaging`), an available update is a *persistent condition* — a banner/notification-inbox item is the right vehicle, not a toast that competes with the toast queue (`TOAST_LIMIT = 5`). The 08 notification inbox is the natural home; coordinate the two.
- Failure path is handled (destructive toast) but could state the remedy: "check your connection / retry" rather than a bare plugin error string.
- No "check for updates" affordance in Settings (manual check) beyond app-launch + whatever the platform wrapper is asked to do.

## 4. Hardening checklist

1. ✅ Add `tauri-plugin-updater` to `Cargo.toml` + register in the new Rust `lib.rs`/`main.rs` (shell entry created; `cargo check` passes).
2. ✅ Add `plugins.updater` to `tauri.conf.json`: GitHub Releases HTTPS endpoint + Ed25519 `pubkey` (bootstrap pair generated; rotate before public release).
3. ✅ Set `createUpdaterArtifacts: true` and sign release builds with a stored release key (`TAURI_SIGNING_PRIVATE_KEY` CI secret) + upload `latest.json` via `.github/scripts/build_update_manifest.py`.
4. ⏳ Establish a versioning scheme (semver) before first release.
5. ⏳ Move the update prompt from toast to the 08 notification inbox/banner; keep the existing download-progress UX.
6. ⏳ Sequence the `com.21labs.app` identifier change with the first updater release (or keep permanently — user-invisible except as a bundle ID).

## 5. Remaining before a release can be cut

- **Rust engine commands** — ✅ implemented in `tauri/src-tauri/src/`:
  - `server.rs` — `start_server`/`stop_server`/`restart_server`/
    `set_keep_server_running`: probes `127.0.0.1:17493`, adopts an already
    running backend (dev flow), else spawns the bundled `otoyin-server`
    sidecar with `--data-dir` when a models dir is given; stdout/stderr is
    forwarded to the webview as `server-log`, spawn/startup failures emit
    `server-error`. The shell auto-starts the backend on app setup and
    coordinates window close with the renderer (`window-close-requested` →
    `window-close-allowed`), stopping the child unless keep-running is set.
  - `audio.rs` + `audio_win.rs` + `audio_mac.rs` —
    `is_system_audio_supported`, `start/stop_system_audio_capture`,
    `list_audio_output_devices`, `play_audio_to_devices`,
    `stop_audio_playback`. Playback decodes wav/mp3/flac/ogg via symphonia
    and plays through cpal (resample + channel convert to each device);
    capture is WASAPI loopback on Windows and ScreenCaptureKit on macOS
    (both write interleaved f32 → 16-bit WAV, base64). Linux reports capture
    unsupported but playback works.
  - `cargo check --offline` is clean. ⚠ macOS capture (`audio_mac.rs`) was
    written against the screencapturekit 1.5 API and is **not compile-checked
    on this Windows host** — verify on macOS before the first release.
- **Signing key custody** — regenerate with `tauri signer generate`, store the
  private key only in CI secrets, and update the pubkey in `tauri.conf.json`.
- **Release-pipeline verification** — the tag-gated `tauri-build` job now
  builds and stages the backend (`scripts/build-server.sh` →
  `backend/build_binary.py`, renamed `otoyin-server`), installs Linux system
  deps (webkit2gtk 4.1), and signs installers
  (`TAURI_SIGNING_PRIVATE_KEY`); the release job flattens per-triple artifacts
  and generates `latest.json` (`build_update_manifest.py`). This must be
  exercised on a real tag once — install one artifact per OS family and
  confirm the app launches with a working backend — before shipping publicly.
- **ARM64 legs** — Windows ARM64 / Linux ARM64 matrix rows are written but
  commented out (GitHub public-preview ARM runners need org opt-in); enable
  them by uncommenting in `build.yml` once the standard legs are proven.

**Needs human decision:** release-key custody (rotate the bootstrap pair) and
release process cadence.