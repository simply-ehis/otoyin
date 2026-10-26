---
name: stem-separation
description: Separate audio into stems (vocals, drums, bass, other) using Demucs ONNX. Use when a user asks to "separate stems", "split vocals", "isolate vocals", "remove vocals", "karaoke", "acapella", or "demucs".
---

# Stem Separation

## Purpose
Split a mixed audio track into individual stems (vocals, drums, bass, other) using
the Demucs (htdemucs) model via ONNX Runtime — no PyTorch required.

## When to use
- User wants to isolate vocals, drums, bass, or other instruments
- User wants a karaoke/acapella version
- User wants to remix or analyze individual stems
- User mentions "demucs", "stem separation", "split track"

## Prerequisites
- Demucs ONNX model downloaded (auto-downloads on first use, ~98MB int8)
- onnxruntime installed
- Audio file to process

## Tools / Endpoints
- `GET /stems/status` — check if demucs is available and model cached
- `POST /stems/separate` — upload audio, get stem files
- `POST /stems/{job_id}/vocal-split` — split vocals into lead/backing
- `POST /stems/{job_id}/mixdown` — combine stems into one mix
- `GET /stems/{job_id}/beats` — detect beats and estimate BPM
- `GET /stems/{job_id}/{name}` — download a stem file

## Frontend
- Route: `/stem-separation`
- Sidebar: Processing → Stem Separation
- Page: upload audio, separate, preview waveforms, download stems, vocal split, mixdown, beats

## Agent procedure
1. Check `/stems/status` to confirm demucs is available
2. Upload audio to `/stems/separate`
3. Return stem download links to user
4. Optionally call vocal-split, mixdown, or beats endpoints

## Notes
- Model downloads on first use (not bundled) — ~98MB
- Uses ONNX Runtime (CPU or CUDA if available)
- GPU strongly recommended for performance