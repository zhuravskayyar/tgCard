param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9.-]+$')]
  [string]$HostName,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^(?:\d{1,3}\.){3}\d{1,3}$')]
  [string]$IpAddress
)

$ErrorActionPreference = "Stop"

$principal = [Security.Principal.WindowsPrincipal]::new(
  [Security.Principal.WindowsIdentity]::GetCurrent()
)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Administrator access is required to update the Windows hosts file."
}

$hostsPath = "C:\Windows\System32\drivers\etc\hosts"
$resolvedHostsPath = (Resolve-Path -LiteralPath $hostsPath).Path
if ($resolvedHostsPath -ne $hostsPath) {
  throw "Unexpected hosts file path: $resolvedHostsPath"
}

$marker = "# Cardastika dev tunnel"
$currentContent = [IO.File]::ReadAllText($resolvedHostsPath)
$withoutCardastikaEntries = [regex]::Replace(
  $currentContent,
  "(?m)^\s*[^#\r\n]+\s+$([regex]::Escape($marker))\s*\r?\n?",
  ""
).TrimEnd("`r", "`n")
$lineEnding = if ($currentContent.Contains("`r`n")) { "`r`n" } else { "`n" }
$updatedContent = "$withoutCardastikaEntries$lineEnding$IpAddress $HostName $marker$lineEnding"

[IO.File]::WriteAllText(
  $resolvedHostsPath,
  $updatedContent,
  [Text.UTF8Encoding]::new($false)
)
Clear-DnsClientCache

Write-Host "Cardastika host mapping is ready: $HostName -> $IpAddress" -ForegroundColor Green
