<#
.SYNOPSIS
    Bundle Python interpreter + venv into a Tauri resource directory.

.DESCRIPTION
    Instead of PyInstaller (which needs 4-6 GB RAM to compile), this script
    copies the Python interpreter + all venv packages into a self-contained
    directory that Tauri bundles as a resource. The Rust sidecar code spawns
    python.exe directly — zero compilation step.

.PARAMETER VenvDir
    Path to the Python virtual environment. Defaults to backend/venv.

.PARAMETER OutputDir
    Path to the output bundle directory. Defaults to tauri/src-tauri/binaries/python.
#>
param(
    [string]$VenvDir = "backend\venv",
    [string]$OutputDir = "tauri\src-tauri\binaries\python"
)

$ErrorActionPreference = "Stop"

# Resolve paths relative to repo root
$RepoRoot = Split-Path $PSScriptRoot -Parent
$VenvDir = Join-Path $RepoRoot $VenvDir
$OutputDir = Join-Path $RepoRoot $OutputDir

Write-Host "=== Python Bundle Script ==="
Write-Host "Venv:    $VenvDir"
Write-Host "Output:  $OutputDir"

# ── Verify venv exists ────────────────────────────────────────────────────────
if (-not (Test-Path $VenvDir)) {
    Write-Error "Venv not found at $VenvDir — run 'just setup' first"
    exit 1
}

# Determine Python executable path (platform-specific)
if ($IsWindows -or $env:OS -eq "Windows_NT") {
    $pythonExe = Join-Path $VenvDir "Scripts\python.exe"
    $pipExe = Join-Path $VenvDir "Scripts\pip.exe"
    $pythonHome = $VenvDir  # Python home = venv root on Windows
} else {
    $pythonExe = Join-Path $VenvDir "bin\python3"
    $pipExe = Join-Path $VenvDir "bin\pip3"
    $pythonHome = $VenvDir
}

if (-not (Test-Path $pythonExe)) {
    Write-Error "Python not found at $pythonExe — venv may be incomplete"
    exit 1
}

# ── Clean output directory ────────────────────────────────────────────────────
Write-Host "`nCleaning output directory..."
if (Test-Path $OutputDir) {
    Remove-Item -Recurse -Force $OutputDir
}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

# ── Copy Python interpreter ───────────────────────────────────────────────────
Write-Host "Copying Python interpreter..."
if ($IsWindows -or $env:OS -eq "Windows_NT") {
    # Windows: copy python.exe and essential DLLs from venv/Scripts/
    $scriptsDir = Join-Path $VenvDir "Scripts"
    $outScripts = Join-Path $OutputDir "Scripts"
    New-Item -ItemType Directory -Path $outScripts -Force | Out-Null

    # Copy python.exe
    Copy-Item (Join-Path $scriptsDir "python.exe") $outScripts -Force
    Copy-Item (Join-Path $scriptsDir "pythonw.exe") $outScripts -Force -ErrorAction SilentlyContinue

    # Copy essential DLLs from venv root (python3X.dll, etc.)
    Get-ChildItem $VenvDir -Filter "python*.dll" | Copy-Item $OutputDir -Force
    Get-ChildItem $VenvDir -Filter "python3*.dll" | Copy-Item $OutputDir -Force
} else {
    # Unix: copy bin/python3 and lib/
    $outBin = Join-Path $OutputDir "bin"
    New-Item -ItemType Directory -Path $outBin -Force | Out-Null

    $venvBin = Join-Path $VenvDir "bin"
    # Copy python3 executable
    Copy-Item (Join-Path $venvBin "python3") $outBin -Force
    Copy-Item (Join-Path $venvBin "python") $outBin -Force -ErrorAction SilentlyContinue
    # Copy python3-config if present
    Copy-Item (Join-Path $venvBin "python3*-config") $outBin -Force -ErrorAction SilentlyContinue
}

# ── Copy site-packages ────────────────────────────────────────────────────────
Write-Host "Copying site-packages (this may take a moment)..."
if ($IsWindows -or $env:OS -eq "Windows_NT") {
    $srcPkgs = Join-Path $VenvDir "Lib\site-packages"
    $dstPkgs = Join-Path $OutputDir "Lib\site-packages"
} else {
    # Find the correct lib path (e.g. lib/python3.12/site-packages)
    $libBase = Join-Path $VenvDir "lib"
    $pyVerDir = Get-ChildItem $libBase -Directory | Where-Object { $_.Name -match "^python3\.\d+$" } | Select-Object -First 1
    if (-not $pyVerDir) {
        Write-Error "Could not find python version directory in $libBase"
        exit 1
    }
    $srcPkgs = Join-Path $pyVerDir.FullName "site-packages"
    $dstPkgsDir = Join-Path $OutputDir "lib"
    New-Item -ItemType Directory -Path $dstPkgsDir -Force | Out-Null
    $dstPkgs = Join-Path $dstPkgsDir $pyVerDir.Name "site-packages"
}

if (-not (Test-Path $srcPkgs)) {
    Write-Error "site-packages not found at $srcPkgs"
    exit 1
}

# Use robocopy on Windows for speed (parallel copy), fallback to Copy-Item
if ($IsWindows -or $env:OS -eq "Windows_NT") {
    Write-Host "  Using robocopy for fast copy..."
    $dstParent = Split-Path $dstPkgs -Parent
    New-Item -ItemType Directory -Path $dstParent -Force | Out-Null
    & robocopy $srcPkgs $dstPkgs /E /NFL /NDL /NJH /NJS /NC /NS /NP /XJ /XD "__pycache__" ".pytest_cache" "tests" | Out-Null
    if ($LASTEXITCODE -gt 3) {
        Write-Error "robocopy failed with exit code $LASTEXITCODE"
        exit 1
    }
} else {
    New-Item -ItemType Directory -Path (Split-Path $dstPkgs -Parent) -Force | Out-Null
    & rsync -a --exclude="__pycache__" --exclude=".pytest_cache" --exclude="tests" "$srcPkgs/" "$dstPkgs/"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "rsync failed"
        exit 1
    }
}

# ── Copy pyvenv.cfg ───────────────────────────────────────────────────────────
# This file tells Python where to find the home directory
Write-Host "Copying pyvenv.cfg..."
$pyvenvCfg = Join-Path $VenvDir "pyvenv.cfg"
if (Test-Path $pyvenvCfg) {
    # Copy to OutputDir root
    Copy-Item $pyvenvCfg $OutputDir -Force

    # Patch the "home" line to point to our bundled Python
    $cfgPath = Join-Path $OutputDir "pyvenv.cfg"
    $lines = Get-Content $cfgPath
    $patched = $lines | ForEach-Object {
        if ($_ -match "^home\s*=") {
            if ($IsWindows -or $env:OS -eq "Windows_NT") {
                "home = ."
            } else {
                "home = ./bin"
            }
        } else {
            $_
        }
    }
    Set-Content -Path $cfgPath -Value $patched
}

# ── Copy backend source code (so `import backend` works) ──────────────────────
Write-Host "Copying backend source code..."
$backendSrc = Join-Path $RepoRoot "backend"
$backendDst = Join-Path $OutputDir "backend"
if (Test-Path $backendDst) {
    Remove-Item -Recurse -Force $backendDst
}
# Copy only Python source files + pyproject.toml, skip tests/build artifacts
$excludeDirs = @("__pycache__", "venv", "dist", "build", ".pytest_cache", "pyi_hooks", "node_modules")
# Use robocopy for speed
$backendDstParent = Split-Path $backendDst -Parent
New-Item -ItemType Directory -Path $backendDstParent -Force | Out-Null
$roboArgs = @($backendSrc, $backendDst, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS", "/NP", "/XJ",
    "/XD") + $excludeDirs + @("/XF", "*.pyc", "*.spec", "*.exe")
& robocopy @roboArgs | Out-Null
if ($LASTEXITCODE -gt 3) {
    Write-Error "robocopy backend failed with exit code $LASTEXITCODE"
    exit 1
}

# ── Write a marker file so the Rust sidecar knows this is a venv bundle ───────
Set-Content -Path (Join-Path $OutputDir ".python-bundle") -Value "21labs-python-bundle-v1"

# ── Report size ───────────────────────────────────────────────────────────────
$size = (Get-ChildItem $OutputDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
$sizeMB = [math]::Round($size / 1MB, 1)
Write-Host "`n=== Bundle Complete ==="
Write-Host "Output: $OutputDir"
Write-Host "Size:   ${sizeMB} MB (vs ~200-300 MB for PyInstaller --onefile)"
Write-Host ""
Write-Host "Next: run 'just build-tauri' to build the app with this bundle."
