# 18 — Model Downloads

## Model Management Page
- **What:** UI for downloading, viewing, and managing AI models.
- **Where:** `app/src/features/store/StorePage.tsx` (Marketplace)
- **Features:**
  - Download status per model (not downloaded / downloading / ready)
  - Storage usage display
  - Model descriptions and requirements

## Model Descriptions
- **Where:** `app/src/features/store/storeUtils.ts` (`MODEL_DESCRIPTIONS`), UI in `app/src/features/store/StorePage.tsx`

### TTS Models
| Model | Size | Description |
|-------|------|-------------|
| Kokoro 82M | ~160MB | Lightweight, CPU realtime, 8 languages, 48 preset voices |
| Qwen3-TTS 0.6B | ~1.2GB | Voice cloning, 10 languages |
| Qwen3-TTS 1.7B | ~3.4GB | Higher quality voice cloning, 10 languages |
| LuxTTS | ~1GB | Fast CPU cloning, English only, 48kHz |
| Chatterbox | ~2GB | 23 languages, emotion exaggeration |
| Chatterbox Turbo | ~700MB | Fast English cloning, paralinguistic tags |
| TADA 1B | ~2GB | English, 700s+ coherent generation |
| TADA 3B | ~6GB | 10 languages, highest quality |

> Qwen3-TTS, LuxTTS, Chatterbox, and TADA models were removed 2026-08 (marketplace launch
> cleanup). The live TTS lineup is: Kokoro, Fish Speech, Zonos, StyleTTS2, ChatTTS, F5-TTS,
> Pocket-TTS, Parler-TTS Mini, MOSS-TTS-Nano, KittenTTS, NeuTTS-Air, NeuTTS-2E, Orpheus.

### Generation Models
| Model | Description |
|-------|-------------|
| Stable Audio Open | Sound effect generation |

> ACE-Step (music) and Bark (non-verbal) were removed 2026-08.

## Download API
- **Where:** `POST /models/download` → `ModelDownloadRequest`
- **Where:** `GET /models/status` → `ModelStatusListResponse`

## Model Storage
- **Location:** `{app_data}/otoyin/models/`
  - `tts/` — TTS engine models
  - `music/` — Music generation models
  - `sfx/` — Sound effect models

## Agent Callable
- **MCP Tools:** `21labs.models_list`, `21labs.models_download`, `21labs.models_load`, `21labs.models_unload`, `21labs.model_cache_dir`, `21labs.model_progress`
- **REST Endpoints:** `GET /models/status`, `POST /models/download`, `POST /models/download/cancel`, `DELETE /models/{name}`, `POST /models/load`, `POST /models/unload`, `GET /models/cache-dir`, `GET /models/progress/{name}`, `GET /models/recommended`, `GET /models/capabilities`, `POST /models/migrate`, `GET /models/migrate/progress`
- **Key Backend Files:** `backend/routes/models/status.py`, `backend/routes/models/download.py`, `backend/routes/models/load_unload.py`, `backend/routes/models/cache.py`, `backend/routes/models/capabilities.py`, `backend/routes/models/recommended.py`, `backend/routes/models/migrations.py`
- **Key Frontend Files:** `app/src/features/store/StorePage.tsx`, `app/src/lib/hooks/useModelDownloadToast.tsx`