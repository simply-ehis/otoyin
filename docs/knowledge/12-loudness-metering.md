# 12 — Real-Time Loudness Metering

## LUFS Measurement
- **What:** Measure audio loudness using the ITU-R BS.1770 algorithm (LUFS) and true peak levels.
- **Where (Rust):** `tauri/src-tauri/labs21-shared-audio/src/lufs.rs` → `LufsMeter`
- **Where (Python):** `backend/routes/features.py` → `POST /audio/loudness`
- **Appears in:** MixerView channel strips as VU meter levels (color-coded green/yellow/red bars)

## Loudness Measurement
- **Where:** `POST /audio/loudness`
- **Request:** `{ audio_path: string }`
- **Returns:**
  - `integrated_lufs` (float): Integrated loudness in LUFS
  - `true_peak_dbtp` (float): True peak level in dBTP
  - `rms_level` (float): RMS signal level (0.0–1.0)
  - `duration_seconds` (float): Audio duration

## LufsMeter (Rust)
- **What:** Real-time LUFS loudness meter for streaming audio analysis.
- **Where:** `labs21-shared-audio/src/lufs.rs`
- **Methods:** `new()`, `process_block(samples, sample_rate)`, `integrated_lufs()`, `short_term_lufs()`, `momentary_lufs()`, `true_peak_dbtp()`, `reset()`

## ITU-R BS.1770 Algorithm
- **Formula:** `L = -0.691 + 10 × log10(mean(sample²))`
- **True Peak:** Maximum absolute sample value converted to dBTP
- **Integrated:** Gated loudness over entire file (time-weighted average of block loudness)

## Agent Callable
- **MCP Tools:** `21labs.analyze_loudness`, `21labs.normalize_audio`, `21labs.master_audio`
- **REST Endpoints:** `POST /audio/loudness`, `POST /audio/normalize`, `POST /audio/master`
- **Key Backend Files:** `backend/services/loudness.py`, `backend/services/mastering.py`, `backend/routes/audio_processing.py`
- **Key Frontend Files:** `app/src/features/workspace/AudioEnhanceView.tsx`
