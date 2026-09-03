# Plan: Per-Engine Keepalive + S2 Emotion Chips + Model Health Dashboard

> PURPOSE: Turn 3 small features from maintenance into shippable slices, while fixing the 7 audit gaps that make those features necessary.
> OWNS: product + eng. READ-WHEN: touching keepalive, emotion, health, or any ModelConfig UI.
> KEY-FILES: `backend/database/models.py:297`, `backend/utils/model_lifecycle.py:141`, `backend/backends/configs/tts.py:187`, `backend/backends/protocols.py:370`, `app/src/components/EngineModelSelector.tsx:35`, `app/src/lib/hooks/useSettings.ts:123`, `docs/archive/PRICING_PLAN.md:64`
> INVARIANTS: Per-engine keepalive is a JSON column, not a new table; emotion chips inject `[tag]` not `(tag)`; health dashboard is read-only (no live graph mutations).
> GOTCHAS: `fish_speech_s2` is invisible in UI today (`EngineModelSelector:35` missing) — fix first or S2 chips are untestable; `gpu_only` must disable on CPU; `tsc` is slow (90s timeout in `bin/check.ps1:68`).
> UPDATED: 2026-08-26

---

## 0. Audit synthesis (why these 3)

Full `get_all_model_configs()` audit (16 TTS, 7 VC, 9 STT, 5 LLM, 3 music) vs frontend `EngineModelSelector.tsx:35`, `SampleColumn.tsx:216`, `languages.ts:66`, `marketplace_catalog.py:24` found 7 gaps that block the 3 features:

| # | Gap | Severity | Blocks |
|---|-----|----------|--------|
| G1 | `fish_speech_s2` not in `ENGINE_OPTIONS`/`languages.ts`/`useGenerationForm` enum — backend ready (`protocols:373`, `configs/tts:192`, `registry:124`), UI invisible | **P0** | A,B,C |
| G2 | `CLONING_ENGINES` mismatch: frontend allows `moss_tts_nano`/`neutts`/`neutts_2e` (`EngineModelSelector:135`), backend `profiles.py:26` rejects with 400 | P1 | A |
| G3 | `voice_design` dead: `SampleColumn:260` collects `voiceDescription` but `useProfileFormHandlers:205` never sends `design_prompt` (`voice_type:"designed"` never created) — `parler_tts`/`qwen3_tts`/`fish_speech` 14+20 presets orphaned | P1 | — |
| G4 | Preset picker hardcodes `kokoro|kitten_tts` (`SampleColumn:216`), hides `pocket_tts` (20), `bark_small` (26), `parler_tts` (14), `neutts_2e` (4), `orpheus` (8) | P1 | A,B |
| G5 | Tag vocab not engine-aware: `ParalinguisticInput.tsx:23` hardcodes 9 `[laugh]…` vs `supported_tags` per engine (`tts.py:204` 8 `[angry]…` for S2, 10 for zonos, 10 for chattts, 7 `<laugh>` for orpheus) — orpheus `<tag>` vs `[tag]` syntax mismatch | P1 | B |
| G6 | `gpu_only`/`needs_trim` invisible: `fish_speech_s2`/`seed_vc` `gpu_only:T` has `storeUtils:104` chip but `EngineModelSelector:265` `isProfileCompatible` doesn't disable on CPU; `needs_trim:T` (7 configs) has no badge | P2 | A,C |
| G7 | Catalog gaps: `chattts`, `f5-tts-onnx`, `whisper-large-v3`, `parakeet-v3-f16` in `configs` but not in `marketplace_catalog.py:24` — downloadable via direct `model_name` but no Store card | P2 | C |

Without G1, B is untestable. Without G4/G5, B shows wrong vocab. Without G2/G6, A misfires on CPU.

---

## 1. Slice A — Per-Engine Keepalive

**Goal:** Global Performance Mode (`GeneralPage:221`) is all-or-nothing. Let users keep S2 Pro resident but unload Whisper, or vice versa. 3.4GB S2 on 16GB RAM needs selective keepalive.

**Non-goal:** Per-model (not per-engine) granularity; auto-tuning; UI for non-TTS engines.

**Design:**
- DB: add `per_engine_keepalive JSON` column to `PerformanceSettings` (`database/models.py:297`) — `{"fish_speech_s2": true, "whisper": false}`. Default `{}` (empty = follow global). Not a new table — 1 JSON column, 1 migration.
- Service: `services/settings.py:124` `get_performance_settings`/`update` handle merge; new `is_engine_keepalive(engine)` helper.
- Lifecycle: `utils/model_lifecycle.py:141` `ModelLifecycleManager` — add `per_engine_overrides: dict` read via `refresh_performance_mode()` (already polled every 30s at `model_lifecycle.py:192` + pre-read at `start():202`). `_unload_if_idle()` checks `per_engine_keepalive.get(engine, global_mode)` before `always_on`.
- API: `models.py:438` `PerformanceSettingsResponse.per_engine_keepalive: dict[str,bool] = {}` + `PerformanceSettingsUpdate` same. `routes/settings.py:71` `PUT /settings/performance` already handles partial `patch.model_dump(exclude_unset=True)` — no new route.
- Frontend: `types.ts:334` `PerformanceSettings.per_engine_keepalive?: Record<string,boolean>`, `clientCaptures.ts:101` no change, `useSettings.ts:123` `usePerformanceSettings` already optimistic — add `per_engine_keepalive` to patch. `StorePage.tsx:1` and `EngineModelSelector.tsx:35` add per-engine toggle row (only for engines with `size_mb > 500` to avoid clutter) — reuses `Toggle` + `showStudioErrorToast` pattern from `GeneralPage:229`.
- Gating: only show toggle for engines that are `downloaded` (`status.py:147` `entitled`) — no toggle for not-downloaded.

**Files:** `database/models.py:297`, `services/settings.py:124`, `models.py:438`, `utils/model_lifecycle.py:141`, `types.ts:334`, `useSettings.ts:123`, `StorePage.tsx:1` (or new `PerEngineKeepaliveRow.tsx` <100 lines).

**Verification:** `pytest backend/tests/test_performance_mode.py:1` add `test_per_engine_keepalive_overrides_global` (global False + per-engine True → no unload). Manual: toggle S2 keepalive on, set global off, wait 30s poll, `GET /health` shows `fish_speech_s2` still loaded via `lifecycle_manager._engines`.

**Risk:** JSON column migration on SQLite needs `ALTER TABLE performance_settings ADD COLUMN per_engine_keepalive JSON DEFAULT '{}'` — add via `alembic` or `Base.metadata.create_all` fallback (like `_get_or_create_performance_row` does). Low.

---

## 2. Slice B — S2 Emotion Chips

**Goal:** S2's 8 `[angry]…` tags (`configs/tts.py:204`) are bracket-normalized in `fish_speech_s2_backend.py:173` but user must type `[angry]` manually. Add chip row that inserts tag; while fixing G4/G5, make tag vocab engine-aware.

**Non-goal:** Free-text emotion prompt; per-engine tag editor modal (just chips + full list tooltip).

**Design:**
- Fix G1 first: add `fish_speech_s2` to `EngineModelSelector.tsx:35` `ENGINE_OPTIONS` (label "Fish Audio S2 Pro (GGUF) — 10 langs, clone, 3.4GB, GPU"), `languages.ts:66` `ENGINE_LANGUAGES` 10 langs `en,zh,ja,ko,de,fr,es,pt,ru,it`, `useGenerationForm.ts:22` `generationSchema` enum, `modelUtils.ts:55` desc already exists.
- G4: replace `SampleColumn.tsx:216` hardcoded `kokoro|kitten_tts` with dynamic: `const presetEngines = useMemo(() => models.filter(m => m.structured_preset_voices.length>0).map(m=>m.engine), [models])` — covers `kokoro` (45), `pocket_tts` (20), `parler_tts` (14), `kitten_tts` (8), `bark_small` (26), `neutts_2e` (4), `orpheus` (8).
- G5: make `ParalinguisticInput.tsx:23` engine-aware: prop `supportedTags: string[]` from `useEngineCapabilities():92` `supported_tags` (full list, not `slice(0,4)`), render chips `supportedTags.map(tag => <Chip onClick={() => insertTag(tag)}>{tag}</Chip>)`. For orpheus, tags are `<laugh>` — insert as-is, no bracket conversion (backend already handles `<tag>` via `vc.py:116` vs `[tag]`).
- New `S2EmotionChips.tsx` (<80 lines): `const TAGS = ["[angry]","[sad]","[whisper]","[shout]","[laugh]","[sigh]","[excited]","[surprised]"]` from `configs/tts.py:204` but reads live from `ModelStatus.supported_tags` so catalog change auto-updates. Renders as `ToggleGroup` above `TextInputField.tsx:61`; `onChipClick` inserts `tag + " "` at cursor in `useGenerationForm`'s `text` field.
- G2 fix (small): align `CLONING_ENGINES` — add `moss_tts_nano`/`neutts`/`neutts_2e` to `backend/services/profiles.py:26` (one-shot clones should be profile-clonable; `bark_small` stays preset-only). One-line change.

**Files:** `EngineModelSelector.tsx:35,66,216`, `languages.ts:66`, `useGenerationForm.ts:22`, `ParalinguisticInput.tsx:23`, new `S2EmotionChips.tsx`, `profiles.py:26`.

**Verification:** `pytest test_fish_speech_s2.py:128` already asserts `[angry]` normalize — add `test_emotion_chip_inserts_bracket_tag` via `@testing-library/react` (render `S2EmotionChips`, click `[angry]`, assert `textarea.value` starts with `[angry]`). Manual: select `fish_speech_s2` in `EngineModelSelector`, see 8 chips, click `[whisper]`, generate, verify output contains whisper style.

**Risk:** `ParalinguisticInput` generic 9 tags vs engine-specific 8/10 — switching to engine-aware changes existing UX for `chattts`/`zonos`/`orpheus` (they'll now see correct vocab, which is a fix, not a regression). Low.

---

## 3. Slice C — Model Health Dashboard

**Goal:** Users can't see why S2 is slow or which models are resident (triage from `bin/check.ps1:68` 90s tsc slowness). Read-only dashboard showing `GET /health` VRAM + `lifecycle_manager` loaded set + `check.ps1` gate status.

**Non-goal:** Live graph mutations, manual load/unload buttons (just display), or fixing tsc slowness itself.

**Design:**
- Backend: add `GET /health/models` (or extend `GET /health` `HealthResponse:589` which already has `vram_*`, `model_loaded`, `subsystems`) to return `lifecycle_manager._engines` dump: `{engine, is_loaded, last_used, always_on, per_engine_keepalive}`. Reuse `utils/model_lifecycle.py:66` `_EngineHandle`, no new DB. Add `GET /health/check` that runs `backend.scripts.check_name_map` + `check_placeholders` + `biome --version` and returns `{biome, ruff, tsc, name_map}` — read-only, no mutations.
- Frontend: new `ModelHealthPage.tsx` (<200 lines) under `Settings → System` (`router.tsx:388` new `settings/system` route, `SettingsLayout` tab). Shows: VRAM bar (`vram_used_mb/total_mb`), per-engine table (engine, loaded, last used, keepalive), gate status (last `bin/check.ps1` run time + result). Reuses `Progress`, `Badge`, `useServerHealth`.
- G6: surface `gpu_only`/`needs_trim` in dashboard as badges (chip `GPU` red for `fish_speech_s2`/`seed_vc` on CPU via `status.py:169` `gpu_only`, `needs_trim` badge via `configs`).
- G7: add missing catalog products (`chattts`, `f5-tts-onnx`, `whisper-large-v3`, `parakeet-v3-f16`) to `marketplace_catalog.py:24` as `paid` with correct `price_usd` from `PRICING_PLAN.md:64` or mark as bundled-free — one-line each.

**Files:** `routes/health.py` (new `health_models.py` or extend `health.py`), `models.py:589` `HealthResponse` extension, `app/src/components/ServerTab/ModelHealthPage.tsx` (new), `router.tsx:1`, `marketplace_catalog.py:24`.

**Verification:** `pytest test_model_gate.py:1` add `test_health_models_lists_engines` (16 engines, `fish_speech_s2` present, `is_loaded` bool). Manual: open `Settings → System`, see S2 row `loaded: false` → generate with S2 → row flips to `true` within 30s poll, VRAM bar updates.

**Risk:** `GET /health/check` runs `check_name_map` which scans `mcp_server/tools` — add 5s timeout and cache 60s so dashboard doesn't hang. Low.

---

## 4. Missing-feature fixes (from audit G2-G7) — ordered

Do G1 first (unblocks B), then G4/G5 with B, then G2/G6/G7 with A/C:

| Order | Fix | File | Effort | Slice |
|-------|-----|------|--------|-------|
| 1 | G1: add `fish_speech_s2` to `ENGINE_OPTIONS`/`languages`/`useGenerationForm` | `EngineModelSelector:35`, `languages.ts:66`, `useGenerationForm:22` | S | B |
| 2 | G4: preset picker dynamic | `SampleColumn:216` | S | B |
| 3 | G5: engine-aware tags | `ParalinguisticInput:23`, `EngineCapabilitiesChips:356` | S | B |
| 4 | G2: `CLONING_ENGINES` align | `profiles.py:26` | XS | A |
| 5 | G3: `voice_design` dead path | `useProfileFormHandlers:205`, `SampleColumn:260` | M | — (defer, not in 3) |
| 6 | G6: `gpu_only`/`needs_trim` badges | `EngineModelSelector:265`, `ModelHealthPage` | XS | A,C |
| 7 | G7: catalog gaps | `marketplace_catalog:24` | XS | C |

G5 deferred: proper `voice_design` (text-described voice) needs new `POST /profiles` `voice_type:"designed"` flow + `design_prompt` handling — larger than B, keep out of slice B (just fix preset picker, not design).

---

## 5. Execution order (small, reversible, verify each)

1. **G1** (1 commit, unblocks B) → verify `fish_speech_s2` selectable, `pytest test_fish_speech_s2:18` still pass
2. **Slice B** (1 commit: G4+G5+bracket chips) → `biome check`, `pytest test_fish_speech_s2:5` new chip test, manual S2 generate
3. **Slice A** (1 commit: DB JSON + lifecycle + API + Store toggle) → `pytest test_performance_mode:8` + new per-engine test, `bin/checkps1 -NoTests` 8/8, manual keepalive toggle
4. **Slice C** (1 commit: health route + dashboard + G7 catalog) → `pytest test_model_gate` new, manual dashboard poll
5. **G6** polish (1 commit) — badges, can ride with C

Each slice <300 lines, <3 files, `bin/check.ps1` + `pytest -k` + `biome` gate per commit. No new deps. `fish_speech_s2` is the critical path — G1 first.

---

## 6. Open questions for confirm

- Per-engine keepalive default: empty JSON (follow global) vs explicit `false` per engine? Propose empty (less migration).
- Emotion chips placement: above `TextInputField` (global) vs inside `ParalinguisticInput` (only when `supportsParalinguistic`)? Propose above, visible for S2 even when not in paralinguistic mode.
- Health dashboard route: `Settings → System` (new) vs `Settings → About` section? Propose new `Settings → System` to keep `About` clean.
- `voice_design` dead path: defer fully (as above) or include minimal fix in B? Propose defer.

Confirm scope or adjust, then I’ll build G1 + Slice B first.
