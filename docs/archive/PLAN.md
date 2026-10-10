# Otoyin UI/UX Overhaul Plan

> ARCHIVED 2026-09-25: Phase 2 verified done in the current tree (GettingStarted
> uses live profile/engine state with CTA; GeneratePage buttons labeled;
> HelpCenter has Popular actions + per-tab context; layouts/Sidebar.tsx gone;
> single /instruments entry; PromptBar, UseCaseWizard, workspaceStore, TabHelp,
> drag-drop InstrumentLibrary, and top-5 WorkspaceLanding all present). The live
> tour in components/AppFrame works; layouts/AppFrame.tsx is unreferenced dead
> code. Current work is tracked in `IMPACT_MAP.md`.

## The Core Problem

Your app's core job is: **type text → pick voice → generate speech.** But right now that flow takes 5+ invisible clicks across 3 collapsed components. Everything else is at the same level. There's no hierarchy.

---

## Phase 1: Generation Prompt Bar

**Replace the current 3-component generation area with a single compact prompt bar.**

### Current (takes ~400-600px vertical, 3 collapsed sections)
```
[VoicePicker collapsed: 52px]
[Composer textarea: 64-300px]  
[Settings toggle: 36px]
[Generate button: 44px]
```

### Target (takes ~120px vertical, always visible)
```
┌──────────────────────────────────────────────────────┐
│ [Voice ▾] [Engine ▾] [Language ▾]          [Attach +]│
│ ┌──────────────────────────────────────────────────┐ │
│ │ Type your script here...                [Send ▶] │ │
│ └──────────────────────────────────────────────────┘ │
│ [Effects ▾] [Temp] [Cleanup] [Persona]       [More ▾]│
└──────────────────────────────────────────────────────┘
```

**New file:** `PromptBar.tsx` — single component replacing VoicePicker + Composer on the Generate page. Voice picker becomes a dropdown popover (not inline grid). Settings become a collapsed "More" row. The textarea auto-expands 1→4 rows on focus. Generate button sits inline at the right end of the textarea (like a chat send button).

**Keep the old Composer** for Stories/Audiobook contexts where full settings are needed. Only the `/` page gets the compact PromptBar.

**Voice dropdown:** Click the voice button → popover with the same grid (max-h-64, scrollable). Selecting a voice closes it. Much less space than the current inline expansion.

---

## Phase 2: Critical Bug Fixes

| Bug | File:Line | Fix |
|-----|-----------|-----|
| GettingStarted step 2 hardcoded `done: false` | `GettingStarted.tsx:42` | Detect actual voice profiles via `useProfiles()` |
| GettingStarted step 3 has no CTA | `GettingStarted.tsx:51` | Add "Start typing above" button that focuses the PromptBar |
| Feature tour force-disabled on mount | `AppFrame.tsx:148-151` | Remove `localStorage.setItem("Otoyin-tour-seen", "true")` |
| Duplicate `/instruments` in sidebar | `Sidebar.tsx:69-70` | Remove from Production group (keep in Content) |
| Stale sidebar duplicate | `layouts/Sidebar.tsx` | Delete the file |
| Icon-only buttons no labels | `GeneratePage.tsx:70-88` | Add text: "Import Voice", "Create Voice" |
| Help button shows generic list | `HelpCenter.tsx` | Add per-tab context (Phase 4) |

---

## Phase 3: Customizable Workspace

**Onboarding asks "What do you want to do?" → sets sidebar defaults. Override anytime.**
Users can select multiple use cases.

### Use-case profiles (multi-select)

| Profile | Visible tabs |
|---------|-------------|
| TTS / Voice generation | Generate, Voices, Effects, Store |
| Podcasting / Dialogue | Generate, Stories, Captures, Mixer |
| Audiobooks | Audiobooks, Generate, Voices, Library |
| Music production | Audio Studio, Instruments, Launcher, Songwriter |
| Voice changer | Workspace (VC, Voice Converter), Captures |
| Everything | All tabs |

Users select all that apply. The union of all selected profiles determines which tabs are visible.

### Implementation
- **New:** `UseCaseWizard.tsx` — first-launch modal, multi-select use cases
- **New:** `workspaceStore.ts` — stores `visibleTabs[]`
- **Modify:** `Sidebar.tsx` — render only visible tabs + "See All" button at bottom
- **Modify:** `SettingsPage.tsx` — add "Sidebar" section with toggle switches per tab + "Reset to defaults"

---

## Phase 4: Help System

### Per-tab context help
- **New:** `TabHelp.tsx` — small "Learn" button in each tab header
- Opens popover: what this tab does, key actions, keyboard shortcuts, assistant prompts

### Assistant knowledge
- Add tab context to assistant system message: "User is currently on the {tabName} tab"
- When user asks "what can I do here?" → assistant lists that tab's features
- Ensure all MCP tool descriptions are rich enough for the assistant to explain them

### Fix HelpCenter
- Add "Popular actions" section at top
- Add "What can I do on this page?" quick action
- Verify backend `/help/search` returns useful results

---

## Phase 5: Instruments

**No bundled packs, but make importing obvious.**

- Replace current empty state ("No instrument packs installed") with a large drag-drop zone + "Click to browse" + format explanation
- Add onDragOver/onDrop to the entire InstrumentLibrary page
- Link to free SoundFont resources

---

## Phase 6: Simplify Hard Features

- **Workspace landing:** Show top 5 tools as large cards + "Show all tools" (not 25 cards at once)
- **Story creation:** Embed the PromptBar directly in the story view (generate lines → auto-add to story)
- **Audiobook import:** Make "Paste Script" the default tab (more accessible than requiring EPUB/PDF)

---

## Execution Order

```
Phase 2 (bugs) → Phase 1 (prompt bar) → Phase 3 (workspace) → Phase 4 (help) → Phase 6 (simplify) → Phase 5 (instruments)
```

Phase 2 is quick wins (1-2 hours). Phase 1 is the transformative change (half day). Phase 3-6 are progressive improvements.

---

## Files Modified (estimated)

### New files
- `app/src/features/generate/PromptBar.tsx`
- `app/src/features/onboarding/UseCaseWizard.tsx`
- `app/src/features/help/TabHelp.tsx`
- `app/src/stores/workspaceStore.ts`

### Modified files
- `app/src/features/generate/GeneratePage.tsx`
- `app/src/features/generate/GettingStarted.tsx`
- `app/src/features/generate/VoicePicker.tsx` → refactor to dropdown/popover
- `app/src/features/generate/Composer.tsx` — keep for Stories/Audiobooks
- `app/src/layouts/Sidebar/Sidebar.tsx`
- `app/src/layouts/AppFrame/AppFrame.tsx`
- `app/src/features/settings/` (per-page: GeneralPage, GenerationPage, CapturesPage, ...)
- `app/src/features/help/HelpCenter.tsx`
- `app/src/components/Workspace/WorkspaceLanding.tsx`
- `app/src/features/instruments/InstrumentLibrary.tsx`
- `app/src/features/stories/StoryList.tsx`
- `app/src/features/audiobooks/ImportWizard.tsx`
- `app/src/lib/onboarding.ts`

### Deleted files
- `app/src/layouts/Sidebar.tsx`
