[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigurationPath,
    [int]$TimeoutSeconds = 20
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'AsodefLegacyBridgeV2.Common.ps1')

$configuration = Get-BridgeConfiguration -ConfigurationPath $ConfigurationPath
$runtimeDirectory = [string]$configuration.runtimeDirectory

if (-not (Test-Path -LiteralPath $runtimeDirectory -PathType Container)) {
    [ordered]@{
        status = 'already_stopped'
        reason = 'runtime_directory_missing'
    } | ConvertTo-Json -Compress
    exit 0
}

$stopPath = Get-BridgeRuntimePath $configuration 'stop.requested'
Set-Content -LiteralPath $stopPath -Value ([DateTime]::UtcNow.ToString('o'))

$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$watchdogAlive = $false
$sshAlive = $false

do {
    $state = Get-BridgeState $configuration
    $watchdogAlive = Test-BridgeWatchdogProcess $state
    $sshAlive = Test-BridgeManagedSshProcess -Configuration $configuration -State $state

    if (-not $watchdogAlive -and -not $sshAlive) {
        [ordered]@{
            status = 'stopped'
            watchdogProcessAlive = $false
            sshProcessAlive = $false
        } | ConvertTo-Json -Compress
        exit 0
    }

    Start-Sleep -Milliseconds 500
} while ([DateTime]::UtcNow -lt $deadline)

[ordered]@{
    status = 'timeout'
    watchdogProcessAlive = $watchdogAlive
    sshProcessAlive = $sshAlive
} | ConvertTo-Json -Compress
exit 1
