$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot

function Import-EnvironmentFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -notmatch '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { continue }
    $name = $matches[1]
    $value = $matches[2].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    if (-not [string]::IsNullOrWhiteSpace($value)) { Set-Item -Path "Env:$name" -Value $value }
  }
}

Import-EnvironmentFile (Join-Path $repositoryRoot ".env")
$env:DATABASE_URL = [Environment]::GetEnvironmentVariable("DATABASE_URL", "User")
$env:CARDASTIKA_DEV_AUTH = "true"
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) { throw "DATABASE_URL is missing from local Cardastika environment configuration." }

Push-Location $repositoryRoot
try { & npm.cmd exec --workspace server -- tsx src/database/devGuildSeed.ts; exit $LASTEXITCODE }
finally { Pop-Location }
