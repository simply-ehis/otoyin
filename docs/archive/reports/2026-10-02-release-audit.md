# Release Audit — 2026-10-02

**Date:** 2026-10-02
**Status:** DONE — verification complete; installer build not cut
**Last verified:** 2026-10-02

PURPOSE: Record what was verified and fixed before attempting a local installer build.
OWNS: Release-readiness sign-off for the personal-use NSIS bundle.
READ-WHEN: Before cutting a build, or when a feature "does nothing" in the packaged app.
KEY-FILES: backend/services/audio_conversion.py, backend/routes/audiobooks.py,
  backend/services/voice_chat.py, backend/tests/test_release_audit_regressions.py,
  tauri/src-tauri/tauri.conf.json, scripts/stage-ffmpeg.sh
INVARIANTS: Every ffmpeg call site must go through audio_conversion.ffmpeg_path();
  static sub-paths must be declared before their catch-all sibling.
GOTCHAS: libvorbis rejects arbitrary bitrates; Starlette matches routes in
  declaration order; ffmpeg_path() is lru_cached so tests must clear it.
UPDATED: 2026-10-02

## Verification status

| Area | Result |
|---|---|
| Backend health | 200, all subsystems healthy (task_queue, lifecycle, database) |
| Backend test suite | **2475 passed, 16 skipped, 0 failed** (169 files, run in 2 halves) |
| Marketplace (Dodo) tests | 26 passed |
| MCP shim | 203 tools, `initialize` + `tools/list` both OK |
| Sidecar binaries | `otoyin-server.exe` + `otoyin-mcp-*.exe` present |
| ffmpeg | 9.0.2 installed + bundled into the NSIS resources |
| Frontend build | `✓ built in 9.87s`, 4.5 MB dist |

## Bugs found and fixed

### 1. ogg export produced a 0-byte file
`convert_audio_file` passed `-b:a <bitrate>` for every format. libvorbis is a
VBR codec and refuses to open the encoder for arbitrary bitrates:
`Error while opening encoder`. Verified directly — the old argv yields
`returncode=4294967274, size=0`.

Fix: ogg now encodes with `-q:a 5` (`_BITRATE_FORMATS` excludes it).
Verified: old argv → 0 bytes, new argv → 5169 bytes.

### 2. `/audiobooks/formats` and `/audiobooks/cached-engines` returned 404
`GET /audiobooks/{book_id}` was declared at line 162, before both static paths
(line 608 and 804). Starlette matches in registration order, so the catch-all
swallowed them and 404'd on a book lookup. This broke the audiobook render
engine list and the export-format picker.

Fix: both moved above the catch-all. Both now return 200.

### 3. Test suite hung on `test_request_tool_confirmation_timeout`
`_request_tool_confirmation` hardcoded a 30s timeout. The test never resolved
the future, so it burned 30 real seconds, blew the suite timeout, and left a
pending future that poisoned every later test file.

Fix: extracted `TOOL_CONFIRMATION_TIMEOUT_S = 30.0` so the test can shrink it.
Production behaviour unchanged. 22 tests now run in 3.22s instead of hanging.

### 4. Stale assertions
- `test_verify_system.py::test_tool_count` asserted 212; actual is 214
  (pre-existing, not caused by the Dodo swap — `assistant_tools/schemas.py`
  untouched). Docstring said 211.
- `test_e2e_flows.py` monkeypatched `paddle_api_key` after the Dodo rename.

### 5. ffmpeg was not bundled — the installer would have shipped broken
`tauri.conf.json` bundled only `otoyin-server/`. A user with no system ffmpeg
would get 501/RuntimeError on every export, conversion, and m4b build.

Fix:
- `audio_conversion.ffmpeg_path()` resolves `OTOYIN_FFMPEG` -> bundled beside the
  app -> PATH, with `lru_cache`.
- All 11 ffmpeg call sites across 6 modules routed through it.
- `ffmpeg/` added to bundle resources; `scripts/stage-ffmpeg.sh` stages it.
- Resolution is lazy (not import time) — doing it at import pushed server
  startup past the 10s budget in `test_server_shutdown_e2e`.

### 6. Kokoro shipped fp32 despite being labelled int8 (212 MB wasted)
The config declared `quant="int8"` but the only reachable source — the
`Heliosoph/kokoro-v1.0-onnx` HF mirror — publishes **only** `kokoro-v1.0.onnx`
(325,505,369 B). `_onnx_precision.resolve_session_path()` therefore always landed
on fp32, so the declared int8/340 MB was fiction.

Upstream `thewh1teagle/kokoro-onnx` release `model-files-v1.1` publishes three
precisions of the same weights, and the app already downloads voices from that
exact release:

| file | bytes | spectral corr. vs fp32 |
|---|---|---|
| kokoro-v1.0.onnx | 325,505,369 | baseline |
| kokoro-v1.0.fp16.onnx | 163,527,961 | 0.999 |
| kokoro-v1.0.int8.onnx | **114,119,327** | 0.916 |

Fix: `_resolve_paths()` now prefers a cached variant, else downloads the
smallest published one, else falls back to the fp32 mirror. Config updated to
`size_mb=114`, `min_ram_mb=250`.

Verified end-to-end: int8 graph loads in 4.9s and synthesizes 2.95s of real
audio (peak 0.35, RMS 0.06) — not silence, no NaN.

Naming trap hit while implementing: the resolver probes
`kokoro-v1.0_int8.onnx` (underscore), but the stem `kokoro-v1.0` already ends in
`.0`, so slicing `.onnx` off the release filename yields
`kokoro-v1.0.int8.onnx` (dot) — which silently missed and fell back to fp32.
Local names are now declared explicitly and pinned by a test.

### 7. parakeet-v3 declared sizes were wrong and inverted
Ground truth from `mudler/parakeet-cpp-gguf`:

| file | real bytes | was declared |
|---|---|---|
| tdt-0.6b-v3-f16.gguf | 1,441,046,400 (~1375 MB) | 220 MB |
| tdt-0.6b-v3-q8_0.gguf | 940,663,680 (~897 MB) | 600 MB |

fp16 (16-bit) was declared *smaller* than q8 (8-bit) — impossible, and it
understated the f16 download by ~1.1 GB. Both corrected, plus `min_ram_mb`.

### 8. Systematic audit: every config's quant claim vs what the repo publishes
Wrote an audit that pulls each config's `hf_repo_id` file list from the HF API
and flags any `quant` with no matching artefact. Six models claimed a precision
their source does not ship:

| model | claimed | reality | action |
|---|---|---|---|
| kokoro-onnx | int8 | mirror fp32-only | **fixed** — now sources int8 from GitHub release (bug 6) |
| kitten-tts-mini | int8 | `kitten_tts_mini_v0_8.onnx` only; int8 exists only for *nano* | corrected to fp32 |
| moss-tts-nano | int8 | reference export has no int8 graphs | corrected to fp32, size 763->640 MB |
| stable-audio-open-1.0 | int8 | 4.4 GB fp32 safetensors | corrected to fp32, size 2500->4415 MB |
| stable-audio-3-small-sfx | Q8_0 | no GGUF/Q8_0 published; backend loads safetensors | corrected to fp32, size 1684->1599 MB |
| pocket-tts-onnx | int8 | **genuine** — repo has real `_int8.onnx` variants | no change |

pocket-tts-onnx was a false positive in my first audit pass: it checks
`KevinAHM/pocket-tts-onnx` (which does ship int8), not the `kyutai/pocket-tts`
PyTorch repo. Left correct.

Net effect: four configs were lying about precision, understating downloads by
up to ~3.9 GB. Pinned by `test_no_false_quant_claims` +
`test_stable_audio_sizes_match_safetensors`.

### 9. Flaky staleness test in test_check_report_headers
`test_stale_warning_after_threshold` built its fixture as
`now - timedelta(days=45)` and asserted the warning said "45 days ago", but the
checker counts whole elapsed days from a date-only value — so it reported 44
whenever the current time-of-day is earlier than 45 days ago (most of the day).
Unrelated to this audit; would have failed on any run after 2026-10-03.
Fixed by using a comfortably-past date and asserting the stable substring.

## Regression tests added

`backend/tests/test_release_audit_regressions.py` — 17 tests, all passing with
and without ffmpeg on PATH (5 skip cleanly when it is absent):

- static route not shadowed by catch-all
- every advertised format converts to non-empty audio
- ogg uses quality mode; CBR formats still get `-b:a`
- m4b audiobook build produces playable audio (probed with ffprobe)
- bitrate option-injection rejected
- ffmpeg resolver: env override wins, bad override ignored, bundled sibling found
- no module shells out to a bare `"ffmpeg"` argv literal
- Kokoro local variant names match the resolver's underscore convention
- Kokoro variant ladder ordered smallest-first (int8 first)
- Kokoro config advertises the size actually downloaded
- parakeet f16/q8 sizes are not inverted and match published bytes

## Blocked

Installer build needs ~5-6GB disk (npm deps, PyInstaller server rebuild, cargo
release target, NSIS output). Only 3.11GB free at audit time. `data/` holds
2.9GB of downloaded models and was left untouched.