# Frontend: State Stores + Routing

PURPOSE: The client's global state model (zustand stores) and the TanStack Router navigation structure.
OWNS: app/src/stores/* (9 zustand stores), app/src/lib/hooks/* (React-Query + custom hooks), app/src/router.tsx.
READ-WHEN: Touching global state (player, generation, stories, UI), cross-tab navigation, or the app shell.
KEY-FILES: stores/playerStore.ts, stores/generationStore.ts, lib/hooks/useAudioPlayer.ts, router.tsx, AppFrame
INVARIANTS: Global cross-cutting state lives in zustand stores; per-request/server data lives in React-Query caches (keyed e.g. ['effectPresets'], ['profiles']). The router is fully lazy-loaded (code-split) per route. The shared AudioContext/AnalyserNode is a module singleton (one per app instance).
GOTCHAS: playerStore holds a single "now playing" item (audioUrl/audioId) + a masterAnalyser used for the rose audio-reactive glow. useAudioPlayer creates a MediaElementSource per <audio> element (only once per element) and writes the analyser into playerStore.
UPDATED: 2026-07-19

## Stores (app/src/stores/)
- `playerStore` — single active audio item: audioUrl, audioId, profileId, title, isPlaying, currentTime, duration, volume, isLooping, shouldRestart, shouldAutoPlay, onFinish callback, masterAnalyser (for audio-reactive UI). `setAudio` clears restart/autoplay flags; `setAudioWithAutoPlay` sets shouldAutoPlay.
- `generationStore` — generation-screen state (selected profile/preset, pending results).
- `storyStore` — Stories tab timeline state.
- `effectsStore` — effects preset/chain editing state.
- `uiStore` — UI flags (theme, panels, modals).
- `serverStore` — backend health/status.
- `audioChannelStore` — voice channel groupings.
- `voiceChangerStore` — real-time voice changer state (low-risk store setters; agent does NOT mutate the live audio graph).
- `logStore` — server log streaming buffer.

## Audio player (lib/hooks/useAudioPlayer.ts)
- `sharedContext`/`sharedAnalyser` are MODULE-SINGLETONS (one AudioContext + AnalyserNode for the whole app). `getSharedAnalyser()` lazily creates them.
- `playPause(file)` — toggles an HTMLAudioElement; on first play creates a `MediaElementSource` → analyser → destination, and publishes the analyser to `playerStore.setMasterAnalyser` (drives the rose audio-reactive glow via `isPlaying`).
- `MediaElementSource` can only be created ONCE per element — wrapped in try/catch (ignore if already connected). Blob URLs are revoked on `ended`/`error` to avoid leaks.

## Routing (router.tsx, TanStack Router)
- `createRootRoute` → AppFrame (sidebar + outlet + Toaster). AppFrame mounts global hooks: `useAssistantCommands`, `useGenerationProgress`, `useModelDownloadToast`, `useRestoreActiveTasks`.
- All page components are LAZY-IMPORTED (code-split): CapturesTab, EffectsTab, MainEditor, ModelsTab, AudioStudio, StoriesTab, VoicesTab, Workspace (Timeline/PitchMap/Mixer), ServerTab pages (About/General/GPU/Logs/MCP/Captures/Changelog/Generation), SettingsLayout.
- Routes are nested under layouts (WorkspaceLayout, SettingsLayout, ServerTab). `redirect` used for default route. `useLocation` for active-nav highlighting.

## Observations (audit findings — for later judgement, NO code change yet)
1. **Single shared AudioContext is never closed** (useAudioPlayer.ts:5-23) — created once, lives for the app's lifetime. Standard for web audio, but if the tab stays open for days the context accumulates. Acceptable; browsers suspend on tab-hide.
2. **playerStore.masterAnalyser is a singleton reference shared into a store** — multiple simultaneous players would fight over the single analyser. The app only plays one item at a time (by design), so safe, but there's no guard preventing two useAudioPlayer instances both writing the analyser.
3. **`onFinish` callback stored in zustand state** (playerStore.ts:15) — storing a function in global state is unusual (functions aren't serializable, breaks any future persist/middleware). Currently no persist middleware, so harmless, but a footgun if someone adds persistence.
4. **Router is fully lazy but the root AppFrame mounts 4 global hooks unconditionally** — `useGenerationProgress`, `useModelDownloadToast`, `useRestoreActiveTasks` run on EVERY route. `useRestoreActiveTasks` re-hydrates in-flight generations on load (good for resume), but the others poll/subscribe constantly even on unrelated tabs. Minor CPU; consider route-scoping.
5. **`useAudioPlayer` is a hook returning local `isPlaying` state** while the source of truth for playback is also in `playerStore.isPlaying` — two copies of "is playing" can desync (local state vs store). The analyser/store path uses playerStore; the hook's `setIsPlaying` is local. A consumer reading the hook's `isPlaying` may disagree with `usePlayerStore.isPlaying`. Worth consolidating to one source.
6. **No global error/loading boundary around lazy routes except `ErrorBoundary` at root** — a route chunk that fails to load (network) shows the root boundary. Fine, but per-route Suspense fallbacks are the lazy `import()` default (blank) — no skeleton.
7. **`audioChannelStore` + `voiceChangerStore` are global but only loosely connected to generation** — channel voice grouping and voice-changer state don't appear to flow into `run_generation` (generation uses profile_id directly). If channels are meant to scope generation, that wiring may be missing (verify before relying on channel-based generation).

## Agent Callable
- **MCP Tools:** (n/a — this doc describes frontend architecture)
- **REST Endpoints:** (n/a — this doc describes frontend state/routing)
- **Key Backend Files:** (n/a)
- **Key Frontend Files:** `app/src/stores/serverStore.ts`, `app/src/stores/playerStore.ts`, `app/src/stores/uiStore.ts`, `app/src/stores/storyStore.ts`, `app/src/stores/effectsStore.ts`, `app/src/stores/generationStore.ts`, `app/src/stores/contentStore.ts`, `app/src/stores/logStore.ts`, `app/src/stores/clipboardStore.ts`, `app/src/stores/voiceChatStore.ts`, `app/src/stores/voiceChangerStore.ts`, `app/src/router.tsx`, `app/src/lib/hooks/useAudioPlayer.ts`
