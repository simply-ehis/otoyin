# Deployment & Setup

**Updated:** 2026-09-03 (redesign pass — post-rebrand env names, npm-only toolchain, notices backend added).

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
- The Python backend is bundled as a Tauri sidecar (`tauri/src-tauri/tauri.conf.json`
  → `resources: binaries/21labs-server/`).
- **Updater: NOT YET FUNCTIONAL** — see `docs/reports/2026-09-03-updater-audit.md`.
  `@tauri-apps/plugin-updater` is a dependency but the Rust plugin, endpoint,
  signing key, and `createUpdaterArtifacts` are all unconfigured. Until then,
  releases ship as installer artifacts only.
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
  (base64 Ed25519), payment credentials (currently PayProGlobal — **provider
  migration pending**, see `docs/reports/2026-09-03-payments-migration-plan.md`),
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
| `MARKETPLACE_PAYPROGLOBAL_*` | Yes* | PayProGlobal credentials (until provider migration lands) |
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

## Migration note (what moved where, 2026-09-03)

- **Package manager:** bun/pnpm → npm (root workspaces). CI uses
  `setup-node@v4` + `npm install`; tighten to `npm ci` once the root
  `package-lock.json` is generated on a networked machine (it is gitignored
  today — see `.gitignore` `package-lock.json`; that ignore should be removed
  when the lockfile lands).
- **Env names:** `TWENTYLABS_*` → `OTOYIN_*` (backward-compat shims in
  `backend/main.py`, `backend/config.py`, MCP shim). Legacy names keep working.
- **Frontend shell:** `app/` is the browser variant + shared source; `tauri/`
  is the desktop shell (the old `web/` workspace was removed; `just dev-web`
  now points at `app`).
- **Notices/notifications:** new — notices live in the marketplace service,
  merged by the main backend at startup (`OTOYIN_NOTICES_URL`), surfaced by the
  existing banner/bell UI.
- **Payments:** live path is PayProGlobal via the marketplace service; the
  in-repo Stripe path in the main backend is legacy/unused by the shipped
  frontend. Provider migration decision pending (see 10 report).
- **Updater:** not functional yet (see 09 report).