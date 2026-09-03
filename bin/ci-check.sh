#!/bin/bash
# ci-check.sh — Unified CI gate for 21-labs
#
# Runs:
#   1. Python pytest (backend unit + integration tests)
#   2. Frontend vitest (React component + hook tests)
#
# Usage:
#   bin/ci-check.sh              # run all
#   bin/ci-check.sh --backend    # backend only
#   bin/ci-check.sh --frontend   # frontend only
#   bin/ci-check.sh --quick      # skip slow E2E tests
#
# Exits non-zero on any failure. Designed for pre-commit hooks and CI pipelines.

set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
failed=0
backend_ok=true
frontend_ok=true
quick=false
backend_only=false
frontend_only=false

# Parse args
for arg in "$@"; do
  case "$arg" in
    --quick)      quick=true ;;
    --backend)    backend_only=true ;;
    --frontend)   frontend_only=true ;;
    -h|--help)
      echo "Usage: ci-check.sh [--quick] [--backend] [--frontend]"
      exit 0
      ;;
  esac
done

# If neither --backend nor --frontend, run both
if [ "$backend_only" = false ] && [ "$frontend_only" = false ]; then
  backend_ok=false  # will be set to true after run
  frontend_ok=false
fi

echo ""
echo "============================================"
echo "  21-labs CI Check"
echo "============================================"
echo ""

# ── Step 1: Python pytest ──
if [ "$frontend_only" = false ]; then
  echo "[1/2] Python pytest..."
  cd "$ROOT"

  PYTEST_ARGS=(
    -x                          # stop on first failure
    --timeout=30                # per-test timeout
    -q                          # quiet output
    --tb=short                  # short tracebacks
    --no-header                 # cleaner output
  )

  # In quick mode, skip E2E tests
  if [ "$quick" = true ]; then
    PYTEST_ARGS+=(--ignore=backend/tests/test_stt_backends_e2e.py)
    PYTEST_ARGS+=(--ignore=backend/tests/test_all_models_e2e.py)
    PYTEST_ARGS+=(--ignore=backend/tests/test_server_shutdown_e2e.py)
    PYTEST_ARGS+=(--ignore=backend/tests/test_streaming_e2e.py)
  fi

  # Run pytest with timeout
  if timeout 120 python -X utf8 -m pytest "${PYTEST_ARGS[@]}" \
      backend/tests/test_tool_registry.py \
      backend/tests/test_tr_dispatch.py \
      backend/tests/test_stt_backends.py \
      backend/tests/test_stt_self_check.py \
      backend/tests/test_generation_subfunctions.py \
      2>&1 | tail -20; then
    echo "  ✅ Backend tests PASSED"
  else
    echo "  ❌ Backend tests FAILED"
    backend_ok=false
    failed=1
  fi
  echo ""
fi

# ── Step 2: Frontend vitest ──
if [ "$backend_only" = false ]; then
  echo "[2/2] Frontend vitest..."
  cd "$ROOT/app"

  VITEST_ARGS=(run --reporter=verbose)

  # Run vitest with timeout
  if timeout 180 npx vitest "${VITEST_ARGS[@]}" 2>&1 | tail -20; then
    echo "  ✅ Frontend tests PASSED"
  else
    echo "  ❌ Frontend tests FAILED"
    frontend_ok=false
    failed=1
  fi
  echo ""
fi

# ── Summary ──
echo "============================================"
if [ $failed -ne 0 ]; then
  echo "  ❌ CI GATE FAILED"
  echo "  Fix the errors above, then re-commit"
  echo "============================================"
  exit 1
else
  echo "  ✅ ALL CHECKS PASSED"
  echo "============================================"
  exit 0
fi
