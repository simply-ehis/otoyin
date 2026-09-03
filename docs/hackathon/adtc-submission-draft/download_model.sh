#!/usr/bin/env bash

# ADTC 2026 model download. Keep this file idempotent and credential-free.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_DIR="$HERE/model"
MODEL_FILE="$MODEL_DIR/Qwen3.5-2B.Q4_K_M.gguf"
MODEL_URL="https://huggingface.co/Jackrong/Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled-GGUF/resolve/main/Qwen3.5-2B.Q4_K_M.gguf"

mkdir -p "$MODEL_DIR"

if [[ -f "$MODEL_FILE" ]]; then
  echo "model already present at $MODEL_FILE — skipping download"
  exit 0
fi

PARTIAL="$MODEL_FILE.partial"
echo "downloading $MODEL_URL"

if command -v curl >/dev/null 2>&1; then
  curl -L --fail --progress-bar -o "$PARTIAL" "$MODEL_URL"
elif command -v wget >/dev/null 2>&1; then
  wget --show-progress -O "$PARTIAL" "$MODEL_URL"
else
  echo "error: neither curl nor wget is installed" >&2
  exit 1
fi

mv "$PARTIAL" "$MODEL_FILE"
echo "done: $MODEL_FILE"
