# Otoyin dev startup script — auto-restarts backend on crash
# Survives shell exit; backend watchdog keeps the server alive.
$ErrorActionPreference = "SilentlyContinue"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $projectRoot "backend\venv\Scripts\python.exe"
$viteJs = Join-Path $projectRoot "node_modules\vite\bin\vite.js"
$maxRestarts = 10
$restartDelay = 3
$healthCheckInterval = 15

$backendProc = $null
$viteProc = $null

# Kill any old instances
Get-Process python -ErrorAction SilentlyContinue | Where-Object {
    try { $_.CommandLine -like '*uvicorn*backend.main*' } catch { $false }
} | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process node -ErrorAction SilentlyContinue | Where-Object {
    try { $_.CommandLine -like '*vite*' } catch { $false }
} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

function Cleanup-Processes {
    if ($backendProc -and -not $backendProc.HasExited) {
        Write-Host "`nStopping backend (PID $($backendProc.Id))..." -ForegroundColor Yellow
        try {
            Invoke-WebRequest -Uri "http://127.0.0.1:17493/shutdown" -Method POST -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
            $backendProc.WaitForExit(8000)
        } catch {}
        if (-not $backendProc.HasExited) {
            try { Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
    if ($viteProc -and -not $viteProc.HasExited) {
        Write-Host "Stopping frontend (PID $($viteProc.Id))..." -ForegroundColor Yellow
        try { Stop-Process -Id $viteProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
}

try {
    # ── Backend with auto-restart watchdog ──────────────────────────────────
    $backendJob = Start-Job -ScriptBlock {
        param($python, $root, $maxRestarts, $restartDelay, $healthCheckInterval)

        function Test-BackendAlive {
            try {
                $r = Invoke-WebRequest -Uri "http://127.0.0.1:17493/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
                return $r.StatusCode -eq 200
            } catch {
                return $false
            }
        }

        $restarts = 0
        while ($restarts -le $maxRestarts) {
            $proc = Start-Process -FilePath $python -ArgumentList "-m","uvicorn","backend.main:app","--port","17493","--host","127.0.0.1" -WorkingDirectory $root -PassThru -WindowStyle Hidden
            Write-Output "[watchdog] Backend started (PID $($proc.Id)), restart #$restarts"

            # Wait for ready
            $ready = $false
            for ($i = 0; $i -lt 30; $i++) {
                Start-Sleep -Seconds 1
                if (Test-BackendAlive) { $ready = $true; break }
            }
            if ($ready) {
                Write-Output "[watchdog] Backend healthy on :17493"
            } else {
                Write-Output "[watchdog] Backend failed to become healthy"
            }

            # Monitor: poll health until process dies
            while ($true) {
                Start-Sleep -Seconds $healthCheckInterval
                if ($proc.HasExited) {
                    Write-Output "[watchdog] Backend process exited (code $($proc.ExitCode))"
                    break
                }
                if (-not (Test-BackendAlive)) {
                    Write-Output "[watchdog] Backend health check failed — killing and restarting"
                    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
                    break
                }
            }

            $restarts++
            if ($restarts -le $maxRestarts) {
                Write-Output "[watchdog] Restarting in ${restartDelay}s..."
                Start-Sleep -Seconds $restartDelay
            }
        }
        Write-Output "[watchdog] Max restarts ($maxRestarts) reached — giving up"
    } -ArgumentList $venvPython, $projectRoot, $maxRestarts, $restartDelay, $healthCheckInterval

    Write-Host "Backend watchdog started (job $($backendJob.Id))" -ForegroundColor Yellow

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
    $viteProc = Start-Process -FilePath "node" -ArgumentList $viteJs,"--port","21132" -WorkingDirectory (Join-Path $projectRoot "app") -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 10

    # Verify
    $bp = netstat -ano | findstr "LISTENING" | findstr ":17493"
    $fp = netstat -ano | findstr "LISTENING" | findstr ":21132"
    if ($bp) { Write-Host "Backend: OK on :17493" -ForegroundColor Green } else { Write-Host "Backend: FAILED" -ForegroundColor Red }
    if ($fp) { Write-Host "Frontend: OK on :21132" -ForegroundColor Green } else { Write-Host "Frontend: FAILED" -ForegroundColor Red }

    if ($bp -and $fp) {
        Write-Host "`nDev server ready at http://localhost:21132" -ForegroundColor Green
        Write-Host "Backend watchdog is monitoring — server auto-restarts on crash" -ForegroundColor DarkGray
    } else {
        Write-Host "`nOne or more services failed to start" -ForegroundColor Red
    }

    # Keep running until user presses Ctrl+C
    Write-Host "`nPress Ctrl+C to stop all services..." -ForegroundColor DarkGray
    try { while ($true) { Start-Sleep -Seconds 5 } }
    finally { Cleanup-Processes }
} catch {
    Cleanup-Processes
    throw
}
