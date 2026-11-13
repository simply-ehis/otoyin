# Deployment & Setup

**Updated:** 2026-10-12 (Cloudflare deployment path prepared; marketplace uses Dodo Payments).

Three deployable units, documented separately:

1. **Desktop app** (Tauri: `tauri/` + shared frontend `app/src` + bundled Python backend)
2. **Main backend** (`backend/` — FastAPI; runs locally with the desktop app, optionally on Railway)
3. **Marketplace service and site** (`marketplace/` — Cloudflare Containers/Pages + Neon)

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
- Tauri updater signatures are required to protect updates. Apple notarization
  and Windows Authenticode certificates are separate and are currently omitted;
  macOS Gatekeeper and Windows SmartScreen may warn users about unsigned builds.
- Rebrand complete: bundle identifier is `com.otoyin.app` (renamed from `com.21labs.app`).

### Release signing-key lifecycle

The updater's trust anchor is the Ed25519 public key in
`tauri/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`); every installer
is signed at build time with the matching private key. Installed apps embed
the pubkey they were built with and refuse updates whose signature doesn't
verify against it — that constraint drives everything below.

**Custody rules**

- Private key: **outside the repository** at
  `%LOCALAPPDATA%\otoyin-signing-current-2026-11-13\.tauri-updater.key`
  (generated 2026-11-13, key id `39994F5CB339E87D`). The `.pub` sits next to
  it. Two places only: the release manager's machine and the
  `TAURI_SIGNING_PRIVATE_KEY` GitHub secret.
- The pubkey that ships is the one embedded in `tauri.conf.json`
  (`plugins.updater.pubkey`) — that tracked field is the source of truth.
  It was last set 2026-11-13 during the pre-first-release rotation.
- The current pair is password-encrypted (minisign; CI passes
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` through (build.yml), and the updater
  e2e test reads the same variable — an encrypted key without that secret
  hangs the signing step).
- Never pass the key on a command line in scripts or workflows; env var or
  `TAURI_SIGNING_PRIVATE_KEY_PATH` only.

**History**

- 2026-11-13: full rotation. The pair generated 2026-09-22
  (pubkey prefix `RWSIdWY+`, key id `8875…`) had an unencrypted raw seed
  (`.tauri-updater.key.legacy-raw.bak`) sitting in the working tree. Those
  files were moved out of the repo into
  `%LOCALAPPDATA%\otoyin-signing-retired-2026-11-13\` (nothing deleted). No
  release was ever signed by the retired pair, so the rotation stranded
  nothing.

**Generation**

```bash
cd tauri
npx tauri signer generate -w "%LOCALAPPDATA%\otoyin-signing-current-2026-11-13\.tauri-updater.key"  # writes .key + .key.pub
gh secret set TAURI_SIGNING_PRIVATE_KEY < "%LOCALAPPDATA%\otoyin-signing-current-2026-11-13\.tauri-updater.key"
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body "<the password>"
# then paste the RWS... line from .key.pub into tauri.conf.json
# plugins.updater.pubkey
```

Verify before tagging a release:

```bash
# signs without prompting, using exactly the env vars CI uses:
TAURI_SIGNING_PRIVATE_KEY_PATH="$LOCALAPPDATA/otoyin-signing-current-2026-11-13/.tauri-updater.key" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<the password>" npx tauri signer sign /tmp/dummy.bin
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

### Marketplace license-signing key lifecycle

Marketplace licenses (and the signed remote catalog) use a second Ed25519
keypair, independent of the updater key. Frozen builds embed the PUBLIC key
(`backend/data/marketplace_public_key.txt`, force-tracked — public keys
aren't secret) and verify every install locally; the marketplace Worker
signs with the private half via the `MARKETPLACE_LICENSE_PRIVATE_KEY`
secret. Same trust model as the updater: an install verifies only against
the key it shipped with.

**Custody rules**

- Public key: `backend/data/marketplace_public_key.txt` — committed;
  bundled into frozen builds by `build_binary.py` (`--add-data` →
  `<bundle>/backend/data`). Resolution order in
  `backend/services/licensing.py`: `TWENTYLABS_MARKETPLACE_PUBLIC_KEY`
  env > bundled file > committed dev placeholder (production rejects the
  dev key, so real builds must ship the bundled file).
- Private key: `marketplace/.license_private.key` — gitignored
  (`.gitignore:68`), never committed. It exists in exactly two places:
  the release manager's machine and the Cloudflare Worker secret.
- Debug marketplace servers sign with the committed DEV pair (same pair
  as the app's dev placeholder) so the local buy→install loop verifies;
  the server lifespan still refuses to start non-debug without the real
  secret.

**Generation + install** (current pair generated 2026-10-13):

```bash
python -c "import base64; from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey as K; from cryptography.hazmat.primitives.serialization import Encoding,NoEncryption,PrivateFormat,PublicFormat; k=K.generate(); print(base64.b64encode(k.private_bytes(Encoding.Raw,PrivateFormat.Raw,NoEncryption())).decode()); print(base64.b64encode(k.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)).decode())"
# private line -> marketplace/.license_private.key (+ offline backup)
# public line  -> backend/data/marketplace_public_key.txt (force-add: git add -f)
cd marketplace
npx wrangler secret put MARKETPLACE_LICENSE_PRIVATE_KEY   # paste the private line
```

**Rotation** — same two-release crossover as the updater key: an installed
app verifies only against the public key it shipped with, so a one-hop swap
strands every existing install. With zero installed base it's one step —
replace both files, `wrangler secret put` the new private half, ship. After
installs exist: ship release N carrying the NEW public key while the Worker
still signs with the OLD private key, then flip the Worker secret before
N+1.

**Compromise recovery** — a leaked private key lets anyone mint licenses
that verify on installed apps. Generate a fresh pair, rotate the Worker
secret and the bundled public key (two-release crossover), and treat
licenses signed during the exposure window as untrustworthy; the offline
model has no revocation list, so a forced-reinstall notice is the only
remediation for abused entitlements.

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

## 3. Marketplace service and website (Cloudflare + Neon)

See `marketplace/README.md` for setup. The API runs as a Dockerized FastAPI
service in Cloudflare Workers Containers; its Durable Object keeps one named
instance and forwards requests to the container. Neon remains the persistent
database. The static Next.js site deploys to Cloudflare Pages.

- Workers Containers require Cloudflare's Workers Paid plan. Deploy locally with
  `cd marketplace; npx wrangler@4 deploy --config wrangler.jsonc`, or let the
  `marketplace-cloudflare.yml` GitHub workflow deploy both services.
- Create the Pages project `otoyin-marketplace` once and set the GitHub
  repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Set repository variables `NEXT_PUBLIC_MARKETPLACE_API_URL` to the API origin
  ending in `/v1` (for example `https://api.example.com/v1`) and
  `NEXT_PUBLIC_MARKETPLACE_URL` to the API origin without `/v1`.
- Add runtime Worker secrets in Cloudflare for database, license signing,
  Dodo, and admin values; never put their values in GitHub variables or source.
- Add the Pages origin to `MARKETPLACE_ALLOWED_ORIGINS` as a JSON array so the
  API accepts browser requests from the deployed site.
- Set the desktop build's `VITE_MARKETPLACE_URL` to the deployed API origin.
- Env: `MARKETPLACE_DATABASE_URL`, `MARKETPLACE_LICENSE_PRIVATE_KEY`
  (base64 Ed25519), `MARKETPLACE_DODO_API_KEY` (+ `MARKETPLACE_DODO_SANDBOX`,
  `MARKETPLACE_DODO_WEBHOOK_SECRET`, `MARKETPLACE_DODO_PRODUCT_MAP` —
  sandbox defaults ON, see `marketplace/README.md`),
  `MARKETPLACE_ADMIN_KEY` (Bearer token for marketplace notice and crash
  administration endpoints).
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

### Marketplace service (Cloudflare Worker + Container)

| Variable | Required | Description |
|---|---|---|
| `MARKETPLACE_DATABASE_URL` | Yes | Neon connection string |
| `MARKETPLACE_LICENSE_PRIVATE_KEY` | Yes | base64 Ed25519 private key |
| `MARKETPLACE_DODO_API_KEY` | Yes* | Dodo API key (*test key OK while testing; local debug mode works without it) |
| `MARKETPLACE_DODO_SANDBOX` | No | `true` (default) — set `false` in prod only |
| `MARKETPLACE_DODO_WEBHOOK_SECRET` | Yes* | Webhook destination signing secret; production webhook calls fail closed without it |
| `MARKETPLACE_DODO_PRODUCT_MAP` | Yes* | JSON catalog product ID → Dodo product ID (paid products fail checkout without an entry) |
| `MARKETPLACE_ADMIN_KEY` | No | Bearer token for protected marketplace administration routes |
| `MARKETPLACE_ALLOWED_ORIGINS` | No | JSON array of browser origins permitted by API CORS |

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

- **Payments (Dodo):** Dodo Payments is the current provider in
  `marketplace/marketplace_server/dodo.py`; `marketplace/README.md` documents
  the required Dodo variables and webhook events. Older Paddle runbooks are
  stale and must not be used for deployment.
- **2026-09-04 — Payments (Paddle cutover):** PayProGlobal (`marketplace_server`
  checkout/webhook) and the in-repo Stripe stack (`backend/services/checkout.py`,
  `tax.py`, Stripe test files/docs, `/marketplace/checkout|webhook/stripe|
  license/{ref}|tax/*` routes) are gone. Paddle was the then-current Merchant
  of Record — tax is calculated by the processor, not locally. UI contract unchanged
  (`POST /v1/checkout`, `GET /v1/webhook/license/{ref}`). The implementation
  has since moved to Dodo; use the current Dodo settings above.
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
- **Payments:** Dodo via the marketplace service. No in-repo payment code
  remains in the main backend.
- **Updater:** functional wiring only — the JS flow + Rust plugin + endpoints
  + artifacts are in place; the desktop binary still needs the missing Rust
  engine commands (`start_server`, audio capture/playback) and a first signed
  release to exercise it (see 09 report).
