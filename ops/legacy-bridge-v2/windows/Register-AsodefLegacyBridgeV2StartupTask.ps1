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

# Persistence deliberately executes the pinned OpenSSH client directly.
# This avoids a hidden/persistent PowerShell launcher and keeps the task
# transparent to endpoint protection while preserving the same SSH controls.
$reverseForward = '{0}:{1}:{2}:{3}' -f $configuration.remoteBindAddress, $configuration.remoteBindPort, $configuration.firebirdHost, $configuration.firebirdPort
$arguments = @(
    '-F', 'NUL',
    '-i', ([string]$configuration.privateKeyPath),
    '-o', 'IdentitiesOnly=yes',
    '-o', 'IdentityAgent=none',
    '-o', 'BatchMode=yes',
    '-o', 'PasswordAuthentication=no',
    '-o', 'KbdInteractiveAuthentication=no',
    '-o', 'PreferredAuthentications=publickey',
    '-o', 'NumberOfPasswordPrompts=0',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', ('ServerAliveInterval={0}' -f $configuration.serverAliveIntervalSeconds),
    '-o', ('ServerAliveCountMax={0}' -f $configuration.serverAliveCountMax),
    '-o', ('ConnectTimeout={0}' -f $configuration.connectTimeoutSeconds),
    '-o', 'StrictHostKeyChecking=yes',
    '-o', ('UserKnownHostsFile={0}' -f $configuration.knownHostsPath),
    '-o', 'GlobalKnownHostsFile=NUL',
    '-o', 'ForwardAgent=no',
    '-o', 'RequestTTY=no',
    '-o', 'PermitLocalCommand=no',
    '-o', 'LogLevel=ERROR',
    '-R', $reverseForward,
    '-N',
    '-p', ([string]$configuration.sshPort),
    ('{0}@{1}' -f $configuration.sshUser, $configuration.sshHost)
)
$actionArguments = (($arguments | ForEach-Object { ConvertTo-BridgeQuotedArgument ([string]$_) }) -join ' ')
$action = New-ScheduledTaskAction -Execute ([string]$configuration.sshPath) -Argument $actionArguments
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
    action = 'direct_ssh'
    lastTaskResult = [int]$info.LastTaskResult
    passwordStoredByScript = $false
} | ConvertTo-Json -Compress
