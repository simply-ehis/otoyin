<#
.SYNOPSIS
  Auto-fix lint/type errors using a cheaper LLM model.
.DESCRIPTION
  Runs the project's lint commands, sends errors to an LLM, and applies the
  returned unified diff. Only edits files referenced in the errors.
.PARAMETER Command
  Lint command to run (default: "bunx biome lint app/src").
.PARAMETER DryRun
  Print the proposed diff without applying.
.PARAMETER LlmProfile
  LLM profile from providers.jsonc (default: freellmapi).
#>
param(
  [string]$Command = 'bunx biome lint app/src --max-diagnostics 200',
  [switch]$DryRun,
  [string]$LlmProfile
)

$ErrorActionPreference = 'Stop'

# ── Run lint ──
Write-Host "Running lint: $Command" -ForegroundColor Yellow
$errors = Invoke-Expression $Command 2>&1 | Out-String

if (-not $errors -or $errors.Trim().Length -eq 0) {
  Write-Host "No errors found." -ForegroundColor Green
  return
}

Write-Host "Errors found. Sending to LLM for auto-fix..." -ForegroundColor Yellow

# ── Load provider config ──
  $providersPath = Join-Path $PSScriptRoot '..\..\.config\opencode\bin\providers.jsonc'
if (-not (Test-Path $providersPath)) {
  # Fallback: try global config
  $providersPath = Join-Path $env:USERPROFILE '.config\opencode\bin\providers.jsonc'
}
if (-not (Test-Path $providersPath)) {
  Write-Host "ERROR: providers.jsonc not found" -ForegroundColor Red
  exit 1
}

$raw = Get-Content -LiteralPath $providersPath -Raw
$stripped = ($raw -split "`n" | Where-Object { $_ -notmatch '^\s*//' }) -join "`n"
$cfg = $stripped | ConvertFrom-Json

if (-not $LlmProfile) { $LlmProfile = $cfg.default }
$p = $cfg.profiles.$LlmProfile
$base = $p.base_url.TrimEnd('/')
$useModel = if ($p.model) { $p.model } else { 'auto' }
$key = if ($p.api_key) { $p.api_key } else { 'no-key' }

# ── Call LLM ──
$body = @{
  model = $useModel
  messages = @(
    @{ role = 'system'; content = 'You are an autofix bot. Given lint/type errors and the repo, return a single unified diff (git diff format with ---/+++ and @@ hunks) that fixes ONLY the reported errors. Do not change behavior beyond fixing the error. Do not refactor. Only edit files referenced in the errors. Output ONLY the diff, no commentary, no markdown fences.' }
    @{ role = 'user'; content = "ERRORS:`n$errors" }
  )
  temperature = 0.1
  max_tokens = 4096
} | ConvertTo-Json -Depth 10 -Compress

$uri = "$base/chat/completions"
try {
  $resp = Invoke-RestMethod -Uri $uri -Method Post -ContentType 'application/json' `
    -Headers @{ Authorization = "Bearer $key" } -Body $body -TimeoutSec 90
  $diff = $resp.choices[0].message.content
} catch {
  Write-Host "LLM request failed: $_" -ForegroundColor Red
  exit 1
}

if ($DryRun) {
  Write-Host "`n=== PROPOSED DIFF ===" -ForegroundColor Cyan
  Write-Output $diff
  return
}

# ── Apply diff ──
$tmp = Join-Path $env:TEMP ("autofix_" + (Get-Date -Format yyyyMMddHHmmss) + ".diff")
$diff | Out-File -LiteralPath $tmp -Encoding utf8
try {
  git apply --check $tmp 2>&1 | Out-Null
  git apply $tmp
  Write-Host "Applied autofix from $tmp" -ForegroundColor Green
} catch {
  Write-Host "git apply failed. Diff saved at $tmp" -ForegroundColor Yellow
  Write-Host "Inspect and apply manually, or re-run with -DryRun." -ForegroundColor Yellow
}
