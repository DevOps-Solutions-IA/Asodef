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
$taskXmlPath = Join-Path $runtimeDirectory 'startup-task.xml'

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

$command = [Security.SecurityElement]::Escape([string]$configuration.sshPath)
$arguments = [Security.SecurityElement]::Escape(('-F "{0}" -N asodef-legacy-bridge-v2' -f $sshConfigPath))
$description = [Security.SecurityElement]::Escape('Maintains the outbound ASODEF Legacy Bridge V2 reverse SSH tunnel after Windows startup.')

$taskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>$description</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
    </BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <LogonType>ServiceAccount</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT5M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$command</Command>
      <Arguments>$arguments</Arguments>
    </Exec>
  </Actions>
</Task>
"@
[System.IO.File]::WriteAllText($taskXmlPath, $taskXml, [System.Text.Encoding]::Unicode)

$schtasks = Join-Path $env:SystemRoot 'System32\schtasks.exe'
$createOutput = & $schtasks /Create /TN $TaskName /XML $taskXmlPath /F 2>&1
if ($LASTEXITCODE -ne 0) {
    throw ('SCHTASKS_XML_CREATE_FAILED:{0}' -f (($createOutput | ForEach-Object { [string]$_ }) -join ' '))
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
$runLevelNode = $xml.SelectSingleNode("//*[local-name()='RunLevel']")
$bootNode = $xml.SelectSingleNode("//*[local-name()='BootTrigger']")
$enabledNode = $bootNode.SelectSingleNode("*[local-name()='Enabled']")
if ($null -eq $commandNode -or $commandNode.InnerText -ne [string]$configuration.sshPath -or
    $null -eq $argumentsNode -or $argumentsNode.InnerText -notlike '*asodef-legacy-bridge-v2*' -or
    $null -eq $userNode -or $userNode.InnerText -notin @('SYSTEM','S-1-5-18') -or
    $null -eq $logonNode -or $logonNode.InnerText -ne 'ServiceAccount' -or
    $null -eq $runLevelNode -or $runLevelNode.InnerText -ne 'LeastPrivilege' -or
    $null -eq $bootNode -or $null -eq $enabledNode -or $enabledNode.InnerText -ne 'true') {
    throw 'SCHTASKS_VERIFY_MISMATCH'
}

[ordered]@{
    status = 'registered'
    taskName = $TaskName
    principal = $userNode.InnerText
    logonType = $logonNode.InnerText
    runLevel = $runLevelNode.InnerText
    trigger = 'AtStartup'
    triggerEnabled = $true
    action = 'direct_ssh_config'
    sshConfigPath = $sshConfigPath
    taskXmlPath = $taskXmlPath
    passwordStoredByScript = $false
} | ConvertTo-Json -Compress
