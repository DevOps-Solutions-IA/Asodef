[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigurationPath,
    [string]$TaskName = 'ASODEF Legacy Bridge V2',
    [switch]$OperatorApproved
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

if (-not $OperatorApproved) {
    throw 'REQUIRES_OPERATOR_APPROVAL: startup task registration mutates Task Scheduler.'
}

. (Join-Path $PSScriptRoot 'AsodefLegacyBridgeV2.Common.ps1')

$configuration = Get-BridgeConfiguration -ConfigurationPath $ConfigurationPath
if (-not (Test-BridgeSystemKeyAccess -PrivateKeyPath ([string]$configuration.privateKeyPath))) {
    throw 'SYSTEM cannot read the configured V2 private key.'
}

$launcherPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'Start-AsodefLegacyBridgeV2.ps1')).Path
$resolvedConfigurationPath = (Resolve-Path -LiteralPath $ConfigurationPath).Path

$powerShellPath = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $powerShellPath -PathType Leaf)) {
    throw 'Windows PowerShell executable is unavailable.'
}

# Keep the scheduled action transparent to endpoint protection: no hidden
# window, no encoded command and no execution-policy bypass.
$actionArguments = '-NoProfile -NonInteractive -File "{0}" -ConfigurationPath "{1}"' -f $launcherPath, $resolvedConfigurationPath
$action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $actionArguments
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew

$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Maintains the outbound ASODEF Legacy Bridge V2 reverse SSH tunnel after Windows startup.'
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

$registered = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction Stop

[ordered]@{
    status = 'registered'
    taskName = $TaskName
    state = [string]$registered.State
    principal = [string]$registered.Principal.UserId
    logonType = [string]$registered.Principal.LogonType
    trigger = 'AtStartup'
    lastTaskResult = [int]$info.LastTaskResult
    passwordStoredByScript = $false
} | ConvertTo-Json -Compress
