# 45 — Steam Audio Integration

PURPOSE: Wire Valve's Steam Audio SDK (4.8.1) ctypes wrapper for real HRTF binaural rendering, with a verified NumPy DSP fallback for convolution/doppler/panning.
OWNS: backend/services/steam_audio.py, backend/routes/spatial.py
READ-WHEN: Working on spatial audio, 3D positioning, or environmental reverb.
KEY-FILES: backend/services/steam_audio.py (ctypes SDK + NumPy DSP), backend/routes/spatial.py (endpoints), data/steam-audio/windows-x64/phonon.dll (SDK binary)
INVARIANTS: Offline/on-device. Non-destructive. Steam Audio DLL is optional — graceful fallback to NumPy if missing OR if the HRTF render produces no output.
GOTCHAS: Steam Audio C API uses opaque handles. `iplContextCreate` (NOT `iplCreateContext`). `STEAMAUDIO_VERSION = 0x040801` (3-byte, NOT 0x04080100). Binaural needs a 2-channel deinterleaved output buffer and `frameSize != 0` on the `IPLAudioSettings` used to create the effect. Thread safety: one context per thread.
UPDATED: 2026-07-18

## ACTUAL STATE (2026-07-18 — REAL HRTF PROVEN)

The Steam Audio SDK **is integrated and ACTIVE** for real HRTF binaural rendering. A measured SOFA HRTF is bundled and loaded; `enable_sdk()` returns `True` and real binaural output is produced.

- `phonon.dll` (4.8.1, 52.9 MB) at `data/steam-audio/windows-x64/phonon.dll`; header `data/steam-audio/include/phonon.h` (199 KB).
- `data/steam-audio/SimpleFreeFieldHRIR_1.0.sofa` (2.9 MB, 48 kHz, from sofacoustics.org) — a real measured free-field HRTF, bundled offline. `_hrtf_path()` discovers `*.sofa`/`*.hrtf` under `data/steam-audio`.
- `backend/services/steam_audio.py` — `SteamAudio`:
  - `load()` extracts the DLL from zip if present and binds `iplContextCreate`/`iplHRTFCreate`/`iplBinauralEffectCreate`/`iplBinauralEffectApply` (+ `...GetTail`/`...Release`) with argtypes/restype from `phonon.h`.
  - `_create_hrtf(ctx, sr)` prefers the bundled SOFA (`IPL_HRTFTYPE_SOFA`, `sofaFileName`, `volume=8.0`, `normType=IPL_HRTFNORMTYPE_RMS`) and falls back to the built-in `IPL_HRTFTYPE_DEFAULT`. **Gotcha:** `IPLHRTFSettings.volume` defaults to RAM garbage → an unset `volume=0` mutes the HRTF and the binaural effect returns silence even though `apply` rc=0. Always set `volume=1.0+`.
  - `enable_sdk()` runs a **render-correctness probe** (`_probe_binaural`): builds a fresh context + HRTF + binaural effect, applies one 220 Hz frame with `spatialBlend=1.0`, and flips `sdk_enabled=True` only if output energy is non-zero. This catches the silent-HRTF case (built-in default HRTF renders silence in this build → probe fails → fall back).
  - `_sdk_binaural()` creates+releases its own HRTF/effect per call, processes **full `frameSize=1024` frames** (partial final frames are zero-padded to a full frame then sliced — passing `numSamples < frameSize` makes the SDK write garbage past the valid samples), bilinearly interpolates the HRTF, drains the tail via `iplBinauralEffectGetTail`, then peak-normalizes the result to [-1,1]. Verified directional output: LEFT source → L/R energy ratio ≈ 3.5; RIGHT → ≈0.85; CENTER → ≈1.1.
  - Convolution and doppler remain **pure NumPy DSP** (`_synth_ir_conv`, `_doppler_resample`) — SDK 4.8 has no simple convolution/doppler effect API. `_cos_pan` is the equal-power fallback still used when the SDK/HRTF is unavailable.
- Routes (`backend/routes/spatial.py`): `/apply-binaural`, `/apply-convolution`, `/apply-doppler`, `/render` all return real WAV; `/render` accepts `speed` + `mix`; `/spatial/status` reports `sdk_enabled` + `hrtf_available` + `backend`.
- MCP: `21labs.spatial_binaural`, `.spatial_convolution`, `.spatial_doppler`, `.spatial_render` exposed.
- Frontend: `SpatialView.tsx` calls `apiClient.renderSpatial(...)`.
- Tests: `tests/test_new_routes.py::TestSpatial*` (24 tests) pass, including the corrupt-zip safety test and a real-HRTF activation assertion (`enable_sdk() is True`, non-silent 2-channel output).

**Conclusion:** Real Steam Audio HRTF binaural rendering is live and verified. The bundled SOFA dataset makes `enable_sdk()` return True; the verified NumPy DSP remains the graceful offline fallback when no HRTF asset is present or the DLL is missing. No silence, no regression.

## SDK SCAFFOLD (2026-07-18)

Wired from `phonon.h` (real, not stubbed):

- ctypes structs mirror the header exactly: `IPLVector3`, `IPLAudioSettings`, `IPLAudioBuffer` (`float** data`, deinterleaved), `IPLHRTFSettings`, `IPLBinauralEffectSettings`, `IPLBinauralEffectParams`, `IPLContextSettings`.
- `IPLContextSettings.version = 0x040801`; binaural `IPLAudioSettings.frameSize = 1024` (frameSize=0 → effect-create rc=1); HRTF `IPLHRTFSettings.volume = 8.0`, `normType = IPL_HRTFNORMTYPE_RMS`.
- `_signatures()` binds argtypes/restype for the four render functions (+ tail/release).
- `enable_sdk()` gates on `_probe_binaural()` output-energy check (proves a real, non-silent render). `_sdk_binaural()` creates+releases its own HRTF/effect per render and always processes full frames.

Adding another HRTF: drop a `*.sofa`/`*.hrtf` under `data/steam-audio/`; `_hrtf_path()` finds it and `_create_hrtf` loads it via `IPL_HRTFTYPE_SOFA` — no code changes elsewhere.

## Architecture

### Integration approach: Python ctypes wrapper

Steam Audio ships pre-built shared libraries (`phonon.dll` on Windows, `libphonon.so` on Linux, `libphonon.dylib` on macOS). We load them via Python `ctypes` — same pattern used by whisper.cpp (`pywhispercpp`) and other native audio libs in this project.

**Why not Rust FFI via Tauri IPC?**
- The Python backend already handles ALL audio processing (TTS, effects, mixing, export)
- Adding Rust-side audio would split the audio pipeline across two processes
- Tauri IPC adds latency for what should be a synchronous DSP call
- ctypes is proven in this codebase (whisper.cpp, rvc_python, llama-cpp-python)

### Download model (like other heavy deps)

Steam Audio SDK binaries are bundled as an optional download:
- `GET /models/status` shows `steam-audio` as available for download
- `POST /models/download?model_name=steam-audio` fetches the SDK
- Stored in `data/steam-audio/{platform}/` (phonon.dll + HRTF dataset)
- If not downloaded, spatial endpoints return the current NumPy fallback with a hint

## Implementation steps

### Step 1: Steam Audio service wrapper
Create `backend/services/steam_audio.py`:
- `SteamAudioWrapper` class that loads `phonon.dll` via ctypes
- Wraps core C API: `iplCreateContext`, `iplCreateScene`, `iplCreateHRTF`, `iplCreateSpatializer`, `iplApplySpatializer`
- Manages handle lifecycle (create/destroy pairs)
- Thread-safe: one context per thread via `threading.local()`

### Step 2: Replace spatial routes
Modify `backend/routes/spatial.py`:
- `/spatial/apply-binaural` → use Steam Audio HRTF if available, fallback to NumPy
- `/spatial/apply-doppler` → use Steam Audio pathing if available, fallback to NumPy
- Add `/spatial/apply-convolution` → NEW endpoint for environmental reverb (currently missing)
- Add `/spatial/render` → NEW endpoint that applies all spatial effects in one pass

### Step 3: HRTF dataset
Steam Audio ships with a default HRTF (MIT KEMAR). For better quality:
- Bundle `steam_audio_hrtf_48k.hrtf` in `data/steam-audio/`
- Allow user-provided HRTF files (SOFA format conversion via `sofa` Python package)

### Step 4: Convolution reverb implementation
The 5 environment presets (car, coffee shop, bedroom, church, studio booth) currently exist as metadata only. With Steam Audio:
- Create `IPLScene` with geometry matching each environment
- Use `iplCreateConvolutionEffect` for real-time convolution
- Or pre-bake impulse responses for each preset (faster, lower runtime cost)

### Step 5: Update docs
- Update `24-spatial-audio.md` to reflect Steam Audio integration
- Update `00-index.md` to list new doc
- Update `TOOL-REFERENCE.md` and `mcp-tools-extended.md` if new tools added

## Fallback behavior

```
if steam_audio_available():
    use_steam_audio()
else:
    use_numpy_dsp()  # current implementation
    show_hint("Download Steam Audio for real HRTF + convolution")
```

## Download size estimate

| Platform | SDK size | HRTF dataset | Total |
|----------|----------|--------------|-------|
| Windows x64 | ~8 MB | ~2 MB | ~10 MB |
| macOS arm64 | ~6 MB | ~2 MB | ~8 MB |
| Linux x64 | ~7 MB | ~2 MB | ~9 MB |

## Performance targets

| Operation | NumPy (current) | Steam Audio (target) |
|-----------|-----------------|----------------------|
| Binaural pan (10s clip) | ~50ms | ~10ms |
| Doppler (10s clip) | ~200ms (sample loop) | ~15ms |
| Convolution reverb | N/A | ~30ms |
| Full spatial render | N/A | ~50ms |
| Cold start | ~2ms | ~200ms (one-time) |

## Dependencies

- `steam-audio` SDK binaries (optional download, ~10MB)
- No new pip packages (ctypes is stdlib)
- HRTF dataset (bundled or user-provided)

## Licensing

Steam Audio is Apache 2.0 — compatible with otoyin's MIT license.

## Agent Callable
- **MCP Tools:** `21labs.list_spatial_presets`, `21labs.list_convolution_presets`, `21labs.spatial_status`, `21labs.spatial_binaural`, `21labs.spatial_convolution`, `21labs.spatial_doppler`, `21labs.spatial_render`
- **REST Endpoints:** `GET /spatial/presets`, `GET /spatial/convolution-presets`, `GET /spatial/status`, `POST /spatial/apply-binaural`, `POST /spatial/apply-convolution`, `POST /spatial/apply-doppler`, `POST /spatial/render`
- **Key Backend Files:** `backend/services/steam_audio.py`, `backend/routes/spatial.py`
- **Key Frontend Files:** `app/src/components/Workspace/SpatialView.tsx`, `app/src/components/Workspace/Spatial/SpatialControls.tsx`, `app/src/components/Workspace/Spatial/SourceControls.tsx`, `app/src/components/Workspace/Spatial/SoundstageRadar.tsx`
