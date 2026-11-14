# Commit everything in the working tree and push it to main (= Vercel Production).
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/ship.ps1 "feat: short description"
# Stops on the first failure. Migrations are NOT applied: the script lists the new ones for Neon.
param([Parameter(Mandatory = $true)][string]$Message)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Run([string]$Label, [scriptblock]$Command) {
  Write-Host "`n== $Label" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Label failed (exit $LASTEXITCODE)" }
}

Run "git fetch" { git fetch origin }
$behind = git rev-list --count HEAD..origin/main
if ($behind -ne "0") { throw "origin/main has $behind new commit(s) (Codex?). Run: git pull --rebase --autostash origin main, then retry." }

Run "build (i18n + all workspaces)" { npm run build }

Run "git add" { git add -A }
$staged = git diff --cached --name-only
if (-not $staged) { Write-Host "Nothing to commit."; exit 0 }
$secrets = $staged | Where-Object { $_ -match '(^|/)(\.env|token\.env)$' }
if ($secrets) { git reset -q; throw "Refusing to commit secrets: $secrets" }

$migrations = git diff --cached --name-only --diff-filter=A -- server/migrations
Run "git commit" { git commit -m $Message }
Run "git push" { git push origin HEAD:main }

Write-Host "`nPushed $(git rev-parse --short HEAD). Vercel deploys Production in a few minutes." -ForegroundColor Green
if ($migrations) {
  Write-Host "Apply these NEW migrations on Neon (project cardastika, branch production), in order:" -ForegroundColor Yellow
  $migrations | ForEach-Object { Write-Host "  $_" }
}
