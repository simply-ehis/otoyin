# 69 — Marketplace & Store

> PURPOSE: How the otoyin model marketplace works — catalog, entitlements, download.
> OWNS: backend/routes/store.py, backend/services/marketplace_catalog.py, backend/services/model_registry.py
> READ-WHEN: browsing models, purchasing packs, managing entitlements, troubleshooting downloads
> KEY-FILES: backend/routes/store.py (REST), backend/services/marketplace_catalog.py (catalog), backend/services/model_registry.py (download/entitlements)
> INVARIANTS: free models download without license check; paid models require signed entitlement; catalog is bundled, then refreshed from the remote marketplace service (signature-verified, offline-first)
> GOTCHAS: remote refresh never breaks the app — on network failure/tamper the bundled catalog stays; a startup background task polls hourly and fetches only when stale (24h threshold, `OTOYIN_CATALOG_POLL_S`/`OTOYIN_CATALOG_REFRESH_S`), so failures retry next tick instead of after a full interval
> UPDATED: 2026-09-04

## Overview

The marketplace provides a catalog of AI models, voice packs, and plugins.
Free models download directly; paid models require a license (Ed25519-signed
entitlement, verified locally).

## Remote catalog refresh (07 Part B)

A startup background task (`backend/app.py::_bg_refresh_remote_catalog`) polls on
a short tick (`OTOYIN_CATALOG_POLL_S`, default 1h) and fetches
`GET /v1/catalog` from the remote marketplace service only when stale
(`remote_catalog_stale`, threshold `OTOYIN_CATALOG_REFRESH_S`, default 24h) — so
the first tick refreshes at startup, catalog updates propagate without an app
restart, and a failed fetch is retried on the next tick rather than after a full
interval. The response verifies against the embedded Ed25519 public key before
swapping the in-memory `PRODUCTS`; any failure (offline, bad signature, timeout)
keeps the bundled catalog and logs silently — offline-first. Signed catalog
documents are never mutated: `local_status` is annotated *after* verification.
See `backend/services/marketplace_catalog.py::refresh_remote_catalog_if_stale`.

## Store categories

- **TTS** — Voice synthesis engines
- **STT** — Speech-to-text engines
- **LLM** — Language models for the assistant
- **SFX** — Sound effects engines
- **Plugins** — VST3/AU and MCP-server plugins

## Key features

- Catalog browsing with category filtering
- Product detail with descriptions, pricing, screenshots
- Download with progress tracking
- Entitlement verification (offline, Ed25519)
- Installed/available/paid/free filtering

## REST endpoints

| Endpoint | Method | Description |
|---|---|---|
| `GET /marketplace/catalog` | GET | List all products |
| `GET /marketplace/catalog/{id}` | GET | Get product detail |
| `POST /marketplace/download` | POST | Download a model |
| `GET /marketplace/entitlements` | GET | List entitlements |
| `GET /marketplace/install/{id}` | GET | Check if installed |

## Agent callable

```python
# Browse catalog
catalog = mcp.call("21labs.list_models")

# Download a model
mcp.call("21labs.models_download", engine="kokoro")

# Check status
status = mcp.call("21labs.models_list")
```

## Licensing (v1)

- **Free models:** Kokoro 82M, KittenTTS, MOSS-TTS-Nano, Parler-TTS Mini, Whisper tiny/base, Moonshine EN, DeepFilterNet, LavaSR, Bark
- **Paid models:** Additional Kokoro voices ($15), StyleTTS2 ($7), Qwen3-TTS ($12–$23), CosyVoice 2 ($15), Zonos ($15), Orpheus 3B ($15), ACE-Step ($23), Spatial Sound Engine ($9)
- **Discount packs:** Pro Voice ($31), Studio ($71), Music ($31), Creator Bundle ($103)
- **Student/indie discount:** 30%

See `docs/MARKETPLACE_PLAN.md` for full pricing and licensing details.
