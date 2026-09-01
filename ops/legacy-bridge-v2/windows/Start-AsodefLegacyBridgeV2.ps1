[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigurationPath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'AsodefLegacyBridgeV2.Common.ps1')

$configuration = $null
$lockStream = $null
$managedSsh = $null

try {
    $configuration = Get-BridgeConfiguration -ConfigurationPath $ConfigurationPath -EnsureRuntimeDirectory

    $lockPath = Get-BridgeRuntimePath $configuration 'bridge.lock'
    try {
        $lockStream = [System.IO.File]::Open(
            $lockPath,
            [System.IO.FileMode]::OpenOrCreate,
            [System.IO.FileAccess]::ReadWrite,
            [System.IO.FileShare]::None
        )
    }
    catch {
        throw 'Another ASODEF Legacy Bridge V2 watchdog already owns the runtime lock.'
    }

    $stopPath = Get-BridgeRuntimePath $configuration 'stop.requested'
    Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue

    $sessionId = [Guid]::NewGuid().ToString('N')
    $reconnectDelay = [int]$configuration.initialReconnectDelaySeconds

    Write-BridgeEvent $configuration 'info' 'watchdog_started' @{
        sessionId = $sessionId
        watchdogProcessId = $PID
    }

    while (-not (Test-Path -LiteralPath $stopPath)) {
        $targetReachable = Test-BridgeTcpEndpoint -HostName ([string]$configuration.firebirdHost) -Port ([int]$configuration.firebirdPort) -TimeoutMilliseconds ([int]$configuration.healthProbeTimeoutMilliseconds)

        if (-not $targetReachable) {
            Write-BridgeState $configuration ([ordered]@{
                status = 'waiting_for_target'
                sessionId = $sessionId
                watchdogProcessId = $PID
                sshProcessId = $null
                updatedAt = [DateTime]::UtcNow.ToString('o')
            })
            Write-BridgeEvent $configuration 'warning' 'target_unavailable'
            Start-Sleep -Seconds $reconnectDelay
            $reconnectDelay = [Math]::Min($reconnectDelay * 2, [int]$configuration.maximumReconnectDelaySeconds)
            continue
        }

        $reverseForward = '{0}:{1}:{2}:{3}' -f $configuration.remoteBindAddress, $configuration.remoteBindPort, $configuration.firebirdHost, $configuration.firebirdPort
        $sshDiagnosticsPath = Get-BridgeRuntimePath $configuration 'ssh-diagnostics.log'

        $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($sshDiagnosticsPath, [string]::Empty, $utf8WithoutBom)

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
            '-E', $sshDiagnosticsPath,
            '-R', $reverseForward,
            '-N',
            '-p', ([string]$configuration.sshPort),
            ('{0}@{1}' -f $configuration.sshUser, $configuration.sshHost)
        )

        $processInfo = New-Object System.Diagnostics.ProcessStartInfo
        $processInfo.FileName = [string]$configuration.sshPath
        $processInfo.Arguments = (($arguments | ForEach-Object {
            ConvertTo-BridgeQuotedArgument ([string]$_)
        }) -join ' ')
        $processInfo.UseShellExecute = $false
        $processInfo.CreateNoWindow = $true

        $managedSsh = New-Object System.Diagnostics.Process
        $managedSsh.StartInfo = $processInfo

        $startedAt = [DateTime]::UtcNow
        [void]$managedSsh.Start()
        Start-Sleep -Seconds 3

        if ($managedSsh.HasExited) {
            $diagnosticLines = @()
            try {
                $diagnosticLines = @(Get-Content -LiteralPath $sshDiagnosticsPath -Tail 100 -ErrorAction Stop)
            }
            catch {
                $diagnosticLines = @()
            }
            $failureCategory = Get-BridgeSshFailureCategory $diagnosticLines
            Clear-Content -LiteralPath $sshDiagnosticsPath -ErrorAction SilentlyContinue

            Write-BridgeState $configuration ([ordered]@{
                status = 'reconnecting'
                sessionId = $sessionId
                watchdogProcessId = $PID
                sshProcessId = $null
                lastExitCode = $managedSsh.ExitCode
                lastFailureCategory = $failureCategory
                updatedAt = [DateTime]::UtcNow.ToString('o')
            })
            Write-BridgeEvent $configuration 'warning' 'ssh_start_failed' @{
                exitCode = $managedSsh.ExitCode
                failureCategory = $failureCategory
            }

            $managedSsh.Dispose()
            $managedSsh = $null
            Start-Sleep -Seconds $reconnectDelay
            $reconnectDelay = [Math]::Min($reconnectDelay * 2, [int]$configuration.maximumReconnectDelaySeconds)
            continue
        }

        Write-BridgeState $configuration ([ordered]@{
            status = 'running'
            sessionId = $sessionId
            watchdogProcessId = $PID
            sshProcessId = $managedSsh.Id
            startedAt = $startedAt.ToString('o')
            targetReachableAtStart = $true
            reverseForwardAcceptedAtStart = $true
        })
        Write-BridgeEvent $configuration 'info' 'tunnel_established' @{
            sshProcessId = $managedSsh.Id
        }

        while (-not $managedSsh.HasExited) {
            if (Test-Path -LiteralPath $stopPath) {
                try {
                    $managedSsh.Kill()
                    $managedSsh.WaitForExit()
                }
                catch {
                }
                break
            }
            Start-Sleep -Seconds 1
        }

        if (Test-Path -LiteralPath $stopPath) {
            Clear-Content -LiteralPath $sshDiagnosticsPath -ErrorAction SilentlyContinue
            break
        }

        $connectedSeconds = ([DateTime]::UtcNow - $startedAt).TotalSeconds
        $exitCode = $managedSsh.ExitCode
        $managedSsh.Dispose()
        $managedSsh = $null

        $diagnosticLines = @()
        try {
            $diagnosticLines = @(Get-Content -LiteralPath $sshDiagnosticsPath -Tail 100 -ErrorAction Stop)
        }
        catch {
            $diagnosticLines = @()
        }
        finally {
            Clear-Content -LiteralPath $sshDiagnosticsPath -ErrorAction SilentlyContinue
        }

        $failureCategory = Get-BridgeSshFailureCategory $diagnosticLines

        Write-BridgeState $configuration ([ordered]@{
            status = 'reconnecting'
            sessionId = $sessionId
            watchdogProcessId = $PID
            sshProcessId = $null
            lastExitCode = $exitCode
            lastFailureCategory = $failureCategory
            updatedAt = [DateTime]::UtcNow.ToString('o')
        })
        Write-BridgeEvent $configuration 'warning' 'tunnel_disconnected' @{
            exitCode = $exitCode
            failureCategory = $failureCategory
        }

        if ($connectedSeconds -ge [int]$configuration.stableConnectionSeconds) {
            $reconnectDelay = [int]$configuration.initialReconnectDelaySeconds
        }
        else {
            $reconnectDelay = [Math]::Min($reconnectDelay * 2, [int]$configuration.maximumReconnectDelaySeconds)
        }

        Start-Sleep -Seconds $reconnectDelay
    }

    Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue

    Write-BridgeState $configuration ([ordered]@{
        status = 'stopped'
        sessionId = $sessionId
        watchdogProcessId = $PID
        sshProcessId = $null
        updatedAt = [DateTime]::UtcNow.ToString('o')
    })
    Write-BridgeEvent $configuration 'info' 'watchdog_stopped' @{
        sessionId = $sessionId
    }
    exit 0
}
catch {
    if ($null -ne $configuration) {
        try {
            Write-BridgeEvent $configuration 'error' 'watchdog_failed' @{
                category = 'configuration_or_runtime_failure'
            }
        }
        catch {
        }
    }
    Write-Error 'ASODEF Legacy Bridge V2 failed closed.'
    exit 1
}
finally {
    if ($null -ne $managedSsh) {
        try {
            if (-not $managedSsh.HasExited) {
                $managedSsh.Kill()
                $managedSsh.WaitForExit()
            }
            $managedSsh.Dispose()
        }
        catch {
        }
    }
    if ($null -ne $lockStream) {
        $lockStream.Dispose()
    }
}
