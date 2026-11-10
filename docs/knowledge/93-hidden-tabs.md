# Hidden tabs

PURPOSE: Hide tabs the user never uses — filtered from the sidebar, blocked at the router — without deleting anything.
OWNS: app/src/lib/tabs/registry.ts, app/src/stores/workspaceStore.ts, app/src/features/settings/WorkspacePage.tsx, hidden-tab guard in app/src/router.tsx
READ-WHEN: touching sidebar nav, tab visibility, onboarding/use-case profiles, or Settings → Workspace
KEY-FILES: app/src/lib/tabs/registry.ts, app/src/stores/workspaceStore.ts, app/src/layouts/Sidebar/Sidebar.tsx, app/src/router.tsx
INVARIANTS: Hidden ≠ deleted — hiding only removes the nav entry + redirects the route. `/library`, `/store`, `/settings` are always-on and refuse to hide. workspaceStore is the single source of truth (uiStore holds nothing). Sidebar stays an accordion.
GOTCHAS: Persisted store is `otoyin-workspace` v2 — v1→v2 migration computes hidden tabs against the old 17-tab list ONLY, so new tabs never auto-hide. `visibleTabs` is `null` when nothing is hidden (legacy sentinel). Router guard runs in root `beforeLoad` — everything behind a hidden tab never loads.
UPDATED: 2026-11-10

## How it works

1. **Registry** (`app/src/lib/tabs/registry.ts`): 36 tabs across 10 groups. Each entry: `path`, `labelKey`, `icon`, `group`, `keywords[]`, `alwaysOn`. `TAB_GROUPS` defines the 10 group labels/descriptions; `ALWAYS_ON_PATHS` = `/library`, `/store`, `/settings`.
2. **Store** (`app/src/stores/workspaceStore.ts`, persist key `otoyin-workspace`, `version: 2`):
   - `hiddenTabs: string[]` (canonical), `visibleTabs: string[] | null` (derived; `null` = all visible).
   - `hideTab` / `toggleTab` / `setTabHidden` no-op on always-on tabs.
   - `applyUseCases(cases)` hides everything except the profile union + always-on (used by onboarding).
   - `USE_CASE_PROFILES`: `tts`, `podcast`, `audiobook`, `music`, `voiceChanger`.
   - `resetToAll()` restores everything; `reopenOnboarding()` sets `onboarded: false` for the welcome-tour replay.
3. **Router guard** (`app/src/router.tsx`, root `beforeLoad`): hidden tab → `redirect({ to: '/settings/workspace', search: { tab } })` before any tab code loads. `/settings/**` and `/help`, `/whats-new`, `/projects`, `/community-presets` are exempt.
4. **Settings → Workspace** (`/settings/workspace`, `WorkspacePage.tsx`): search filter, grouped toggles, `?tab=` highlight banner with Enable button (landing target for the guard redirect and for hidden send-to handoffs), always-on "Locked" badges, quick-profile buttons, Replay welcome tour, Show all tabs.

## Tests

- `app/src/stores/workspaceStore.test.ts` — hide/show/toggle, always-on refusal, derived `visibleTabs`, `applyUseCases`, registry integrity (unique paths, declared groups, keywords present, exact always-on set).
- `app/src/layouts/Sidebar/Sidebar.test.tsx` — group headers render, accordion reveal, hidden tab absent from nav, Music group disappears when its only tab is hidden, always-on tabs survive mass-hide.

## Known follow-ups

- Ctrl+K search reads the registry (keywords are ready).
- Send-to handoffs targeting a hidden tab should offer "Turn on X?" (Enable flow via `?tab=`).
- Onboarding wizard should end in `applyUseCases(selected)` + mark onboarded (already wired in `UseCaseWizard.tsx`).
