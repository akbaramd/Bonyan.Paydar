#Requires -RunAsAdministrator
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$PackagePath,
  [string]$ServerUrl,
  [string]$ClientCertificateThumbprint,
  [switch]$NoStart
)
$ErrorActionPreference = 'Stop'
if ($ServerUrl -and $ServerUrl -notmatch '^https://[^/\s]+') { throw 'ServerUrl must start with https://' }
$package = (Resolve-Path -LiteralPath $PackagePath).Path
$agentExe = Join-Path $package 'Agent\InfraGraph.Agent.Windows.exe'
$trayExe = Join-Path $package 'Tray\Paydar.Agent.Tray.exe'
if (!(Test-Path $agentExe) -or !(Test-Path $trayExe)) { throw 'The extracted package must contain Agent and Tray executables.' }
$installRoot = Join-Path $env:ProgramFiles 'Paydar'
$dataRoot = Join-Path $env:ProgramData 'Paydar'
$serviceName = 'PaydarAgent'
New-Item -ItemType Directory -Path $installRoot,$dataRoot -Force | Out-Null

# Only SYSTEM and Administrators may modify service configuration and executable files.
& icacls.exe $dataRoot /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to protect agent configuration folder' }
if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
  Stop-Service -Name $serviceName -Force -ErrorAction Stop
}
New-Item -ItemType Directory (Join-Path $installRoot 'Agent') -Force | Out-Null
Copy-Item (Join-Path $package 'Agent\*') (Join-Path $installRoot 'Agent') -Recurse -Force -ErrorAction Stop
New-Item -ItemType Directory (Join-Path $installRoot 'Tray') -Force | Out-Null
Copy-Item (Join-Path $package 'Tray\*') (Join-Path $installRoot 'Tray') -Recurse -Force
$configPath = Join-Path $dataRoot 'agent.json'
if (!(Test-Path $configPath)) {
  $cfg = [ordered]@{
    AgentId = ([guid]::NewGuid()).ToString()
    InstallationEpoch = ([guid]::NewGuid()).ToString()
    ServerUrl = $(if ($ServerUrl) {$ServerUrl.TrimEnd('/')} else {$null})
    ClientCertificateThumbprint = $(if ($ClientCertificateThumbprint) {$ClientCertificateThumbprint.Replace(' ','')} else {$null})
    IntervalSeconds = 300
  }
  $cfg | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
}
if (!(Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) {
  & sc.exe create $serviceName binPath= ('"' + (Join-Path $installRoot 'Agent\InfraGraph.Agent.Windows.exe') + '"') start= auto DisplayName= 'Paydar Agent' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to register Windows Service' }
}
& sc.exe failure $serviceName reset= 86400 actions= restart/60000/restart/60000/""/0 | Out-Null
$runKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'
New-ItemProperty -Path $runKey -Name 'PaydarAgentTray' -Value ('"' + (Join-Path $installRoot 'Tray\Paydar.Agent.Tray.exe') + '"') -PropertyType String -Force | Out-Null
if (!$NoStart) { Start-Service -Name $serviceName -ErrorAction Stop }
Write-Host 'Paydar Agent installed. Configure the HTTPS Gateway and trusted client certificate from the tray icon.'

