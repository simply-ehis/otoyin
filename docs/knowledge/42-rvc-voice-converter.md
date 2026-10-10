# 42 - RVC v2 Voice Converter

File-based voice conversion to a downloaded RVC v2 voice pack. Distinct from the
real-time Voice Changer (pitch/formant, no model). CPU-first, optional CUDA.
**Optional**: lazy-imported; degrades gracefully if `rvc-python` is not installed.
Paired with Seed-VC (zero-shot) — see `43b-seed-vc.md`.

## Route

`/voice-converter` - VoiceConverterView (root tab in Sidebar), engine="rvc"

## Architecture

### Backend (`backend/routes/voice_convert.py`)
- `GET /voice-packs` - lists registered packs with `installed` flag (checks `data/models/rvc/{name}` for a `.pth`).
- `POST /voice-convert` - accepts JSON `{audio_path, voice_pack, transpose, index_rate, f0_method}`, resolves the stored audio, runs RVC, returns WAV blob.

### Backend (`backend/backends/rvc_backend.py`)
- `RVCBackend` implements the `VCBackend` protocol.
- Shared HuBERT content extractor (`lassl/ContentVec-128`), per-voice `.pth` generator (auto-located by `_find_generator`/`_find_index` globbing any `.pth`/`.index` in `data/models/rvc/{name}`).
- `convert(audio, sr, voice_name, transpose, index_rate, f0_method)` loads the pack on demand via `RVCInference.load_model(voice_name)`.
- `RVC_VOICE_PACKS` maps pack name -> descriptor with `repo` (HF id), optional `pth`/`index` root filenames, or `zip` (a zip archive in the repo that is extracted).

### Models registry (`backend/backends/__init__.py`)
- `_get_rvc_configs()` emits `ModelConfig` entries named `rvc-{name}` so packs appear in `/models/status`.
- Download (`backend/routes/models.py`, engine=="rvc") uses `hf_hub_download` per-descriptor: root-level `pth`/`index` copied into `data/models/rvc/{name}/`, or `zip` extracted there.
- Real public packs (no placeholders):
  - `default` -> `PhoenixStormJr/RVC-V2-default-voice` (MIT, root `default.pth` + feature index).
  - `an-v2`, `coconut-v2` -> `sxndypz/rvc-v2-models` (OpenRAIL, per-voice `.zip` containing `.pth`+`.index`).

## Invariants
- RVC depends on `torch` (already present) and the `rvc-python` package (not yet in requirements).
- Voice packs are public community repos (`PhoenixStormJr/RVC-V2-default-voice`, `sxndypz/rvc-v2-models`) — real, no placeholders.
- Conversion is non-destructive: input audio is never modified.

## GOTCHAS
- Uses the maintained `rvc-python` package (import: `rvc_python.infer.RVCInference`), NOT the bare `rvc` PyPI package. `RVCInference(models_dir=..., device=...)` loads a pack by name from `data/models/rvc/{name}`.
- `rvc-python` pulls fairseq, faiss-cpu, pyworld, torchcrepe and pins `numpy<=1.23.5` — heavy and may conflict with other ML deps. Best installed in a dedicated venv. Install is lazy so a missing package degrades gracefully.
- RVC is **voice conversion**, not zero-shot cloning. It converts source audio INTO a pre-trained target voice pack (10–30 min clean audio + GPU to train a pack). It cannot "clone from a few seconds" — that is GPT-SoVITS/Seed-VC territory.
- HuBERT/RMVPE weights download into the rvc_python dir on first use.

## Agent Callable
- **MCP Tools:** `21labs.list_voice_packs`, `21labs.convert_voice`
- **REST Endpoints:** `GET /voice-packs`, `POST /voice-convert`
- **Key Backend Files:** `backend/backends/rvc_backend.py`, `backend/routes/voice_convert.py`
- **Key Frontend Files:** `app/src/features/workspace/VoiceConverterView.tsx`
