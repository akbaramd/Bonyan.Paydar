#Requires -RunAsAdministrator
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$PackageSource,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$Sha256,
  [Parameter(Mandatory=$true)][string]$ServerUrl,
  [string]$ClientCertificateThumbprint
)
$ErrorActionPreference='Stop'
if ($ServerUrl -notmatch '^https://[^/\s]+') { throw 'ServerUrl must be HTTPS' }
$staging=Join-Path $env:TEMP ("paydar-install-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $staging -Force | Out-Null
try {
  $zip=Join-Path $staging 'agent.zip'
  $uri=$null
  if ([uri]::TryCreate($PackageSource,[System.UriKind]::Absolute,[ref]$uri) -and $uri.Scheme -eq 'https') {
    Invoke-WebRequest -Uri $uri -OutFile $zip -UseBasicParsing
  } else {
    Copy-Item -LiteralPath $PackageSource -Destination $zip -ErrorAction Stop
  }
  $actual=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
  if ($actual -ine $Sha256) { throw 'Package SHA256 mismatch: installation stopped' }
  $folder=Join-Path $staging 'package'
  Expand-Archive -LiteralPath $zip -DestinationPath $folder -Force
  & (Join-Path $folder 'Install-PaydarAgent.ps1') -PackagePath $folder -ServerUrl $ServerUrl -ClientCertificateThumbprint $ClientCertificateThumbprint
  if (!$?) { throw 'Agent installation failed' }
} finally {
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}
