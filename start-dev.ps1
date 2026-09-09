# Otoyin dev startup script — run once, survives shell exit
$ErrorActionPreference = "SilentlyContinue"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $projectRoot "backend\venv\Scripts\python.exe"
$viteJs = Join-Path $projectRoot "node_modules\vite\bin\vite.js"

# Kill any old instances
Get-Process python -ErrorAction SilentlyContinue | Where-Object {
    try { $_.CommandLine -like '*uvicorn*backend.main*' } catch { $false }
} | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process node -ErrorAction SilentlyContinue | Where-Object {
    try { $_.CommandLine -like '*vite*' } catch { $false }
} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start backend
Write-Host "Starting backend on :17493..." -ForegroundColor Yellow
Start-Process -FilePath $venvPython -ArgumentList "-m","uvicorn","backend.main:app","--port","17493","--host","127.0.0.1" -WorkingDirectory $projectRoot -WindowStyle Hidden

# Wait for backend to be ready
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:17493/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}
if ($ready) { Write-Host "Backend ready" -ForegroundColor Green }
else { Write-Host "Backend not ready after 30s" -ForegroundColor Red }

# Start Vite frontend
Write-Host "Starting frontend on :21132..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList $viteJs,"--port","21132" -WorkingDirectory (Join-Path $projectRoot "app") -WindowStyle Hidden
Start-Sleep -Seconds 10

# Verify
$bp = netstat -ano | findstr "LISTENING" | findstr ":17493"
$fp = netstat -ano | findstr "LISTENING" | findstr ":21132"
if ($bp) { Write-Host "Backend: OK on :17493" -ForegroundColor Green } else { Write-Host "Backend: FAILED" -ForegroundColor Red }
if ($fp) { Write-Host "Frontend: OK on :21132" -ForegroundColor Green } else { Write-Host "Frontend: FAILED" -ForegroundColor Red }

if ($bp -and $fp) {
    Write-Host "`nDev server ready at http://localhost:21132" -ForegroundColor Green
} else {
    Write-Host "`nOne or more services failed to start" -ForegroundColor Red
}
