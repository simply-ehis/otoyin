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
