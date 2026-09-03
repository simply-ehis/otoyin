# Error Handling — Studio‑Themed System

## Overview

Error messages use sound‑studio terminology throughout. Raw backend/network errors are translated at display time into studio‑appropriate messages.

## Architecture

| Layer | File | Purpose |
|---|---|---|
| Error definitions | `app/src/lib/errors.ts` | 12 error codes, `inferStudioError()` regex matcher, `showStudioErrorToast()` |
| Crash boundary | `app/src/components/ErrorBoundary/ErrorBoundary.tsx` | Class‑based React error boundary |
| Crash screen | `app/src/components/ErrorBoundary/CrashScreen.tsx` | Full‑screen error card with collapsible console log, retry button |
| Inline banner | `app/src/components/ErrorBoundary/ErrorBanner.tsx` | Dismissable inline banner (critical/warning/info severity) |
| Error hook | `app/src/hooks/useErrorHandler.ts` | Returns `{ error, handleError, clearError }` with optional toast |

## Error Codes

| Code | Severity | Trigger pattern |
|---|---|---|
| SIGNAL_LOST | critical | network/fetch/connection/ECONNREFUSED |
| ENGINE_STALLED | critical | timeout/server errors |
| SAMPLE_BUFFER_UNDERRUN | warning | pipeline/resource exhaustion |
| CORRUPTED_TRACK | warning | file corruption |
| UNSUPPORTED_FORMAT | warning | format/decoding errors |
| MICROPHONE_MUTED | warning | mic/permission errors |
| NO_AUDIO_DEVICE | warning | audio device errors |
| MODEL_NOT_LOADED | warning | model download/load errors |
| INFERENCE_FAILED | warning | generation/inference errors |
| SESSION_OVERLOAD | warning | session state errors |
| AUTOSAVE_FAILED | warning | save/disk errors |
| UNEXPECTED_GLITCH | critical | anything not matched above |

## Usage

```tsx
import { inferStudioError, showStudioErrorToast } from '@/lib/errors';

// Inline error display
if (error) {
  const studioErr = inferStudioError(error);
  return <div>{studioErr.title}: {studioErr.message}</div>;
}

// Toast notification
showStudioErrorToast(error);
```

## Wiring

- **Top level:** `App.tsx` wraps `<RouterProvider>` in `<ErrorBoundary>` — catches total crashes
- **Route level:** `router.tsx` wraps `<Outlet>` in route‑level `<ErrorBoundary>` — keeps sidebar/frame alive when a tab fails
- **ProfileList:** uses `inferStudioError()` to display "Signal Lost" instead of "Failed to fetch"
- **VoicesTab:** uses `inferStudioError()` to display error UI instead of empty table
