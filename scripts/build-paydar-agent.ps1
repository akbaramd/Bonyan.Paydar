[CmdletBinding()]
param([string]$Version = '0.1.0-preview')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dest = Join-Path $root 'artifacts\agent-package'
$payload = Join-Path $root 'src\agents\Paydar.Agent.Setup\payload.zip'
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory (Join-Path $dest 'Agent'),(Join-Path $dest 'Tray') -Force | Out-Null
dotnet publish (Join-Path $root 'src\agents\InfraGraph.Agent.Windows\InfraGraph.Agent.Windows.csproj') -c Release -r win-x64 --self-contained true -o (Join-Path $dest 'Agent') -m:1
if ($LASTEXITCODE -ne 0) { throw 'Agent publish failed' }
dotnet publish (Join-Path $root 'src\agents\Paydar.Agent.Tray\Paydar.Agent.Tray.csproj') -c Release -r win-x64 --self-contained true -o (Join-Path $dest 'Tray') -m:1
if ($LASTEXITCODE -ne 0) { throw 'Tray publish failed' }
Copy-Item (Join-Path $root 'deploy\agent\Install-PaydarAgent.ps1') $dest
Copy-Item (Join-Path $root 'deploy\agent\Uninstall-PaydarAgent.ps1') $dest
Copy-Item (Join-Path $root 'deploy\agent\Install-PaydarAgentBootstrap.ps1') $dest
if (Test-Path $payload) { Remove-Item $payload -Force }
Compress-Archive -Path (Join-Path $dest '*') -DestinationPath $payload -CompressionLevel Optimal
$setupDest = Join-Path $root 'artifacts\setup'
New-Item -ItemType Directory $setupDest -Force | Out-Null
dotnet publish (Join-Path $root 'src\agents\Paydar.Agent.Setup\Paydar.Agent.Setup.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $setupDest -m:1
if ($LASTEXITCODE -ne 0) { throw 'Setup publish failed' }
$exe = Join-Path $root ("artifacts\Paydar-Agent-" + $Version + "-win-x64.exe")
Copy-Item (Join-Path $setupDest 'Paydar.Agent.Setup.exe') $exe -Force
$zip = Join-Path $root ("artifacts\Paydar-Agent-" + $Version + "-win-x64.zip")
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $dest '*') -DestinationPath $zip -CompressionLevel Optimal
Get-FileHash -Path $zip,$exe -Algorithm SHA256 | Select-Object Path,Hash
Write-Warning 'UNSIGNED PREVIEW BUILD: production use and unattended updates require code signing and rollback acceptance.'