# One-command release: build -> commit everything -> migrate Neon -> push main -> wait for Vercel -> check the site.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/ship.ps1 "feat: short description"
# Needs the Windows user variable CARDASTIKA_PROD_DATABASE_URL (Neon production) and the gh CLI logged in.
# Migrations run BEFORE the push, so new code never meets a database without its tables.
param([Parameter(Mandatory = $true)][string]$Message)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$Site = "https://app.cardastika.org"
$Repo = "zhuravskayyar/tgCard"

function Run([string]$Label, [scriptblock]$Command) {
  Write-Host "`n== $Label" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Label failed (exit $LASTEXITCODE)" }
}

$prodDb = [Environment]::GetEnvironmentVariable("CARDASTIKA_PROD_DATABASE_URL", "User")
if (-not $prodDb) { throw "Set the user variable CARDASTIKA_PROD_DATABASE_URL (Neon production connection string)." }

Run "git fetch" { git fetch origin }
$behind = git rev-list --count HEAD..origin/main
if ($behind -ne "0") { throw "origin/main has $behind new commit(s) (Codex?). Run: git pull --rebase --autostash origin main, then retry." }

Run "build (i18n + all workspaces)" { npm run build }

Run "git add" { git add -A }
$secrets = git diff --cached --name-only | Where-Object { $_ -match '(^|/)(\.env|token\.env)$' }
if ($secrets) { git reset -q; throw "Refusing to commit secrets: $secrets" }
if (git diff --cached --name-only) { Run "git commit" { git commit -m $Message } } else { Write-Host "Nothing new to commit." }
if ((git rev-list --count origin/main..HEAD) -eq "0") { Write-Host "Nothing to push."; exit 0 }

# Production already records 064/065, so the runner applies only files it has not seen.
$env:DATABASE_URL = $prodDb
try { Run "migrate Neon production" { npm run migrate --workspace server } }
finally { Remove-Item Env:DATABASE_URL }

Run "git push" { git push origin HEAD:main }
$sha = git rev-parse HEAD

Write-Host "`n== waiting for Vercel" -ForegroundColor Cyan
$state = "pending"
for ($i = 0; $i -lt 60 -and $state -eq "pending"; $i++) {
  Start-Sleep -Seconds 10
  $state = gh api "repos/$Repo/commits/$sha/status" --jq ".state"
  if (-not $state -or ((gh api "repos/$Repo/commits/$sha/status" --jq ".statuses | length") -eq "0")) { $state = "pending" }
}
if ($state -ne "success") { throw "Vercel deployment state: $state" }

$health = Invoke-RestMethod "$Site/api/health"
if (-not $health.ok) { throw "API health check failed" }
Write-Host "`nReleased $($sha.Substring(0, 7)): Vercel deployed, $Site/api/health ok." -ForegroundColor Green
