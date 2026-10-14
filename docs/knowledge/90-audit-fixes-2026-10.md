# Production Audit Fixes — 2026-10-14

PURPOSE: Record the 2026-10-14 three-part production audit (frontend, Tauri,
  backend), the fixes applied, and the deferrals with reasons.
OWNS: This doc only (fix history, no runtime contract).
READ-WHEN: Touching undo, playback, model downloads, SSE status, backend
  exports, plugin process spawn, or the Tauri server lifecycle.
KEY-FILES: app/src/features/audioStudio/AudioStudioStore.ts,
  app/src/layouts/AudioPlayer/AudioPlayer.tsx, backend/utils/chunked_tts.py,
  backend/services/status_bus.py, backend/services/plugin_install.py,
  tauri/src-tauri/src/server.rs, tauri/src-tauri/capabilities/default.json
INVARIANTS: Every fix is behavior-preserving except where a bug is being
  corrected; no new dependencies were added (deferrals exist for exactly that
  reason).
GOTCHAS: The undo stack now carries onUndo/onRedo callbacks — snapshot state
  cannot reach the decoded-AudioBuffer playback cache ref. The SSE bus never
  drops completed/failed payloads. started_by_us alone is not proof of life;
  pair it with child_handle_held.
UPDATED: 2026-10-14

## Audit summary

Three audits ran on 2026-10-14: frontend (12 findings: 2 high, 4 med, 6 low),
Tauri (10: 3 high, 5 med, 2 low), backend (8: 1 high, 4 med, 3 low). All high
findings and the cheap/surgical medium-low findings were fixed in this pass.

## Frontend fixes (app/src)

- **Undo no-op on audio replacement** — `UndoEntry` gained optional
  `onUndo`/`onRedo` callbacks carried between stacks; the decoded-AudioBuffer
  playback cache lives in a ref the plain snapshot cannot reach. Import,
  record, and bounce sites pass cache-swap callbacks; isolation, stitch,
  renderFx, and podcast sites reorder `pushUndo` before their mutation.
- **Stuck toast** — `useModelDownloadToast` tracks `settledRef`, dismisses on
  cleanup; `useGenerationForm` disarms only in `catch`, not `finally`.
- **Skip-to-start** — `TransportControls` gained `onSkipToStart`; AudioStudio
  wires `stopPlayback(); setCurrentTime(0)`.
- **Stale playhead** — reset/importSession/resetToTemplate reset
  `currentTimeRef`.
- **Fallback onEnded** now fires the store `onFinish`.
- **useAudioPlayer** — `loadedFileRef` identity check tears down a different
  file passed to playPause.
- **AudioPlayer** — `retryTimer` tracked and cleared on effect cleanup.
- **Master analyser** torn down on the `!trackHasAudio` early return.
- **Double-start guard** — `isStartingRef` + `startPlaybackInner` rename;
  seekTo/togglePlayPause call the wrapper.
- **Space steal** — AudioStudio root carries `data-audio-studio=""`; the
  AudioPlayer Space handler bails on `closest()`.

## Backend fixes (backend/)

- **HIGH chunked TTS underallocation** — overlap precompute now simulates the
  real write position (`pos_i = prefix[i] - total_overlap`). Short chunk +
  long crossfade used to crash with a NumPy broadcast error. Regression test:
  `tests/test_streaming_chunks.py::TestConcatenateAudioChunks`.
- **Download cancel** — `DownloadTask.cancel_event` (threading.Event);
  progress wrapper raises `DownloadCancelledError`; class name registered in
  `rate_limiter._NON_RETRYABLE_NAMES` so retries don't resurrect a cancel.
- **Zip/export sync-in-async** — story/generation/profile/standalone export
  and audiobook WAV reads run via `asyncio.to_thread` (engine has
  `check_same_thread: False`).
- **Path traversal → 400** — `config.PathTraversalError(ValueError)` with a
  dedicated app.py handler; routes that already map ValueError keep working.
- **Plugin subprocess pipes** — both Popen calls use DEVNULL (socket
  transport; unread 64KB PIPE buffers froze plugins).
- **SSE terminal events** — the status bus never drops completed/failed;
  a full queue expires its oldest intermediate event instead.
- **Streaming STT buffer cap** — force-finalize after
  `MAX_UTTERANCE_SECONDS` (30) of unbroken loud audio.
- **Sample upload temp leak** — read-loop failures (disconnect, 413) unlink
  the `delete=False` temp file before re-raising.
- **DeepFilterNet was never bundled** — `scripts/download_required_models.py`
  declared the weights bundled, but `build_binary.py` had no `--add-data` for
  them, and the service resolves `hf_hub_download(..., local_files_only=True)`
  with no bundle fallback. On a fresh install the voice-changer denoiser was
  therefore dead for every user (silently skipped, not even an error). Now
  staged at `<bundle>/deepfilter/` (8.6 MB) and `deepfilter_onnx._bundled_model_path()`
  checks it first when frozen, HF cache second. Verified: dev→None→cache path,
  frozen→bundle path, frozen-without-copy→None. Demucs v4 (303 MB) is
  deliberately NOT bundled (would outweigh the rest of the installer) and is
  listed in `RUNTIME_WEIGHTS` instead; LavaSR likewise resolves at runtime via
  audiosronnx — the old "ships in the wheel" comments were wrong (the wheel
  carries code only).

## Tauri fixes (tauri/src-tauri)

- **Updater stops the backend first** — `tauriPlatform.downloadAndInstall`
  invokes `stop_server` before `update.downloadAndInstall`; the Windows
  updater exits the process directly so RunEvent::Exit cleanup never runs.
- **Captures export fs capability** — capabilities/default.json adds
  `fs:allow-write-file`, `fs:allow-write-text-file`, and an fs:scope covering
  the standard save locations.
- **Adoption claims ownership** — plan_bind's OursAlive arm sets
  `started_by_us`; `stop_if_ours` falls back to killing the owner-lock pid
  when no Child handle exists. Close can no longer disown a running backend.
- **Liveness** — `child_handle_held` gates the started_by_us short-circuit in
  ensure_started/start_server; the monitor stand-down re-checks the child
  slot after cooldown; give-up/restart-fail arms reset ownership.
- **Unix** — pid_alive uses `ps -p` (macOS has no /proc); kill args split
  (`-TERM` + `--pid`); spawn_bundled_silent sets process_group(0).
- **window_state** — Instant init uses checked_sub (boot-relative monotonic
  clock panicked on <1h uptime).

## Deferred (see TODO_REMAINING.md)

Frontend #12 (importSession doesn't stop playback — cross-component plumbing),
tauri-plugin-single-instance (new-dependency rule), macOS permission IPC
commands (untestable on this Windows box).
