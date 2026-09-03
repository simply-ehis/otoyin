# Plugin System (Marketplace Extensions)

PURPOSE: Install, verify, and safely run third-party `.21labs` plugin bundles.
OWNS: `backend/services/plugin_install.py`, `backend/routes/plugins_marketplace.py`,
`backend/plugins/manifest.py`, `backend/plugins/manifest_schema.json`.
READ-WHEN: Adding/auditing plugin install, signature verification, or runtime launch.
KEY-FILES: `services/plugin_install.py` (gates), `plugins/manifest.py` (schema + checksums).
INVARIANTS:
- Install NEVER executes third-party code.
- Every bundled file must match `manifest.checksums` (SHA-256) or install aborts.
- Executable kinds (`mcp-server`, `ui-panel`) require a valid Ed25519 signature over
  the canonical manifest; `TWENTYLABS_PLUGIN_REQUIRE_TRUSTED=1` restricts to
  `TWENTYLABS_TRUSTED_PLUGIN_KEYS`.
- Plugins install `enabled=False`. Nothing runs until a user enables it.
- `launch_plugin` is the only code-execution path: no shell, `entry.command` must be a
  file inside the install dir (no system binaries), args come only from the manifest,
  and a stripped env is passed. Declared `permissions` gate the launch.
GOTCHAS:
- Bundle = zip named `.21labs` with `manifest.json` (+ optional `manifest.sig`).
- `ui-panel` is recorded but NOT executed by the backend; the client must sandbox it.
- Checksums are a hard gate for ALL kinds; `verified` flag only reflects the signature.

## Endpoints (`/marketplace/plugins`)
- `POST /install` (UploadFile) — validate + verify + persist (disabled).
- `GET /` , `GET /{plugin_id}` — list / inspect.
- `POST /{plugin_id}/enable` , `/disable` — flip the enabled flag.
- `DELETE /{plugin_id}` — stop + remove row + remove dir (containment-checked).
- `POST /{plugin_id}/launch` , `/stop` , `GET /{plugin_id}/status` — runtime gateway (mcp-server only).

## Signature scheme
`manifest.sig` = base64(Ed25519(private_key, canonical(manifest))). `canonical` =
`json.dumps(manifest, sort_keys=True, separators=(",",":"))`. Developer public key is
`developer.pubkey` (`ed25519:<base64>`), declared in the manifest.

## Bundle authoring (`backend/scripts/build_plugin_bundle.py`)
Authoring counterpart to the install/verify contract. Produces a `.21labs` zip with
`manifest.json`, payload files, and an optional `manifest.sig`.

- `python -m backend.scripts.build_plugin_bundle --sample --out build/reference-plugin.21labs`
  builds a self-signed reference bundle from a generated sample plugin (voice-pack).
- `--source DIR` builds from a prepared directory (manifest.json + files).
- `--gen-key PATH` generates an Ed25519 keypair, embeds the public key, signs, and writes
  the key JSON. `--key PATH` signs with an existing base64 private key.
- `just plugin-bundle` runs the `--sample` build and prints the developer public key
  (usable as a `TWENTYLABS_TRUSTED_PLUGIN_KEYS` entry for curated-marketplace mode).
- The script mirrors `plugin_install._canonical` and `manifest.validate_manifest` exactly,
  so a bundle it produces is guaranteed to install through the real service.

## External-app linking layer
`external-app` is a distinct kind that links to an **existing system binary** (a DAW, CLI
tool, etc.) instead of shipping code. It relaxes exactly one invariant — runnable code may
live outside the bundle — and compensates with a dedicated, durable consent gate.

- Manifest: `kind: "external-app"`, `entry: { type: "external", command: <absolute path>, args: [...] }`.
  `command` must be an absolute path (no PATH resolution, no shell, no `..`).
- Install is identical to other executable kinds: **signature required**, installs
  `enabled=False`, `trust_external=False`.
- **Approval gate** (`POST /{id}/approve-external`) is the only way to set `trust_external=True`
  (and enables the plugin). It is durable — toggling `enabled` afterward does not require
  re-approval. This is the consent that distinguishes the linking layer from bundled code.
- **Launch** (`POST /{id}/launch-external` → `launch_external_plugin`): requires `enabled`
  AND `trust_external`; resolves `command` (absolute path, existing file, no `..`); spawns with
  no shell, manifest-only `args`, a stripped env, and the same `permissions` gate
  (`network` required for `socket` transport). Registered in the shared `_PROCESSES` map, so
  `stop` / `status` work unchanged.
- Never reuse the normal `launch_plugin` path for external targets — that path's safety
  depends on "code is inside the bundle"; mixing would defeat the checksum/signature model.
