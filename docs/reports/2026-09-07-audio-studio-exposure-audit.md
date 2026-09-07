# Audio Studio exposure audit (prompt 05)

**Date:** 2026-09-07
**Status:** DONE — `features/audioStudio/` migration verified complete; no
routes, features, or imports dropped.
**Last verified:** 2026-09-07

Verified 2026-09-07: the `features/audioStudio/` migration is complete and
no routes, features, or imports were dropped.

## File inventory

46 files in `app/src/features/audioStudio/` — matches the git diff stat
from `bf7de3e` (the migration commit). Zero missing, zero extra.

## Route wiring

- `/audio-studio` route defined in `app/src/router.tsx:877` → `AudioStudio`
- Lazy import from `@/features/audioStudio/AudioStudio` (new path, correct)
- Sidebar link at `app/src/layouts/Sidebar.tsx:44` with i18n key `sidebar.audioStudio`
- `components/index.ts` re-exports `AudioStudio` from new path
- `assistantCommands.ts` imports `useAudioStudioStore` from new path

## Feature coverage (old vs new)

| Feature | Old import | New import | Present |
|---|---|---|---|
| PodcastProducer | `@/components/AudioStudio/...` | `./PodcastProducer` | Yes |
| TranscriptDrawer | `@/lib/transcript` | `@/lib/transcript` | Yes |
| IsolationStem | `@/components/Workspace/...` | `@/features/workspace/...` | Yes |
| useOfflineExport | `./audioStudio/useOfflineExport` | `./useOfflineExport` | Yes |
| usePluginExport | `./audioStudio/usePluginExport` | `./usePluginExport` | Yes |
| useStudioIsolation | `./audioStudio/useStudioIsolation` | `./useStudioIsolation` | Yes |
| useStudioMidi | `./audioStudio/useStudioMidi` | `./useStudioMidi` | Yes |
| StudioToolbar | `./audioStudio/StudioToolbar` | `./StudioToolbar` | Yes |
| TransportControls | `./audioStudio/TransportControls` | `./TransportControls` | Yes |

## Old-path references

Zero references to `@/components/AudioStudio` remain in the codebase.

## Remaining work

- Live perf measurement (deferred to capable hardware — see `2026-09-05-audio-studio-perf.md`)
- TranscriptDrawer is imported from `@/lib/transcript` (shared lib, not feature-local — acceptable)
