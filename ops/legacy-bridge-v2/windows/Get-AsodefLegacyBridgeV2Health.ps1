[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigurationPath,
    [string]$TaskName = 'ASODEF Legacy Bridge V2'
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'AsodefLegacyBridgeV2.Common.ps1')

try {
    $configuration = Get-BridgeConfiguration -ConfigurationPath $ConfigurationPath
    $state = Get-BridgeState $configuration

    $targetReachable = Test-BridgeTcpEndpoint -HostName ([string]$configuration.firebirdHost) -Port ([int]$configuration.firebirdPort) -TimeoutMilliseconds ([int]$configuration.healthProbeTimeoutMilliseconds)

    $watchdogAlive = Test-BridgeWatchdogProcess $state
    $managedSshAlive = Test-BridgeManagedSshProcess -Configuration $configuration -State $state
    $stateRunning = $null -ne $state -and [string]$state.status -eq 'running'
    $watchdogHealthy = $stateRunning -and $watchdogAlive -and $managedSshAlive

    $taskRunning = $false
    try {
        $taskService = New-Object -ComObject 'Schedule.Service'
        $taskService.Connect()
        $task = $taskService.GetFolder('\').GetTask($TaskName)
        $taskRunning = $null -ne $task -and [int]$task.State -eq 4 # TASK_STATE_RUNNING
    }
    catch {
        $taskRunning = $false
    }
    $sshConfigPath = Join-Path ([string]$configuration.runtimeDirectory) 'ssh_config'
    $configPinned = $false
    if (Test-Path -LiteralPath $sshConfigPath -PathType Leaf) {
        $sshConfigText = Get-Content -LiteralPath $sshConfigPath -Raw
        $expectedForward = 'RemoteForward {0}:{1} {2}:{3}' -f $configuration.remoteBindAddress, $configuration.remoteBindPort, $configuration.firebirdHost, $configuration.firebirdPort
        $configPinned = $sshConfigText -match [regex]::Escape(('HostName {0}' -f $configuration.sshHost)) -and
            $sshConfigText -match [regex]::Escape(('User {0}' -f $configuration.sshUser)) -and
            $sshConfigText -match [regex]::Escape($expectedForward) -and
            $sshConfigText -match [regex]::Escape('StrictHostKeyChecking yes') -and
            $sshConfigText -match [regex]::Escape('ExitOnForwardFailure yes')
    }
    $directSsh = @(Get-CimInstance Win32_Process -Filter "Name = 'ssh.exe'" -ErrorAction SilentlyContinue | Where-Object {
        [string]$_.ExecutablePath -eq [string]$configuration.sshPath -and
        [string]$_.CommandLine -like "*-F*$sshConfigPath*" -and
        [string]$_.CommandLine -like '*-N*asodef-legacy-bridge-v2*'
    })
    $directSshAlive = $directSsh.Count -eq 1
    $directHealthy = $taskRunning -and $directSshAlive -and $configPinned

    $healthy = $targetReachable -and ($watchdogHealthy -or $directHealthy)
    $mode = if ($directHealthy) { 'scheduled_task_direct_ssh' } elseif ($watchdogHealthy) { 'watchdog' } else { 'none' }

    [ordered]@{
        status = $(if ($healthy) { 'ok' } else { 'unavailable' })
        mode = $mode
        state = $(if ($directHealthy) { 'running' } elseif ($null -ne $state) { [string]$state.status } else { 'missing' })
        taskRunning = $taskRunning
        watchdogProcessAlive = $watchdogAlive
        sshProcessAlive = $(if ($directHealthy) { $true } else { $managedSshAlive })
        targetReachable = $targetReachable
        sshConfigPinned = $configPinned
        reverseForwardVerification = 'ssh_alive_after_exit_on_forward_failure;confirm_end_to_end_on_vps'
        staleStateRejected = $(if ($directHealthy) { $false } else { (-not $watchdogAlive -or -not $managedSshAlive) })
    } | ConvertTo-Json -Compress

    if ($healthy) { exit 0 }
    exit 1
}
catch {
    [ordered]@{
        status = 'error'
        code = 'LEGACY_BRIDGE_V2_HEALTH_CONFIGURATION_ERROR'
    } | ConvertTo-Json -Compress
    exit 2
}
