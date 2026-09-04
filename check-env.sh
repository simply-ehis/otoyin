#!/usr/bin/env bash
# check-env.sh — macOS/Linux mirror of check-env.bat (prompt 19).
# Probes the native build environment Tauri needs. Fails loudly, no setup.
set -euo pipefail

fail=0
need() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "ok: $1 ($($1 --version 2>/dev/null | head -n1))"
  else
    echo "MISSING: $1 — $2"
    fail=1
  fi
}

need node "install Node.js 18+ (https://nodejs.org)"
need npm "ships with Node.js"
need python3 "install Python 3.11+ (3.12 preferred)"
need cargo "install Rust via https://rustup.rs (pinned: tauri/src-tauri/rust-toolchain.toml)"
need rustc "install Rust via https://rustup.rs"

case "$(uname -s)" in
  Darwin)
    xcode-select -p >/dev/null 2>&1 \
      && echo "ok: xcode CLT ($(xcode-select -p))" \
      || { echo "MISSING: Xcode Command Line Tools — run: xcode-select --install"; fail=1; }
    ;;
  Linux)
    if command -v pkg-config >/dev/null 2>&1 && pkg-config --exists webkit2gtk-4.1; then
      echo "ok: webkit2gtk"
    else
      echo "MISSING: webkit2gtk — e.g. sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev"
      fail=1
    fi
    ;;
esac

if [ "$fail" -ne 0 ]; then
  echo "check-env.sh: environment incomplete (see MISSING lines above)"
  exit 1
fi
echo "check-env.sh: environment looks good"
