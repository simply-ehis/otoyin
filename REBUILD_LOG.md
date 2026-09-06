# REBUILD_LOG — Full Frontend Rebuild (prompt 03)

Staying on React. Old tree is behavior-reference only; nothing new copies its JSX.

## Restore provenance & archive/ deletion (2026-09-05)

The components restored into `app/src` during the first days of September
originated from the `archive/frontend-components/` directory (342 files),
itself a copy of the pre-rebuild `app/src/components` tree. The archive
copy was **cp1252/UTF-8 corrupted** (raw cp1252 bytes, U+FFFD, double-encoded
mojibake, stray control bytes); the corruption was repaired **in the working
tree copies** across several passes (see commit `630b6f9` and the encoding
gate `.githooks/pre-commit` + `scripts/check-encoding.py`, extended with
`scripts/check-lossy-qmark.py` for lossy-`?` glyph artifacts).

The archive was then **deleted** (untracked + gitignored, 2.5 MB) after
verifying nothing unique was lost, file-by-file against git HEAD:

- **314/342** byte-identical to their `app/src/components/*` counterparts
  (comparison run pre-deletion; script inline in session log).
- **21** differ — every one a file repaired in-tree after the archive copy
  was taken (mojibake repair, de-translucify, encoding fixes); e.g. archive
  `ui/alert.tsx` still carries `bg-red-50`, tree version is token-clean.
- **7** `Store/*` files absent from `components/` — rebuilt into
  `features/store/` during the store slice (all 7 exist there).
- Repo-wide scans (encoding gate + lossy-`?` twin probe) run green after
  deletion; no doc, script, or workflow references `archive/frontend-`
  `components/` (the `docs/knowledge` `archive/` mentions are a different,
  tracked `docs/knowledge/archive/` directory).

Rationale: the archive was the last **corrupt-source** copy in the tree;
keeping it invited future restores that would reintroduce corruption the
gates now prevent. The git history (commit `630b6f9` and earlier) retains
the pre-repair lineage; the archive itself was never tracked.

Recovery map (which `git show` command yields pre- vs post-repair text):
`docs/knowledge/78-component-lineage.md`.

## Step 0 inventory (2026-09-04)

- `app/src`: 285 tsx (275 in `components/`, 10 in `lib/` + `hooks/` + `test/`)
- `tauri/`: 1 tsx (`tauri/src/main.tsx` — thin entry, no component tree)
- Entry floor intact: `App.tsx`, `main.tsx`, `router.tsx` (962 lines, ~70 component imports)
- Behavior reference: `archive/frontend-components/` (342 files, committed) — read for
  behavior/functionality only, never copy JSX per 03.
- Backend untouched: source of truth for routes; `docs/FEATURES.md` + 
  `backend/data/app_features.json` define the capability surface.
- Superseded: the 16-file translucency tweak pass on the old tree (reskin, not rebuild —
  rejected per 03). Those edits stay in the working tree but the tree itself is deleted
  dir-by-dir as screens land.

## Locked architecture decisions

1. **Folders** — `app/src/ui/` canonical primitives, `app/src/features/` screen
   composition, `app/src/layouts/` shell chrome. `lib/`, `hooks/`, `stores/`, `i18n/`
   stay. Old `app/src/components/` deleted as screens land, never added to.
2. **State** — Zustand stays (stores intact, tests cover them). No re-decision per screen.
3. **Routing** — TanStack router file stays; route paths unchanged (no capability
   regression). Imports repoint `@/components/*` → `@/ui/*` + `@/features/*` +
   `@/layouts/*` as screens land.
4. **Tokens** — `docs/design/proof/proof.html` is the face: warm neutrals
   (hsl 28), flat rose accent (hsl 348 68% 58%), solid surfaces, radius 4/8/12,
   motion 120/200ms ease-out, 4-role type. Applied to `styles/tokens.css` :root +
   tailwind `@theme` defaults. Grayscale `gs-*` scale + theme classes untouched
   (other themes keep working).
5. **Canonical library first** — proven by vitest render tests (no demo route, no
   router churn). Every screen consumes it; no screen invents a one-off button.
6. **Rules (always)** — 19 desktop-ui skills; no transparency/glass (`bg-*/NN`
   fills, `backdrop-blur`); no floating disconnected panels (modal scrims exempt
   per surfaces-overlays); heroicons only; clear headers + section rules; banners
   for persistent states, toasts (4s) for confirmations; empty/loading/error on
   every view; zero placeholders (gate stays green).

## Build order (03)

1. Tokens + `ui/` library + vitest proof.
2. `layouts/` shell (TitleBar, AppFrame, Sidebar, banners) → repoint router shell.
3. Simple screens (settings pages, info pages) → prove routing/data.
4. Complex screens last (Audio Studio, mixer, marketplace, workspace views).
5. Reconnect pass vs FEATURES.md + archive behavior. Delete old dirs as replaced.

## Screen checklist (definition of done per screen)

- [ ] Built only from `ui/` canonical set (no one-off styled elements)
- [ ] Tokens exact (no old grayscale values smuggled in)
- [ ] Wired to real backend route(s)
- [ ] Every old-screen capability still reachable (archive + FEATURES.md check)
- [ ] Empty + loading + error states designed
- [ ] Old dir deleted after replacement lands

## Screens landed

- Slice 1 (`dad769d`): tokens face, `ui/` canonical library + vitest proof,
  `layouts/` shell (TitleBar, Sidebar, banners, AppFrame with theme-sync fix).
- Slice 2 (uncommitted): `features/settings/*` (About, ApiKeys, Captures, General,
  Generation, Gpu, Language, Logs, LottieExport, MCP, MarketplacePlugins,
  ModelHealth, Plugins, Scripting, Shortcuts, Support, Telemetry, Theme, Timecode,
  rows) + `features/voices/*` (VoicesTab, ProfileCard, QuickCloneDialog,
  ReferenceVoicesBrowser, SampleList, SampleUpload, VoiceInspector, samples).
- Slice 3 (uncommitted): **Store / marketplace** — `features/store/` (18 files):
  `StorePage` (browse / My Licenses / Pricing Admin views) composed from
  `StoreFilters`, `BrowseStates`, `StoreHero`, `OffersBanner`, `ProductGrid`,
  `PerEngineKeepaliveRow`, `LicensesView`, `PricingAdmin` (+ `pricingCountries`);
  `StoreProductCard` renders the three per-product states — **cached** (success
  chip + one-step **Activate** via `loadModel(engine)`), **owned-not-installed**
  (info chip + Install), **needs-download** (price/Free + Buy/Download) — driven
  by backend `local_status` + entitlements + live model-status (single
  `[modelStatus]` query key); `StoreDetailModal` split into `ProductSpecs`,
  `ProductActions` (activate/redeem/checkout/download/delete), `ProductReviews`,
  `SimilarProducts`; helpers ported to `storeUtils` (MODEL_DESCRIPTIONS,
  filter/sort, download maps). Router repointed `/store` → `@/features/store`;
  `app/src/components/Store/` **deleted** (replaced). Verified: tsc clean for
  the feature, biome lint+format clean, ui vitest proof green, wiring guard
  passes for store.
- Slice 2 (`8133fc5`): full settings feature (16 pages + layout + rows +
  theme/language selects) and capture primitives (gates, ChordPicker,
  CapturePill). `lib` gate/pill imports repointed to new paths.
- Slice 3 (`4006763`): generate feature (page, voice picker, composer with
  tags/instruct/engine/temp/effects/clean/cancel, virtualized history with
  retry/favorite/export/import/delete, starter checklist). `ui/form` RHF
  bridge. Note: this commit also carries the parallel agent's
  `clientCore.ts` circuit-breaker client surfacing (complements the audit
  503 gate — friendly error, no auto-retry on cooldowns).
- Slice 4 (`15bf85b`): voices feature A (tab, cards, inspector, samples,
  quick clone, reference library) + effects chain editor + ui extras.
- Slice 5 (`b215ac9`): captures feature (tab, list, action bar, detail,
  readiness checklist, inline player, tag adder replacing prompt()).
- Slice 6 (`47b4c2d`): library tab. Voices files also landed via `15bf85b`.
- Slice 7 (`aafcbbc`): voice create/edit form (clone/preset/design sources,
  draft persistence, rollback-on-sample-failure) + design panel.
- Slice 8 (`00713dd`): effects tab (preset lists, detail editor with
  audition/save-as/delete, generation picker).
- Slice 9 (`483d361`): dubbing wizard (upload, preview, config, progress,
  download, keyboard flow).
- Slice 10 (`dfbedb4`): stories (library rail, sortable content with
  playback highlight, add/import/paste/export, docked composer).
  Deferred to studio phase: track-level item editing (trim/gain/fades),
  full multitrack timeline, AB compare, automation lanes.
- Slice 11 (`0f6a62c`): audiobooks (import wizard, rail, detail, cast,
  chapters, conversion). Also carries parallel-track marketplace catalog
  backend + docs from the other agent.
- Slice 12 (uncommitted): **Audio Studio port (05 redesign)** —
  `app/src/components/AudioStudio/` (50 files, ~6.1k lines) moved to
  `features/audioStudio/` (46 files; the nested `audioStudio/` editing-
  surface subdir flattened one level, every file and functional boundary
  preserved). Imports converted from legacy `@/components/ui/*` to the
  canonical `@/ui/*` library (button/slider/select/input/dialog/progress/
  use-toast/primitives/states); two deep-relative `lib/utils/debug` imports
  fixed to the `@/` alias. Design-system pass per 05: replaced the shell's
  translucent `from-black/40` visualizer gradient with a solid `bg-card`
  docked surface, `bg-muted/30` ruler → `bg-muted`, `bg-card/50` track-
  header panel → `bg-card`, drag-overlay `bg-card/80` → `bg-popover`.
  Router `/audio-studio` repointed to `@/features/audioStudio`; external
  importers repointed (`components/index.ts`, StudioVisualizer,
  VideoPreviewView, clientStoriesB, assistantCommands, transcript/index).
  `app/src/components/AudioStudio/` **deleted** (replaced); knowledge docs
  path references updated. Verified: tsc clean for the feature, biome
  clean, encoding gate clean. Remaining per 05: 04 feature-audit exposure
  pass + realtime-perf profiling budget (canvas/rAF paths) on this screen.
- Slice 13 (uncommitted): **workspace views — Mixer, Studio, DSP, PitchMap.**
  New `app/src/features/workspace/` (`playBlob.ts` shared preview player +
  4 views), all canonical `ui/` only, router repointed, 4 old files deleted.
  Fresh decisions (not inherited): horizontal channel cards instead of DAW
  faders (canonical Slider is horizontal-only — no one-off orientation
  hacks); NO fake demo channels/VU data (old tree hardcoded 4 channels +
  vuLevels) — mixer starts empty, channels from clip-paste or saved
  sessions; master VU is a real AnalyserNode level during preview, 0 idle;
  pitch snap toggle made REAL via `SCALE_*` intervals (C root, labeled);
  DSP synth/effect lists from `/dsp/capabilities` with built-in fallback;
  contour segments are keyboard-operable buttons. Wiring added:
  `list/get/deleteMixerSession` in `clientStoriesB` (backend factory
  already serves full CRUD). Verified: biome clean on all slice files,
  placeholders clean, production build green (`✓ built`, router repoint
  bundles). tsc: 0 errors in any slice-13 file; tree-wide error list is
  unstable — a parallel session is actively editing old-tree + voices/
  audiobooks files (see STATUS.md), so a clean full-project tsc must wait
  for a quiet tree.
- Slice 14 (uncommitted): **workspace views — ADR, Conversation, AudioPlan,
  BatchQueue, Automation, Comping.** ADR as `features/workspace/adr/`
  (types, WaveformBars, AlignmentPanel, RecordingControls, TakeManager,
  ADRView); the rest flat in `features/workspace/`. Router repointed (6
  routes), 11 old files deleted. Fresh decisions: guide upload via
  label+input (not document.createElement); window.confirm replaced with
  AlertDialog; per-line text inputs added to Conversation (old sent empty
  text always); presets/lanes/curves from backend (`/conversation/presets`,
  `/automation/parameters`, `/dsp/capabilities`, corrected two stale client
  types) with built-in fallbacks; real plan_json rendering in AudioPlan
  (old discarded the response); envelope points are per-lane with
  remove-point; cue pads/lane dots keyboard-focusable; comping + mixer
  start empty (no fake demo lanes); canonical Table for the job queue.
  Wiring added: `listConversationPresets`, mixer/comping
  list/get/delete session fns. Verified: biome clean, placeholders clean,
  production build green, full-project tsc exit 0 (one toast-prop type fix
  along the way).
- Slice 15 (uncommitted): **workspace views — VoiceChanger, VoiceConverter,
  NoiseReduction, AudioEnhance, VocalIsolation, Diarization, LiveTranscript,
  TranscriptEdit (built for real — old was a "coming soon" stub).** Shared
  `features/workspace/UploadField.tsx` (label-wrapped picker) + audioStudio
  `IsolationStem` imports repointed to the new VocalIsolationView. Fresh
  decisions: Noise/Enhance UPLOAD first via dspUpload (old sent a bare
  client filename the backend could never resolve — guaranteed failure);
  caps-driven changer latency (was hardcoded 45); cloud STT model offered;
  diarization speaker hues in text only; transcript editing with
  click-to-play (local element + player-store URL shape), shift-click
  multi-select, filler picker, delete-to-new-take. Router repointed (8
  routes), 8 old files deleted. Verified: biome clean, placeholders clean,
  production build green, full-project tsc exit 0.
- UI fix pass (from annotated screenshot review): backend `/health` no
  longer 500s on fresh installs (missing TTS engine now reports degraded
  instead of raising); dev frontend moved to :21132 per tauri devUrl;
  notification badge counts live downloads only (bundled content no longer
  inflates it); GeneratePage header uses the real rose logo with Import /
  Create as icon+tooltip buttons at the right; collapsed sidebar rail drops
  the dead brand row and rides up. Verified: biome clean, full tsc exit 0,
  dev-web serving both.
- Slice 16 (uncommitted, no minigame per scope): **workspace views —
  Spatial (+spatial/ subcomponents, keyboard-nudge radar), SoundEffects,
  Platform Export, VideoPreview, YouTube, Spectrogram (+canvas with
  blob-upload fix); content pages — Offers, WhatsNew, CommunityPresets,
  StandaloneProject.** Router repointed (10 routes), 15 old paths deleted,
  barrel repointed (3 entries). Fresh decisions: sources start empty (no
  fake demo data); engine segmented control as pressed-buttons; spectrogram
  canvas uploads blob: URLs first (backend 404s on object URLs — old view
  silently failed); Export upload-first (same filename bug as Noise);
  TrackVisuals repointed to the new canvas. Skipped per scope: MiniGame,
  Assistant/Help/Notifications (parallel session's area). Verified: biome
  clean, placeholders clean, production build green; full tsc shows ONLY 2
  errors in `features/store/OffersBanner.tsx` — parallel session's
  in-flight edit (`localPrice` undefined, untouched per no-collision rule).
- Slice 17 (uncommitted): **reconnect pass — 27 router repoints to already-built
  features (tabs, all settings pages, misc pages), dead ModelsTab block +
  21 old paths deleted, barrel repointed, `interpolateValue` ported to
  `features/stories/timeline.ts` for the shared playback hook.** Kept
  deliberately: shell chrome (AppFrame/Sidebar/Banners/Workspace shell —
  parallel session's area) and the StoriesTab editor graph (old AppFrame
  renders StoryTrackEditor). Player: already wired (store + AudioPlayer +
  shortcuts), nothing to rebuild. Minigame: `features/game/` registry
  (brick-survivors + documented future slot), generic GameModal/GameNudge,
  router repointed. Verified: biome clean, placeholders clean, production
  build green, full-project tsc exit 0.
