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

$configuration = Get-BridgeConfiguration -ConfigurationPath $ConfigurationPath -EnsureRuntimeDirectory
if (-not (Test-BridgeSystemKeyAccess -PrivateKeyPath ([string]$configuration.privateKeyPath))) {
    throw 'SYSTEM cannot read the configured V2 private key.'
}

# Keep the Task Scheduler action deliberately small and transparent. OpenSSH
# receives its pinned policy from a dedicated machine-level config file.
$sshConfigPath = Join-Path ([string]$configuration.runtimeDirectory) 'ssh_config'
$sshConfig = @(
    'Host asodef-legacy-bridge-v2'
    ('    HostName {0}' -f $configuration.sshHost)
    ('    Port {0}' -f $configuration.sshPort)
    ('    User {0}' -f $configuration.sshUser)
    ('    IdentityFile {0}' -f ([string]$configuration.privateKeyPath).Replace('\','/'))
    '    IdentitiesOnly yes'
    '    IdentityAgent none'
    '    BatchMode yes'
    '    PasswordAuthentication no'
    '    KbdInteractiveAuthentication no'
    '    PreferredAuthentications publickey'
    '    NumberOfPasswordPrompts 0'
    '    ExitOnForwardFailure yes'
    ('    ServerAliveInterval {0}' -f $configuration.serverAliveIntervalSeconds)
    ('    ServerAliveCountMax {0}' -f $configuration.serverAliveCountMax)
    ('    ConnectTimeout {0}' -f $configuration.connectTimeoutSeconds)
    '    StrictHostKeyChecking yes'
    ('    UserKnownHostsFile {0}' -f ([string]$configuration.knownHostsPath).Replace('\','/'))
    '    GlobalKnownHostsFile NUL'
    '    ForwardAgent no'
    '    RequestTTY no'
    '    PermitLocalCommand no'
    '    LogLevel ERROR'
    ('    RemoteForward {0}:{1} {2}:{3}' -f $configuration.remoteBindAddress, $configuration.remoteBindPort, $configuration.firebirdHost, $configuration.firebirdPort)
)
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($sshConfigPath, $sshConfig, $utf8WithoutBom)

$action = New-ScheduledTaskAction -Execute ([string]$configuration.sshPath) -Argument ('-F "{0}" -N asodef-legacy-bridge-v2' -f $sshConfigPath)
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Maintains the outbound ASODEF Legacy Bridge V2 reverse SSH tunnel after Windows startup.' -Force | Out-Null

$registered = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction Stop

[ordered]@{
    status = 'registered'
    taskName = $TaskName
    state = [string]$registered.State
    principal = [string]$registered.Principal.UserId
    logonType = [string]$registered.Principal.LogonType
    trigger = 'AtStartup'
    action = 'direct_ssh_config'
    sshConfigPath = $sshConfigPath
    lastTaskResult = [int]$info.LastTaskResult
    passwordStoredByScript = $false
} | ConvertTo-Json -Compress
