# 24 — 3D Spatial Audio

Environmental convolution, HRTF-like binaural panning, and Doppler effect.

> **Current status:** Binaural panning works via NumPy/Steam Audio. Convolution reverb
> now implemented with synthetic IR (NumPy) and Steam Audio SDK fallback.
> Steam Audio SDK integration available as optional download.

## Route

`/workspace/spatial` — SpatialView

## Architecture

### Backend (`backend/routes/spatial.py`)

- `GET /spatial/presets` — List spatializer presets.
- `GET /spatial/convolution-presets` — List convolution environment presets.
- `GET /spatial/status` — Check if Steam Audio SDK is available.
- `POST /spatial/apply-binaural` — Apply binaural panning to audio based on a 3D position.
- `POST /spatial/apply-convolution` — Apply environmental convolution reverb.
- `POST /spatial/apply-doppler` — Apply Doppler frequency shift for moving sound sources.
- `POST /spatial/render` — Full spatial render: binaural + convolution in one pass.

### Frontend (`SpatialView.tsx`)

- SVG soundstage with draggable source positions
- Listener at center, sources positioned in 2D space
- Environment preset selector (car, coffee shop, bedroom, church, studio booth)
- Doppler intensity slider
- Real-time coordinate badges for each source

## Positioning Model

- Each source has (x, y) coordinates relative to a 400x300 viewBox
- Listener at center (200, 150)
- Distance from listener determines gain attenuation
- Angle determines stereo panning (left/right)
- Doppler intensity scales frequency shift based on velocity

## Convolution Environments

| Environment | Character | Status |
|-------------|-----------|--------|
| car_interior | Small, dry, low-frequency resonance | IMPLEMENTED (synthetic IR, Steam Audio when available) |
| coffee_shop | Medium, diffuse, ambient chatter | IMPLEMENTED |
| bedroom | Small, soft surfaces, short decay | IMPLEMENTED |
| church | Large, long reverb tail | IMPLEMENTED |
| studio_booth | Dead, no reflections | IMPLEMENTED |

## Agent Callable
- **MCP Tools:** `21labs.list_spatial_presets`, `21labs.list_convolution_presets`, `21labs.spatial_status`, `21labs.spatial_binaural`, `21labs.spatial_convolution`, `21labs.spatial_doppler`, `21labs.spatial_render`
- **REST Endpoints:** `GET /spatial/presets`, `GET /spatial/convolution-presets`, `GET /spatial/status`, `POST /spatial/apply-binaural`, `POST /spatial/apply-convolution`, `POST /spatial/apply-doppler`, `POST /spatial/render`
- **Key Backend Files:** `backend/services/steam_audio.py`, `backend/routes/spatial.py`
- **Key Frontend Files:** `app/src/components/Workspace/SpatialView.tsx`, `app/src/components/Workspace/Spatial/SpatialControls.tsx`, `app/src/components/Workspace/Spatial/SourceControls.tsx`, `app/src/components/Workspace/Spatial/SoundstageRadar.tsx`
