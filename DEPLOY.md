# Deployment & Setup

**Updated:** 2026-09-06 (release signing-key lifecycle documented; 2026-09-04: crash reporting — first-party opt-in pipeline, no SaaS; Paddle cutover; lockfile committed, CI on `npm ci`).

Three deployable units, documented separately:

1. **Desktop app** (Tauri: `tauri/` + shared frontend `app/src` + bundled Python backend)
2. **Main backend** (`backend/` — FastAPI; runs locally with the desktop app, optionally on Railway)
3. **Marketplace service** (`marketplace/marketplace_server/` — Vercel + Neon)

Local dev is **npm-only** — no bun, no pnpm. See the migration note at the bottom.

---

## 1. Desktop app (Tauri build + release)

```bash
npm install            # one lockfile for the whole workspace
just setup-python      # backend venv + deps
just build             # server binary + Tauri app
```

- Frontend source lives in `app/src` (shell + shared lib) and `tauri/src`
  (Tauri entry); the Tauri webview builds the `tauri/` workspace, which
  aliases `@` → `app/src`.
- The Python backend is bundled with the app (`tauri/src-tauri/tauri.conf.json`
  → `resources: binaries/otoyin-server/`); the tag-gated `tauri-build` CI
  job builds it per-platform (`scripts/build-server.sh` → `backend/build_binary.py`
  PyInstaller onedir) and stages it before `cargo tauri build`, so installers
  ship with a working backend.
- **Updater: wired end-to-end** (see `docs/reports/2026-09-03-updater-audit.md`):
  `tauri-plugin-updater` is registered in the Rust shell, `tauri.conf.json`
  points at the GitHub Releases static manifest with an Ed25519
  pubkey, `createUpdaterArtifacts: true`, and the tag workflow signs every
  build (`TAURI_SIGNING_PRIVATE_KEY` secret) and uploads `latest.json`.
  Signing-key custody, rotation, and compromise recovery: see
  **Release signing-key lifecycle** below.
- Rebrand complete: bundle identifier is `com.otoyin.app` (renamed from `com.21labs.app`).

### Release signing-key lifecycle

The updater's trust anchor is the Ed25519 public key in
`tauri/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`); every installer
is signed at build time with the matching private key. Installed apps embed
the pubkey they were built with and refuse updates whose signature doesn't
verify against it — that constraint drives everything below.

**Custody rules**

- Private key: `tauri/src-tauri/.tauri-updater.key` — gitignored
  (`.gitignore:64`), **never committed** (untracked, absent from all git
  history — verified). It exists in exactly two places: the release
  manager's machine and the `TAURI_SIGNING_PRIVATE_KEY` GitHub secret.
- The `.key.pub` file is also untracked. The pubkey that ships is the one
  embedded in `tauri.conf.json` — that tracked field is the source of truth.
- The current pair is password-encrypted (`rsign encrypted secret key`,
  real password — generated 2026-09-22, key id `8875…`; stale predecessors
  backed up to `~/.tauri`). CI passes `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  through (build.yml), and the updater e2e test reads the same variable —
  an encrypted key without that secret hangs the signing step.
- Never pass the key on a command line in scripts or workflows; env var or
  `TAURI_SIGNING_PRIVATE_KEY_PATH` only.

**Generation**

```bash
cd tauri
npx tauri signer generate -w src-tauri/.tauri-updater.key  # writes .key + .key.pub
gh secret set TAURI_SIGNING_PRIVATE_KEY < src-tauri/.tauri-updater.key
# then paste the one-line base64 from .key.pub into tauri.conf.json
# plugins.updater.pubkey (that field takes the file's base64 box verbatim)
```

Verify before tagging a release:

```bash
# signs without prompting, using exactly the env vars CI uses:
TAURI_SIGNING_PRIVATE_KEY_PATH=src-tauri/.tauri-updater.key \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" npx tauri signer sign /tmp/dummy.bin
# manifest generator finds installer + .sig for at least one leg (rc 0):
# (needs GITHUB_REPOSITORY / GITHUB_REF_NAME set, run from the repo root)
python .github/scripts/build_update_manifest.py <artifact-dir>
```

(End-to-end harness: fake update server + `tauri dev --config` override
re-pointing `plugins.updater.endpoints` — see the updater audit report.)

**Rotation (installed base exists)** — two-release crossover. Changing the
signing key in one hop strands every existing install: release N signed with
the new key is rejected by apps still holding the old pubkey.

1. **Release N** — paste the NEW pubkey into `tauri.conf.json`; CI still
   signs with the OLD secret. Old installs accept N (old-key signature), and
   N's installed copies now trust the new key.
2. **Release N+1** — swap the GitHub secret to the NEW private key before
   tagging. N installs accept N+1 (new-key signature verifies against the
   new pubkey N carries).

Announce step 1 via the notices banner so the installed base actually lands
on N before N+1 ships — anyone who skips N is stranded at it.

**Pre-first-release rotation (current state)**: zero installed base, so it's
one step — generate the new pair, update `tauri.conf.json` pubkey and the
GitHub secret together, adopt semver. Nothing to strand.

**Compromise recovery**

If the private key (or the GitHub secret) is exposed or even suspected:

1. Treat every existing install as burned — their updaters trust the
   compromised key, and no manifest you publish can re-secure them. A
   password on the key only slows offline cracking; treat it as compromised
   regardless.
2. Generate a fresh pair immediately; update `tauri.conf.json` pubkey and
   the CI secret in the same next release (that release reaches only the
   installs made after it — see rotation above).
3. Broadcast a forced-migration notice: `POST /v1/notices/admin` (surfaces
   via the AnnouncementBanner) and a GitHub release note instructing users
   to manually download and reinstall the new build.
4. Audit the exposure window: GitHub releases API for unexpected assets or
   a tampered `latest.json`, CI run logs for unexplained signing jobs.
5. Re-sign nothing retroactively. Installers signed while the key was safe
   remain valid artifacts; only the update channel is burned.

## 2. Main backend (local, optional Railway)

Runs at `127.0.0.1:17493` by default, sidecar-bundled in production; it can
also be deployed remotely (e.g. Railway — `railway.json` builds the
`backend/Dockerfile`; healthcheck `/health`, 60s timeout).

```bash
just dev-backend       # uvicorn backend.main:app --reload --port 17493
# or remote:
python -m backend.main --host 0.0.0.0
```

**Railway variables:** `OTOYIN_PORT` (Railway injects `PORT` — the app reads
`OTOYIN_PORT` first, then `PORT`-style defaults), `LICENSE_SIGNING_KEY`,
`OTOYIN_CORS_ORIGINS` (if serving a web client), `OTOYIN_NOTICES_URL` (if you
want the deployed backend to also merge remote notices). Legacy `TWENTYLABS_*`
names are still honored with a deprecation warning for one release.

## 3. Marketplace service (Vercel + Neon)

See `marketplace/README.md` for full setup. Short version:

- Postgres (Neon) for products/orders/licenses/**notices**.
- Env: `MARKETPLACE_DATABASE_URL`, `MARKETPLACE_LICENSE_PRIVATE_KEY`
  (base64 Ed25519), `MARKETPLACE_PADDLE_API_KEY` (+ `MARKETPLACE_PADDLE_SANDBOX`,
  `MARKETPLACE_PADDLE_WEBHOOK_SECRET`, `MARKETPLACE_PADDLE_PRICE_MAP` —
  sandbox defaults ON, see `marketplace/README.md` and `PADDLE_TESTING.md`),
  `MARKETPLACE_ADMIN_KEY` (Bearer token for `POST /v1/notices/admin` and
  future admin routes).
- Serves: `/v1/catalog`, `/v1/checkout`, `/v1/webhook/*`, `/v1/notices`.
- The desktop app polls `/v1/notices` on launch via `OTOYIN_NOTICES_URL`
  (offline-first; see `docs/knowledge/77-notifications.md`).

## Environment variable reference

### Main backend (`backend/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `OTOYIN_HOST` | No | `127.0.0.1` | Bind host (legacy `TWENTYLABS_HOST` fallback) |
| `OTOYIN_PORT` | No | `17493` | Bind port (legacy `TWENTYLABS_PORT` fallback) |
| `OTOYIN_CORS_ORIGINS` | No | - | Extra CORS origins, comma-separated |
| `OTOYIN_LOG_FORMAT` | No | - | Log format override |
| `OTOYIN_NOTICES_URL` | No | (disabled) | Remote notices endpoint (`GET /v1/notices` on the marketplace service) |
| `OTOYIN_NOTICES_TIMEOUT_S` | No | `5` | Notices fetch timeout |
| `OTOYIN_CRASH_URL` | No | (disabled) | Crash-report forward target (`POST /v1/crashes` on the marketplace service); local log works regardless |
| `OTOYIN_CRASH_TIMEOUT_S` | No | `5` | Crash forward timeout |
| `OTOYIN_CATALOG_URL` | No | (disabled) | Remote signed catalog endpoint (`GET /v1/catalog` on the marketplace service); when unset the bundled catalog is used |
| `OTOYIN_CATALOG_TIMEOUT_S` | No | `8` | Catalog fetch timeout |
| `OTOYIN_CATALOG_REFRESH_S` | No | `86400` | Staleness threshold — refresh when the last successful fetch is older than this (24h) |
| `OTOYIN_CATALOG_POLL_S` | No | `3600` | Background poll tick — checks staleness hourly; fetches only when stale (bounded retry on failure) |
| `OTOYIN_CLIENT_ID` | No | - | MCP shim client id |
| `LICENSE_SIGNING_KEY` | No | dev default | HMAC/Ed25519 key for license signing |
| `FREESOUND_API_KEY` | No | - | Freesound v2 token |
| `TWENTYLABS_*` / `TWENTYONE_LABS_*` | No | - | Legacy names, still honored (deprecation-warned) |
| `VST3_USER_PATH` / `VST3_SYSTEM_PATH` | No | - | VST3 plugin search paths |
| `HSA_OVERRIDE_GFX_VERSION` | No | - | AMD ROCm override |

Source of truth: `backend/config.py` (`_env(new, old, default)` helper),
`backend/main.py`, `backend/app.py`.

### Marketplace service (Vercel)

| Variable | Required | Description |
|---|---|---|
| `MARKETPLACE_DATABASE_URL` | Yes | Neon connection string |
| `MARKETPLACE_LICENSE_PRIVATE_KEY` | Yes | base64 Ed25519 private key |
| `MARKETPLACE_PADDLE_API_KEY` | Yes* | Paddle API key (*sandbox key OK while testing; dev-mode fulfills free without it) |
| `MARKETPLACE_PADDLE_SANDBOX` | No | `true` (default) — set `false` in prod only |
| `MARKETPLACE_PADDLE_WEBHOOK_SECRET` | Yes* | Per-destination secret (`pdl_ntfset_...`); webhooks 401 without a match |
| `MARKETPLACE_PADDLE_PRICE_MAP` | Yes* | JSON product_id → Paddle `pri_...` (paid products 500 without an entry) |
| `MARKETPLACE_ADMIN_KEY` | No | Bearer token for `/v1/admin/*` routes (notices) |

## Local dev (end-to-end, npm only)

```bash
npm install            # whole workspace (root package-lock.json; CI uses npm ci)
just setup-python      # backend venv + pip deps
just dev               # backend + Tauri desktop
just dev-web           # backend + browser variant (app workspace)
```

No bun, no pnpm anywhere in the instructions. If you see one in a doc, it's
stale — report it.

## Backup (whole data directory + database)

Two supported paths — pick per need:

- **Single story, portable archive (UI: Stories → `···` → Export
  (.dstf.zip), header Import button):** `GET /stories/{id}/export`
  bundles the story record, items, generations, versions, audio files, and
  embedded voice profiles (self-contained by design). `POST
  /stories/import` restores with fresh IDs (no collisions); voices match
  by name first, then import the embedded copy. Use this to move work
  between machines.
- **Peace-of-mind full backup (manual):** stop the app, then copy these
  together — they are only consistent as a pair:
  - the data directory (`data/` next to the backend by default;
    `backend/config.py:get_data_dir()` is authoritative) — audio,
    profiles, generations, and the `otoyin.db` SQLite file inside it;
  - `OTOYIN_MODELS_DIR` too if set (model weights live outside `data/`
    when overridden; otherwise they are cache-redownloadable, not precious).
  - Restore = put both back in the same locations before starting the app.
  - Never restore the DB without its data dir (audio paths dangle) or
    vice versa (records point nowhere).

## Migration note (what moved where)

- **2026-09-04 — Payments (Paddle cutover):** PayProGlobal (`marketplace_server`
  checkout/webhook) and the in-repo Stripe stack (`backend/services/checkout.py`,
  `tax.py`, Stripe test files/docs, `/marketplace/checkout|webhook/stripe|
  license/{ref}|tax/*` routes) are gone. Paddle Billing is the single Merchant
  of Record — tax is calculated by Paddle, not locally. UI contract unchanged
  (`POST /v1/checkout`, `GET /v1/webhook/license/{ref}`). Seller-side setup
  (prices, destination secret, Payoneer payout) is dashboard work — see
  `PADDLE_TESTING.md` go-live checklist.
- **Package manager:** bun/pnpm → npm (root workspaces). CI uses
  `setup-node@v4` + `npm ci` against the committed root `package-lock.json`.
- **Env names:** `TWENTYLABS_*` → `OTOYIN_*` (backward-compat shims in
  `backend/main.py`, `backend/config.py`, MCP shim). Legacy names keep working.
- **Frontend shell:** `app/` is the browser variant + shared source; `tauri/`
  is the desktop shell (the old `web/` workspace was removed; `just dev-web`
  now points at `app`).
- **Notices/notifications:** new — notices live in the marketplace service,
  merged by the main backend at startup (`OTOYIN_NOTICES_URL`), surfaced by the
  existing banner/bell UI.
- **Payments:** single path — Paddle via the marketplace service (see the
  2026-09-04 entry above). No in-repo payment code remains in the main backend.
- **Updater:** functional wiring only — the JS flow + Rust plugin + endpoints
  + artifacts are in place; the desktop binary still needs the missing Rust
  engine commands (`start_server`, audio capture/playback) and a first signed
  release to exercise it (see 09 report).