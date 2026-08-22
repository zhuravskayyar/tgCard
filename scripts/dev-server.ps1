$ErrorActionPreference = "Stop"

foreach ($name in @("DATABASE_URL", "TELEGRAM_BOT_TOKEN", "CLIENT_ORIGIN")) {
  $value = [Environment]::GetEnvironmentVariable($name, "User")

  if (-not [string]::IsNullOrWhiteSpace($value)) {
    Set-Item -Path "Env:$name" -Value $value
  }
}

& npm.cmd run dev --workspace server
exit $LASTEXITCODE
