[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigurationPath,
    [string]$TaskName = 'ASODEF Master Firebird Tunnel'
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

& (Join-Path $PSScriptRoot 'Stop-AsodefFirebirdTunnel.ps1') `
    -ConfigurationPath $ConfigurationPath

$deadline = [DateTime]::UtcNow.AddSeconds(20)
do {
    Start-Sleep -Seconds 1
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($null -eq $task -or $task.State -ne 'Running') {
        break
    }
} while ([DateTime]::UtcNow -lt $deadline)

if ($null -eq $task) {
    throw 'The scheduled tunnel task is not registered.'
}
if ($task.State -eq 'Running') {
    throw 'The tunnel task did not stop within the bounded wait.'
}

Start-ScheduledTask -TaskName $TaskName
