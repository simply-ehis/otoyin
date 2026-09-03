#Requires -Version 5.1
<#
.SYNOPSIS
    Detect GPU and install the optimal ONNX Runtime provider for 21-labs.
.DESCRIPTION
    Probes for GPU hardware, then pip-installs the best ONNX Runtime package:
      - onnxruntime-directml  (AMD / Intel / NVIDIA on Windows via DirectML)
      - onnxruntime-gpu       (NVIDIA via CUDA)
      - onnxruntime           (CPU only fallback)
    Records the choice to data/runtime/onnx_provider.json.
.PARAMETER Force
    Re-install even if the current package is already correct.
.PARAMETER DryRun
    Detect and report only; do not install.
.EXAMPLE
    .\bin\setup-onnx.ps1
    .\bin\setup-onnx.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$VenvPython = Join-Path $ProjectRoot "backend\venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    $VenvPython = "python"
}

Write-Host "`n=== 21-labs ONNX Runtime Setup ===" -ForegroundColor Cyan

# --- Detect GPU ---
$gpuInfo = $null
try {
    $gpuInfo = Get-CimInstance -ClassName Win32_VideoController -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notlike "*Remote*" -and $_.Name -notlike "*Citrix*" } |
        Select-Object -First 1
} catch {
    Write-Host "  GPU detection failed: $_" -ForegroundColor Yellow
}

$gpuName = if ($gpuInfo) { $gpuInfo.Name.Trim() } else { "Unknown" }
$gpuVendor = "unknown"
if ($gpuName -match "NVIDIA")          { $gpuVendor = "nvidia" }
elseif ($gpuName -match "AMD|ATI|Radeon") { $gpuVendor = "amd" }
elseif ($gpuName -match "Intel")       { $gpuVendor = "intel" }

Write-Host "  GPU:   $gpuName" -ForegroundColor White
Write-Host "  Vendor: $gpuVendor" -ForegroundColor White

# --- Determine target package ---
$targetPkg = "onnxruntime"
$targetReason = "CPU-only (no compatible GPU detected)"

$onWindows = ($env:OS -eq "Windows_NT") -or (-not (Test-Path variable:global:IsLinux))
if ($onWindows -and ($gpuVendor -in @("nvidia", "amd", "intel"))) {
    $targetPkg = "onnxruntime-directml"
    $targetReason = "DirectML ($gpuName)"
} elseif ((-not $onWindows) -and ($gpuVendor -eq "nvidia")) {
    $targetPkg = "onnxruntime-gpu"
    $targetReason = "CUDA ($gpuName)"
}

Write-Host "`n  Target: $targetPkg" -ForegroundColor Green
Write-Host "  Reason: $targetReason" -ForegroundColor DarkGray

# --- Check current state ---
$currentPkg = "none"
try {
    $ver = & $VenvPython -c "import onnxruntime; print(onnxruntime.__version__)" 2>$null
    $dml = & $VenvPython -c "import onnxruntime as o; print('DmlExecutionProvider' in o.get_available_providers())" 2>$null
    if ($dml -eq "True") { $currentPkg = "onnxruntime-directml" }
    else { $currentPkg = "onnxruntime" }
    Write-Host "  Current: $currentPkg v$ver" -ForegroundColor DarkGray
} catch {
    Write-Host "  Current: not installed" -ForegroundColor DarkGray
}

if ($DryRun) {
    Write-Host "`n  [DryRun] Would install: $targetPkg" -ForegroundColor Yellow
    return
}

# --- Install ---
$needInstall = $Force -or ($currentPkg -ne $targetPkg)
if ($needInstall) {
    Write-Host "`n  Installing $targetPkg ..." -ForegroundColor Cyan
    if ($currentPkg -ne "none" -and $currentPkg -ne $targetPkg) {
        Write-Host "  Removing $currentPkg ..." -ForegroundColor DarkGray
        & $VenvPython -m pip uninstall -y $currentPkg 2>$null
    }
    & $VenvPython -m pip install --upgrade $targetPkg
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: pip install failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Installed: $targetPkg" -ForegroundColor Green
} else {
    Write-Host "`n  Already installed: $currentPkg" -ForegroundColor Green
}

# --- Record choice ---
Write-Host "`n  Recording choice ..." -ForegroundColor DarkGray
$provider = if ($targetPkg -eq "onnxruntime-directml") { "DmlExecutionProvider" } else { "CPUExecutionProvider" }
& $VenvPython -c "from backend.backends._onnx_precision import record_onnx_provider; record_onnx_provider('$provider')"

# --- Verify ---
Write-Host "`n  Verifying ..." -ForegroundColor Cyan
& $VenvPython -c "import onnxruntime as ort; print('  Providers:', ort.get_available_providers())"

Write-Host "`n=== Done ===" -ForegroundColor Green
