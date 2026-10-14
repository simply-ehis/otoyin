<#
.SYNOPSIS
  Build the payment-free TEST copy of Otoyin Studio.

.DESCRIPTION
  The test copy unlocks every Store product (paid models included) without
  the Dodo/Cloudflare/Neon payment infrastructure:

    1. writes backend/data/store_test_mode.flag
    2. rebuilds the backend sidecar (PyInstaller) carrying the flag
       (build_binary.py bundles it into <bundle>/backend/data/)
    3. builds the Tauri app with tauri/src-tauri/tauri.test.conf.json merged
       over tauri.conf.json: productName "Otoyin Studio Test", identifier
       com.otoyin.app.test (separate app + data dir — coexists with the
       production install), updater disabled
    4. strips the flag file again (finally-block) so regular builds stay clean

  licensing.store_test_mode() honors the flag ONLY when bundled into a frozen
  build — a production installer cannot activate test mode via environment.
  Source/dev runs use TWENTYLABS_STORE_TEST_MODE=true instead.

.EXAMPLE
  pwsh -File bin/build-test.ps1
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$flag = Join-Path $root "backend\data\store_test_mode.flag"
$tauriDir = Join-Path $root "tauri"
$conf = Join-Path $root "tauri\src-tauri\tauri.test.conf.json"
$venvPy = Join-Path $root "backend\venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) { throw "Backend venv not found: $venvPy (run: just _ensure-venv)" }

Write-Host "=== Otoyin test build (payment-free store) ===" -ForegroundColor Cyan

try {
    Set-Content -Path $flag -Value "test build $(Get-Date -Format o)" -Encoding utf8
    Write-Host "[1/3] Test-mode flag written: $flag" -ForegroundColor Yellow

    Write-Host "[2/3] Rebuilding backend sidecar (PyInstaller)..." -ForegroundColor Yellow
    Push-Location $root
    try {
        & $venvPy backend\build_binary.py
        if ($LASTEXITCODE -ne 0) { throw "build_binary.py failed (rc=$LASTEXITCODE)" }
        $binDir = Join-Path $root "tauri\src-tauri\binaries"
        New-Item -ItemType Directory -Path $binDir -Force | Out-Null
        Remove-Item (Join-Path $binDir "otoyin-server") -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item (Join-Path $root "backend\dist\otoyin-server") (Join-Path $binDir "otoyin-server") -Recurse -Force
        # The staged exe must exist before the bundler runs — catches any
        # build_binary.py output-layout drift with a clear error instead of
        # a cryptic tauri resource failure mid-build.
        $stagedExe = Join-Path $binDir "otoyin-server\otoyin-server.exe"
        if (-not (Test-Path $stagedExe)) { throw "Staged backend exe missing: $stagedExe" }
        # externalBin is mandatory in tauri.conf.json — a missing MCP exe
        # fails the bundle with a confusing message. Fail fast, clearly.
        $mcpExe = Join-Path $binDir "otoyin-mcp-x86_64-pc-windows-msvc.exe"
        if (-not (Test-Path $mcpExe)) { throw "Missing externalBin: $mcpExe (stage otoyin-mcp first)" }
        # ACL: grant RX on the staging dir so the bundler can read + pack it
        # regardless of which account produced the files. S-1-1-0 (Everyone)
        # via SID — group names are localized on non-English Windows.
        & icacls.exe $binDir /grant "*S-1-1-0:(OI)(CI)RX" /T /Q | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: icacls returned $LASTEXITCODE — check staging-dir ACLs" -ForegroundColor Red }
    }
    finally {
        Pop-Location
    }

    Write-Host "[3/3] Building Tauri app (test identity, updater off)..." -ForegroundColor Yellow
    Push-Location $tauriDir
    try {
        # npm run (not npx): tauri is a workspace with its own
        # package.json, so npx misses the root-hoisted binary and hangs
        # on a registry fetch when offline.
        npm run tauri -- build --config $conf
        if ($LASTEXITCODE -ne 0) { throw "tauri build failed (rc=$LASTEXITCODE)" }
    }
    finally {
        Pop-Location
    }
}
finally {
    Remove-Item $flag -ErrorAction SilentlyContinue
    if (Test-Path $flag) {
        Write-Host "WARNING: flag still present after cleanup — delete $flag" -ForegroundColor Red
    }
    else {
        Write-Host "Flag stripped (production builds unaffected)." -ForegroundColor Yellow
    }
}

$nsisDir = Join-Path $root "tauri\src-tauri\target\release\bundle\nsis"
Write-Host "`nDone. Test artifacts:" -ForegroundColor Green
Get-ChildItem $nsisDir -Filter "Otoyin Studio Test*" -ErrorAction SilentlyContinue |
    ForEach-Object { Write-Host "  $($_.FullName)" }
Write-Host "  (exe: tauri\src-tauri\target\release\Otoyin Studio Test.exe)" -ForegroundColor Gray
Write-Host "`nNOTE: binaries/otoyin-server now carries the TEST backend (bundled" -ForegroundColor Yellow
Write-Host "flag). Re-stage the sidecar before any production build — CI does" -ForegroundColor Yellow
Write-Host "this automatically; locally re-copy from backend/dist." -ForegroundColor Yellow
