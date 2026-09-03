# RENAME_LOG — 21 Labs / TwentyLabs / Di Stefano → Otoyin

Product is now **Otoyin**. This log records what was renamed, what shims
keep old configs working, and what was intentionally left alone and why.

## Renamed with backward-compat shims

| Area | Change | Compat |
|---|---|---|
| `backend/main.py` | CLI description → "Otoyin backend server"; reads `OTOYIN_HOST` / `OTOYIN_PORT` first | Falls back to `TWENTYLABS_HOST` / `TWENTYLABS_PORT` with a deprecation warning; port-in-use hint prints the new name |
| `backend/config.py` | New `_env(new, old, default)` helper; all limits, host/port, models dir read `OTOYIN_*` first | Legacy `TWENTYLABS_*` values still honored |
| `backend/mcp_server/tools/_common.py` | `_get_mcp_base()` reads `OTOYIN_*` first | Legacy `TWENTYLABS_*` / `TWENTYONE_LABS_*` still honored |
| `backend/app.py` | `twentylabs_lifespan` → `otoyin_lifespan`; `OTOYIN_LOG_FORMAT`, `OTOYIN_CORS_ORIGINS`, argv port stored as `OTOYIN_PORT` | Legacy env names still honored |
| `backend/mcp_server/context.py` | Primary client header is now `X-otoyin-Client-Id` | Legacy `X-21labs-Client-Id` still accepted |
| `backend/mcp_shim/__main__.py` | Reads `OTOYIN_HOST` / `OTOYIN_PORT` / `OTOYIN_CLIENT_ID` first | Sends both new and legacy client headers; legacy `TWENTYONE_LABS_*` still read |
| `backend/mcp_server/server.py` | FastMCP `name="21labs"` → `name="otoyin"` | Display name only; tool names unchanged (see below) |
| `app/src/stores/serverStore.ts` | `isLoopbackTWENTYLABSServerUrl` → `isLoopbackServerUrl` | Old name kept as an alias export; test covers both |
| `marketplace/marketplace_server/app.py` | Title → "Otoyin Marketplace" | Docs-only surface |
| `marketplace/.../routes/checkout.py` | New orders use `otoyin_` prefix | Old `21labs_` rows stay valid — lookups match the full string, no migration needed |

## Renamed (user-visible strings, no compat needed)

- Theme label "Di Stefano" → "Otoyin" (`uiStore.ts`, en `translation.json`, `FEATURES.md`). Theme key `di-stefano` and CSS selectors unchanged — renaming the key would orphan persisted user settings; that is a separate slice.
- en `translation.json`: ".21-labs.zip" → ".dstf.zip" (matches the other three locales and the actual export filename in `backend/routes/profiles.py`).
- `.agents/skills/21 labs/` → `.agents/skills/otoyin-studio/` (skill `name:` frontmatter updated; `docs/knowledge/34-content-recipes.md` reference updated).
- `README.md` + studio skill: "44 active agent skills" → "63" (verified: 63 folders under `.agents/skills/` excluding `_shared`, none marked deprecated).
- `justfile` header comment → "Otoyin development commands".

## Intentionally left alone

- **MCP tool namespace `21labs.*`** (`MCP_NAME_PREFIX`, ~110 tool names, assistant mappings, voice-chat/workflow prompts, `mcp-tools-extended.md`, knowledge index): public agent API. Renaming breaks every connected MCP client and all recorded docs. Separate versioned migration, not this pass.
- **`X-21labs-Client-Id` legacy header + `twentylabs_CLIENT_ID` strings in en i18n**: describe the still-accepted legacy header. Both headers work, so both old and new doc wording stay true.
- **Binary/spec filenames** (`21labs-mcp.spec`, `21labs-server.spec`, `build_binary.py` names, `justfile` copy paths, `tauri.conf.json` resources, `setup-dev.js` placeholder, `sh.21labs.app` data path): build coordination slice. Renaming needs the spec files, build scripts, and Tauri sidecar wiring changed atomically and installer-tested.
- **Tauri bundle identifier `com.21labs.app`**: OS-level app identity. Changing it breaks updates for installed users; needs release planning.
- **`.mcp.json` server key/command**: points at the real `21labs-mcp` binary name; changes with the binary slice above.
- **Prod URLs** (`marketplace.21labs.app`, `app.21labs.app`, `telemetry.21labs.app`, marketplace `webhook_url`): DNS-dependent. Change only after the new domain serves traffic.
- **Plugin extension `.21labs` / `21labs.db` filename / `.21labs_probe`**: on-disk formats. Renaming orphans existing installs without a migration.
- **`CHANGELOG.md` history + `AI-KNOWLEDGE-PLAN.md`**: historical record; rewriting misrepresents what the product was called at the time.
- **`archive/` components**: not shipped; not worth churn.

## Audit command (remaining occurrences)

Most remaining matches are the wire-protocol names above, which must stay
until the versioned migration. Re-audit with:

```powershell
Get-ChildItem -Recurse -File -Include *.ts,*.tsx,*.py,*.json,*.md,*.toml,*.rs |
  Select-String -Pattern '21[- _]?labs|twenty[- _]?labs|di[- _]?stefano' -CaseSensitive:$false |
  Group-Object Path | Sort-Object Count -Descending
```

## Guideline compliance for this pass

- Ponytail: smallest surgical set; each row above is independently revertable; no new dependencies, no new abstractions (one `_env` helper, one alias export).
- Offline-first / low-end: no network or GPU assumptions added or changed.
- No floating UI / glassmorphism: no styling changes at all (`backdrop-blur`, translucent fills, floating panels untouched — none added).
- Zero placeholders: no new markers; `backend/scripts/check_placeholders.py` must stay green.
- Icons: no icon changes; heroicons-only rule untouched.
