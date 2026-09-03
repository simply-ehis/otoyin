<#
.SYNOPSIS
  End-to-end Needle 2 finetune for 21labs - curate assets, finetune LoRA, build .cact.
.DESCRIPTION
  1. Curates data/needle/tools.json (202 tools) + data/needle/train.jsonl (synthetic, no API key)
  2. Ensures base checkpoint checkpoints/needle2.pkl is cached
  3. Finetunes LoRA via needle.model.finetune (bypasses cli XLA fd handling)
  4. Builds models/needle-21labs.cact for Needle(weights=...)
  Run after freeing ~4GB (close dev server/tabs). Uses backend\venv Python.
  Works from any working directory.
.EXAMPLE
  pwsh -File bin/finetune-needle.ps1
  pwsh -File bin/finetune-needle.ps1 -Epochs 1 -BatchSize 4
#>
param(
    [int]$Epochs = 3,
    [int]$BatchSize = 8,
    [string]$ToolsJson = "data/needle/tools.json",
    [string]$TrainJsonl = "data/needle/train.jsonl",
    [string]$OutPkl = "models/needle-21labs.pkl",
    [string]$OutCact = "models/needle-21labs.cact"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$py = Join-Path $repoRoot "backend\venv\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "Python not found at $py - run just setup first" }
Set-Location $repoRoot

# Resolve all file args relative to repo root
$ToolsJson = Join-Path $repoRoot $ToolsJson
$TrainJsonl = Join-Path $repoRoot $TrainJsonl
$OutPkl = Join-Path $repoRoot $OutPkl
$OutCact = Join-Path $repoRoot $OutCact
$checkpointPkl = Join-Path $repoRoot "checkpoints/needle2.pkl"

# 1. Curate tools.json if missing
if (-not (Test-Path $ToolsJson)) {
    Write-Host "[1/4] Curating tools.json..." -ForegroundColor Cyan
    $code = @'
import json, pathlib
from backend.routes.assistant_tools.schemas import TOOLS
p = pathlib.Path(r"__TOOLSJSON__")
p.parent.mkdir(parents=True, exist_ok=True)
needle_tools = [{"name": t["function"]["name"], "description": t["function"].get("description",""), "parameters": t["function"].get("parameters", {"type":"object","properties":{}})} for t in TOOLS]
p.write_text(json.dumps(needle_tools, indent=2), encoding="utf-8")
print(f"wrote {len(needle_tools)} tools to {p}")
'@
    $code = $code.Replace("__TOOLSJSON__", $ToolsJson)
    $tmp = Join-Path $env:TEMP "opencode_curate_tools.py"
    Set-Content -Path $tmp -Value $code -Encoding UTF8
    & $py -X utf8 $tmp
    if ($LASTEXITCODE -ne 0) { throw "tools curation failed" }
} else { Write-Host "[1/4] tools.json exists - skip" -ForegroundColor DarkGray }

# 2. Curate train.jsonl if missing (local synthetic, no OpenRouter)
if (-not (Test-Path $TrainJsonl)) {
    Write-Host "[2/4] Generating synthetic train.jsonl (no API key)..." -ForegroundColor Cyan
    $gen = Join-Path $env:TEMP "opencode\gen_needle_data.py"
    if (-not (Test-Path $gen)) { throw "Generator not found at $gen - re-run asset curation" }
    & $py -X utf8 $gen
    if ($LASTEXITCODE -ne 0) { throw "train.jsonl generation failed" }
} else { Write-Host "[2/4] train.jsonl exists - skip" -ForegroundColor DarkGray }

# 3. Ensure base checkpoint is cached
if (-not (Test-Path $checkpointPkl)) {
    Write-Host "[3/4] Base checkpoint missing - will auto-download on finetune start" -ForegroundColor Yellow
} else { Write-Host "[3/4] Base checkpoint cached" -ForegroundColor DarkGray }

# 4. Finetune (direct API to avoid cli XLA fd dup that breaks PowerShell pipes)
Write-Host "[4/4] Finetuning LoRA: epochs=$Epochs batch=$BatchSize -> $OutPkl (30-60 min on CPU)..." -ForegroundColor Cyan
$directPy = @'
import sys
from pathlib import Path
sys.path.insert(0, str(Path(r"__REPOROOT__").resolve()))
class Args:
    jsonl_path = r"__TRAINJSONL__"
    checkpoint = None
    epochs = __EPOCHS__
    batch_size = __BATCHSIZE__
    lr = 1e-4
    lora_rank = 16
    lora_alpha = 32.0
    max_len = 1024
    val_split = 0.1
    generate = 0
    model = "deepseek/deepseek-v4-flash"
    workers = 8
    checkpoint_dir = r"__REPOROOT__\checkpoints"
    out = r"__OUTPKL__"
from needle.model.finetune import finetune_local
finetune_local(Args())
print("FINETUNE_DONE")
'@
$directPy = $directPy.Replace("__TRAINJSONL__", $TrainJsonl).Replace("__OUTPKL__", $OutPkl).Replace("__EPOCHS__", "$Epochs").Replace("__BATCHSIZE__", "$BatchSize").Replace("__REPOROOT__", "$repoRoot")
$tmpPy = Join-Path $env:TEMP "opencode\finetune_run.py"
Set-Content -Path $tmpPy -Value $directPy -Encoding UTF8
& $py -X utf8 $tmpPy
if ($LASTEXITCODE -ne 0) { throw "finetune failed (exit $LASTEXITCODE)" }
if (-not (Test-Path $OutPkl)) { throw "finetune finished but $OutPkl not found" }
Write-Host "LoRA saved: $OutPkl" -ForegroundColor Green

# 5. Build .cact
Write-Host "Building .cact -> $OutCact..." -ForegroundColor Cyan
& $py -X utf8 -m needle.cli build $checkpointPkl --lora $OutPkl --out $OutCact
if ($LASTEXITCODE -ne 0) { throw "build failed" }
Write-Host "Done: $OutCact - load via Needle(weights='$OutCact', tools=TOOLS)" -ForegroundColor Green
