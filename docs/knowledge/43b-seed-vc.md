# 43b - Seed-VC (zero-shot voice clone)

Zero-shot voice conversion: clone a target voice from a reference audio clip
(1–30s) with **no training**. Uses the official Seed-VC wrapper
(`Plachtaa/seed-vc`, `SeedVCWrapper`). Heavier than RVC but needs no pre-trained
pack — just a reference file. **Optional**: lazy-imported, degrades gracefully if
Seed-VC is not installed.

## Route

`/voice-converter` - VoiceConverterView, engine="seed_vc"

## Architecture

### Backend (`backend/backends/seed_vc_backend.py`)
- `SeedVCBackend.convert(audio, sr, reference_audio_path, diffusion_steps, length_adjust, inference_cfg_rate, f0_condition, pitch_shift)`.
- Lazy-imports `seed_vc_wrapper.SeedVCWrapper`; checkpoints auto-download from
  `Plachta/Seed-VC` on first load. Returns (wav, sr).
- GPU-recommended (`gpu_only` model flag).
- `_venv_site_packages()` resolves the isolated Seed-VC venv from `SEED_VC_VENV`
  env or default `data/models/seed_vc_venv`, and the backend injects that
  venv's `site-packages` onto `sys.path` before importing `seed_vc_wrapper`.
  If neither exists, the load raises a clear "run install_seed_vc.py" error.

### Route (`backend/routes/voice_convert.py`)
- `POST /voice-convert` with `engine="seed_vc"` + `reference_audio_path` (a stored
  file). Both source and reference are resolved via `config.resolve_storage_path`.
- RVC and Seed-VC share the same endpoint; `engine` selects the backend via
  `get_vc_backend(engine)` in `backends/__init__.py`.

### Models registry
- `_get_seed_vc_configs()` emits `seed-vc` (engine="seed_vc", `clone_voice=True`,
  `gpu_only=True`, ~1500 MB). Shows in `/models/status`; download triggers a
  lazy model load (which pulls the real checkpoints).

## Invariants
- Reference audio is clipped to 25s by Seed-VC automatically.
- No voice pack, no training — pure in-context learning.
- Non-destructive: source audio is never modified.

## GOTCHAS
- Seed-VC is NOT a clean PyPI package: install from git
  (`pip install git+https://github.com/Plachtaa/seed-vc`) plus its
  `requirements.txt`. Heavy (DiT + Whisper + BigVGAN + CAMPPlus + RMVPE) and
  easily conflicts with the base app's pinned numpy/torch — install separately
  (dedicated venv) and rely on the lazy import.
- Use the provided one-shot installer: `python scripts/install_seed_vc.py`.
  It builds an isolated venv at `data/models/seed_vc_venv` (or `SEED_VC_VENV`)
  and installs Seed-VC + its requirements there, so the base app deps are untouched.
- First inference downloads ~1.5 GB of checkpoints from HuggingFace.
- V2 (style/accent/emotion) model is available via `convert_style` in the
  wrapper but the backend currently uses V1 (`convert_voice`).

## Agent Callable
- **MCP Tools:** `21labs.convert_voice` (with `engine: "seed_vc"`)
- **REST Endpoints:** `POST /voice-convert` (with `engine: "seed_vc"`)
- **Key Backend Files:** `backend/backends/seed_vc_backend.py`, `backend/routes/voice_convert.py`
- **Key Frontend Files:** `app/src/features/workspace/VoiceConverterView.tsx`
