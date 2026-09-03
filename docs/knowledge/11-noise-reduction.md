# 11 — Noise Reduction

## RNNoise Integration
- **What:** Remove background noise from audio using RNNoise (deep learning-based VAD + noise suppression). Falls back to spectral gating if RNNoise is not installed.
- **Where:** `backend/services/noise_reduction.py` → `reduce_noise_rnnoise()`
- **Where (API):** `POST /audio/noise-reduce`
- **Parameters:**
  - `audio_path` (string, required): Path to audio file
  - `vad_threshold` (float, 0.0–1.0, default 0.5): Voice activity detection threshold
- **Returns:** Streaming WAV of cleaned audio
- **Triggered from:** TimelineView via the clip editing tools (Edit Tools dropdown → noise reduction)

## RNNoise Processing
- **Algorithm:** Frame-based processing with 480-sample frames (10ms at 48kHz)
- **Where:** `backend/services/noise_reduction.py` → `_apply_rnnoise()`
- **Behavior:** Each frame is passed through the RNNoise neural network which estimates a gain mask to suppress noise while preserving speech

## Spectral Gating (Fallback)
- **What:** Noise reduction using spectral analysis when RNNoise is unavailable.
- **Where:** `backend/services/noise_reduction.py` → `_apply_spectral_gate()`
- **Algorithm:**
  1. Estimate noise profile from silent frames (energy < threshold)
  2. For each frame: compute FFT, calculate gain = max(0, (mag - noise_profile × 1.5) / mag)
  3. Apply gain mask and inverse FFT

## Noise Profile Estimation
- **Where:** `backend/services/noise_reduction.py` → `estimate_noise_profile()`
- **Returns:** estimated_snr_db, noise_level, speech_level, noise_frames, speech_frames

## Agent Callable
- **MCP Tools:** `21labs.noise_reduce`
- **REST Endpoints:** `POST /audio/noise-reduce`
- **Key Backend Files:** `backend/services/noise_reduction.py`, `backend/routes/features.py`
- **Key Frontend Files:** `app/src/components/Workspace/NoiseReductionView.tsx`
