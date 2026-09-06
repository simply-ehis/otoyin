# Contributing to otoyin

We welcome contributions. This project is in active development.

## Development setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up Python venv: `just setup-python` (or manually: `python -m venv backend/venv` + `pip install -r backend/requirements.txt`)
4. Start dev server: `just dev` (backend + Tauri) or `just dev-web` (browser only)

## Code style

- **Frontend:** Biome for lint/format. Run `npm run check` in `app/`.
- **Backend:** Ruff for lint/format. Run `ruff check backend/` and `ruff format backend/`.
- **TypeScript:** `tsc --noEmit` must pass in both `app/` and `web/`.
- Keep files under 500 lines, functions under 100 lines.
- Add tooltip on every icon-only button.
- Use heroicons only (`@heroicons/react/24/outline`). No Lucide.
- Tauri IPC only — no HTTP/CLI/localhost for inter-window communication.

## Project structure

| Directory | What lives here |
|---|---|
| `app/` | React frontend (Tauri desktop) |
| `web/` | React frontend (browser variant) |
| `backend/` | Python FastAPI server |
| `backend/backends/` | TTS/STT/VC/Music engine integrations |
| `backend/routes/` | HTTP API route modules |
| `backend/services/` | Business logic |
| `backend/mcp_server/` | MCP server + tools |
| `tauri/` | Tauri desktop shell (Rust) |
| `docs/knowledge/` | Per-tool knowledge docs |
| `.agents/skills/` | Agent skills for AI-driven audio production |

## Before submitting

1. Run `just check` (lint + format + typecheck)
2. Run `just test` (Python tests)
3. If you touched TTS/engine code, verify the engine loads and generates
4. Update `docs/knowledge/` if you changed a tool interface
5. Update `FEATURES.md` if you added a user-facing feature

## Pull request process

1. Create a feature branch
2. Make your changes in small, reversible steps
3. Run typecheck and lint
4. Submit a PR with a clear description of changes
5. Link any related issues

## License

By contributing, you agree that your contributions will be licensed under the project's license.
