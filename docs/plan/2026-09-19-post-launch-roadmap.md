# Post-Launch Improvement Roadmap

> PURPOSE: Ordered backlog after the app became buildable. What to do next,
> in what order, and why — each item names its files and its exit proof.
> OWNS: product owner + maintainers. READ-WHEN: planning any post-release
> work; before touching updater, bounce, DSP hot paths, or i18n.
> KEY-FILES: tauri/src-tauri/Cargo.toml, backend/services/effects_chain.py,
> backend/services/effects.py, backend/routes/audio_pipeline/processing.py,
> docs/PADDLE_LAUNCH_CHECKLIST.md.
> INVARIANTS: P0 before P1; no item lands without its proof; app stays
> offline-first and payment stays fail-closed throughout.
> GOTCHAS: updater correctness depends on P0.1+P0.2 together; bounce has TWO
> engines (P0.3); translations are English-backfilled, not translated (P1.6).
> UPDATED: 2026-09-19.

## Standing state (2026-09-19)

- NSIS installer builds (`Otoyin Studio_0.1.0_x64-setup.exe`), single multilingual target.
- All gates green on main (biome, tsc, ruff, pytest, vitest, pre-commit 11/11).
- Payments fail-closed pending the owner checklist; nothing in code blocks launch.

## P0 — correctness gaps (in order)

### P0.1 Updater end-to-end proof
Install the setup.exe on a clean machine/VM, publish a signed test
release, verify Settings → Check for updates downloads, verifies, installs.
**Proof:** screen recording of an update applying. Blocks trusting auto-update.

### P0.2 Tauri crate 2.9.5 → 2.11.x alignment
Clears the `__TAURI_BUNDLE_TYPE variable not found` warning, which explicitly
says the updater "may not be able to update this package."
Files: `tauri/src-tauri/Cargo.toml`, `Cargo.lock`. **Proof:** warning gone
from a clean `just build-tauri` log.

### P0.3 Bounce backend unification
Export-with-FX renders through `services/effects_chain.py` (16 effect
types) while Render FX uses `services/effects.py` (28 types) — telephone,
vocoder, auto-tune and friends silently do nothing on export. Unify on one
engine or surface the skips. **Proof:** render-then-export parity test.

### P0.4 Payment live run
Owner-side checklist in `docs/PADDLE_LAUNCH_CHECKLIST.md` (keys done; left:
Paddle account, 31 prices, webhook, deploy, sandbox sale, $1 live
donation + refund). **Proof:** real $1 charge + refund in dashboard.

## P1 — quality and performance

### P1.1 Python DSP off the event loop
Sidechain-duck, compress, and silence-removal loops run per-sample Python
inside async routes — long files stall every other request. Vectorize with
numpy or wrap in `asyncio.to_thread`.
Files: `backend/routes/audio_pipeline/processing.py`.
**Proof:** 10-minute file processes while `/health` stays <100ms.

### P1.2 Human translations
1784 keys across 8 locales are English backfills flagged needs-human-review.
**Proof:** parity script clean AND `_meta.status` flipped per locale by a reviewer.

### P1.3 Vite chunk warnings
Several chunks exceed 500KB after minification (`manualChunks` or limit
adjustment). Cosmetic + load-time. **Proof:** warning-free `vite build`.

### P1.4 StoryTrackEditor split
1000+ line component (known). Split by responsibility.
**Proof:** no file over the 500-line cap in the touched area.

### P1.5 configs.py growth
`backend/backends/configs.py` ~941 lines and growing (known).
**Proof:** split by engine family with the registry green.

## P2 — scale and operations

- **P2.1 Marketplace Postgres** — add `asyncpg`; SQLite + file backups are fine for start.
- **P2.2 Marketplace admin routes** — `MARKETPLACE_ADMIN_KEY` is currently unused; catalog edits go through `seed.py`/DB.
- **P2.3 Marketplace CORS tighten** — currently `allow_origins=["*"]`.
- **P2.4 Deep-link handler** for `otoyin://` (payment return-to-app; polling + Check-again covers it today).
- **P2.5 Playwright browser pinning** — local browsers drifted from the package version once; pin in setup.
- **P2.6 Money columns Float → Numeric(10,2)** — Decimal correctness in orders/donations.

## Explicitly not planned

- Full Audio Studio redesign (deferred earlier in favor of shipped slices).
- VST3/AU plugin hosting (upstream stub exists).
