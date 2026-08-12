[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigurationPath,
    [string]$TaskName = 'ASODEF Master Firebird Tunnel',
    [switch]$OperatorApproved
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

if (-not $OperatorApproved) {
    throw 'REQUIRES_OPERATOR_APPROVAL: rerun with -OperatorApproved after reviewing the task definition.'
}

. (Join-Path $PSScriptRoot 'AsodefFirebirdTunnel.Common.ps1')
$configuration = Get-TunnelConfiguration $ConfigurationPath
$launcherPath = Join-Path $PSScriptRoot 'Start-AsodefFirebirdTunnel.ps1'
$resolvedConfigurationPath = (Resolve-Path -LiteralPath $ConfigurationPath).Path
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name

$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "{0}" -ConfigurationPath "{1}"' -f `
    $launcherPath,
    $resolvedConfigurationPath
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal `
    -UserId $currentUser `
    -LogonType Interactive `
    -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 255 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

$task = New-ScheduledTask `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Maintains the private ASODEF read-only Firebird reverse tunnel.'

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
Write-Output 'Task registered for the current user at logon. No password was stored by this script.'
