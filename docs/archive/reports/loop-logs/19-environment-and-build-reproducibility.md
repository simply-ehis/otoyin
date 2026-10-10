# Loop log — 19-environment-and-build-reproducibility

## 2026-09-05 — PLAN
Re-read Context: device detection + plugin paths explicitly fine (don't touch). 5 confirmed gaps + 2 worth-a-pass.

## 2026-09-05 — unit-by-unit SELF-VERIFY
| Unit | Check | Result |
|---|---|---|
| Pinned Python deps | `backend/requirements.txt` still `>=`-style (fastapi>=0.109.0); torch==2.5.1 pinned; NO lockfile (`requirements.lock`/freeze/pip-tools/uv — absent; only requirements-core/rvc/requirements.txt). Commit `570ede7` "lockfile committed" = npm package-lock, not Python | FAIL → REAL GAP (fresh-install drift still possible) |
| rust-toolchain.toml | `tauri/src-tauri/rust-toolchain.toml` EXISTS. Forced-version behavior test NOT performed | IN PROGRESS (file yes, behavior proof no) |
| check-env.sh | `check-env.sh` EXISTS alongside `check-env.bat`. Fresh-macOS/Linux run + broken-setup catch test NOT logged | IN PROGRESS (file yes, field test no) |
| Path concatenation (~15) | Site-by-site real-vs-URL verdicts NOT logged in this pass | NOT STARTED |
| bun/pnpm mess | Closed via 03 (see 01/03 logs) | PASS |
| Zero-cache fresh install | Never-run-machine test NOT logged | NOT STARTED |
| .env.example completeness | Table exists (see 12 log); mechanical `os.environ` diff NOT run | IN PROGRESS (shared with 12) |

## AUDIT checkpoint
Fresh-install re-run after pinning/download-path changes: no changes in this pass. PASS (vacuous).

## Exit checklist
- [ ] Fresh clone+machine builds with zero troubleshooting (open)
- [ ] 15 path sites resolved (open)
- [ ] .env.example diffed (open)
→ FILE IN PROGRESS. Biggest open: Python lockfile is a build, not a verification.
