[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigurationPath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'AsodefFirebirdTunnel.Common.ps1')

$configuration = Get-TunnelConfiguration $ConfigurationPath
$statePath = Get-TunnelRuntimePath $configuration 'state.json'
$stopPath = Get-TunnelRuntimePath $configuration 'stop.requested'
Set-Content -LiteralPath $stopPath -Value ([DateTime]::UtcNow.ToString('o'))

if (Test-Path -LiteralPath $statePath) {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if ($null -ne $state.processId) {
        $process = Get-Process -Id ([int]$state.processId) -ErrorAction SilentlyContinue
        if ($null -ne $process -and $process.ProcessName -eq 'ssh') {
            $expectedProcess = $true
            try {
                $expectedProcess = ($process.Path -eq $configuration.sshPath)
            }
            catch {
                $expectedProcess = $false
            }
            if ($expectedProcess) {
                Stop-Process -Id $process.Id
            }
        }
    }
}

Write-TunnelEvent $configuration 'info' 'stop_requested'
