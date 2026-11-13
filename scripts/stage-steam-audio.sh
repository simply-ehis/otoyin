#!/usr/bin/env bash
# Stage the Steam Audio SDK (Valve phonon) into tauri/src-tauri/binaries/steam-audio/
# so the NSIS bundle ships real HRTF/occlusion binaural out of the box.
#
# Steam Audio 4.8.1 (Apache-2.0): https://github.com/ValveSoftware/steam-audio
#   Zip layout: steamaudio/lib/<platform>-x64/phonon.{dll,so,dylib}
#   (NOT bin/Windows64/phonon.dll as older notes claim.)
#   Only phonon.dll and THIRDPARTY.md are staged - the rest is dead weight
#   (TrueAudioNext.dll is AMD-only and optional).
#
# v0.1.0 ships Windows only, so only the Windows64 leg is staged.
#
# Usage:  ./scripts/stage-steam-audio.sh
# Env:    STEAM_AUDIO_ZIP_URL  override the 4.8.1 release zip
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

dest="$REPO_ROOT/tauri/src-tauri/binaries/steam-audio"
url="${STEAM_AUDIO_ZIP_URL:-https://github.com/ValveSoftware/steam-audio/releases/download/v4.8.1/steamaudio_4.8.1.zip}"
platform_entry="steamaudio/lib/windows-x64/phonon.dll"
license_entry="steamaudio/THIRDPARTY.md"

mkdir -p "$dest"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading Steam Audio SDK from $url"
curl -L --retry 5 --retry-delay 3 -o "$tmp/steamaudio.zip" "$url"

echo "Extracting $platform_entry and $license_entry"
"${PYTHON:-python}" - "$tmp/steamaudio.zip" "$dest" "$platform_entry" "$license_entry" <<'PY'
import sys
import zipfile

zpath, dest, platform_entry, license_entry = sys.argv[1:5]
with zipfile.ZipFile(zpath) as zf:
    names = set(zf.namelist())
    if platform_entry not in names:
        sys.exit(f"ERROR: {platform_entry} not in zip (layout changed?)")
    with zf.open(platform_entry) as src, open(f"{dest}/phonon.dll", "wb") as dst:
        dst.write(src.read())
    if license_entry in names:
        with zf.open(license_entry) as src, open(f"{dest}/THIRDPARTY.md", "wb") as dst:
            dst.write(src.read())
PY

if [ ! -s "$dest/phonon.dll" ]; then
  echo "ERROR: phonon.dll not staged into $dest" >&2
  exit 1
fi

echo "Staged:"
ls -la "$dest"
echo "Steam Audio SDK ready at $dest - now run 'just build-tauri' (or the release workflow)"
