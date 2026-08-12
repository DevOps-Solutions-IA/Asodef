[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigurationPath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'AsodefFirebirdTunnel.Common.ps1')

try {
    $configuration = Get-TunnelConfiguration $ConfigurationPath
    $statePath = Get-TunnelRuntimePath $configuration 'state.json'
    $state = $null
    if (Test-Path -LiteralPath $statePath) {
        $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    }

    $processAlive = $false
    if ($null -ne $state -and $null -ne $state.processId) {
        $process = Get-Process -Id ([int]$state.processId) -ErrorAction SilentlyContinue
        if ($null -ne $process -and $process.ProcessName -eq 'ssh') {
            try {
                $processAlive = ($process.Path -eq $configuration.sshPath)
            }
            catch {
                $processAlive = $true
            }
        }
    }

    $targetReachable = Test-TcpEndpoint `
        -HostName $configuration.firebirdHost `
        -Port ([int]$configuration.firebirdPort) `
        -TimeoutMilliseconds ([int]$configuration.healthProbeTimeoutMilliseconds)

    # ExitOnForwardFailure plus a live SSH process proves the reverse listener
    # was accepted for this connection. The VPS/API probe remains authoritative
    # for end-to-end listener reachability.
    $reverseListenerEstablished = $processAlive -and
        $null -ne $state -and
        $state.reverseForwardEstablished -eq $true

    $healthy = $processAlive -and $targetReachable -and $reverseListenerEstablished
    [ordered]@{
        status = $(if ($healthy) { 'ok' } else { 'unavailable' })
        sshProcessAlive = $processAlive
        targetReachable = $targetReachable
        reverseListenerEstablished = $reverseListenerEstablished
        reverseListenerVerification = 'inferred_from_exit_on_forward_failure;confirm_end_to_end_on_vps'
    } | ConvertTo-Json -Compress

    if ($healthy) { exit 0 }
    exit 1
}
catch {
    [ordered]@{
        status = 'error'
        code = 'TUNNEL_HEALTH_CONFIGURATION_ERROR'
    } | ConvertTo-Json -Compress
    exit 2
}
