# Remaining Production Tasks

## GitHub and public/private split

- [x] Create and push the complete source to a private GitHub repository
  (https://github.com/simply-ehis/otoyin, private, `main`; pushed 2026-10-13).
- [ ] Separate the public core from the private marketplace backend/catalog and
  model assets. The marketplace code is currently coupled to the app backend;
  inspect the exported source and built installers before publishing.
- [ ] Publish the separated core under the MIT license. Scan the public tree
  and release artifacts for private data, credentials, and model files first.
- [ ] Add the updater signing key/password as GitHub Actions secrets. After the
  public artifact boundary is safe, publish non-draft releases to the public
  update repository so installed apps can download `latest.json` and installers.

## Cloudflare and Neon

- [ ] Confirm the Cloudflare account has the Workers Paid plan for Containers.
- [ ] Create the Cloudflare Pages project `otoyin-marketplace`, configure the
  API Worker custom domain, and point DNS at the Pages site and Worker.
- [ ] Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to GitHub Actions.
- [ ] Add Worker secrets for the Neon database URL, license signing key,
  payment provider credentials, product map, and admin key. Keep payment in
  sandbox mode until end-to-end checks pass. The license private key is at
  `marketplace/.license_private.key` (gitignored; paste into
  `wrangler secret put MARKETPLACE_LICENSE_PRIVATE_KEY` — its public half is
  already committed at `backend/data/marketplace_public_key.txt` and bundles
  into frozen builds; see DEPLOY.md "Marketplace license-signing key
  lifecycle").
- [ ] Set `NEXT_PUBLIC_MARKETPLACE_API_URL` (ending in `/v1`) and
  `NEXT_PUBLIC_MARKETPLACE_URL` in GitHub repository variables. Confirm the
  Pages origin is allowed by `MARKETPLACE_ALLOWED_ORIGINS`.
- [ ] Configure the desktop `VITE_MARKETPLACE_URL` to the deployed API URL.

## Build and production verification

- [ ] Re-run `npm ci` and `npm run build` in `marketplace/web` when npm registry
  access is available. A lockfile mismatch was corrected, but the clean install
  and static Pages build could not be completed here.
- [ ] Run the marketplace checks and exercise catalog, checkout, webhook,
  refund, signed license, and notices against the Cloudflare deployment and
  Neon database before enabling live payments.
- [ ] Complete a signed Tauri release and test the updater from an installed
  build. Apple notarization and Windows Authenticode are intentionally skipped;
  users may see operating-system trust warnings. Keep Tauri update signatures.

## Support

- [ ] Implement the `/support` page and public GitHub issue forms described in
  [the support plan](docs/SUPPORT_FEEDBACK_PLAN.md).
- [ ] Choose the private contact route and response-time expectation for
  purchase, refund, license, and model-delivery support.

## Audit fixes and deferrals (2026-10-14)

A three-part production audit (frontend, Tauri, backend) found 30 issues; all
high-severity and the surgical medium/low findings were fixed (summary:
`docs/knowledge/90-audit-fixes-2026-10.md`). These were deliberately deferred:

- [ ] Frontend: `importSession` / `resetToTemplate` do not stop playback
  before swapping track audio (audit finding #12). The zustand store cannot
  reach the playback engine's `stopPlayback()`; wire an
  `onBeforeSessionSwap` callback from `AudioStudio` (which owns
  `usePlaybackEngine`) into the store, then re-enable session import during
  playback.
- [ ] Tauri: add `tauri-plugin-single-instance`. Two app instances race for
  port 17493 (the adoption/ownership logic now keeps this safe, but a second
  window is still poor UX). Blocked on the "no new dependencies without spec
  approval" rule — approve the plugin, then add it to `Cargo.toml` and
  `lib.rs`.
- [ ] Tauri: the macOS microphone/accessibility permission IPC commands are
  unregistered and cannot be exercised on the Windows dev box. Implement and
  verify on macOS hardware before an Apple release.
- [ ] Tauri: `fs:scope` in `capabilities/default.json` covers the standard
  save locations ($HOME, $DESKTOP, $DOWNLOAD, $DOCUMENT, $AUDIO, $VIDEO,
  $PICTURES). Exports to other roots (removable drives, custom paths) are
  rejected by the fs plugin — widen the scope or move export writes to the
  Rust side if this becomes a real complaint.
- [ ] Bundle: Demucs v4 (`htdemucs.onnx`, 303 MB) is listed in
  `backend/scripts/download_required_models.py::RUNTIME_WEIGHTS` and installs
  into `data/models/` on first use (HF cache copy cleared) — deliberately not shipped, since bundling it
  would grow every installer by more than the rest of the bundle. Revisit only
  if stem separation becomes a headline offline feature.
- [ ] Bundle: LavaSR is fetched on first use by the `audiosronnx` resolver
  (cache: `~/.local/share/audiosronnx`), so a truly air-gapped install cannot
  use bandwidth extension. Same trade-off as Demucs; bundle if offline
  completeness outgrows installer size.
- [ ] Models: NeuTTS / Kokoro-torch / PocketTTS / KittenTTS take a repo id
  and resolve internally (their loaders' own HF cache use is
  library-managed). The app layers (install, status, `_is_model_cached`)
  already follow the app-folder rule
  (`docs/knowledge/91-app-folder-models-and-staged-startup.md`); convert
  the loaders to local directories if those libraries ever accept them.
