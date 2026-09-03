# TESTING.md — How to Test otoyin

## Quick Verification (after every change)

```powershell
# Full gate: lint + typecheck + format + async check + NAME_MAP + placeholder + tests
bin/check.ps1

# Frontend only (skip Python lint/format, keep tests)
bin/check.ps1 -Quick

# Lint only (no tests)
bin/check.ps1 -NoTests

# Auto-fix what's fixable
bin/check.ps1 -Fix
```

Just equivalents (cross-platform, same gate):

```powershell
just verify          # == bin/check.ps1
just verify-fix      # == bin/check.ps1 -Fix
just verify-frontend # == bin/check.ps1 -Quick
just check           # lint + typecheck + format (no tests)
just test            # core pytest gate (matches bin/check.ps1 + CI)
just test-all        # full pytest suite
```

## Smoke Test (verify the app runs)

```powershell
# Start backend + check /health
bin/run.ps1 -BackendOnly
# or
just smoke
just dev-backend      # backend only (checks port 17493 free, friendly error if busy)

# Full app (backend + Tauri)
bin/run.ps1
just dev              # polls /health/ready up to 30s, handles TWENTYLABS_PORT
```

Port conflicts: if `17493` is busy, `just dev-backend` prints the PID and hints:

```
Port 17493 already in use.
TWENTYLABS_PORT=17494 just dev-backend   or   just kill
```

Same for voice-changer (17494) — it auto-picks a free port and reports it at `/voice-changer/status`.

## Unit Tests

### Backend (pytest)
```powershell
just test
# core gate (matches CI + pre-commit):
backend/venv/Scripts/python.exe -X utf8 -m pytest backend/tests/test_tool_registry.py backend/tests/test_tr_dispatch.py backend/tests/test_stt_backends.py backend/tests/test_stt_self_check.py backend/tests/test_generation_subfunctions.py -q --timeout=15

# full suite
just test-all
# or
backend/venv/Scripts/python.exe -m pytest backend/tests -v
```

### E2E Model Tests
```powershell
just test-models
just test-models --only kokoro
bin/e2e.ps1 -Only kokoro
```

## Pre-commit Hook

`.githooks/pre-commit` runs on `git commit` (installed by `just setup` or `npm run setup`):

1. Biome lint (JS/TS)
2. TypeScript typecheck
3. Ruff lint + Ruff format (Python)
4. NAME_MAP coverage
5. Placeholder markers (TODO/FIXME/HACK/XXX — `custom_token_XXX` in orpheus_backend.py is allowed)
6. Python pytest (core, 60s)
7. Frontend vitest (120s)
8. Python import check

If it fails, fix and re-stage. Auto-fix: `bin/check.ps1 -Fix` or `just fix`.

To install manually: `git config core.hooksPath .githooks`
To verify: `git config --get core.hooksPath` should print `.githooks`

## Lint Commands (manual)

```powershell
bunx biome lint app/src
bunx biome format app/src
cd app && bun run typecheck
ruff check backend
ruff format --check backend
python -X utf8 -m scripts.check_async_blocking backend/routes
python -X utf8 -m backend.scripts.check_name_map
just fix  # biome --write + ruff --fix + ruff format
```

## When to Test

- **After every feature phase**: `bin/check.ps1` or `just verify`
- **Before commit**: pre-commit hook runs automatically
- **After refactoring**: `bin/check.ps1` + `just test-all`
- **After dependency changes**: `just setup` + `bin/check.ps1`
- **Before release**: `just test-models` (full e2e)
- **Port issues**: `just kill` then retry, or `TWENTYLABS_PORT=17495 just dev`
