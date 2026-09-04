# Deployment & Setup

**Updated:** 2026-09-04 (Paddle cutover — Stripe/PayProGlobal removed, lockfile committed, CI on `npm ci`).

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
  points at the GitHub Releases static manifest
  (`21-labs/21-labs/releases/latest/download/latest.json`) with an Ed25519
  pubkey, `createUpdaterArtifacts: true`, and the tag workflow signs every
  build (`TAURI_SIGNING_PRIVATE_KEY` secret) and uploads `latest.json`.
  **Before the first public release:** regenerate the signing key with
  `tauri signer generate` (our bootstrap pair lives at
  `tauri/src-tauri/.tauri-updater.key` — gitignored — and must be kept only in
  CI secrets), paste the new pubkey into `tauri.conf.json`, and adopt a semver
  scheme.
- Rebrand note: bundle identifier is still `com.21labs.app` (user-invisible);
  renaming it must be sequenced with the first updater release (breaks update
  matching for installed copies).

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