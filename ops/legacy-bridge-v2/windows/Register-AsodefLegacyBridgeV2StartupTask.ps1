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

$runtimeDirectory = [string]$configuration.runtimeDirectory
$sshConfigPath = Join-Path $runtimeDirectory 'ssh_config'
$systemKeyPath = Join-Path $runtimeDirectory 'secrets\asodef-legacy-bridge-v2-system-ed25519'

# Windows OpenSSH rejects a private key when the executing identity can see
# ACL grants for other principals. Preserve the operator key for manual use,
# but give the SYSTEM-scheduled task a SYSTEM-owned, SYSTEM-only copy.
Copy-Item -LiteralPath ([string]$configuration.privateKeyPath) -Destination $systemKeyPath -Force
$systemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
$allow = [Security.AccessControl.AccessControlType]::Allow
$systemKeyAcl = New-Object Security.AccessControl.FileSecurity
$systemKeyAcl.SetOwner($systemSid)
$systemKeyAcl.SetAccessRuleProtection($true, $false)
$systemKeyAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($systemSid, 'FullControl', $allow)))
Set-Acl -LiteralPath $systemKeyPath -AclObject $systemKeyAcl

$verifiedSystemKeyAcl = Get-Acl -LiteralPath $systemKeyPath
$ownerSid = $verifiedSystemKeyAcl.Owner
try {
    $ownerSid = (New-Object Security.Principal.NTAccount($verifiedSystemKeyAcl.Owner)).Translate([Security.Principal.SecurityIdentifier]).Value
}
catch {
}
$allowedSids = @($verifiedSystemKeyAcl.Access | Where-Object { $_.AccessControlType -eq $allow } | ForEach-Object {
    $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
} | Select-Object -Unique)
if ($ownerSid -ne 'S-1-5-18' -or $allowedSids.Count -ne 1 -or $allowedSids[0] -ne 'S-1-5-18') {
    throw 'SYSTEM_PRIVATE_KEY_ACL_VERIFY_FAILED'
}

$sshConfig = @(
    'Host asodef-legacy-bridge-v2'
    ('    HostName {0}' -f $configuration.sshHost)
    ('    Port {0}' -f $configuration.sshPort)
    ('    User {0}' -f $configuration.sshUser)
    ('    IdentityFile {0}' -f $systemKeyPath.Replace('\','/'))
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

# Windows Server 2016 on this host has a broken ScheduledTasks CIM provider.
# Use the native Task Scheduler COM API, which has been validated under SSH.
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$root = $service.GetFolder('\')
$definition = $service.NewTask(0)
$definition.RegistrationInfo.Description = 'Maintains the outbound ASODEF Legacy Bridge V2 reverse SSH tunnel after Windows startup.'
$definition.Principal.UserId = 'SYSTEM'
$definition.Principal.LogonType = 5  # TASK_LOGON_SERVICE_ACCOUNT
$definition.Principal.RunLevel = 1   # TASK_RUNLEVEL_HIGHEST

$trigger = $definition.Triggers.Create(8) # TASK_TRIGGER_BOOT
$trigger.Enabled = $true

$action = $definition.Actions.Create(0) # TASK_ACTION_EXEC
$action.Path = [string]$configuration.sshPath
$action.Arguments = '-F "{0}" -N asodef-legacy-bridge-v2' -f $sshConfigPath

$definition.Settings.Enabled = $true
$definition.Settings.AllowDemandStart = $true
$definition.Settings.StartWhenAvailable = $true
$definition.Settings.MultipleInstances = 2 # TASK_INSTANCES_IGNORE_NEW
$definition.Settings.ExecutionTimeLimit = 'PT0S'
$definition.Settings.RestartInterval = 'PT5M'
$definition.Settings.RestartCount = 3

$registered = $root.RegisterTaskDefinition(
    $TaskName,
    $definition,
    6,       # TASK_CREATE_OR_UPDATE
    'SYSTEM',
    $null,
    5,       # TASK_LOGON_SERVICE_ACCOUNT
    $null
)

$verified = $root.GetTask($TaskName)
if ($null -eq $verified -or $verified.Name -ne $TaskName) {
    throw 'TASK_COM_VERIFY_FAILED'
}

[ordered]@{
    status = 'registered'
    taskName = $TaskName
    principal = 'SYSTEM'
    logonType = 'ServiceAccount'
    runLevel = 'Highest'
    trigger = 'AtStartup'
    triggerEnabled = $true
    action = 'direct_ssh_config'
    sshConfigPath = $sshConfigPath
    systemPrivateKeyPath = $systemKeyPath
    systemPrivateKeyOwner = 'SYSTEM'
    passwordStoredByScript = $false
} | ConvertTo-Json -Compress
