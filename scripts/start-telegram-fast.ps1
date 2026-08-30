param(
  [switch]$NoOpenTelegram
)

$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$runtimeDirectory = Join-Path $repositoryRoot ".runtime"
$clientPort = 5173
$serverPort = 3000
$tunnelPidPath = Join-Path $runtimeDirectory "cloudflared-named.pid"

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

  Write-Host "DATABASE_URL is needed to start the Cardastika server." -ForegroundColor Yellow
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
    return $connection.Wait(250) -and $tcpClient.Connected
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
    [int]$Attempts = 40
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

function Test-CardastikaOrigin {
  param([string]$Origin)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$Origin/" -TimeoutSec 5
    return (
      $response.StatusCode -eq 200 -and
      $response.Content.Contains("<title>Cardastika") -and
      $response.Content.Contains("/assets/") -and
      -not $response.Content.Contains("/@vite/client")
    )
  } catch {
    return $false
  }
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

function Test-PublicApiProxy {
  param([string]$Origin)

  try {
    $response = Invoke-WebRequest `
      -UseBasicParsing `
      -Method Post `
      -Uri "$Origin/api/auth/telegram" `
      -ContentType "application/json" `
      -Body '{"initData":"invalid"}' `
      -TimeoutSec 8
    return $response.StatusCode -eq 401
  } catch {
    $response = $_.Exception.Response
    return $null -ne $response -and [int]$response.StatusCode -eq 401
  }
}

function Test-ProductionClient {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$clientPort/" -TimeoutSec 3
    return (
      $response.StatusCode -eq 200 -and
      $response.Content.Contains("<title>Cardastika") -and
      $response.Content.Contains("/assets/") -and
      -not $response.Content.Contains("/@vite/client")
    )
  } catch {
    return $false
  }
}

function Get-ClientCacheVersion {
  $indexPath = Join-Path $repositoryRoot "client\dist\index.html"
  if (-not (Test-Path -LiteralPath $indexPath)) {
    throw "The production client index was not found at $indexPath."
  }

  $indexContent = Get-Content -Raw -LiteralPath $indexPath
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($indexContent)
    return ([System.BitConverter]::ToString($hasher.ComputeHash($bytes)).Replace("-", "").Substring(0, 12).ToLowerInvariant())
  } finally {
    $hasher.Dispose()
  }
}

function Stop-NonProductionClient {
  $listeners = @(Get-NetTCPConnection -LocalPort $clientPort -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    if (-not $process -or $process.ProcessName -ne "node") {
      throw "Port $clientPort is occupied by an unexpected process (PID $($listener.OwningProcess))."
    }

    Stop-Process -Id $listener.OwningProcess -Force
  }

  Wait-ForCondition -FailureMessage "The previous Vite client did not stop on port $clientPort." -Attempts 20 -Condition {
    -not (Test-TcpPort $clientPort)
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
  if (
    -not $listener -or
    -not $listener.CommandLine -or
    $listener.CommandLine.IndexOf($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or
    $listener.CommandLine -notmatch 'src[\\/]index\.ts'
  ) {
    throw "Port $serverPort is occupied by a process outside this Cardastika server."
  }

  $workspaceServers = @($allProcesses | Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -and
    $_.CommandLine.IndexOf($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    $_.CommandLine -match 'src[\\/]index\.ts'
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

function Build-Cardastika {
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  & $npm "run" "build"
  if ($LASTEXITCODE -ne 0) {
    throw "Cardastika production build failed with exit code $LASTEXITCODE."
  }
}

function Start-CardastikaClient {
  Build-Cardastika

  if (Test-TcpPort $clientPort) {
    if (Test-ProductionClient) {
      return
    }
    Stop-NonProductionClient
  }

  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  Start-HiddenProcess `
    -FilePath $npm `
    -ArgumentList @("run", "preview", "--workspace", "client", "--", "--host", "127.0.0.1", "--port", "$clientPort", "--strictPort") `
    -Name "client" | Out-Null
  Wait-ForCondition -FailureMessage "Vite did not start on port $clientPort." -Condition {
    (Test-TcpPort $clientPort) -and (Test-ProductionClient)
  }
}

function Start-CardastikaServer {
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  Start-HiddenProcess `
    -FilePath $npm `
    -ArgumentList @("run", "dev", "--workspace", "server") `
    -Name "server" | Out-Null
  Wait-ForCondition -FailureMessage "Cardastika server did not start on port $serverPort." -Condition {
    Test-TcpPort $serverPort
  }
}

function Get-NamedTunnelProcess {
  if (-not (Test-Path -LiteralPath $tunnelPidPath)) {
    return $null
  }

  try {
    $processId = [int](Get-Content -Raw -LiteralPath $tunnelPidPath).Trim()
    $process = Get-Process -Id $processId -ErrorAction Stop
    if ($process.ProcessName -eq "cloudflared") {
      return $process
    }
  } catch {
    return $null
  }

  return $null
}

function Stop-NamedTunnelProcess {
  param([System.Diagnostics.Process]$Process)

  if (-not $Process -or $Process.HasExited) {
    Remove-Item -LiteralPath $tunnelPidPath -ErrorAction SilentlyContinue
    return
  }

  Stop-Process -Id $Process.Id -Force -ErrorAction Stop
  Wait-ForCondition -FailureMessage "The stale Cloudflare tunnel did not stop." -Attempts 20 -Condition {
    $null -eq (Get-Process -Id $Process.Id -ErrorAction SilentlyContinue)
  }
  Remove-Item -LiteralPath $tunnelPidPath -ErrorAction SilentlyContinue
}

function Start-NamedTunnel {
  $cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
  if (-not $cloudflared) {
    throw "cloudflared is not installed or is not available on PATH."
  }

  $tunnelArguments = @("tunnel", "--no-autoupdate", "run", "--url", "http://127.0.0.1:$clientPort")
  if (-not [string]::IsNullOrWhiteSpace($env:CLOUDFLARE_TUNNEL_TOKEN)) {
    $tunnelArguments += @("--token", $env:CLOUDFLARE_TUNNEL_TOKEN)
  } else {
    $credentialsFile = Join-Path $env:USERPROFILE ".cloudflared\$($env:CLOUDFLARE_TUNNEL_ID).json"
    if (-not (Test-Path -LiteralPath $credentialsFile)) {
      throw "Cloudflare tunnel credentials were not found at $credentialsFile."
    }
    $tunnelArguments += @("--credentials-file", $credentialsFile, $env:CLOUDFLARE_TUNNEL_NAME)
  }

  $process = Start-HiddenProcess `
    -FilePath $cloudflared.Source `
    -ArgumentList $tunnelArguments `
    -Name "cloudflared-named"
  Set-Content -LiteralPath $tunnelPidPath -Value $process.Id -NoNewline
  return $process
}

function Update-TelegramMenuIfNeeded {
  param(
    [string]$BotToken,
    [string]$Origin,
    [string]$Version
  )

  $expectedUrl = "$Origin/?v=$Version"
  $currentMenu = Invoke-RestMethod `
    -Method Post `
    -Uri "https://api.telegram.org/bot$BotToken/getChatMenuButton" `
    -ContentType "application/json" `
    -Body "{}"
  if ($currentMenu.result.web_app.url -eq $expectedUrl) {
    return
  }

  $menuText = if ([string]::IsNullOrWhiteSpace($currentMenu.result.text)) { "Cardastika" } else { $currentMenu.result.text }
  $body = @{
    menu_button = @{
      type = "web_app"
      text = $menuText
      web_app = @{ url = $expectedUrl }
    }
  } | ConvertTo-Json -Depth 5 -Compress
  $updated = Invoke-RestMethod `
    -Method Post `
    -Uri "https://api.telegram.org/bot$BotToken/setChatMenuButton" `
    -ContentType "application/json" `
    -Body $body
  if (-not $updated.ok) {
    throw "Telegram menu button update failed."
  }
}

New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
Import-EnvironmentFile (Join-Path $repositoryRoot ".env")
Ensure-DatabaseUrl

# The permanent tunnel serves the API through Vite's same-origin /api proxy.
# Remove any VITE_API_URL inherited from an older quick-tunnel session so the
# client cannot keep calling an expired trycloudflare.com hostname.
Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue

$rawTokenPath = Join-Path $repositoryRoot "token.env"
if (Test-Path -LiteralPath $rawTokenPath) {
  $rawToken = (Get-Content -Raw -LiteralPath $rawTokenPath).Trim()
  if ($rawToken -match '^\d+:[A-Za-z0-9_-]+$') {
    $env:TELEGRAM_BOT_TOKEN = $rawToken
  }
}

if ([string]::IsNullOrWhiteSpace($env:TELEGRAM_BOT_TOKEN)) {
  throw "TELEGRAM_BOT_TOKEN is missing from local environment configuration."
}
if ([string]::IsNullOrWhiteSpace($env:CLIENT_ORIGIN)) {
  throw "CLIENT_ORIGIN is required for the fast launcher. Configure a permanent HTTPS hostname first."
}
if (
  [string]::IsNullOrWhiteSpace($env:CLOUDFLARE_TUNNEL_TOKEN) -and
  ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_TUNNEL_ID) -or [string]::IsNullOrWhiteSpace($env:CLOUDFLARE_TUNNEL_NAME))
) {
  throw "Configure CLOUDFLARE_TUNNEL_TOKEN or CLOUDFLARE_TUNNEL_ID plus CLOUDFLARE_TUNNEL_NAME."
}

$telegramMe = Invoke-RestMethod -Method Get -Uri "https://api.telegram.org/bot$($env:TELEGRAM_BOT_TOKEN)/getMe"
if (-not $telegramMe.ok -or [string]::IsNullOrWhiteSpace($telegramMe.result.username)) {
  throw "Telegram Bot API did not return a bot username."
}
$env:VITE_TELEGRAM_BOT_USERNAME = $telegramMe.result.username

$clientOrigin = $env:CLIENT_ORIGIN.TrimEnd("/")
$parsedOrigin = [Uri]$clientOrigin
if ($parsedOrigin.Scheme -ne "https" -or $parsedOrigin.AbsolutePath -ne "/") {
  throw "CLIENT_ORIGIN must be an HTTPS origin without a path."
}
$env:CLIENT_ORIGIN = $clientOrigin
$env:PORT = "$serverPort"
$env:__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS = $parsedOrigin.DnsSafeHost

Push-Location $repositoryRoot
try {
  if (Test-TcpPort $serverPort) {
    Stop-WorkspaceServer
  }
  Start-CardastikaServer
  Start-CardastikaClient

  $tunnelProcess = Get-NamedTunnelProcess
  $publicOriginHealthy = $tunnelProcess -and -not $tunnelProcess.HasExited -and (Test-CardastikaOrigin $clientOrigin) -and (Test-PublicApiProxy $clientOrigin)
  if (-not $publicOriginHealthy) {
    if ($tunnelProcess) {
      Write-Host "Restarting the stale or unhealthy Cloudflare tunnel..." -ForegroundColor Yellow
      Stop-NamedTunnelProcess $tunnelProcess
    }
    $tunnelProcess = Start-NamedTunnel
    Wait-ForCondition -FailureMessage "The permanent Telegram hostname is not serving Cardastika and its public API." -Condition {
      -not $tunnelProcess.HasExited -and (Test-CardastikaOrigin $clientOrigin) -and (Test-PublicApiProxy $clientOrigin)
    }
  }
  if (-not (Test-ServerOrigin $clientOrigin)) {
    throw "Cardastika server does not accept CLIENT_ORIGIN=$clientOrigin. Restart the server after changing .env."
  }
  if (-not (Test-PublicApiProxy $clientOrigin)) {
    throw "The public Telegram Mini App cannot reach the Cardastika API proxy."
  }

  $clientCacheVersion = Get-ClientCacheVersion
  Update-TelegramMenuIfNeeded `
    -BotToken $env:TELEGRAM_BOT_TOKEN `
    -Origin $clientOrigin `
    -Version $clientCacheVersion

  Write-Host "Cardastika Telegram fast launch is ready." -ForegroundColor Green
  Write-Host "Client: $clientOrigin/"
  Write-Host "Bot: @$($telegramMe.result.username)"
  Write-Host "No migrations or seeds were run."

  if (-not $NoOpenTelegram) {
    try {
      Start-Process "tg://resolve?domain=$($telegramMe.result.username)"
    } catch {
      Start-Process "https://t.me/$($telegramMe.result.username)"
    }
  }
} finally {
  Pop-Location
}
