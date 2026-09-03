# NOTICE — Otoyin Studios

Copyright © 2026 Ehis. All rights reserved where not otherwise licensed.

Otoyin Studio is licensed under the **GNU Affero General Public License v3.0**
(see `LICENSE`). "Sound" in Japanese (音 *oto*) and Chinese (音 *yīn*);
*"worthy of praise"* in Yoruba.

## Opened vs. proprietary

| Component | License |
|---|---|
| Backend services, engine wrappers, DSP/audio pipeline | AGPL-3.0 |
| Desktop app UI (React/Tauri), assistant, marketplace browsing | AGPL-3.0 |
| License **verification** logic (`services/licensing.py`) | AGPL-3.0 — public so verification is auditable; signatures are Ed25519 and cannot be forged from source |
| Marketplace license server, signing keys, payment webhooks | Proprietary — never distributed |
| Curated model weights / quant packs | Separate marketplace terms; not part of this repository |

Trademark: "Otoyin", "Otoyin Studios" and the whale-fluke mark are trademarks
of Ehis; the AGPL grants no naming or branding rights.

## Dependency notes (from the 2026-08-24 audit)

- No GPL-v2-only dependencies found; no blockers for AGPL-3 distribution.
- `num2words` — LGPL: used as an unmodified linked library, compatible.
- `PyMuPDF` — dual AGPL-3/commercial: we take the AGPL-3 side.
- ~60 packages ship without license metadata in their wheels; all are
  permissive (MIT/BSD/Apache) by spot-check at audit time. Re-verify any new
  dependency before release via `pip-license-checker` or equivalent.
- Bundled runtimes (`llama.cpp` server binaries, MIT) and ONNX Runtime
  (MIT) are redistributed under their respective notices.

## Identifier compatibility note (v1)

Wire-format identifiers intentionally retain the legacy prefix through v1:
`TWENTYLABS_*` environment variables and MCP tool namespace `21labs.*`.
These are scheduled to migrate to OTOYIN_*/`otoyin.*` in v1.1 with aliasing,
after downstream client configs have a migration window.
