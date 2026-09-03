<#
.SYNOPSIS
  Run end-to-end tests (model tests against the running backend).
.DESCRIPTION
  Runs the Python e2e test suite. Backend must be running on port 17493.
  Returns non-zero on failure.
.PARAMETER Only
  Run only specific model tests (e.g., -Only kokoro).
#>
param(
  [string]$Only
)

$ErrorActionPreference = 'Stop'

Write-Host "`n=== 21labs E2E Tests ===" -ForegroundColor Cyan

  $venvPython = Join-Path $PSScriptRoot '..\backend\venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
  Write-Host "ERROR: Python venv not found. Run: just setup" -ForegroundColor Red
  exit 1
}

# Verify backend is running
try {
  $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:17493/health' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
  if ($resp.StatusCode -ne 200) { throw "Backend not healthy" }
} catch {
  Write-Host "ERROR: Backend not running on port 17493. Start it first: just dev-backend" -ForegroundColor Red
  exit 1
}

  $testScript = Join-Path $PSScriptRoot '..\backend\tests\test_all_models_e2e.py'
if (-not (Test-Path $testScript)) {
  Write-Host "ERROR: E2E test script not found at $testScript" -ForegroundColor Red
  exit 1
}

$args = @()
if ($Only) {
  $args += '--only'
  $args += $Only
}

Write-Host "Running: python test_all_models_e2e.py $($args -join ' ')" -ForegroundColor Yellow
& $venvPython $testScript @args
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nE2E FAILED" -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "`nE2E PASSED" -ForegroundColor Green
exit 0
