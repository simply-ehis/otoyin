#!/usr/bin/env bash
# Stage a static ffmpeg build into tauri/src-tauri/binaries/ffmpeg/bin/ so the
# NSIS bundle ships its own encoder. The backend resolves it via
# audio_conversion.ffmpeg_path() (OTOYIN_FFMPEG -> bundled -> PATH), so a user
# with no system ffmpeg still gets audiobook export + format conversion.
#
# Usage:
#   scripts/stage-ffmpeg.sh [output_dir]
#
# Env:
#   FFMPEG_ZIP_URL  override the download (default: gyan.dev essentials build)
#   OTOYIN_FFMPEG   if already set and valid, we just copy from that dir
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="${1:-$root/tauri/src-tauri/binaries/ffmpeg}"
url="${FFMPEG_ZIP_URL:-https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$dest/bin"

# 1) Reuse an already-present ffmpeg if the caller points at one.
if [[ -n "${OTOYIN_FFMPEG:-}" && -f "${OTOYIN_FFMPEG}" ]]; then
  echo "Staging from OTOYIN_FFMPEG: $OTOYIN_FFMPEG"
  src_dir="$(dirname "$OTOYIN_FFMPEG")"
  cp -f "$src_dir/ffmpeg.exe" "$dest/bin/" 2>/dev/null || cp -f "$src_dir/ffmpeg" "$dest/bin/"
  [[ -f "$src_dir/ffprobe.exe" ]] && cp -f "$src_dir/ffprobe.exe" "$dest/bin/" || true
else
  # 2) Download the static build.
  echo "Downloading ffmpeg from $url"
  curl -L --retry 5 --retry-delay 3 -o "$tmp/ffmpeg.zip" "$url"
  echo "Extracting..."
  unzip -q "$tmp/ffmpeg.zip" -d "$tmp/x"
  bin_dir="$(dirname "$(find "$tmp/x" -type f -name 'ffmpeg.exe' -o -type f -name 'ffmpeg' | head -1)")"
  cp -f "$bin_dir/ffmpeg.exe" "$dest/bin/" 2>/dev/null || cp -f "$bin_dir/ffmpeg" "$dest/bin/"
  [[ -f "$bin_dir/ffprobe.exe" ]] && cp -f "$bin_dir/ffprobe.exe" "$dest/bin/" || true
fi

if [[ ! -f "$dest/bin/ffmpeg.exe" && ! -f "$dest/bin/ffmpeg" ]]; then
  echo "ERROR: ffmpeg binary not staged into $dest/bin" >&2
  exit 1
fi

echo "Staged:"
ls -la "$dest/bin"
echo "ffmpeg ready at $dest/bin — now run 'just build-tauri' (or build-local)"