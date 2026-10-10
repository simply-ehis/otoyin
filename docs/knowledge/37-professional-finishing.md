PURPOSE: How to use the new professional-finishing tools — de-esser / spectral de-noise effects, mastering, and stem separation — from any AI surface.

OWNS: `backend/services/mastering.py`, `backend/services/stem_separation.py`, `backend/services/effects_extended.py` (apply_deesser, apply_spectral_denoise), `backend/routes/audio.py` (`/audio/master`, `/audio/separate`).

READ-WHEN: An AI or user asks to de-ess, clean noise, master a mix, or isolate vocals/instruments.

KEY-FILES: `33-agent-operating-guide.md`, `TOOL-REFERENCE.md`, `34-content-recipes.md` (every recipe ends on `master_audio`).

INVARIANTS:
- All operations are non-destructive: inputs are never overwritten; each returns a new export file or base64 WAV.
- Everything runs offline; Demucs (stem separation) is an OPTIONAL heavy dependency, gated like CUDA. If absent, `separate_audio` returns HTTP 501 with an install hint.

GOTCHAS:
- `master_audio` normalizes to integrated LUFS (K-weighted), not peak dB. Pass `target_lufs` (default -14 for streaming/podcast, -23 for broadcast EBU R128, -16 for Spotify/YouTube music).
- `separate_audio` returns only ONE stem per call. To get vocals + backing, call it twice (stem=vocals, then stem=other).
- De-esser is a whole-file sibilant-band gain reduction; for per-word precision use Comping/takes instead.

## Tools

### Effects (in the plugin chain + `apply_effect`)
- **deesser** — params: `threshold_db` (-40..0, def -18), `reduction_db` (-18..0, def -6), `freq_low` (2000..6000, def 4000), `freq_high` (6000..12000, def 8000), `strength` (0..1, def 0.6). Use at the end of a vocal chain.
- **spectral_denoise** — params: `amount` (0..1, def 0.7). Estimates noise from the first 100 ms (room tone); safe to chain before de-esser.

### master_audio
- Assistant: `master_audio(audio_path, target_lufs=-14.0, true_peak_db=-1.0, width=0.0)`
- MCP: `21labs.master_audio(...)`
- Pipeline: glue broadband compressor → true-peak limiter → LUFS normalize → optional stereo widener (`width` > 0 widens, < 0 narrows). Always ends clipped to true peak.

### separate_audio
- Assistant: `separate_audio(audio_path, stem="vocals", model_name="htdemucs")`
- MCP: `21labs.separate_audio(...)`
- Stem options: `vocals`, `drums`, `bass`, `other`.
- Preferred engine: Demucs HTDemucs ONNX (`demucs_onnx`, ~316MB, MIT) — free download from the **Store (marketplace, Extras)**; the torch `pip install demucs` path is only the fallback when ONNX weights aren't cached. First-time users don't need to pre-download: the Isolate UI auto-downloads the model (one click) and then runs separation.
- User surfaces: Workspace → Processing → **Isolate** (`VocalIsolationView`, upload → separate → preview/download) and the Audio Studio toolbar **Isolate** button (isolates the selected track's stem into a NEW non-destructive track).

## Real-time overdub
- Audio Studio now allows record-while-playing: press Record while a session plays to lay a new track over the existing mix. The record guard no longer blocks on `isPlaying`. The new layer is captured as a separate non-destructive track.

## Agent Callable
- **MCP Tools:** `21labs.master_audio`, `21labs.separate_audio`, `21labs.compress_audio`, `21labs.normalize_audio`, `21labs.noise_reduce`
- **REST Endpoints:** `POST /audio/master`, `POST /audio/separate`, `POST /audio/compress`, `POST /audio/normalize`, `POST /audio/noise-reduce`
- **Key Backend Files:** `backend/services/mastering.py`, `backend/services/stem_separation.py`, `backend/services/effects_extended.py`, `backend/services/noise_reduction.py`, `backend/routes/audio_processing.py`
- **Key Frontend Files:** `app/src/features/workspace/AudioEnhanceView.tsx`, `app/src/features/workspace/NoiseReductionView.tsx`, `app/src/features/workspace/VocalIsolationView.tsx`

UPDATED: 2026-08-20
