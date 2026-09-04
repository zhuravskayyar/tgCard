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

$tokenFile = Join-Path $repositoryRoot "token.env"
if (Test-Path -LiteralPath $tokenFile) {
  $rawToken = (Get-Content -Raw -LiteralPath $tokenFile).Trim()
  if ($rawToken -match '^\d+:[A-Za-z0-9_-]+$') { $env:TELEGRAM_BOT_TOKEN = $rawToken }
}

foreach ($name in @("DATABASE_URL", "TELEGRAM_BOT_TOKEN", "CLIENT_ORIGIN")) {
  $current = (Get-Item -Path "Env:$name" -ErrorAction SilentlyContinue).Value
  $saved = [Environment]::GetEnvironmentVariable($name, "User")
  if ([string]::IsNullOrWhiteSpace($current) -and -not [string]::IsNullOrWhiteSpace($saved)) {
    Set-Item -Path "Env:$name" -Value $saved
  }
}

foreach ($name in @("DATABASE_URL", "TELEGRAM_BOT_TOKEN", "CLIENT_ORIGIN")) {
  if ([string]::IsNullOrWhiteSpace((Get-Item -Path "Env:$name" -ErrorAction SilentlyContinue).Value)) {
    throw "$name is missing from local Cardastika environment configuration."
  }
}

Push-Location $repositoryRoot
try {
  & npm.cmd run bot:dev --workspace server
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
