# Otoyin — Documentation

**Otoyin** is an open-source, offline-first AI voice studio for professional audio post-production.

## Quick Start

```bash
npm install          # Install dependencies
npm run setup        # Download models / sidecar binaries
npm run dev          # Launch Tauri dev app (backend auto-starts in prod)
npm run dev:server   # Start Python backend separately (port 17493)
npm run lint         # Biome lint
npm run typecheck    # TypeScript check
```

## Active Docs

| Doc | Purpose |
|-----|---------|
| [ASSISTANT_ARCHITECTURE.md](ASSISTANT_ARCHITECTURE.md) | Planner-executor architecture, GGUF quants, model evaluation |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | Build state, known issues, test counts |
| [WHATS_NEXT.md](WHATS_NEXT.md) | Backlog and future work |
| [MARKETPLACE_PLAN.md](MARKETPLACE_PLAN.md) | Monetization plan |
| [DEPLOYMENT_TEST_PLAN.md](DEPLOYMENT_TEST_PLAN.md) | Pre-release smoke-test checklist |
| [AUDIO_PRODUCTION_GUIDE.md](AUDIO_PRODUCTION_GUIDE.md) | Production best practices |
| [FEATURES.md](FEATURES.md) | User-facing feature catalog |
| [Knowledge Base](knowledge/00-index.md) | Feature docs, tool reference, error handling |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution guidelines |

## Archived

Completed, locked, or deferred docs moved to `archive/`:

| Doc | Why archived |
|-----|-------------|
| `CLARITY_CAPABILITIES.md` | Completed capability scan — findings applied |
| `64-tts-enhancer-cleaner.md` | Phase 1 shipped; Phases 2/3 deferred |
| `future-rolling-autosave-history.md` | Deferred — not planned for v1 |
| `PLUGIN_MANIFEST_SCHEMA.md` | v1 manifest schema locked |
| `PRICING_PLAN.md` | Pricing locked 2026-08-17 |
| `USE_CASES.md` | Personas — all shipped features |
