#Requires -RunAsAdministrator
[CmdletBinding()]
param([switch]$DeleteLocalData)
$ErrorActionPreference = 'Stop'
$service = Get-Service PaydarAgent -ErrorAction SilentlyContinue
if ($service) {
    if ($service.Status -ne 'Stopped') { Stop-Service PaydarAgent -Force }
    & sc.exe delete PaydarAgent | Out-Null
}
Remove-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -Name PaydarAgentTray -ErrorAction SilentlyContinue
if (Test-Path "$env:ProgramFiles\Paydar") { Remove-Item "$env:ProgramFiles\Paydar" -Recurse -Force }
if ($DeleteLocalData -and (Test-Path "$env:ProgramData\Paydar")) {
    Remove-Item "$env:ProgramData\Paydar" -Recurse -Force
}
Write-Host 'Paydar Agent uninstalled; local data preserved unless -DeleteLocalData was supplied.'
