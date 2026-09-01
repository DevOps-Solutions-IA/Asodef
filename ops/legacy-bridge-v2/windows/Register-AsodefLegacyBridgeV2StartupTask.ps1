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

# Keep persistence independent of the ScheduledTasks CIM provider. Some
# Windows Server 2016 installations return 0x80070057 from Get/Register-
# ScheduledTask even though the native Task Scheduler service is healthy.
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

$taskCommand = '"{0}" -F "{1}" -N asodef-legacy-bridge-v2' -f ([string]$configuration.sshPath), $sshConfigPath
$schtasks = Join-Path $env:SystemRoot 'System32\schtasks.exe'
$createOutput = & $schtasks /Create /TN $TaskName /TR $taskCommand /SC ONSTART /RU SYSTEM /RL LIMITED /F 2>&1
if ($LASTEXITCODE -ne 0) {
    throw ('SCHTASKS_CREATE_FAILED:{0}' -f (($createOutput | ForEach-Object { [string]$_ }) -join ' '))
}

$xmlText = (& $schtasks /Query /TN $TaskName /XML 2>$null | Out-String)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($xmlText)) {
    throw 'SCHTASKS_VERIFY_FAILED'
}
$xml = [xml]$xmlText
$commandNode = $xml.SelectSingleNode("//*[local-name()='Command']")
$argumentsNode = $xml.SelectSingleNode("//*[local-name()='Arguments']")
$userNode = $xml.SelectSingleNode("//*[local-name()='UserId']")
$logonNode = $xml.SelectSingleNode("//*[local-name()='LogonType']")
$bootNode = $xml.SelectSingleNode("//*[local-name()='BootTrigger']")
if ($null -eq $commandNode -or $commandNode.InnerText -ne [string]$configuration.sshPath -or
    $null -eq $argumentsNode -or $argumentsNode.InnerText -notlike '*asodef-legacy-bridge-v2*' -or
    $null -eq $userNode -or $userNode.InnerText -notin @('SYSTEM','S-1-5-18') -or
    $null -eq $bootNode) {
    throw 'SCHTASKS_VERIFY_MISMATCH'
}

[ordered]@{
    status = 'registered'
    taskName = $TaskName
    principal = $userNode.InnerText
    logonType = $(if ($null -ne $logonNode) { $logonNode.InnerText } else { $null })
    trigger = 'AtStartup'
    action = 'direct_ssh_config'
    sshConfigPath = $sshConfigPath
    passwordStoredByScript = $false
} | ConvertTo-Json -Compress
