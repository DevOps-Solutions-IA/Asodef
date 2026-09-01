[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigurationPath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'AsodefLegacyBridgeV2.Common.ps1')

try {
    $configuration = Get-BridgeConfiguration -ConfigurationPath $ConfigurationPath
    $state = Get-BridgeState $configuration

    $targetReachable = Test-BridgeTcpEndpoint -HostName ([string]$configuration.firebirdHost) -Port ([int]$configuration.firebirdPort) -TimeoutMilliseconds ([int]$configuration.healthProbeTimeoutMilliseconds)

    $watchdogAlive = Test-BridgeWatchdogProcess $state
    $sshAlive = Test-BridgeManagedSshProcess -Configuration $configuration -State $state
    $stateRunning = $null -ne $state -and [string]$state.status -eq 'running'

    $healthy = $stateRunning -and $watchdogAlive -and $sshAlive -and $targetReachable

    [ordered]@{
        status = $(if ($healthy) { 'ok' } else { 'unavailable' })
        state = $(if ($null -ne $state) { [string]$state.status } else { 'missing' })
        watchdogProcessAlive = $watchdogAlive
        sshProcessAlive = $sshAlive
        targetReachable = $targetReachable
        reverseForwardVerification = 'ssh_alive_after_exit_on_forward_failure;confirm_end_to_end_on_vps'
        staleStateRejected = (-not $watchdogAlive -or -not $sshAlive)
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
