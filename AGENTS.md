# otoyin — Agent Rules

This project's local rules extend the global constitution. The global `AGENT.md`
(`C:\Users\ehis\.config\opencode\skill\AGENT.md`) is the governing constitution and takes
precedence on conflicts — re-read it every session and after any context compaction. Skill
selection: consult `C:\Users\ehis\.config\opencode\skill\SKILL_INDEX.md`. Completion gate:
`C:\Users\ehis\.config\opencode\skill\BUILD_CHECKLIST.md`. Impact map: `IMPACT_MAP.md`
(update it on structural changes). Local rules below override the global defaults where
they are stricter (e.g. file/function size caps).

## READ-WHEN
- Touching TTS engines → `backend/backends/*.py`, `backend/backends/configs.py`
- Touching voice profiles → `backend/services/profiles.py`, `app/src/components/VoiceProfiles/`
- Touching the story editor → `app/src/components/StoriesTab/StoryTrackEditor.tsx` (1000+ lines)
- Touching audio studio → `app/src/features/audioStudio/AudioStudio.tsx` + `usePlaybackEngine.ts`, `AudioStudioStore.ts` (moved from `components/AudioStudio/` 2026-08-19)
- Touching API client → `app/src/lib/api/client*.ts` (one file per domain)
- Touching MCP tools → `backend/mcp_server/tools/` (10 files, 110 tools)
- Touching models/downloads → `backend/routes/models/`, `app/src/components/ServerSettings/`

## KEY-FILES
- `app/src/lib/api/client.ts` — API client entry point (all backend calls)
- `app/src/lib/api/types.ts` — TypeScript types matching backend Pydantic models
- `backend/backends/configs.py` — model config registry (large, ~941 lines; see PROJECT_STATUS known issues)
- `backend/routes/__init__.py` — route registration (all routers wired here)
- `backend/app.py` — FastAPI app lifecycle (startup, shutdown, middleware)
- `biome.json` — JS/TS lint config
- `backend/pyproject.toml` — Python lint (Ruff) + pytest config
- `justfile` — all dev/build/test commands

## INVARIANTS
- Tauri IPC only — no HTTP/CLI/localhost for inter-window communication
- otoyin is a separate Tauri window in the same process — NOT a standalone sidecar
- Rose is the only motion in the visual identity (Caravaggio-style, warm single-source light)
- Everything offline/on-device — no cloud dependencies for core features
- All edits non-destructive (undo/redo on every operation)
- Icons: heroicons only (`@heroicons/react/24/outline`). No Lucide, no other icon libs.
- Error handling: `showStudioErrorToast(error)` in frontend, `logger.debug(..., exc_info=True)` in backend

## GOTCHAS
- `app/tsconfig.json` targets ES2022 — do NOT downgrade to ES2020 (breaks `Object.hasOwn`)
- `app/src/lib/api/` is in `.biomeignore` — generated code, don't lint/format it
- `lucide-react` is in `app/package.json` but should NOT be used — heroicons only
- Backend venv path: `backend/venv/Scripts/python.exe` (Windows) or `backend/venv/bin/python` (Unix)
- `just dev` starts both backend + Tauri. `just dev-backend` starts only the backend.
- Pre-commit hook lives at `.githooks/pre-commit` — install with `git config core.hooksPath .githooks`
- `backend/backends/configs.py` is large (~941 lines) and growing — be careful when editing

## Code Quality
- Zero placeholders — no TODOs, no stubs, no `pass`, no `// TODO`, no `NotImplementedError`
- Max 500 lines per file (exceptions: generated assets, translation files)
- Max 100 lines per function
- Doc every tool/function as you build it (knowledge docs)
- Tooltip on every icon-only button (use `title` or `aria-label`)
- Use existing libraries — no new dependencies without spec approval

## Branding
- "21labs" — all user-facing text, docs, README, LICENSE
- Rose is the only motion in the visual identity (Caravaggio-style, warm single-source light)
- Everything offline/on-device — no cloud dependencies
- All edits non-destructive

## Architecture
- Tauri IPC only — no HTTP/CLI/localhost for inter-window communication
- otoyin is a separate Tauri window in the same process — NOT a standalone sidecar
- Rose SVG at ~0.08 opacity behind UI via CSS; audio-reactive glow via player store `isPlaying`

## Knowledge
- Every tool built must have a corresponding knowledge doc in `docs/knowledge/`
- Knowledge index (`00-index.md`) must list every doc with a one-line summary

## Verification
- Run `bin/check.ps1` after every feature phase (lint + typecheck + format)
- Run `bin/check.ps1 -Fix` to auto-fix what's possible
- Pre-commit hook runs automatically on `git commit` (install: `git config core.hooksPath .githooks`)
- Stop and ask if unclear — never guess the spec
