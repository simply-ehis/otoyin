# 69 — Marketplace & Store

> PURPOSE: How the otoyin model marketplace works — catalog, entitlements, download.
> OWNS: backend/routes/store.py, backend/services/marketplace_catalog.py, backend/services/model_registry.py
> READ-WHEN: browsing models, purchasing packs, managing entitlements, troubleshooting downloads
> KEY-FILES: backend/routes/store.py (REST), backend/services/marketplace_catalog.py (catalog), backend/services/model_registry.py (download/entitlements)
> INVARIANTS: free models download without license check; paid models require signed entitlement; catalog is bundled, then refreshed from the remote marketplace service (signature-verified, offline-first)
> GOTCHAS: remote refresh never breaks the app — on network failure/tamper the bundled catalog stays; refresh runs at startup (background task) + on Store open + every 24h
> UPDATED: 2026-09-04

## Overview

The marketplace provides a catalog of AI models, voice packs, and plugins.
Free models download directly; paid models require a license (Ed25519-signed
entitlement, verified locally).

## Remote catalog refresh (07 Part B)

At startup (background task) the app fetches `GET /v1/catalog` from the remote
marketplace service (`OTOYIN_MARKETPLACE_URL`, default
`https://otoyin-marketplace.example`), verifies the Ed25519 signature against the
embedded public key, and swaps the in-memory `PRODUCTS`. Any failure (offline,
bad signature, timeout) keeps the bundled catalog and logs silently — offline-first.
Signed catalog documents are never mutated: `local_status` is annotated *after*
verification. See `backend/services/marketplace_catalog.py::refresh_remote_catalog`.

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
