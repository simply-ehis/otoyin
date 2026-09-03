---
name: app-ui-loading
description: Design and implement loading, pending, and progress feedback in the otoyin React app without blank panes or inaccessible silent waits.
---
# App UI Loading

## Purpose

This skill defines the loading contract for the React/Tauri app. Loading feedback must tell the
user what is happening, preserve existing content during refreshes, and expose status to assistive
technology. The app is an offline studio, so model loading and long audio operations can take
seconds or minutes and need honest, contextual feedback.

## When to use

- Adding or changing a lazy route or code-split component.
- Wiring a React Query request, upload, model download, export, or audio render.
- Fixing a blank pane, disabled button with no explanation, or silent pending operation.

## Loading surfaces

| Situation | Use | Rule |
|---|---|---|
| Route/chunk startup | `AppLoadingScreen` from `app/src/components/ui/AppLoadingScreen.tsx` | Full-area branded fallback; never a blank pane. |
| First data load with no usable data | `LoadingState` from `app/src/components/ui/LoadingState.tsx` | Provide a specific label such as `Loading voice packs…`. |
| Refresh with existing data | Keep the content visible | Add an inline spinner or `isFetching` hint; do not replace the content. |
| Button mutation | `Spinner` inside the button | Disable only the action being performed and change its label. |
| Long generation/download | Existing progress/toast surface | Include model/task name, current phase, and failure recovery. |

## Agent procedure

1. Identify whether the operation is route loading, first data load, refresh, or mutation.
2. Pick the smallest surface in the table that communicates the state.
3. Give the state a user-facing label; avoid bare ellipses or unexplained disabled controls.
4. Add `role="status"`, `aria-live="polite"`, and `aria-busy="true"` to region-level states.
5. Preserve content during refetches and make the error state recoverable with a retry or next step.
6. Keep the rose mark as the only branded motion; avoid adding unrelated animated decoration.

## Pitfalls / gotchas

- Do not use `fallback={null}` for the primary route content.
- Do not show a full-screen loading overlay for a nonessential lazy overlay such as Help or the
  Assistant; those controls should remain usable while the overlay loads.
- Do not claim progress percentages unless the backend provides a real progress value.
- Do not hide a failed request behind an endlessly spinning state.

## Cross-links

- [agent-operating-guide](../agent-operating-guide/SKILL.md)
- [troubleshooting](../troubleshooting/SKILL.md)
- [batch-queue](../batch-queue/SKILL.md)

## Validation

- Run the app typecheck and frontend tests.
- Confirm a lazy route displays `AppLoadingScreen` while its module is unavailable.
- Confirm loading regions are announced by screen readers and disappear on success or error.
