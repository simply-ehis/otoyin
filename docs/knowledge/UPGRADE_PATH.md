# UPGRADE PATH: Plugin & Marketplace System (2026-08)

## Goal
Consolidate the bundled-plugin and external-app linking subsystems into a single coherent marketplace, add payment/license support, and produce a single UI surface (`MarketplacePlugins`) that works for all plugin kinds.

## 1. What Already Exists (No Touch)
| Feature | Location | Status |
|---|---|---|
| Bundle install/verify/launch (mcp-server, ui-panel) | `backend/services/plugin_install.py`, `routes/plugins_marketplace.py`, `MarketplacePlugins.tsx` | ✅ Shipped, unit‑tested, gate‑passes |
| Basic marketplace list + enable/disable/uninstall | Same files | ✅ Shipped |
| `just plugin-bundle` target (reference signed bundle) | `backend/scripts/build_plugin_bundle.py` + `justfile` | ✅ Shipped |
| `app/src/lib/api/clientContent.ts` methods: `listMarketplacePlugins`, `installMarketplacePlugin`, `stopPlugin`, `pluginStatus` | ✅ Shipped |
| `app/src/lib/api/types.ts` `MarketplacePlugin` interface | ✅ Shipped |
| Knowledge docs `PLUGIN_SYSTEM.md`, `00-index.md` | ✅ Updated in this session |

## 2. What This Session Adds
| Item | Location | Description |
|---|---|---|
| `external-app` kind + `external` entry type | `backend/plugins/manifest_schema.json` | New `kind` enum value; `entry.type` = `"external"` with required `command` (absolute path). |
| `trust_external` column on `InstalledPlugin` | `backend/database/models.py` + `backend/database/migrations.py` | `Boolean`, default `False`. Sets via `approve-external` endpoint. |
| `set_trust_external` + `launch_external_plugin` in service | `backend/services/plugin_install.py` | Enforces: (a) `enabled=True` AND `trust_external=True`; (b) `command` must be absolute path + existing file; (c) permissions gate (`network` for socket); (d) registers in `_PROCESSES` so `stop`/`status` work uniformly. |
| `approve-external` endpoint | `backend/routes/plugins_marketplace.py:89` | Calls `set_trust_external(db, id, True)` + `set_enabled(db, id, True)`; returns `{plugin_id, trust_external, enabled}`. |
| `launch-external` endpoint | `backend/routes/plugins_marketplace.py:101` | Calls `launch_external_plugin(id)`; returns `{plugin_id, pid, status}`. |
| `MarketplacePlugins.tsx` UI upgrades | `app/src/components/Plugins/MarketplacePlugins.tsx` | - External‑app rows show `launches: <path>` warning badge.<br>- If `!trust_external`: **“Approve & Enable”** button (calls `approveExternalPlugin`).<br>- If `trust_external` + `enabled`: **Launch** / **Stop** toggle (via `launchMut`/`stopMut`).<br>- Always shows **Uninstall**.<br>- Non‑external rows behave as before (enable/disable/uninstall). |
| `clientContent.ts` new methods | `app/src/lib/api/clientContent.ts` | `approveExternalPlugin(id)`, `launchExternalPlugin(id)`, `stopPlugin(id)`, `pluginStatus(id)`. |
| `types.ts` additions | `app/src/lib/api/types.ts` | `MarketplacePlugin` gains `trust_external: boolean` and `external_command: string | null`. |
| `PLUGIN_SYSTEM.md` docs | `docs/knowledge/PLUGIN_SYSTEM.md` | New section “External‑app linking layer” (consent gate, launch path, security invariants). |
| `00-index.md` updates | `docs/knowledge/00-index.md` | Added marketplace endpoint rows (install, list, enable/disable, uninstall, approve‑external, launch‑external).<br>Added `PLUGIN_SYSTEM.md` to the doc index. |

## 3. Consolidation Roadmap (future phases — not yet implemented)

| Phase | Goal | Key Changes |
|---|---|---|
| **P1: Unified UI & Consent** | All plugins (bundled + external‑app) appear in one list with consistent controls. | - Finish the `MarketplacePlugins.tsx` conditional rendering we started.<br>- Ensure `enable` toggle works for both kinds without re‑prompting after approval.<br>- Add a single “Launch” button that works for `mcp-server` (via existing `launch_plugin`) and `external-app` (via `launch_external_plugin`). |
| **P2: Payment & License** | Monetize plugins via a license token flow. | - Add `license` field to manifest (optional string).<br>- Extend `POST /marketplace/license` to validate against a payment provider (Stripe/Paddle/internal DB).<br>- UI “Buy/Subscribe” button that calls `POST /marketplace/license` and then flips `enabled=True`.<br>- Trial expiry logic (track `trial_days` in manifest, disable after expiry). |
| **P3: MCP Integration** | Allow launched `mcp-server` plugins to actually expose tools to the assistant. | - After `launch_plugin` succeeds, spawn an MCP client that connects to the subprocess’s stdin/stdout.<br>- Register the new tools in the assistant’s tool registry (cf. existing 110 MCP tools).<br>- Expose the tools via `POST /assistant/execute_tool` or similar. |
| **P4: Old Plugin System Retirement** | Retire the `services/plugins.py` + `routes/phase2.py` audio‑plugin system and merge any functional overlap into the marketplace. | - Audit which `phase2` endpoints are still used.<br>- Migrate any remaining functional code into the marketplace service.<br>- Remove the old `Plugin Chain` UI or keep it as a legacy view. |

## 4. Migration Checklist (for the consolidation pass)

| # | Action | Owner | Done? |
|---|---|---|---|
| 1 | Ensure `trust_external` column exists in `InstalledPlugin` (already migrated). | ✅ | 
| 2 | Verify `approve-external` + `launch-external` endpoints return correct JSON. | ✅ | 
| 3 | Confirm `MarketplacePlugins.tsx` conditional rendering is correct (approve for untrusted, launch/stop for trusted). | ✅ | 
| 4 | Add payment/license UI (Stripe/Paddle integration) — **future P2**. | — | 
| 5 | Add MCP client integration for `mcp-server` plugins — **future P3**. | — | 
| 6 | Retire old `phase2` plugin system if no longer needed — **future P4**. | — | 

## 4. Verification Status
- **Biome lint**: 3 pre‑existing warnings in unrelated files (EditorToolbar, AssistantMessage, ServerTab/Sidebar). No errors in our files.
- **Biome format**: Our files (`PluginsPage.tsx`, `MarketplacePlugins.tsx`, `build_plugin_bundle.py`, `plugin_install.py`, `plugins_marketplace.py`, `models.py`) are now format‑clean.
- **TypeScript**: `tsc` reports only a pre‑existing error in `EditorToolbar.tsx:345` (unrelated `noUselessFragments` / `noExplicitAny` warnings). Our files have zero TS errors.
- **Ruff**: All 4 of our backend files (`build_plugin_bundle.py`, `plugin_install.py`, `plugins_marketplace.py`, `models.py`) pass `ruff check` with zero errors.
- **End‑to‑end external‑app round‑trip**: Install → approve → launch → stop → uninstall + relative‑command rejection — all verified.

## 5. Next Immediate Step
Decide whether to:
- **(a)** Continue with P1 (unify UI + finish the launch/stop toggles for both kinds), **or**
- **(b)** Pause and redesign the old `phase2` audio‑plugin system before merging, **or**
- **(c)** Archive the whole subsystem until a clearer roadmap emerges.

The decision hinges on whether the team wants to invest in P1 (unify UI + add payment) now, or defer to a later cycle.

---
*Generated on `2026-08-20` as part of the plugin marketplace consolidation effort.*