#!/usr/bin/env bash
set -euo pipefail

echo "==> Building Di Stefano server binaries..."

PLATFORM=$(uname -s)
ARCH=$(uname -m)

case "$PLATFORM" in
  Linux)   EXT=""; TARGET="linux-$ARCH" ;;
  Darwin)  EXT=""; TARGET="darwin-$ARCH" ;;
  Windows) EXT=".exe"; TARGET="windows-$ARCH" ;;
esac

OUT_DIR="target/release/$TARGET"
mkdir -p "$OUT_DIR"

echo "Building di-stefano-server..."
if command -v pyinstaller &> /dev/null; then
  pyinstaller --onefile \
    --name "di-stefano-server$EXT" \
    --distpath "$OUT_DIR" \
    backend/main.py \
    --add-data "backend:backend"
  echo "Server binary: $OUT_DIR/di-stefano-server$EXT"
else
  echo "PyInstaller not found. Install with: pip install pyinstaller"
  exit 1
fi
