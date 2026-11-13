#!/usr/bin/env bash
# Stage the llama.cpp runtime into tauri/src-tauri/binaries/llama/ so the
# NSIS bundle ships its own llama-server + llama-tts (GGUF planner + Qwen3-TTS).
# The Python backend resolves it via find_llama_server()/find_llama_tts()
# (TWENTYLABS_LLAMA_SERVER / _TTS -> bundled sidecar -> PATH).
#
# Usage:
#   scripts/stage-llama.sh [output_dir]
#
# Env:
#   LLAMA_CPP_TAG        llama.cpp release tag (default: b12360, CPU x64 build)
#   LLAMA_ZIP_URL        override the download URL entirely
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="${1:-$root/tauri/src-tauri/binaries/llama}"
tag="${LLAMA_CPP_TAG:-b12360}"
url="${LLAMA_ZIP_URL:-https://github.com/ggml-org/llama.cpp/releases/download/${tag}/llama-${tag}-bin-win-cpu-x64.zip}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$dest"

echo "Downloading llama.cpp ${tag} from $url"
curl -L --retry 5 --retry-delay 3 -o "$tmp/llama.zip" "$url"
echo "Extracting..."
unzip -q "$tmp/llama.zip" -d "$tmp/x"

# Release layout: the zip root is the build folder itself (flat list of exes + DLLs).
bin_dir="$(dirname "$(find "$tmp/x" -type f -name 'llama-server.exe' | head -1)")"
if [[ -z "$bin_dir" ]]; then
  echo "ERROR: llama-server.exe not found inside the zip" >&2
  exit 1
fi

# Ship every runtime artifact — server, TTS CLI, mtmd, and their ggml/llama DLLs.
cp -f "$bin_dir"/* "$dest"/

if [[ ! -f "$dest/llama-server.exe" || ! -f "$dest/llama-tts.exe" ]]; then
  echo "ERROR: staged payload is missing llama-server.exe or llama-tts.exe" >&2
  exit 1
fi

echo "Staged llama.cpp ${tag}:"
ls -la "$dest"
echo "llama.cpp ready at $dest"
