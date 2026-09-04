param(
  [switch]$NoOpenTelegram
)

$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$runtimeDirectory = Join-Path $repositoryRoot ".runtime"
$clientPort = 5173
$serverPort = 3000

function Import-EnvironmentFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -notmatch '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      continue
    }

    $name = $matches[1]
    $value = $matches[2].Trim()
    if (
      $value.Length -ge 2 -and
      (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    if (-not [string]::IsNullOrWhiteSpace($value)) {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

function Ensure-DatabaseUrl {
  if (-not [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
    return
  }

  $savedDatabaseUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL", "User")
  if (-not [string]::IsNullOrWhiteSpace($savedDatabaseUrl)) {
    $env:DATABASE_URL = $savedDatabaseUrl
    return
  }

  Write-Host "DATABASE_URL is needed once to start PostgreSQL/server after a restart." -ForegroundColor Yellow
  $secureDatabaseUrl = Read-Host "Paste DATABASE_URL (input is hidden)" -AsSecureString
  $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureDatabaseUrl)
  try {
    $databaseUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
  }

  if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    throw "DATABASE_URL was not provided."
  }

  $env:DATABASE_URL = $databaseUrl.Trim()
  [Environment]::SetEnvironmentVariable("DATABASE_URL", $env:DATABASE_URL, "User")
}

function Test-TcpPort {
  param([int]$Port)

  $tcpClient = [Net.Sockets.TcpClient]::new()
  try {
    $connection = $tcpClient.ConnectAsync("127.0.0.1", $Port)
    return $connection.Wait(500) -and $tcpClient.Connected
  } catch {
    return $false
  } finally {
    $tcpClient.Dispose()
  }
}

function Wait-ForCondition {
  param(
    [scriptblock]$Condition,
    [string]$FailureMessage,
    [int]$Attempts = 60
  )

  for ($attempt = 0; $attempt -lt $Attempts; $attempt += 1) {
    if (& $Condition) {
      return
    }
    Start-Sleep -Milliseconds 500
  }

  throw $FailureMessage
}

function Start-HiddenProcess {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$Name
  )

  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $stdoutPath = Join-Path $runtimeDirectory "$Name-$timestamp.out.log"
  $stderrPath = Join-Path $runtimeDirectory "$Name-$timestamp.err.log"
  return Start-Process `
    -FilePath $FilePath `
    -ArgumentList $ArgumentList `
    -WorkingDirectory $repositoryRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -PassThru
}

function Get-Origin {
  param([string]$Url)

  try {
    return ([Uri]$Url).GetLeftPart([UriPartial]::Authority).TrimEnd("/")
  } catch {
    return $null
  }
}

function Test-CardastikaOrigin {
  param([string]$Origin)

  if ([string]::IsNullOrWhiteSpace($Origin)) {
    return $false
  }

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$Origin/" -TimeoutSec 8
    return $response.StatusCode -eq 200 -and $response.Content.Contains("<title>Cardastika")
  } catch {
    return $false
  }
}

function Test-ClientUsesSameOriginApi {
  try {
    $response = Invoke-WebRequest `
      -UseBasicParsing `
      -Uri "http://127.0.0.1:$clientPort/src/api/config.ts" `
      -TimeoutSec 4
    return (
      $response.StatusCode -eq 200 -and
      $response.Content -notmatch '"VITE_API_URL"\s*:\s*"[^"\s]+"'
    )
  } catch {
    return $false
  }
}

function Test-PublicApiProxy {
  param([string]$Origin)

  try {
    Invoke-WebRequest `
      -UseBasicParsing `
      -Method Post `
      -Uri "$Origin/api/auth/telegram" `
      -ContentType "application/json" `
      -Body '{"initData":"invalid"}' `
      -TimeoutSec 8 | Out-Null
    return $false
  } catch {
    $statusCode = $_.Exception.Response.StatusCode
    return $null -ne $statusCode -and [int]$statusCode -eq 401
  }
}

function Get-TelegramContext {
  $botToken = $env:TELEGRAM_BOT_TOKEN
  $me = Invoke-RestMethod -Method Get -Uri "https://api.telegram.org/bot$botToken/getMe"
  $menu = Invoke-RestMethod `
    -Method Post `
    -Uri "https://api.telegram.org/bot$botToken/getChatMenuButton" `
    -ContentType "application/json" `
    -Body "{}"

  if (-not $me.ok -or -not $menu.ok) {
    throw "Telegram Bot API did not return a successful response."
  }

  return [pscustomobject]@{
    BotUsername = $me.result.username
    Menu = $menu.result
  }
}

function Get-ExistingClientTunnelOrigin {
  param([string]$CurrentMenuUrl)

  $menuOrigin = Get-Origin $CurrentMenuUrl
  if (Test-CardastikaOrigin $menuOrigin) {
    return $menuOrigin
  }

  try {
    $cloudflaredProcessIds = @(Get-Process cloudflared -ErrorAction Stop | Select-Object -ExpandProperty Id)
    $metricsPorts = Get-NetTCPConnection -State Listen -ErrorAction Stop |
      Where-Object { $_.OwningProcess -in $cloudflaredProcessIds } |
      Select-Object -ExpandProperty LocalPort -Unique

    foreach ($metricsPort in $metricsPorts) {
      try {
        $metrics = (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$metricsPort/metrics" -TimeoutSec 2).Content
        $origins = [regex]::Matches($metrics, 'https://[a-z0-9-]+\.trycloudflare\.com') |
          ForEach-Object Value |
          Select-Object -Unique
        foreach ($origin in $origins) {
          if (Test-CardastikaOrigin $origin) {
            return $origin
          }
        }
      } catch {
        continue
      }
    }
  } catch {
    return $null
  }

  return $null
}

function Start-ClientTunnel {
  $cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
  if (-not $cloudflared) {
    throw "cloudflared is not installed or is not available on PATH."
  }

  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $stdoutPath = Join-Path $runtimeDirectory "client-tunnel-$timestamp.out.log"
  $stderrPath = Join-Path $runtimeDirectory "client-tunnel-$timestamp.err.log"
  Start-Process `
    -FilePath $cloudflared.Source `
    -ArgumentList @("tunnel", "--url", "http://127.0.0.1:$clientPort", "--no-autoupdate") `
    -WorkingDirectory $repositoryRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -PassThru | Out-Null

  $script:publishedTunnelOrigin = $null
  Wait-ForCondition -FailureMessage "cloudflared did not publish a client URL." -Condition {
    $logContent = ""
    if (Test-Path -LiteralPath $stdoutPath) { $logContent += Get-Content -Raw -LiteralPath $stdoutPath }
    if (Test-Path -LiteralPath $stderrPath) { $logContent += Get-Content -Raw -LiteralPath $stderrPath }
    $match = [regex]::Match($logContent, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($match.Success) {
      $script:publishedTunnelOrigin = $match.Value
      return $true
    }
    return $false
  }

  return $script:publishedTunnelOrigin
}

function Test-ServerOrigin {
  param([string]$Origin)

  try {
    $response = Invoke-WebRequest `
      -UseBasicParsing `
      -Method Options `
      -Uri "http://127.0.0.1:$serverPort/api/player/deck" `
      -Headers @{
        Origin = $Origin
        "Access-Control-Request-Method" = "GET"
        "Access-Control-Request-Headers" = "Authorization"
      } `
      -TimeoutSec 4
    return (
      $response.StatusCode -eq 204 -and
      $response.Headers["Access-Control-Allow-Origin"] -eq $Origin
    )
  } catch {
    return $false
  }
}

function Stop-WorkspaceServer {
  $connection = Get-NetTCPConnection -State Listen -LocalPort $serverPort -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $connection) {
    return
  }

  $allProcesses = Get-CimInstance Win32_Process
  $listener = $allProcesses | Where-Object ProcessId -eq $connection.OwningProcess
  if (-not $listener -or $listener.CommandLine.IndexOf($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw "Port $serverPort is occupied by a process outside this Cardastika workspace."
  }

  $workspaceServers = @($allProcesses | Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -and
    $_.CommandLine.IndexOf($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    $_.CommandLine -match 'src[\\/](?:index|local)\.ts'
  })
  $workspaceServerIds = @($workspaceServers | Select-Object -ExpandProperty ProcessId)
  $treeRoots = @($workspaceServers | Where-Object { $_.ParentProcessId -notin $workspaceServerIds })
  foreach ($treeRoot in $treeRoots) {
    & taskkill.exe /PID $treeRoot.ProcessId /T /F 2>$null | Out-Null
  }
  Wait-ForCondition -FailureMessage "The old Cardastika server did not release port $serverPort." -Condition {
    -not (Test-TcpPort $serverPort)
  }
}

function Stop-WorkspaceClient {
  $connection = Get-NetTCPConnection -State Listen -LocalPort $clientPort -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $connection) {
    return
  }

  $allProcesses = Get-CimInstance Win32_Process
  $listener = $allProcesses | Where-Object ProcessId -eq $connection.OwningProcess
  if (
    -not $listener -or
    -not $listener.CommandLine -or
    $listener.CommandLine.IndexOf($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or
    $listener.CommandLine -notmatch 'vite'
  ) {
    throw "Port $clientPort is occupied by a process outside this Cardastika Vite client."
  }

  $treeRoot = $listener
  while ($treeRoot.ParentProcessId) {
    $parent = $allProcesses | Where-Object ProcessId -eq $treeRoot.ParentProcessId
    if (
      -not $parent -or
      $parent.Name -notin @("cmd.exe", "node.exe") -or
      -not $parent.CommandLine -or
      $parent.CommandLine -notmatch '(?:vite|run\s+dev\s+--workspace\s+client)'
    ) {
      break
    }
    $treeRoot = $parent
  }

  & taskkill.exe /PID $treeRoot.ProcessId /T /F 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to stop the old Cardastika Vite process tree."
  }
  Wait-ForCondition -FailureMessage "The old Cardastika client did not release port $clientPort." -Condition {
    -not (Test-TcpPort $clientPort)
  }
}

function Start-CardastikaClient {
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  Start-HiddenProcess `
    -FilePath $npm `
    -ArgumentList @("run", "dev", "--workspace", "client", "--", "--host", "127.0.0.1", "--port", "$clientPort", "--strictPort") `
    -Name "client" | Out-Null
  Wait-ForCondition -FailureMessage "Vite did not start on port $clientPort." -Condition {
    Test-TcpPort $clientPort
  }
}

function Start-CardastikaServer {
  Ensure-DatabaseUrl
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  Start-HiddenProcess `
    -FilePath $npm `
    -ArgumentList @("run", "dev", "--workspace", "server") `
    -Name "server" | Out-Null
  Wait-ForCondition -FailureMessage "Cardastika server did not start on port $serverPort." -Condition {
    Test-TcpPort $serverPort
  }
}

function Set-TelegramMenu {
  param(
    [object]$TelegramContext,
    [string]$ClientOrigin
  )

  $menuText = if ([string]::IsNullOrWhiteSpace($TelegramContext.Menu.text)) {
    "Cardastika"
  } else {
    $TelegramContext.Menu.text
  }
  $menuUrl = "$ClientOrigin/"
  $body = @{
    menu_button = @{
      type = "web_app"
      text = $menuText
      web_app = @{ url = $menuUrl }
    }
  } | ConvertTo-Json -Depth 5 -Compress
  $result = Invoke-RestMethod `
    -Method Post `
    -Uri "https://api.telegram.org/bot$($env:TELEGRAM_BOT_TOKEN)/setChatMenuButton" `
    -ContentType "application/json" `
    -Body $body

  if (-not $result.ok) {
    throw "Telegram menu button update failed."
  }

  $storedMenu = Invoke-RestMethod `
    -Method Post `
    -Uri "https://api.telegram.org/bot$($env:TELEGRAM_BOT_TOKEN)/getChatMenuButton" `
    -ContentType "application/json" `
    -Body "{}"
  return $storedMenu.result.web_app.url
}

New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
Import-EnvironmentFile (Join-Path $repositoryRoot ".env")

# Telegram development serves API requests through Vite's same-origin /api
# proxy. Clear any stale public API tunnel before Vite reads its environment.
Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue

$rawTokenPath = Join-Path $repositoryRoot "token.env"
if (Test-Path -LiteralPath $rawTokenPath) {
  $rawToken = (Get-Content -Raw -LiteralPath $rawTokenPath).Trim()
  if ($rawToken -match '^\d+:[A-Za-z0-9_-]+$') {
    $env:TELEGRAM_BOT_TOKEN = $rawToken
  }
}

foreach ($requiredName in @("TELEGRAM_BOT_TOKEN")) {
  if ([string]::IsNullOrWhiteSpace((Get-Item -Path "Env:$requiredName" -ErrorAction SilentlyContinue).Value)) {
    throw "$requiredName is missing from local environment configuration."
  }
}

Push-Location $repositoryRoot
try {
  $telegramContext = Get-TelegramContext
  $env:VITE_TELEGRAM_BOT_USERNAME = $telegramContext.BotUsername
  $databaseWasStartedByLauncher = $false

  Write-Host "[1/5] Checking PostgreSQL..." -ForegroundColor Cyan
  if (-not (Test-TcpPort 5432)) {
    Ensure-DatabaseUrl
    & (Join-Path $PSScriptRoot "dev-db-forward.ps1")
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL startup failed." }
    $databaseWasStartedByLauncher = $true
  }
  if (-not [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
    & node (Join-Path $PSScriptRoot "check-db.cjs")
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL authentication failed." }
  } else {
    Write-Host "PostgreSQL is already running; credentials will be requested only if server restart is needed." -ForegroundColor DarkGray
  }

  Write-Host "Applying database migrations and canonical content..." -ForegroundColor DarkGray
  & npm.cmd run migrate --workspace server
  if ($LASTEXITCODE -ne 0) { throw "Database migration failed." }
  & npm.cmd run seed --workspace server
  if ($LASTEXITCODE -ne 0) { throw "Canonical data seed failed." }

  Write-Host "[2/5] Checking Vite client..." -ForegroundColor Cyan
  if (Test-TcpPort $clientPort) {
    if (-not (Test-ClientUsesSameOriginApi)) {
      Write-Host "Restarting the workspace client to remove a stale API URL..." -ForegroundColor Yellow
      Stop-WorkspaceClient
      Start-CardastikaClient
    }
  } else {
    Start-CardastikaClient
  }
  if (-not (Test-ClientUsesSameOriginApi)) {
    throw "Vite client is not configured to use the same-origin /api proxy."
  }

  Write-Host "[3/5] Reusing or starting the Telegram tunnel..." -ForegroundColor Cyan
  $clientOrigin = Get-ExistingClientTunnelOrigin $telegramContext.Menu.web_app.url
  if (-not $clientOrigin) {
    $clientOrigin = Start-ClientTunnel
    Wait-ForCondition -FailureMessage "The new client tunnel is not serving Cardastika." -Condition {
      Test-CardastikaOrigin $clientOrigin
    }
  }
  $env:CLIENT_ORIGIN = $clientOrigin
  $env:PORT = "$serverPort"

  Write-Host "[4/5] Checking Cardastika server..." -ForegroundColor Cyan
  if (Test-TcpPort $serverPort) {
    if ($databaseWasStartedByLauncher -or -not (Test-ServerOrigin $clientOrigin)) {
      Write-Host "Restarting only the workspace server for the active Telegram origin..." -ForegroundColor Yellow
      Stop-WorkspaceServer
      Start-CardastikaServer
    }
  } else {
    Start-CardastikaServer
  }
  if (-not (Test-ServerOrigin $clientOrigin)) {
    throw "Cardastika server does not accept the active Telegram client origin."
  }
  if (-not (Test-PublicApiProxy $clientOrigin)) {
    throw "The public Telegram Mini App cannot reach the Cardastika API proxy."
  }

  Write-Host "[5/5] Updating the Telegram menu..." -ForegroundColor Cyan
  $menuUrl = Set-TelegramMenu -TelegramContext $telegramContext -ClientOrigin $clientOrigin

  Write-Host ""
  Write-Host "Cardastika Telegram development is ready." -ForegroundColor Green
  Write-Host "Client: $menuUrl"
  Write-Host "Bot: @$($telegramContext.BotUsername)"
  Write-Host "Existing cloudflared processes were left running."

  if (-not $NoOpenTelegram) {
    try {
      Start-Process "tg://resolve?domain=$($telegramContext.BotUsername)"
    } catch {
      Start-Process "https://t.me/$($telegramContext.BotUsername)"
    }
  }
} finally {
  Pop-Location
}
