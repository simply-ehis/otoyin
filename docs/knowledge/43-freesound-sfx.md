# 43 - Freesound SFX Browser

Cloud SFX source (user-provided API key). Deliberate, documented exception to the
on-device rule: Freesound is a curated, license-tagged library reachable only via
its public API. Search metadata + previews are cached under `data/sounds/`.

## Route

`/sounds` - SoundEffectsView (root tab in Sidebar)

## Architecture

### Service (`backend/services/freesound.py`)
- `is_configured()` - true if `FREESOUND_API_KEY` env var is set.
- `search_sounds(query, page, page_size, filter, sort)` - hits Freesound v2 `/search/text/`, caches results locally (1h TTL).
- `download_preview(sound_id, preview_url)` - downloads the HQ OGG preview to `data/sounds/{id}.ogg`.

### Routes (`backend/routes/sounds.py`)
- `GET /sounds/search?q=&page=` - returns the Freesound payload (`count`, `results[]` with `previews`, `license`, `duration`). 503 if key missing.
- `POST /sounds/download/{id}` - body `{preview_url}`; caches the preview locally; returns `{path, cached}`.

## Invariants
- User supplies their own free API key — no key, no service.
- Only previews (OGG) are downloaded in v1; full downloads need OAuth (out of scope).
- Results cached so repeat browsing stays offline.

## GOTCHAS
- Requires `httpx` (already in backend requirements).
- API key must be set in the backend environment, not the frontend.
- **Licensing**: free API use is non-commercial only. Commercial/multi-user use requires a negotiated license with UPF (mtg@upf.edu). Hard rate limit: 60 req/min, 2000 req/day. A single global org key works for non-commercial use but every sound still carries its own CC license (Attribution / Attribution-NonCommercial / CC0) that must be credited in exported projects.
- `filter=license:"Creative Commons 0"` in the search query restricts to license-free sounds.

## Agent Callable
- **MCP Tools:** `21labs.search_freesound`, `21labs.download_freesound`
- **REST Endpoints:** `GET /sounds/search`, `POST /sounds/download/{soundId}`
- **Key Backend Files:** `backend/services/freesound.py`, `backend/routes/sounds.py`
- **Key Frontend Files:** `app/src/features/workspace/SoundEffectsView.tsx`
