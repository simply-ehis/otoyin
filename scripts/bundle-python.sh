#!/usr/bin/env bash
# Bundle Python interpreter + venv + backend source into a Tauri resource directory.
# No compilation — just copies files. Zero build-time RAM cost.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="${1:-$REPO_ROOT/backend/venv}"
OUTPUT_DIR="${2:-$REPO_ROOT/tauri/src-tauri/binaries/python}"

echo "=== Python Bundle Script ==="
echo "Venv:    $VENV_DIR"
echo "Output:  $OUTPUT_DIR"

# ── Verify venv exists ──────────────────────────────────────────────────────
if [ ! -d "$VENV_DIR" ]; then
    echo "ERROR: Venv not found at $VENV_DIR — run 'just setup' first" >&2
    exit 1
fi

PYTHON_EXE="$VENV_DIR/bin/python3"
if [ ! -f "$PYTHON_EXE" ]; then
    echo "ERROR: Python not found at $PYTHON_EXE" >&2
    exit 1
fi

# ── Clean output directory ─────────────────────────────────────────────────
echo ""
echo "Cleaning output directory..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# ── Copy Python interpreter + bin ───────────────────────────────────────────
echo "Copying Python interpreter..."
mkdir -p "$OUTPUT_DIR/bin"
# Copy python3 executable
cp "$VENV_DIR/bin/python3" "$OUTPUT_DIR/bin/"
cp "$VENV_DIR/bin/python" "$OUTPUT_DIR/bin/" 2>/dev/null || true
# Copy python3-config if present
cp "$VENV_DIR/bin/python3"*-config "$OUTPUT_DIR/bin/" 2>/dev/null || true

# ── Copy site-packages ──────────────────────────────────────────────────────
echo "Copying site-packages (this may take a moment)..."
LIB_BASE="$VENV_DIR/lib"
PY_VER_DIR=$(find "$LIB_BASE" -maxdepth 1 -type d -name "python3.*" | head -1)
if [ -z "$PY_VER_DIR" ]; then
    echo "ERROR: Could not find python version directory in $LIB_BASE" >&2
    exit 1
fi

SRC_PKGS="$PY_VER_DIR/site-packages"
DST_PKGS="$OUTPUT_DIR/lib/$(basename "$PY_VER_DIR")/site-packages"

if [ ! -d "$SRC_PKGS" ]; then
    echo "ERROR: site-packages not found at $SRC_PKGS" >&2
    exit 1
fi

mkdir -p "$(dirname "$DST_PKGS")"
rsync -a --exclude="__pycache__" --exclude=".pytest_cache" --exclude="tests" "$SRC_PKGS/" "$DST_PKGS/"

# ── Copy pyvenv.cfg ────────────────────────────────────────────────────────
echo "Copying pyvenv.cfg..."
PYVENV_CFG="$VENV_DIR/pyvenv.cfg"
if [ -f "$PYVENV_CFG" ]; then
    cp "$PYVENV_CFG" "$OUTPUT_DIR/"
    # Patch "home" to point to our bundled bin
    sed -i.bak "s|^home *=.*|home = ./bin|" "$OUTPUT_DIR/pyvenv.cfg"
    rm -f "$OUTPUT_DIR/pyvenv.cfg.bak"
fi

# ── Copy backend source code ───────────────────────────────────────────────
echo "Copying backend source code..."
BACKEND_DST="$OUTPUT_DIR/backend"
rm -rf "$BACKEND_DST"
rsync -a \
    --exclude="__pycache__" \
    --exclude=".pytest_cache" \
    --exclude="venv" \
    --exclude="dist" \
    --exclude="build" \
    --exclude="node_modules" \
    --exclude="*.pyc" \
    --exclude="*.spec" \
    --exclude="*.exe" \
    "$REPO_ROOT/backend/" "$BACKEND_DST/"

# ── Write marker file ──────────────────────────────────────────────────────
echo "21labs-python-bundle-v1" > "$OUTPUT_DIR/.python-bundle"

# ── Report size ─────────────────────────────────────────────────────────────
SIZE=$(du -sm "$OUTPUT_DIR" | cut -f1)
echo ""
echo "=== Bundle Complete ==="
echo "Output: $OUTPUT_DIR"
echo "Size:   ${SIZE} MB (vs ~200-300 MB for PyInstaller --onefile)"
echo ""
echo "Next: run 'just build-tauri' to build the app with this bundle."
