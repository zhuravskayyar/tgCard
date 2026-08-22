param(
  [string]$Distro = "Ubuntu"
)

$ErrorActionPreference = "Stop"

$databasePort = 5432
$keepAliveMarker = "CARDASTIKA_DB_KEEPALIVE=1"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$windowsDatabaseHost = "127.0.0.1"

function Invoke-WslRoot {
  param([string[]]$Arguments)

  $output = & wsl.exe -d $Distro -u root -- @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "WSL command failed: $($Arguments[0])"
  }

  return $output
}

function Test-TcpPort {
  $client = [Net.Sockets.TcpClient]::new()

  try {
    $connection = $client.ConnectAsync($windowsDatabaseHost, $databasePort)
    return $connection.Wait(500) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Get-ConfiguredDatabaseUrl {
  $databaseUrl = $env:DATABASE_URL

  if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    $databaseUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL", "User")
  }

  if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    throw "DATABASE_URL is not configured."
  }

  return $databaseUrl.Trim()
}

function Use-LocalDatabaseUrl {
  $configuredUrl = Get-ConfiguredDatabaseUrl

  try {
    $databaseUri = [Uri]$configuredUrl
  } catch {
    throw "DATABASE_URL is not a valid URL."
  }

  if ($databaseUri.Scheme -notin @("postgres", "postgresql")) {
    throw "DATABASE_URL must use the postgres or postgresql scheme."
  }

  $localUri = [UriBuilder]::new($databaseUri)
  $localUri.Host = $windowsDatabaseHost
  $localUri.Port = $databasePort
  $localDatabaseUrl = $localUri.Uri.AbsoluteUri

  $env:DATABASE_URL = $localDatabaseUrl

  $userDatabaseUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL", "User")
  if (-not [string]::IsNullOrWhiteSpace($userDatabaseUrl) -and $userDatabaseUrl -ne $localDatabaseUrl) {
    [Environment]::SetEnvironmentVariable("DATABASE_URL", $localDatabaseUrl, "User")
    Write-Output "Updated the user DATABASE_URL host to Windows localhost."
  }
}

function Test-NodeDatabaseConnection {
  Push-Location $repositoryRoot

  try {
    & node "$PSScriptRoot/check-db.cjs"
    return $LASTEXITCODE -eq 0
  } finally {
    Pop-Location
  }
}

function Start-WslKeepAlive {
  $existingProcess = Get-CimInstance Win32_Process -Filter "Name = 'wsl.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine.Contains($keepAliveMarker)
  } | Select-Object -First 1

  if ($existingProcess) {
    return
  }

  Start-Process -FilePath "wsl.exe" -ArgumentList @(
    "-d",
    $Distro,
    "-u",
    "root",
    "--",
    "env",
    $keepAliveMarker,
    "sleep",
    "infinity"
  ) -WindowStyle Hidden | Out-Null
}

Write-Output "Starting PostgreSQL in WSL distro '$Distro'..."
Invoke-WslRoot @("service", "postgresql", "start") | Out-Null
Invoke-WslRoot @("pg_isready", "-h", "127.0.0.1", "-p", "$databasePort") | Out-Null
Start-WslKeepAlive

Use-LocalDatabaseUrl

$connectionReady = $false
for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
  if (Test-TcpPort) {
    $connectionReady = $true
    break
  }

  Start-Sleep -Milliseconds 250
}

if (-not $connectionReady) {
  throw "WSL localhost forwarding did not expose PostgreSQL on Windows localhost:$databasePort."
}

if (-not (Test-NodeDatabaseConnection)) {
  throw "Windows Node could not authenticate to PostgreSQL."
}

Write-Output "Cardastika PostgreSQL is ready on Windows localhost:$databasePort."
