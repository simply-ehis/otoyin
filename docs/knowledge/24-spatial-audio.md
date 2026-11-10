# 24 — 3D Spatial Audio

Environmental convolution, HRTF binaural panning, Doppler effect, and
multi-source spatial mixing.

> **Current status:** Multi-source spatial mix works via NumPy/Steam Audio.
> Each source carries its own audio, 2D soundstage position, gain (dB), and
> mute state; the mix is rendered in one pass and peak-normalized so it never
> clips. Binaural can be disabled per-render. Rendered output can be saved to
> the Library. Steam Audio SDK integration available as optional download.

## Route

`/spatial` — `SpatialView` (legacy `/workspace/spatial` redirects here).

## Architecture

### Backend (`backend/routes/spatial.py`)

- `GET /spatial/presets` — List spatializer presets.
- `GET /spatial/convolution-presets` — List convolution environment presets.
- `GET /spatial/status` — Check if Steam Audio SDK is available.
- `POST /spatial/apply-binaural` — Apply binaural panning to audio based on a 3D position.
- `POST /spatial/apply-convolution` — Apply environmental convolution reverb.
- `POST /spatial/apply-doppler` — Apply Doppler frequency shift for moving sound sources.
- `POST /spatial/render` — Full spatial render: binaural + convolution in one pass (single source).
- `POST /spatial/render-mix` — **Multi-source mix:** per-source doppler → binaural pan → environment convolution, then all sources summed and peak-normalized.

### Frontend (`SpatialView.tsx`)

- Per-source row: searchable generation picker (pick each source's audio), mute toggle, gain slider (−30 dB … +12 dB), position readout, remove button.
- SVG soundstage with draggable source positions + arrow-key nudging per focused source.
- Listener at center (200, 150), sources positioned in 2D space.
- Environment preset selector (car, coffee shop, bedroom, church, studio booth).
- Doppler intensity slider, HRTF binaural toggle.
- Render button → preview playback → "Save to Library" (posts the WAV to `/library/save-generated-audio`).

## Positioning Model

- Each source has `(x, y)` coordinates relative to a 400×300 viewBox mapped to
  spatial `(x, z)` with `y = 0` and fixed `distance = 1.0`.
- Listener at center `(200, 150)`.
- **Gain is a per-source dB slider (−30 … +12)** — distance no longer doubles
  as loudness (the old code conflated the two).
- Angle determines stereo panning (left/right); binaural off falls back to
  mono duplicated to stereo with gain applied.

## Convolution Environments

| Environment | Character | Status |
|-------------|-----------|--------|
| car_interior | Small, dry, low-frequency resonance | IMPLEMENTED (synthetic IR, Steam Audio when available) |
| coffee_shop | Medium, diffuse, ambient chatter | IMPLEMENTED |
| bedroom | Small, soft surfaces, short decay | IMPLEMENTED |
| church | Large, long reverb tail | IMPLEMENTED |
| studio_booth | Dead, no reflections | IMPLEMENTED |

## Agent Callable

- **MCP Tools:** `21labs.list_spatial_presets`, `21labs.list_convolution_presets`, `21labs.spatial_status`, `21labs.spatial_binaural`, `21labs.spatial_convolution`, `21labs.spatial_doppler`, `21labs.spatial_render`, `21labs.spatial_render_mix`
- **REST Endpoints:** `GET /spatial/presets`, `GET /spatial/convolution-presets`, `GET /spatial/status`, `POST /spatial/apply-binaural`, `POST /spatial/apply-convolution`, `POST /spatial/apply-doppler`, `POST /spatial/render`, `POST /spatial/render-mix`
- **Key Backend Files:** `backend/services/steam_audio.py`, `backend/routes/spatial.py`
- **Key Frontend Files:** `app/src/features/workspace/SpatialView.tsx`, `app/src/features/workspace/spatial/SpatialControls.tsx`, `app/src/features/workspace/spatial/SourceControls.tsx`, `app/src/features/workspace/spatial/GenerationPicker.tsx`, `app/src/features/workspace/spatial/SoundstageRadar.tsx`, `app/src/features/workspace/spatial/types.ts`, `app/src/lib/api/clientSpatial.ts`

## Tests

- `backend/tests/test_new_routes.py::TestSpatialApply::test_render_mix_returns_wav` — two sources render to WAV.
- Backend spatial suite: `test_new_routes.py -k "Spatial"` (13 tests).
