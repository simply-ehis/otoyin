#!/usr/bin/env bash
# Build the otoyin-mcp stdio shim (PyInstaller --onefile) and stage it as the
# Tauri externalBin sidecar: tauri/src-tauri/binaries/otoyin-mcp-<host-triple>
# (.exe on Windows). tauri.conf.json declares it in externalBin; the bundle
# step fails if it is missing.
#
# Usage:  ./scripts/build-shim.sh          (uses backend/venv python)
#         PYTHON=python3 ./scripts/build-shim.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PLATFORM="$(uname -s)"
case "$PLATFORM" in
  MINGW* | MSYS* | CYGWIN*)
    EXT=".exe"
    PY_FALLBACK="$REPO_ROOT/backend/venv/Scripts/python.exe"
    ;;
  *)
    EXT=""
    PY_FALLBACK="$REPO_ROOT/backend/venv/bin/python"
    ;;
esac

if [ -n "${PYTHON:-}" ]; then
  if [[ "$PYTHON" == */* ]]; then
    PY_BIN="$PYTHON"
  else
    PY_BIN="$(command -v "$PYTHON")" || { echo "Python '$PYTHON' not found on PATH." >&2; exit 1; }
  fi
else
  PY_BIN="$PY_FALLBACK"
fi

if [ -z "${PY_BIN:-}" ] || [ ! -x "$PY_BIN" ]; then
  echo "Python not found at ${PY_BIN:-<unset>} - run 'just setup-python' first (or set PYTHON)." >&2
  exit 1
fi

echo "==> Building otoyin-mcp shim..."
"$PY_BIN" "$REPO_ROOT/backend/build_binary.py" --shim

TRIPLE="$(rustc --print host-tuple)"
mkdir -p "$REPO_ROOT/tauri/src-tauri/binaries"
cp "$REPO_ROOT/backend/dist/otoyin-mcp${EXT}" "$REPO_ROOT/tauri/src-tauri/binaries/otoyin-mcp-${TRIPLE}${EXT}"
echo "MCP shim staged at tauri/src-tauri/binaries/otoyin-mcp-${TRIPLE}${EXT}"
