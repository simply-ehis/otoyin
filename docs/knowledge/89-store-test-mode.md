# 89 — Store Test Mode (payment-free testing copy)

PURPOSE: How a build unlocks every Store product without the Dodo/Cloudflare/Neon payment infrastructure, and why production installers cannot.
OWNS: backend/services/licensing.py (store_test_mode, _test_mode_entitlements), backend/build_binary.py (flag bundling), bin/build-test.ps1, tauri/src-tauri/tauri.test.conf.json
READ-WHEN: Building a test/QA copy, debugging "everything shows Owned", or changing the entitlement gate.
KEY-FILES: backend/services/licensing.py, backend/routes/models/download.py, backend/routes/marketplace.py, app/src/features/store/StorePage.tsx
INVARIANTS: Frozen builds honor ONLY the bundled flag file — env vars (TWENTYLABS_STORE_TEST_MODE) never activate test mode in a shipped installer; bin/build-test.ps1 always strips the flag (finally-block); test grants STACK ON TOP of real licenses, never replace them.
GOTCHAS: The Store UI builds its owned-set from exact `models:<id>` strings and does NOT understand wildcards — test mode must enumerate per-product ids (from marketplace_catalog.PRODUCTS) in addition to the `models:*` wildcard that carries the download/verify gates. The marketplace_catalog module imports licensing at load time, so the enumeration import inside licensing must stay lazy.
UPDATED: 2026-10-13

## How it works
`licensing.store_test_mode()` resolves two ways:
- **Frozen (bundled) builds**: presence of `backend/data/store_test_mode.flag` inside the bundle (`sys._MEIPASS/backend/data/`). `bin/build-test.ps1` writes the flag, rebuilds the sidecar (build_binary.py `--add-data`s it), builds Tauri with the test identity, then deletes the flag.
- **Source runs (dev/tests)**: env `TWENTYLABS_STORE_TEST_MODE` in {1, true, yes} (case-insensitive).

`active_entitlements(db)` then adds `models:*` **plus** `models:<id>` for every catalog product. That single choke point feeds all three consumers: the 402 download gate (`has_entitlement` via `_matches` wildcard), `GET /marketplace/entitlements` (Store UI owned chips), and `POST /marketplace/verify`.

## Test copy identity
`tauri/src-tauri/tauri.test.conf.json` merges over `tauri.conf.json` (`npm run tauri -- build --config <abs-path>` — `npx` hangs on the offline registry here): productName "Otoyin Studio Test", identifier `com.otoyin.app.test` (separate install + `%APPDATA%` data dir — coexists with the production app), updater `active: false` (a test copy must never auto-update into a production binary).

## Build
```
pwsh -File bin/build-test.ps1     # or: just build-test
```
Produces `tauri/src-tauri/target/release/bundle/nsis/Otoyin Studio Test_0.1.0_x64-setup.exe`
(372.7 MB, verified 2026-10-14). The test config pins `targets: ["nsis"]` **and**
`createUpdaterArtifacts: false` — the base config sets the latter to `true`, which
makes `tauri build` demand the updater signing private key; a test copy has no updater
and no key. On this 3.4 GB box the cycle is ~53 min (PyInstaller ~20, cargo release
~12, makensis LZMA over the ~1 GB staged bundle ~25+), so run it in the background
without a timeout — two runs were killed by harness timeouts mid-compression.

Afterwards `tauri/src-tauri/binaries/otoyin-server` carries the TEST backend (bundled
flag). The script warns about this: re-stage the sidecar before a production build, or
the production installer picks up the test binary.

The installer built on 2026-10-14 predates the DeepFilterNet bundling fix (see
`90-audit-fixes-2026-10.md`); on a machine whose HF cache already holds
`deepfilter.onnx` the denoiser resolves offline anyway, and the next test build ships
the weights inside the bundle.

## Agent Callable
- **MCP Tools:** none (build-time concern)
- **REST:** `GET /marketplace/entitlements` (reflects test grants), `POST /models/download` (402 gate passes)
- **Key Files:** `backend/services/licensing.py`, `bin/build-test.ps1`
