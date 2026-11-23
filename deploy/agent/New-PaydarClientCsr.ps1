#Requires -RunAsAdministrator
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$configPath = Join-Path $env:ProgramData 'Paydar\agent.json'
if (!(Test-Path $configPath)) { throw 'Install Paydar Agent first.' }
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$agentId = [guid]$config.AgentId
if ($agentId -eq [guid]::Empty) { throw 'Invalid agent identity' }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$directory = (Resolve-Path $OutputDirectory).Path
$inf = Join-Path $directory 'paydar-client.inf'
$request = Join-Path $directory ('paydar-' + $agentId.ToString('N') + '.req')
$contents = @'
[Version]
Signature="$Windows NT$"
[NewRequest]
Subject = "CN=Paydar-AGENTID"
MachineKeySet = TRUE
KeyLength = 2048
KeySpec = 1
KeyUsage = 0xa0
ProviderName = "Microsoft Software Key Storage Provider"
ProviderType = 0
Exportable = FALSE
RequestType = PKCS10
HashAlgorithm = SHA256
[EnhancedKeyUsageExtension]
OID=1.3.6.1.5.5.7.3.2
'@.Replace('AGENTID', $agentId.ToString('N'))
[System.IO.File]::WriteAllText($inf, $contents, (New-Object System.Text.UTF8Encoding($false)))
& certreq.exe -new -machine $inf $request
if ($LASTEXITCODE -ne 0) { throw 'Windows certificate request generation failed' }
Write-Host "CSR: $request"
Write-Host 'Submit the CSR to the approved internal CA and request a Client Authentication certificate.'
Write-Host "Agent ID: $agentId"
Write-Host "Installation Epoch: $($config.InstallationEpoch)"
