#Requires -RunAsAdministrator
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$IssuedCertificatePath,
  [string]$ServerUrl
)
$ErrorActionPreference='Stop'
$configPath = Join-Path $env:ProgramData 'Paydar\agent.json'
if (!(Test-Path $configPath)) { throw 'Install Paydar Agent first.' }
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$id = [guid]$config.AgentId
if ($id -eq [guid]::Empty) { throw 'Agent identity is not configured.' }
if ($ServerUrl -and $ServerUrl -notmatch '^https://[^/\s]+') { throw 'Gateway URL must use HTTPS.' }
$certificateFile = (Resolve-Path -LiteralPath $IssuedCertificatePath).Path
& certreq.exe -accept -machine $certificateFile
if ($LASTEXITCODE -ne 0) { throw 'CA-issued certificate could not be accepted.' }
$expectedSubject = 'CN=Paydar-' + $id.ToString('N')
$candidates = @(
  Get-ChildItem Cert:\LocalMachine\My |
    Where-Object { $_.Subject -like "*$expectedSubject*" -and $_.HasPrivateKey -and
      $_.NotAfter -gt [DateTime]::UtcNow -and $_.NotBefore -lt [DateTime]::UtcNow }
)
if ($candidates.Count -ne 1) { throw "Expected one valid client certificate, found $($candidates.Count). Select/clean old certs manually." }
$cert = $candidates[0]
if (!(@($cert.EnhancedKeyUsageList | ForEach-Object {$_.ObjectId}) -contains '1.3.6.1.5.5.7.3.2')) {
  throw 'Issued certificate does not contain the Client Authentication EKU.'
}
$config.ClientCertificateThumbprint = $cert.Thumbprint.ToUpperInvariant()
if ($ServerUrl) { $config.ServerUrl = $ServerUrl.TrimEnd('/') }
$temp = $configPath + '.tmp'
$config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temp -Encoding UTF8
Move-Item -LiteralPath $temp -Destination $configPath -Force
Write-Host "Client certificate ready: $($cert.Thumbprint)"
Write-Host "Admin approval required: AgentId=$($config.AgentId) InstallationEpoch=$($config.InstallationEpoch)"
if (Get-Service PaydarAgent -ErrorAction SilentlyContinue) {
  Restart-Service PaydarAgent -ErrorAction Stop
  Write-Host 'Paydar Agent service restarted.'
}
