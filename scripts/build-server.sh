#!/usr/bin/env bash
# Build the otoyin Python backend into a standalone binary and stage it where
# Tauri expects it (tauri/src-tauri/binaries/otoyin-server/), registered as a
# bundle.resources dir in tauri.conf.json.
#
# Canonical builder: backend/build_binary.py (PyInstaller --onedir with the
# full hidden-import/runtime-hook table). Run from the repo root; the script
# resolves the interpreter (venv python, or $PYTHON for CI), pre-downloads the
# small ONNX weights that ship inside the frozen bundle, builds, then copies
# the onedir output into the Tauri binaries dir.
#
# Usage:  ./scripts/build-server.sh          (uses backend/venv python)
#         PYTHON=python3 ./scripts/build-server.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PLATFORM="$(uname -s)"
ARCH="$(uname -m)"

case "$PLATFORM" in
  Linux)   EXT="" ;;
  Darwin)  EXT="" ;;
  # Git Bash / MSYS2 / Cygwin on GitHub's windows-latest runner report
  # MINGW64_NT-* / MSYS_NT-* / CYGWIN_NT-* — never literally "Windows".
  MINGW* | MSYS* | CYGWIN*)
    EXT=".exe"
    ;;
  *)
    echo "Unknown platform: $PLATFORM" >&2
    exit 1
    ;;
esac

# Resolve the Python interpreter: $PYTHON override wins (CI), else venv python.
# $PYTHON may be a bare command name (e.g. "python" on a runner PATH).
if [ -n "${PYTHON:-}" ]; then
  if [[ "$PYTHON" == */* ]]; then
    PY_BIN="$PYTHON"
  else
    PY_BIN="$(command -v "$PYTHON")" || { echo "Python '$PYTHON' not found on PATH." >&2; exit 1; }
  fi
elif [ -n "$EXT" ]; then
  PY_BIN="$REPO_ROOT/backend/venv/Scripts/python.exe"
else
  PY_BIN="$REPO_ROOT/backend/venv/bin/python"
fi

if [ -z "${PY_BIN:-}" ] || [ ! -x "$PY_BIN" ]; then
  echo "Python not found at ${PY_BIN:-<unset>} — run 'just setup-python' first (or set PYTHON)." >&2
  exit 1
fi

# Tiny ONNX weights (Silero VAD etc.) must be in the HF cache before the
# PyInstaller build so build_binary.py's --collect-data/--add-data picks them
# up and ships them inside the frozen bundle.
echo "==> Downloading bundled ONNX weights..."
"$PY_BIN" -m backend.scripts.download_required_models

echo "==> Building otoyin-server ($PLATFORM/$ARCH)..."
"$PY_BIN" "$REPO_ROOT/backend/build_binary.py"

SRC="$REPO_ROOT/backend/dist/otoyin-server"
if [ ! -d "$SRC" ]; then
  echo "Build failed: expected onedir output at $SRC" >&2
  exit 1
fi

# Stage into the gitignored dir tauri.conf.json maps as a bundle resource.
DEST="$REPO_ROOT/tauri/src-tauri/binaries/otoyin-server"
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -R "$SRC" "$DEST"
echo "Server bundle staged at $DEST"
