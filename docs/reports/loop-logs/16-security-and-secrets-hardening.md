# Loop log — 16-security-and-secrets-hardening

## 2026-09-05 — PLAN
Re-read Context: solid core (encrypted BYOK, no hardcoded secrets, broad rate limiting) — verify gaps only.

## 2026-09-05 — unit-by-unit SELF-VERIFY
| Unit | Check | Result |
|---|---|---|
| MCP trust model | `context.py` tracks client-id (new `X-otoyin-Client-Id` + legacy accept) + `current_remote_addr`; MCP mounted at `/mcp` on the backend app (same bind as backend — localhost with desktop). Explicit written trust statement (local-only vs remote-mode exposure) NOT found as a doc; remote-mode MCP exposure audit NOT logged | IN PROGRESS (mechanism visible; statement + remote audit pending) |
| Marketplace admin auth | `_require_admin` (Bearer `MARKETPLACE_ADMIN_KEY`, 401/503) in notices.py. Live unauthenticated-attempt test NOT logged | IN PROGRESS (code yes, attack demo no) |
| Webhook verify | Paddle `Paddle-Signature`-over-raw-body, 401 on mismatch (see 10 log). Forgery-payload test NOT logged | IN PROGRESS (code yes, attack demo no) |
| Notification admin auth | Same `_require_admin` path as marketplace admin. Same pending demo | IN PROGRESS |
| Dep-scan gate | CI `security-audit` job: `npm audit --audit-level=high` + `pip-audit -r backend/requirements.txt` (ci.yml:89-104). Deliberate-vulnerable-dep blocking test NOT performed | IN PROGRESS (gate exists, proof pending) |

## AUDIT checkpoint
Re-run all attack checks after any auth change: no auth changes in this pass. PASS (vacuous).

## Exit checklist
- [ ] Every admin/write path tested-rejecting (code yes, demos no)
- [ ] Forgery rejected (code yes, demo no)
- [ ] Scan gate proven blocking (gate yes, proof no)
→ FILE IN PROGRESS. Pattern: all five units are "code exists, adversarial demonstration pending" — a single attack-test session could close 4/5.
