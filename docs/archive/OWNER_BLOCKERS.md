PURPOSE: Every clean-build/launch blocker that needs the human owner (accounts, money, keys, DNS) — start these while the agent handles the code.
OWNS: product owner (Ehis). Everyone else: read-only.
READ-WHEN: before first sale, before first signed release, when checkout/license/updater fails in prod, when planning the launch week.
KEY-FILES: docs/PADDLE\_LAUNCH\_CHECKLIST.md (payment steps), PADDLE\_TESTING.md (test loops), DEPLOY.md (deploy + key lifecycle), RENAME\_LOG.md (domains intentionally still 21labs.app).
INVARIANTS: code is fail-closed without these (503, never free licenses; updater refuses unsigned manifests); nothing here needs a code change.
GOTCHAS: sandbox keys must never ship in prod; rotating the license keypair invalidates old licenses; rotating the updater key in one hop strands installed apps (two-release crossover — DEPLOY.md).
UPDATED: 2026-09-22

# Owner Blockers — Start These, Agent Handles the Rest

Code is done and fail-closed. Everything below is an account, a purchase,
a dashboard click, or a secret only you can create. Work top-down; each
section says exactly what to do and where the how-to lives.

## 1\. Payments (Paddle) — blocks all revenue

Full steps: `docs/PADDLE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_LAUNCH\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_CHECKLIST.md`. Test loops: `PADDLE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_TESTING.md`.

* \[ ] **Paddle seller account** — sign up at https://vendors.paddle.com
(**Billing**, not Classic).
* \[ ] **Nigerian payout** — connect **Payoneer** under Paddle checkout
settings and confirm a **test payout lands** before going live. No code
ships until money movement is verified, not assumed.
* \[ ] **31+ paid catalog products → Paddle prices** — one product + price per
paid product in the dashboard; copy each `pri\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_...` ID into the single
`MARKETPLACE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_PADDLE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_PRICE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_MAP` JSON env var. Any paid product without an
entry 500s at checkout by design.
* \[ ] **Webhook destination** — Paddle notification destination →
`https://<your-host>/v1/webhook`, subscribed to `transaction.completed`,
`transaction.canceled`, `transaction.payment\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_failed`,
`adjustment.created`; copy the `pdl\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_ntfset\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_...` secret to
`MARKETPLACE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_PADDLE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_WEBHOOK\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_SECRET`.
* \[ ] **License keypair (do before deploying)** — generate one Ed25519 pair
(command in `PADDLE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_LAUNCH\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_CHECKLIST.md` §1): private →
`MARKETPLACE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_LICENSE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_PRIVATE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_KEY` on the server; public → release builds
via `TWENTYLABS\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_MARKETPLACE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_PUBLIC\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_KEY` **plus**
`TWENTYLABS\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_ENV=production`. Mismatch = every paid license fails on-device.
* \[ ] **Sandbox sale end-to-end**, then a **live $1 donation + refund**
(exercises refund→revoke before real money). Then flip
`MARKETPLACE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_PADDLE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_SANDBOX=false` in prod only.

## 2\. Release signing — blocks shipping installers users trust

Key lifecycle: `DEPLOY.md` ("Release signing-key lifecycle").

* \[x] **Updater keypair rotation — DONE 2026-09-22 (key id `8875…`).**
Fresh passworded pair generated; raw pubkey in `tauri.conf.json`
(Tauri-native format); private key ONLY at
`tauri/src-tauri/.tauri-updater.key` (gitignored — verified). Stale
unmatching key backed up to `\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\~/.tauri/otoyin-stale-backup-2026-09-22.key`.
Updater e2e (sign→manifest→download→verify) is green. `build.yml` now
passes the password secret through; e2e test reads it from
`TAURI\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_SIGNING\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_PRIVATE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_KEY\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_PASSWORD` (same variable CI uses).
* \[ ] **Save the two secrets at repo creation** (nothing to set until the
`simply-ehis/otoyin` repo exists): **(1)** `TAURI\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_SIGNING\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_PRIVATE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_KEY` =
contents of `tauri/src-tauri/.tauri-updater.key`
(`gh secret set TAURI\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_SIGNING\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_PRIVATE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_KEY < tauri/src-tauri/.tauri-updater.key`);
**(2)** `TAURI\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_SIGNING\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_PRIVATE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_KEY\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_PASSWORD` = the password handed over
in chat 2026-09-22 (also save it in your password manager — loss =
no more signed updates, per the CLI's own warning).
* \[ ] **macOS: Apple Developer membership ($99/yr)** — required for
code-signing + notarization; without it macOS Gatekeeper warns/blocks.
Human account decision (loop-log 17).
* \[ ] **Windows: Authenticode OV/EV certificate (\~$200–400/yr)** — without it
SmartScreen flags the installer. Human cost/vendor decision (loop-log 17).
* \[ ] **First signed release + updater E2E proof** (roadmap P0.1) — tag,
install the setup.exe on a clean VM, verify Settings → Check for updates
applies. Screen-record it; that recording is the proof auto-update works.

## 3\. Hosting + data — blocks the marketplace service

Setup: `marketplace/README.md`. Env reference: `DEPLOY.md` §3.

* \[ ] **Vercel project** for `marketplace/` + **Neon Postgres** database.
(SQLite file works to start — back it up; Neon needs `asyncpg` added to
requirements first, it is not installed today.)
* \[ ] **All `MARKETPLACE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*` env vars set in Vercel** (API key, sandbox flag,
price map, webhook secret, license private key, `MARKETPLACE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_ADMIN\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_KEY`).
`MARKETPLACE\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_DEBUG=false` in prod (dev auto-fulfill must be off).
* \[ ] **Seed + HTTPS** — run `python -m marketplace\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_server.seed`, serve behind
public HTTPS (Paddle webhooks require it).

## 4\. Domains + DNS — blocks prod URLs resolving

Per `RENAME\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_LOG.md`, prod URLs intentionally still say `21labs.app` (change
only after the new domain serves traffic). `app/src/lib/marketplace.ts:14`
hardcodes `https://marketplace.21labs.app`; `tauri.conf.json` updater
endpoint, CUDA binary URL, and About/Privacy links point at
`github.com/simply-ehis/otoyin` (rewritten 2026-09-22; was `anomalyco`).

* \[ ] **Point DNS + TLS at the marketplace host** (or change the URL in
`marketplace.ts` and rebuild — that half is agent work once you decide).
* \[ ] **Create the release repo + connect it** — this checkout has never
been pushed anywhere (no git remote; nothing will be pushed without your
explicit say-so). Create `simply-ehis/otoyin` on GitHub, then set it as
`origin` (`git remote add origin https://github.com/simply-ehis/otoyin.git`).
Code already points there (updater endpoint, CUDA downloads, About/Privacy
links, updater e2e fixtures). Before the first signed tag, the agent
re-verifies the updater pubkey against the new repo.
* \[ ] Optional future: `otoyin://` deep-link OS handler for payment
return-to-app (polling + "Check again" covers it today — roadmap P2.4).

## 5\. Optional, not launch-blocking

* **Human translations** (roadmap P1.2) — 9 locales are English-backfilled and
flagged `needs-human-review`. Shippable as-is; review when you want.
* **Freesound API key** — end-user BYOK in Settings, not an owner task.
* **Neon/Postgres migration** (roadmap P2.1) — only when SQLite outgrows start.

## 6\. Agent handles the rest (do not start these yourself)

* All code, lint/type/test gates (`bin/check.ps1`), and CI wiring.
* Changing hardcoded URLs after you decide domains, rebuilds, manifest gen.
* Catalog admin CRUD, CORS tightening leftovers, deep-link plugin, Playwright
pinning (roadmap P2) — say the word per item.
* Re-running the verification gate after each phase and reporting evidence.

## Go-live order (short version)

1. §1 keypair → §3 deploy (HTTPS, seeded, key prefix matches) →
sandbox sale → $1 live donation + refund → `SANDBOX=false`.
2. §2 GitHub secret confirmed → first signed tag → clean-VM updater proof.
3. §4 DNS live → prod builds → monitor webhook logs.
4. Certs (Apple/Windows) any time before you need warning-free installs.

