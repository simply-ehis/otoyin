# Otoyin: Onboarding, Hidden Tabs, Search, Settings, Updater and Startup Design

A design plan built from your ideas, with my additions marked as suggestions. Nothing here is built yet.

## 1. What you decided

- Onboarding becomes a short flow: welcome, pick your workflow, set up the AI agent, done.
- Tabs you don't pick are **hidden and never loaded**. You can bring them back from Settings.
- Because there are about 30 tabs, **search** must be excellent.
- Settings follow one rule: no developer settings (paths, commands, ports), and no free-typed values unless unavoidable.
- More accent colours, and maybe custom colour tokens.
- A proper **updater** and better **space (storage) management**.
- Startup must be fast. If it can't be, show a loader, never a blank screen.
- A setting for what the app opens on: a new Generate window, or the previous tab.
- Priority loading for everything except models, so the backend has time to start without crashing.
- User help docs, plus a skill or doc for every new agent capability.

## 2. Onboarding flow

**Step 1: Welcome.** Logo, one line about what Otoyin is, a Continue button. Language follows the system.

**Step 2: What will you use Otoyin for?** Multi-select cards. Each card lists the tabs it turns on and roughly how much model space it may need.

| Card | Tabs it enables (proposal, adjust to your real tab names) |
| --- | --- |
| Generate speech | Generate (TTS), Voice clone, Voice convert |
| Clean up audio | Reduce noise, Polish, Convert (formats), Edit |
| Audio studio | Edit, Stem separation, Effects, Spatial, Dubbing |
| Music | Music generation, Songwriting |
| Sound effects | SFX generation, SFX browser |
| Everything | All tabs |

Always on, whatever you pick: **Library** (your files and results), **Marketplace**, **Settings**, **Search**, and the AI agent button.

**Step 3 (my suggestion): Models for your picks.** Show only what your choices need. Small models (the ones allowed to auto-download) install right away. Bigger ones are listed with size and a disk-space and RAM check, and can be skipped for later. Without this step, people finish onboarding and hit a "model not installed" wall on their first click.

**Step 4: Configure the AI / agent** (see section 9). Skippable.

**Step 5: Done.** One primary button: "Try it", which opens the first tab of the user's main workflow with a **sample audio file already loaded**. Show a small hint: "Press Ctrl+K to search anything."

**Am I missing anything? My additions:**

- The **models step** above.
- A quick **audio device check** (pick microphone and speakers, play a test sound), because wrong devices are a common first-run failure.
- **Privacy choices:** crash reports and usage stats are on by default, with one clear toggle.
- A **first win**: the sample file, so the user hears a result in under a minute.&#32;
- **Back** and **Skip** on every step. Skipping picks a safe default set (Generate, Edit, Reduce noise) plus Search.
- **Re-run onboarding** from Settings, so changing your mind is easy.
- Theme: **System by default**, with the accent picker in Settings, not in onboarding.

## 3. Hidden tabs: how it works

Two states for every tab: **Enabled** and **Hidden**. Hidden means the tab is not in the navigation, its code is **never loaded**, its backend capability stays dormant, and its models are never touched.

**Hidden is not deleted.**

- Search still finds hidden tabs, shown as "Stem separation (hidden)" with an **Enable** button.
- "Send to..." from another tab can target a hidden tab. It asks "Turn on Stem separation?" with one click.
- Settings has a **Workspaces** screen: toggles grouped by workflow, plus a "Show everything" switch.

**How to make it truly not loaded**

- The navigation is built from one **tab registry**, filtered by the enabled list saved in the config.
- Each tab's frontend is a lazy chunk, loaded on first open.
- Backend features register lazily and start on first use.
- A hidden tab's models follow your existing rules: no active model, no load.

**Navigation space**

- Group sections that can collapse, a **Pinned** area, and **Recent** on top.
- A slim icon rail with labels on hover, and a "More" list when there are many tabs.

**Safety**

- Never hide a tab that has a running job or unsaved work. Warn first.

## 4. Search (Ctrl+K) that covers everything

**The key idea:** everything registers itself in a typed registry, so search is complete by construction.

| Searches | Source | On select |
| --- | --- | --- |
| Tabs | Tab registry (including hidden) | Open, or Enable then open |
| Actions | Command registry ("Separate stems", "Normalize") | Run, or open the tab with it ready |
| Settings | Settings schema (every setting has keywords) | Jump to it and highlight |
| Models | Installed and Marketplace | Show details, install |
| Your files | Library, recent projects, outputs | Open |
| Help | Help articles | Open the article |
| Agent | Fallback "Ask the agent: ..." | Send to the agent |

**Behaviour**

- Fuzzy matching with typo tolerance and synonyms ("denoise" finds Reduce noise, "vocals remover" finds Stem separation).
- Results grouped, with the state shown (hidden, not installed, running).
- Keyboard first. Recents when the box is empty. A tip row when nothing matches.
- A visible search button in the top bar so touch and mouse users find it.
- The index builds **when idle**, never during boot.

**Guardrail:** a registry item without a title and keywords fails the build, so nothing is ever unsearchable.

## 5. Settings

### 5.1 The rules

1. **No developer settings.** No typed paths, commands, ports, endpoints or flags. Folder choices use the native folder picker.
2. **Every setting has:** a label, a one-line plain description, a constrained control (toggle, segmented choice, dropdown, slider with min, max and step, colour picker), a default, and a reset button.
3. **Free text only where unavoidable:** API keys, and a custom provider address inside the "Add provider" flow.
4. **Every setting must change something you can see or hear.** If not, remove it.
5. Settings are searchable, and a changed setting shows a small "modified" dot.

### 5.2 Groups (about 8)\[can be more\]

General (language, on launch, updates) · Appearance · Audio (devices, default export format) · Workspaces (show and hide tabs) · Models and storage · AI and agent · Shortcuts · Privacy · About and support.

### 5.3 One schema as the single source

Each setting is defined once, in code: key, type, default, allowed range or options, label, help text, group, search keywords, needs-restart flag, and the version it appeared in. The settings screen is **generated** from that schema, and Rust validates every value on load and save. A setting cannot exist without a rule, because the schema requires one.

### 5.4 Storage: is a config JSON too hard? No, it's the right choice

Use a plain `settings.json` for preferences:

- It carries a `schemaVersion` and migrates old versions.
- **Atomic writes:** write a temp file, force it to disk, then rename. This survives crashes and power loss.
- On load, merge with defaults, drop unknown keys, and clamp out-of-range values.
- If the file is corrupted, keep a `.bak` copy, reset to defaults, and tell the user.

**Keys are different. Never put API keys in the JSON.** Use the **operating system's credential store** (on Windows, Credential Manager, through the Rust `keyring` crate). if too hard or complex use a jsonc. The JSON only records that a key exists.

Key screen flow: choose a provider, paste the key, press **Test connection**, then it shows a masked value (••••1234) with Replace and Remove. The full key is never shown again. Exported settings **never** contain keys. If the credential store is unavailable, fall back to an encrypted file and say so clearly.

### 5.5 Appearance growth (safe version of custom colours)

- 10 to 12 accent presets plus a custom accent.
- **A small set of colour tokens** you can customize: accent, background, surface, text, highlight. The app derives hover, border and muted shades from them.
- A **contrast guard** warns when text would be hard to read, and blocks unreadable combinations.
- Reset to default, save as a named theme, import and export themes as a small JSON file (colours only, no code).
- Plus a **backup** of all settings as one JSON file, without keys.

## 6. Updater

**User flow**

1. The app checks quietly after startup is idle (15 to 30 seconds in), then about once a day. Settings also has **Check for updates**.
2. If there is one: a calm banner, "Update 1.4.2 is ready. What's new?" with **Restart now** and **Later**.
3. It downloads in the background with progress. The signature is verified.
4. It **never restarts while a job is running**. It waits or asks.
5. "Later" installs on the next quit.
6. After updating, a **What's new** note shows once.
7. If an update fails, keep the current version, show **Retry**, and don't nag.

**Technical shape**

- Tauri's updater plugin with signed releases. The signing key stays offline or in CI secrets, never in the repo.
- A `latest.json` manifest hosted with your releases.
- Models never ship inside app updates. They update through the Marketplace.
- A separate, tiny **announcements feed** for news and push messages, independent of releases (matches your earlier decision).
- A **minimum supported version** field, so an old app can be told "please update" if the backend changes.
- Optional later: a Stable and Beta channel.

**Tests to run before trusting it:** update from the previous version on a clean Windows machine; interrupted download; wrong signature rejected; settings migrate correctly after the update.

## 7. Space management (screen layout)

Your screenshot shows what you meant: the screen is mostly empty chrome. Sizes below are measured from the image (approximate, 1915 px wide).

| Area | Today | Fix |
| --- | --- | --- |
| Top | About 55 px of blank band above the logo; the header is about 107 px tall for one row of content | One bar of 44 to 48 px: logo, a centred search box (Ctrl+K), then bell, help and window icons. Make it the window drag area. Gains about 60 px on every screen |
| Sidebar width and rows | About 360 px wide; group headers about 45 px tall; the nav scrolls inside a short window | 240 px wide, 64 px collapsed to icons. Group headers 32 px. One group open at a time. Show only the groups the user enabled |
| Sidebar bottom | Clipboard, a game entry and Collapse take three rows | One compact row of icons. Move the game out of the main nav |
| Action buttons | Learn, Record, Import Voice and Create Voice float above the card with a gap of about 40 px | Put them in the voice picker row as small buttons, or one "+ Voice" menu |
| Script area | One line tall; the card ends at about 45% of the height, so most of the main area is empty | Make the script box fill the height. Generate sits pinned at the bottom right, with extra options in a slim row below |
| History panel | About 590 px wide and nearly empty at 0 items | A thin collapsed rail with a count badge. It opens when something exists or when clicked. The empty message moves under the script box as "Try an example" |
| Spacing | Gaps differ from place to place | One 8 px scale: 8, 12, 16, 24 |

Approximate result: about 60 px of height back at the top, about 120 px of width back from the sidebar, and about 350 px of width back from History while it is empty. The main area stops looking empty because the script box fills it.

**Storage (optional).** I first read "space management" as disk storage. If you want that too, my draft is:

- A **Storage** screen with total used and a coloured bar by category: Models, Cache, Projects and outputs, Temporary.
- A list of models with size and **last used**, and one-click removal.
- "Free up space" suggestions, such as unused models and old temp files, each with the space it would free.
- A **disk-free check before any download**, with a clear message when it won't fit.
- Automatic clean-up of temp files, and an undo for the last clean.
- If you want a storage location option, use the folder picker, not typed text.

## 8. Startup and loading (critical)

**Budgets (suggested, measure them)**

- Window visible in under 300 ms with a static splash.
- Usable shell in under 1.5 seconds on an 8 GB machine.
- Never a blank window. Never a crash because the backend wasn't ready.

**Boot order**

| Priority | What | Notes |
| --- | --- | --- |
| P0 | Native window and a splash made of plain HTML and CSS | Painted before the JavaScript bundle. Theme read from a tiny config so there's no flash |
| P1 | Settings and the startup choice | New Generate, or last tab |
| P2 | Backend handshake | Rust starts the engine in the background and sends a `backend-ready` event. No polling loops |
| P3 | The first visible tab's code and data | Lazy chunk only |
| P4 | Idle prefetch | Likely next tabs and the search index |
| P5 | Later only | Models, Marketplace network, update check, any stats |

**The loading screen**

- Shows **real stages** ("Starting the audio engine…"), not a fake progress bar.
- Gives the backend time to start. Commands wait in a queue until ready, or the tab shows "Engine starting" instead of an error.
- If the engine takes too long (about 8 seconds), show a hint. If it fails, show **Retry** and **Start in safe mode**.

**Crash prevention**

- Single-instance guard.
- **Crash-loop detection:** after 2 failed starts in a row, boot in safe mode (skip session restore and prefetch) and offer a copyable diagnostics report.
- **Hidden-window watchdog:** if the window starts hidden and the page never loads, force it visible after about 5 seconds with an error page, so there is never an invisible "ghost" window.

**Startup setting:** "On launch: **New Generate** / **Last tab** / **Library**". Returning users default to Last tab. First run opens the first tab of the chosen workflow.

**Making the "dynamic components not loading" bug impossible to return**

- One typed route registry for all lazy tabs.
- Retry once on a chunk-load failure, then show a per-tab error with **Reload tab**, never a blank pane.
- A build test that imports every lazy route.
- A smoke test that opens every enabled tab and fails on any console error.
- The updater replaces the whole front-end bundle at once, so old and new file names never mix.

## 9. Agent step: "direct, not MCP"

My understanding of your idea: the in-app agent should call Otoyin's own commands directly, not through MCP. I agree with that.

**Recommendation**

- Build one typed **command registry** (name, description, inputs, outputs, permissions). The UI, search, the agent and the local websocket API all use it.
- The in-app agent uses ordinary tool or function calling against that registry. It is simpler, faster, and each command can carry its own permission.
- A coding agent (such as Claude Code) can drive the app through the existing local websocket/API using the same registry.
- If you ever want third-party agents to discover tools automatically, MCP can be a thin wrapper over the same registry. It is optional and later.

**Onboarding choices:** connect my coding agent · use a provider and key · use a local model · skip.

**Safe defaults:** the agent shows its plan first, only reads by default, and asks before anything that overwrites or deletes.

## 10. Help docs and skills

**For users**

- A searchable, offline **Help** section.
- A **?** on every tab that opens its article: what it does, a 3-step quick start, presets explained, and fixes for common problems.
- A tip shown once per tab, dismissible.
- **What's new** after updates.

**For agents**

- `AGENTS.md` at the repo root: structure, rules and commands.
- One **skill file per capability**: what it does, inputs, outputs, limits, example calls, and common failures.
- A generated capability list from the command registry, so documents never drift from the code.
- **Rule:** a new capability cannot be merged without its skill file and its help article. Make the build check this.

## 11. Open items and next steps

1. Finalize the real tab names and groups for the onboarding cards.
2. Then I can write the implementation prompts, one per area: onboarding with hidden tabs and search, the settings schema and key storage, startup and loader, and the updater.
