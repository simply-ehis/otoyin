<#
.SYNOPSIS
  Smoke test — start the app and hit the health endpoint.
.DESCRIPTION
  Starts the backend (if not running), waits for /health, and reports status.
  Used by the agent to verify the app is actually running after a change.
.PARAMETER BackendOnly
  Only start/check the backend, skip Tauri.
#>
param(
  [switch]$BackendOnly
)

$ErrorActionPreference = 'Stop'
$healthUrl = 'http://127.0.0.1:17493/health'

Write-Host "`n=== 21labs Smoke Test ===" -ForegroundColor Cyan

# ── Check if backend is already running ──
$running = $false
try {
  $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
  if ($resp.StatusCode -eq 200) {
    $running = $true
    Write-Host "Backend: already running at $healthUrl" -ForegroundColor Green
    $health = $resp.Content | ConvertFrom-Json
    Write-Host "  Status: $($health.status)" -ForegroundColor Gray
    if ($health.gpu_type) { Write-Host "  GPU: $($health.gpu_type)" -ForegroundColor Gray }
    if ($health.backend) { Write-Host "  Backend: $($health.backend)" -ForegroundColor Gray }
  }
} catch {
  # Not running
}

if (-not $running) {
  Write-Host "Backend: not running. Starting..." -ForegroundColor Yellow

  $venvPython = Join-Path $PSScriptRoot '..\backend\venv\Scripts\python.exe'
  if (-not (Test-Path $venvPython)) {
    Write-Host "ERROR: Python venv not found. Run: just setup" -ForegroundColor Red
    exit 1
  }

  $backendJob = Start-Process -PassThru -NoNewWindow -FilePath $venvPython `
    -ArgumentList '-m','uvicorn','backend.main:app','--port','17493'

  Write-Host "Waiting for backend to start..." -ForegroundColor Yellow
  $maxWait = 30
  for ($i = 0; $i -lt $maxWait; $i++) {
    Start-Sleep -Seconds 1
    try {
      $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($resp.StatusCode -eq 200) {
        $running = $true
        Write-Host "Backend: started (PID $($backendJob.Id))" -ForegroundColor Green
        break
      }
    } catch {
      # Still starting
    }
  }

  if (-not $running) {
    Write-Host "ERROR: Backend failed to start within ${maxWait}s" -ForegroundColor Red
    Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue
    exit 1
  }
}

if (-not $BackendOnly) {
  Write-Host "`nTauri: starting dev mode..." -ForegroundColor Yellow
   Push-Location (Join-Path $PSScriptRoot '..\tauri')
  try {
    & bun run tauri dev
  } finally {
    Pop-Location
  }
} else {
  Write-Host "`nBackend-only mode. Tauri skipped." -ForegroundColor Gray
  Write-Host "Health endpoint: $healthUrl" -ForegroundColor Gray
}

Write-Host "`n=== Smoke test complete ===" -ForegroundColor Cyan
