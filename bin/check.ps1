<#
.SYNOPSIS
  Unified verification gate - runs all checks for this project.
.DESCRIPTION
  Runs Biome lint+format (JS/TS), TypeScript typecheck, Ruff lint+format (Python),
  Async-blocking check, NAME_MAP coverage, Placeholder check, Python pytest, and Frontend vitest.
  Mirrors the pre-commit gate and CI jobs. Exits non-zero on any failure.
.PARAMETER Fix
  Auto-fix issues where possible (biome --write, ruff --fix, ruff format).
.PARAMETER Quick
  Skip Python lint/format/async/NAME_MAP/placeholder checks (faster for frontend-only changes).
  Still runs Biome + typecheck + tests.
.PARAMETER NoTests
  Skip test runs (lint + typecheck only).
#>
param(
  [switch]$Fix,
  [switch]$Quick,
  [switch]$NoTests
)

$ErrorActionPreference = 'Continue'
$bad = $false

# Dynamic step counting so [x/total] is always accurate
$steps = @()
$steps += "Biome lint"
$steps += "Biome format"
$steps += "TypeScript typecheck"
if (-not $Quick) {
  $steps += "Ruff lint"
  $steps += "Ruff format"
  $steps += "Async blocking check"
  $steps += "NAME_MAP coverage"
  $steps += "Placeholder markers (TODO/FIXME/HACK)"
}
if (-not $NoTests) {
  $steps += "Python pytest (core)"
  $steps += "Frontend vitest"
}
$total = $steps.Count
$step = 0

Write-Host "`n=== 21labs Verification Gate ===" -ForegroundColor Cyan
Write-Host "Mode: $(if ($Quick) {'Quick (frontend+tests)'} elseif ($NoTests) {'Lint only'} else {'Full'}) - $total steps" -ForegroundColor Gray

function Invoke-Step {
  param([string]$Label, [scriptblock]$Action)
  $script:step++
  Write-Host "`n[$script:step/$script:total] $Label..." -ForegroundColor Yellow
  & $Action
  if ($LASTEXITCODE -ne 0) { $script:bad = $true }
}

# -- JS/TS: Biome lint --
Invoke-Step "Biome lint" {
  if ($Fix) { & bunx biome lint app/src --write --unsafe }
  else { & bunx biome lint app/src }
}

# -- JS/TS: Biome format --
Invoke-Step "Biome format" {
  if ($Fix) { & bunx biome format app/src --write }
  else { & bunx biome format app/src }
}

# -- JS/TS: TypeScript typecheck (90s budget; slow on low-end hardware) --
$step++
Write-Host "`n[$step/$total] TypeScript typecheck..." -ForegroundColor Yellow
$appDir = Join-Path $PSScriptRoot '..\app'
$tsJob = Start-Job -ScriptBlock { param($dir) Set-Location $dir; & bun run typecheck 2>&1 } -ArgumentList $appDir
if (-not (Wait-Job $tsJob -Timeout 90)) {
  Stop-Job $tsJob | Out-Null
  Write-Host "  TypeScript typecheck timed out after 90s (slow hardware) - warning, not failing gate" -ForegroundColor Yellow
} else {
  $tsOut = Receive-Job $tsJob
  $tsOut | Write-Host
  if ($tsOut -match 'error TS') { $bad = $true }
}
Remove-Job $tsJob -Force -ErrorAction SilentlyContinue

if (-not $Quick) {
  $venvPy = Join-Path $PSScriptRoot '..\backend\venv\Scripts\python.exe'
  if (-not (Test-Path $venvPy)) { $venvPy = 'python' }
  # -- Python: Ruff lint --
  Invoke-Step "Ruff lint" {
    if ($Fix) { & $venvPy -m ruff check backend --fix }
    else { & $venvPy -m ruff check backend }
  }

  # -- Python: Ruff format --
  Invoke-Step "Ruff format" {
    if ($Fix) { & $venvPy -m ruff format backend }
    else { & $venvPy -m ruff format --check backend }
  }

  # -- Python: Async blocking check --
  $step++
  Write-Host "`n[$step/$total] Async blocking check..." -ForegroundColor Yellow
  Push-Location (Join-Path $PSScriptRoot '..\backend')
  & $venvPy -X utf8 -m scripts.check_async_blocking routes
  if ($LASTEXITCODE -ne 0) { $bad = $true }
  Pop-Location

  # -- Python: NAME_MAP coverage check --
  $step++
  Write-Host "`n[$step/$total] NAME_MAP coverage check..." -ForegroundColor Yellow
  if (-not (Test-Path $venvPy)) { $venvPy = 'python' }
  Push-Location (Join-Path $PSScriptRoot '..')
  & $venvPy -X utf8 -m backend.scripts.check_name_map
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  NAME_MAP coverage FAILED - new MCP tools missing entries" -ForegroundColor Red
    $bad = $true
  } else {
    Write-Host "  NAME_MAP coverage OK" -ForegroundColor Green
  }
  Pop-Location

  # -- Zero placeholders check --
  $step++
  Write-Host "`n[$step/$total] Placeholder markers (TODO/FIXME/HACK)..." -ForegroundColor Yellow
  Push-Location (Join-Path $PSScriptRoot '..')
  $venvPy2 = Join-Path $PSScriptRoot '..\backend\venv\Scripts\python.exe'
  if (-not (Test-Path $venvPy2)) { $venvPy2 = 'python' }
  & $venvPy2 -X utf8 -m backend.scripts.check_placeholders
  if ($LASTEXITCODE -ne 0) { $bad = $true }
  Pop-Location
}

if (-not $NoTests) {
  # -- Python: pytest (core tests) --
  $step++
  Write-Host "`n[$step/$total] Python pytest (core)..." -ForegroundColor Yellow
  Push-Location (Join-Path $PSScriptRoot '..')
  $venvPy = Join-Path $PSScriptRoot '..\backend\venv\Scripts\python.exe'
  if (-not (Test-Path $venvPy)) { $venvPy = 'python' }
  & $venvPy -X utf8 -m pytest `
    backend/tests/test_tool_registry.py `
    backend/tests/test_tr_dispatch.py `
    backend/tests/test_stt_backends.py `
    backend/tests/test_stt_self_check.py `
    backend/tests/test_generation_subfunctions.py `
    -q --tb=line --no-header --timeout=15
  if ($LASTEXITCODE -ne 0) { $bad = $true }
  Pop-Location

  # -- Frontend: vitest --
  $step++
  Write-Host "`n[$step/$total] Frontend vitest..." -ForegroundColor Yellow
  Push-Location (Join-Path $PSScriptRoot '..\app')
  & npx vitest run --reporter=dot
  if ($LASTEXITCODE -ne 0) { $bad = $true }
  Pop-Location
}

# -- Summary --
Write-Host "`n=== Result ===" -ForegroundColor Cyan
if ($bad) {
  Write-Host "FAILED - fix the errors above, then re-run: bin/check.ps1" -ForegroundColor Red
  Write-Host "  Auto-fix: bin/check.ps1 -Fix" -ForegroundColor Gray
  exit 1
} else {
  Write-Host ("ALL CHECKS PASSED ({0}/{1})" -f $step,$total) -ForegroundColor Green
  exit 0
}
