# 94 — Onboarding

PURPOSE: First-launch wizard (welcome → use-case cards → setup → generate) that decides which sidebar tabs stay visible, then marks onboarding complete.
OWNS: app/src/features/onboarding/UseCaseWizard.tsx, app/src/stores/workspaceStore.ts (USE_CASE_PROFILES + applyUseCases), onboarding i18n keys
READ-WHEN: touching first-run flow, use-case profiles, tab visibility defaults, or Settings → Workspace "Replay welcome tour"
KEY-FILES: app/src/features/onboarding/UseCaseWizard.tsx, app/src/stores/workspaceStore.ts, app/src/lib/tabs/registry.ts, app/src/i18n/locales/en/translation.json
INVARIANTS: Wizard opens only when `workspaceStore.onboarded === false`; selecting use-cases calls `applyUseCases(selected)` which hides everything except the profile union + always-on tabs; Skip = markOnboarded + close, never navigates; Re-run from Settings → Workspace calls `reopenOnboarding()` (sets onboarded false).
GOTCHAS: Per design doc §2, models step / device check / agent step / privacy toggle / sample-audio "first win" are NOT built — they need backend model-download, device-audio, and command-registry scaffolding that doesn't exist yet. The existing "setup" step ("Get a voice") is the closest shipped equivalent and points at the Store.
UPDATED: 2026-11-10

## Flow

1. Welcome — what Otoyin is, "Get started".
2. Use case — multi-select cards; each lists the tabs it enables (registry-driven) + model-space estimate. Selecting none = "Show everything".
3. Setup — download a voice model from the Store, pick/make a voice.
4. Generate — write, generate, listen; "Start generating" → navigate to `/` and mark onboarded.

Skip (on every step) = `markOnboarded()` + close dialog. Back steps through the wizard. Finishing sets `onboarded: true`; `reopenOnboarding()` resets it to false for the Settings replay path.

## Use-case profiles (`USE_CASE_PROFILES` in workspaceStore.ts)

| Key | Tabs enabled | Model space |
|-----|--------------|-------------|
| tts | /, /voices, /voice-converter, /sounds, /songwriter | ~400 MB |
| podcast | /, /stories, /captures, /diarize, /voices, /audio-enhance, /noise-reduction | ~700 MB |
| audiobook | /audiobooks, /, /voices, /library, /noise-reduction, /audio-enhance | ~300 MB |
| music | /music-gen, /songwriter, /instruments, /audio-studio, /mixer, /launcher | ~1.2 GB |
| voiceChanger | /voice-converter, /captures, /vocal-isolation, /noise-reduction, /audio-enhance | ~600 MB |

Always-on (never hidden): /library, /store, /settings.

## Tests

- `app/src/features/onboarding/UseCaseWizard.test.tsx` — welcome opens, usecase selection reaches setup+generate+onboarded, back, skip onboards without touching tabs, reopen works, cards list tabs + space, skip on setup/generate onboards without navigating (10 tests).
- `app/src/test/onboarding.test.tsx` — per-tab intro memory + tab mapping (4 tests, untouched by this slice).
