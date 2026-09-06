# Prompt: Full Rebrand — 21-labs / TwentyLabs / Di Stefano → Otoyin

## Context

The product is called **Otoyin** now. It was previously "Di Stefano," then
"21 Labs" (also written "21-labs," "TwentyLabs," "21labs"). The user-facing
name has mostly moved to Otoyin already — the `README.md` and logo are
correct — but the old names are still baked into internals: environment
variable names, function names, service titles, DB-adjacent identifiers,
and scattered docs/config. A repo-wide grep across `.ts .tsx .py .json .md
.toml .rs` for `21[- ]?labs|twenty ?labs|di ?stefano` (case-insensitive)
currently returns matches in **~298 files**. Most of those are docs
mentioning the old name in passing (harmless, but should still be updated
for consistency) — but a meaningful subset are **identifiers that would
require care to rename** (env vars, function names, published titles).

## What NOT to touch yet

If 03-frontend-framework-migration.md is being executed (React → new
framework), **do not spend time renaming internals of React components that
are about to be deleted and rewritten from scratch.** Check with whoever's
running that prompt first. It's fine (and useful) to rename user-visible
strings and translation files even ahead of the migration, since those
survive the rewrite; it's wasted work to rename internal variable names in
`.tsx` files that won't exist in two weeks.

## Confirmed identifier-level renames (not just find-replace-safe strings)

These need real renames, not just text substitution, because other code
references them by exact name:

1. **`backend/main.py`** — CLI description says `"21-labs backend server"`.
   Env vars `TWENTYLABS_HOST` and `TWENTYLABS_PORT` are read via
   `os.environ.get(...)`. Renaming these env vars is a **breaking change**
   for anyone's existing `.env` files or deploy configs — do a compatibility
   shim: read the new `OTOYIN_HOST` / `OTOYIN_PORT` first, fall back to the
   old names with a deprecation warning logged, for at least one release.

2. **`app/src/stores/serverStore.ts`** — exported function
   `isLoopbackTWENTYLABSServerUrl()`. This is called from other files —
   grep all call sites (`grep -rn "isLoopbackTWENTYLABSServerUrl" app/src`)
   before renaming to `isLoopbackOtoyinServerUrl` (or better,
   `isLoopbackServerUrl` — drop the brand name from an internal helper
   entirely, it doesn't need it).

3. **`marketplace/marketplace_server/app.py`** — FastAPI app instantiated
   with `title="21labs Marketplace"`. This title is likely visible in
   OpenAPI docs (`/docs`) served by that service — user-facing, fix it.

4. **Order ref prefixes** — `backend/services/checkout.py` generates
   `order_ref` values in some places; check for any `21labs_` string prefix
   pattern used as an ID namespace (saw one in
   `marketplace/marketplace_server/routes/checkout.py`:
   `order_ref = f"21labs_{uuid.uuid4().hex[:16]}"`). If any *existing* orders
   in a live database already have this prefix, **do not silently change the
   format** — either keep accepting the old prefix on lookup, or write a
   migration. Ask before touching this one if the marketplace DB has real
   production orders in it.

5. **`.mcp.json`, MCP server name/title** — check
   `backend/mcp_server/` for any server name/description string that
   surfaces to MCP clients (Claude Code, Cursor, etc. — this is
   user/agent-facing, matters).

## Straightforward text/doc renames (safe to batch)

Everything else in the ~298-file grep result: markdown docs (`docs/`,
root-level `.md` files), JSON config comments/labels, i18n translation
files (`app/src/i18n/locales/*/translation.json` — check all four locales:
en, ja, zh-TW, zh-CN), test file names/descriptions, CI workflow names/job
labels. Do a careful find-replace but **read each diff** — some matches
will be in git history/changelog entries (`CHANGELOG.md`) that are historical
record and arguably *shouldn't* be rewritten (rewriting history in a
changelog is misleading). Use judgment: rename forward-facing docs, leave
dated changelog entries that describe what the product *was called at the
time* alone, or add a one-line note ("formerly 21 Labs") instead of rewriting.

## Also found while checking the README's own numbers

`.agents/skills/` contains a subdirectory literally named `21 labs` — an
obvious leftover, rename/merge it into wherever its content actually
belongs. Separately, the root `README.md` claims "44 active agent skills"
but the folder currently has 65 entries (64 excluding the shared `_shared`
folder) — that number is stale regardless of the rename; verify the real
count of active (non-deprecated) skills and correct it while you're in there.

## Also check

- `21labs-mcp.spec` and `21labs-server.spec` (root) — these look like
  PyInstaller spec files. Renaming the files themselves affects the build
  scripts that reference them (`scripts/build-server.sh`,
  `scripts/bundle-python.sh`/`.ps1`) — grep for the spec filenames before
  renaming, update every reference in the same pass.
- Any hardcoded window titles / app IDs in `tauri/src-tauri/tauri.conf.json`
  (bundle identifier, product name) — these affect OS-level app identity
  (taskbar name, installer name) and are highly user-visible. Double-check
  against what's already correct in the README/logo so this doesn't regress
  a name that's already been fixed there.

## Deliverable

A PR (or plan, if not implementing yet) that: (a) does the identifier-level
renames from the confirmed list above with backward-compat shims where
noted, (b) batch-renames the doc/text occurrences with a script + manual
diff review, (c) leaves a short `RENAME_LOG.md` noting anything intentionally
left alone (changelog history) and why.
