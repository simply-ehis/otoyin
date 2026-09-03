#!/usr/bin/env bash
# Kaggle setup — run once per notebook session. Leaves only `finetune` for you.
set -e
echo "[1/3] Installing cactus-needle..."
pip install -q cactus-needle

echo "[2/3] Curating 21labs tools -> data/needle/..."
python -c "
from backend.routes.assistant_tools.schemas import TOOLS
import json, pathlib
p = pathlib.Path('data/needle/tools.json'); p.parent.mkdir(parents=True, exist_ok=True)
tools = [{'name': t['function']['name'], 'description': t['function'].get('description',''), 'parameters': t['function'].get('parameters', {'type':'object','properties':{}})} for t in TOOLS]
p.write_text(json.dumps(tools, indent=2), encoding='utf-8')
print(f'  tools.json: {len(tools)} tools')
"
# Use local synthetic generator (no API key) — already in repo at /tmp/opencode/gen_needle_data.py
# If you prefer OpenRouter generation: needle generate-data --tools data/needle/tools.json --num-samples 2000
if [ ! -f data/needle/train.jsonl ]; then
  echo "[3/3] Generating train.jsonl (synthetic, 1966 ex)..."
  python /tmp/opencode/gen_needle_data.py
else
  echo "[3/3] train.jsonl exists ($(du -h data/needle/train.jsonl | cut -f1)) - skip"
fi

echo ""
echo "Ready. Now run finetune:"
echo "  python -m needle.cli finetune data/needle/train.jsonl --epochs 3 --batch-size 16 --out models/needle-21labs.pkl"
echo "  python -m needle.cli build checkpoints/needle2.pkl --lora models/needle-21labs.pkl --out models/needle-21labs.cact"
