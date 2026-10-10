# Post-Launch Improvement Roadmap

> PURPOSE: Ordered backlog after the app became buildable. What to do next,
> in what order, and why — each item names its files and its exit proof.
> OWNS: product owner + maintainers. READ-WHEN: planning any post-release
> work; before touching updater, bounce, DSP hot paths, or i18n.
> KEY-FILES: tauri/src-tauri/Cargo.toml, backend/services/effects_chain.py,
> backend/services/effects.py, backend/routes/audio_pipeline/processing.py,
> backend/routes/audio_pipeline/bounce.py, backend/backends/configs/ +
> backend/backends/registry.py, docs/PADDLE_LAUNCH_CHECKLIST.md.
> INVARIANTS: P0 before P1; no item lands without its proof; app stays
> offline-first and payment stays fail-closed throughout.
> GOTCHAS: updater correctness depends on P0.1+P0.2 together; bounce has TWO
> engines (P0.3: bounce.py → effects_chain.py 16 types, processing.py:604 →
> effects.py 28 types); translations are English-backfilled, not translated (P1.2).
> UPDATED: 2026-09-19 (verified 2026-09-19: P1.4 done, P1.5 split-landed,
> P2.2 admin-key wired — see items).

## Standing state (2026-09-19)

- NSIS installer builds (`Otoyin Studio_0.1.0_x64-setup.exe`), single multilingual target.
- All gates green on main (biome, tsc, ruff, pytest, vitest, pre-commit 11/11).
- Payments fail-closed pending the owner checklist; nothing in code blocks launch.

## P0 — correctness gaps (in order)

### P0.1 Updater end-to-end proof
Install the setup.exe on a clean machine/VM, publish a signed test
release, verify Settings → Check for updates downloads, verifies, installs.
**Proof:** screen recording of an update applying. Blocks trusting auto-update.

### P0.2 Tauri crate 2.9.5 → 2.11.x alignment — DONE (2026-09-19)
`Cargo.lock`: tauri 2.9.5→**2.11.5**, tauri-build 2.5.3→**2.6.3**,
tauri-plugin-updater 2.9.0→**2.11.0**, dialog→2.7.0, fs→2.5.0, shell→2.3.6
(max compatible; `Cargo.toml` carets already permit — lockfile-only change).
**Proof:** full `npm run tauri build` log (`tauri/src-tauri/target/tauri-build-p02.log`,
215 lines) has **zero** `BUNDLE_TYPE` / "may not be able to update" hits; exe +
`Otoyin Studio_0.1.0_x64-setup.exe` bundled via makensis. `cargo check` clean.
**Follow-up (owner, blocks P0.1):** build stops at updater signing —
`TAURI_SIGNING_PRIVATE_KEY` not set in this env (public key IS in
`tauri.conf.json`). No `.sig`/`latest.json` emitted until the private key is provided.

### P0.3 Bounce backend unification — DONE (2026-09-19)
`AudioEffectsChain.apply_chain` (`backend/services/effects_chain.py`) now falls
through to the Render FX engine (`services.effects.apply_effect`) for any type
outside its native 16 — telephone, vocoder, auto-tune + 12 more render on
export exactly as in Render FX. A type neither engine knows raises
`ValueError` (loud, like Render FX) instead of passing through silently.
Fixes bounce, mixer, plugin process/preview, and scripting paths at once
(all funnel through this function). **Proof:** `backend/tests/test_bounce_parity.py`
(13 tests: extended types transform + match Render FX bit-for-bit, stereo
bounce path, unknown raises) + 195 passed across effects/mixer/plugin/preset/
profile/export/mastering suites, ruff check + format clean.
**Follow-ups (not P0):** reverb tails differ between engines (output length;
deliberately excluded from strict parity) — unify tail handling or bless the
difference; `test_unknown_effect_returns_unchanged` was already failing on main
and now asserts the loud contract.

### P0.4 Payment live run
Owner-side checklist in `docs/PADDLE_LAUNCH_CHECKLIST.md` (keys done; left:
Paddle account, 31 prices, webhook, deploy, sandbox sale, $1 live
donation + refund). **Proof:** real $1 charge + refund in dashboard.

## P1 — quality and performance

### P1.1 Python DSP off the event loop — DONE (2026-09-19)
Duck + compress extracted to sync cores (`_duck_audio`, `_compress_audio` in
`backend/routes/audio_pipeline/processing.py`, DSP math byte-identical) and
run via `await asyncio.to_thread(...)` — the file's own established pattern
(`reverb_audio_route`, `apply_effect_chain_route`). Silence-removal needed NO
change: verified run-jumping (not per-sample) — heartbeat passes on the old
code; test pins the contract.
**Proof:** live server, 10-min/24 kHz file through `/audio/compress`, 335
`/health` polls during processing — max 379 ms, p99 266 ms, mean 84 ms
(idle baseline max 158/p99 53/mean 27 ms; pre-fix the loop stalled ~4 s per
60 s of audio, i.e. ~40 s of total starvation here). Residual is CPython GIL
contention from the worker thread; true <100 ms p99 needs vectorized DSP or
process isolation — recorded as follow-up, not pursued (no new deps, no DSP
behavior change). Guard: `backend/tests/test_processing_event_loop.py`
(heartbeat, fails pre-fix) + 22 passed, ruff check/format clean.

### P1.2 Human translations — OPEN (verified 2026-09-19: 9 locales × ~1250 keys, ~11265 total)
All non-English locales carry `_meta.status: needs-human-review` English backfills.
**Proof:** parity script clean AND `_meta.status` flipped per locale by a reviewer.

### P1.3 Vite chunk warnings — DONE (verified 2026-09-20)
Entry chunk (648→220KB): 8 non-English locales lazy-loaded via dynamic `import()` + `addResourceBundle()`.
vendor-syntax (618→72KB): full Prism bundle replaced with PrismLight + 17 registered languages.
**Proof met:** `vite build` warning-free; 591 vitest + lint + typecheck clean.

### P1.4 StoryTrackEditor split — DONE (verified 2026-09-19: 386 lines, under cap)
`app/src/features/stories/editor/StoryTrackEditor.tsx` measures 386 lines —
under the 500-line cap. No split needed unless it regrows.
**Proof met:** no file over the 500-line cap in the touched area.

### P1.5 configs.py growth — DONE (verified 2026-09-20)
`configs/__init__.py` (867→106): STT→`stt.py` (382), LLM→`llm.py` (160), music/misc→`music.py` (178).
`registry.py` (629→411): TTS registry→`registry/tts.py` (122).
All files ≤500 lines. 111 backend tests + 56 targeted tests pass (parakeet/qwen3 pre-existing skip).

## P2 — scale and operations

- **P2.1 Marketplace Postgres** — add `asyncpg`; SQLite + file backups are fine for start.
- **P2.2 Marketplace admin routes — PARTIALLY LANDED (verified 2026-09-19).**
  `MARKETPLACE_ADMIN_KEY` IS wired: `routes/notices.py` (`_require_admin`,
  `POST /v1/notices/admin`) + crash-report admin reads. Catalog edits still go
  through `seed.py`/DB. Remaining: catalog admin CRUD if wanted.
- **P2.3 Marketplace CORS tighten — DONE (verified 2026-09-20).** Restricted to localhost/tauri origins.
- **P2.4 Deep-link handler** for `otoyin://` (payment return-to-app; polling + Check-again covers it today).
- **P2.5 Playwright browser pinning** — local browsers drifted from the package version once; pin in setup.
- **P2.6 Money columns Float → Numeric(10,2) — DONE (verified 2026-09-20).** `price_usd`, `baseline_usd`, `amount_usd` all `Numeric(10,2)`.

## Explicitly not planned

- Full Audio Studio redesign (deferred earlier in favor of shipped slices).
- VST3/AU plugin hosting (upstream stub exists).
