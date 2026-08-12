[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigurationPath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'AsodefFirebirdTunnel.Common.ps1')

$configuration = Get-TunnelConfiguration $ConfigurationPath
$mutex = New-Object System.Threading.Mutex($false, 'Local\ASODEF_MasterFirebirdTunnel')
$hasMutex = $false

try {
    $hasMutex = $mutex.WaitOne(0, $false)
    if (-not $hasMutex) {
        throw 'A tunnel watchdog is already running for this user.'
    }

    $stopPath = Get-TunnelRuntimePath $configuration 'stop.requested'
    Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
    $reconnectDelay = [int]$configuration.initialReconnectDelaySeconds

    while (-not (Test-Path -LiteralPath $stopPath)) {
        $targetReachable = Test-TcpEndpoint `
            -HostName $configuration.firebirdHost `
            -Port ([int]$configuration.firebirdPort) `
            -TimeoutMilliseconds ([int]$configuration.healthProbeTimeoutMilliseconds)

        if (-not $targetReachable) {
            Write-TunnelEvent $configuration 'warning' 'target_unavailable'
            Start-Sleep -Seconds $reconnectDelay
            $reconnectDelay = [Math]::Min(
                $reconnectDelay * 2,
                [int]$configuration.maximumReconnectDelaySeconds
            )
            continue
        }

        $reverseForward = '{0}:{1}:{2}:{3}' -f `
            $configuration.remoteBindAddress,
            $configuration.remoteBindPort,
            $configuration.firebirdHost,
            $configuration.firebirdPort
        $sshDiagnosticsPath = Get-TunnelRuntimePath $configuration 'ssh-diagnostics.log'

        # OpenSSH writes its own diagnostics without invoking a PowerShell
        # ScriptBlock on a background Process event thread. This is required
        # for Windows PowerShell 5.1 on Windows Server 2016.
        $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText(
            $sshDiagnosticsPath,
            [string]::Empty,
            $utf8WithoutBom
        )

        $arguments = @(
            '-F', 'NUL',
            '-i', $configuration.privateKeyPath,
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
        $processInfo.FileName = $configuration.sshPath
        $processInfo.Arguments = (($arguments | ForEach-Object {
            ConvertTo-QuotedProcessArgument ([string]$_)
        }) -join ' ')
        $processInfo.UseShellExecute = $false
        $processInfo.CreateNoWindow = $true

        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $processInfo

        $startedAt = [DateTime]::UtcNow
        [void]$process.Start()
        Start-Sleep -Seconds 3

        if (-not $process.HasExited) {
            Write-TunnelState $configuration ([ordered]@{
                status = 'running'
                processId = $process.Id
                startedAt = $startedAt.ToString('o')
                reverseForwardEstablished = $true
                targetReachableAtStart = $true
            })
            Write-TunnelEvent $configuration 'info' 'tunnel_established'
        }

        $process.WaitForExit()
        $connectedSeconds = ([DateTime]::UtcNow - $startedAt).TotalSeconds
        $exitCode = $process.ExitCode
        $process.Dispose()

        $diagnosticLines = @()
        try {
            if (Test-Path -LiteralPath $sshDiagnosticsPath) {
                $diagnosticLines = @(
                    Get-Content -LiteralPath $sshDiagnosticsPath -Tail 100 -ErrorAction Stop
                )
            }
        }
        catch {
            $diagnosticLines = @()
        }
        finally {
            Clear-Content -LiteralPath $sshDiagnosticsPath -ErrorAction SilentlyContinue
        }
        $failureCategory = Get-SshFailureCategory $diagnosticLines

        if (Test-Path -LiteralPath $stopPath) {
            break
        }

        Write-TunnelState $configuration ([ordered]@{
            status = 'reconnecting'
            processId = $null
            lastExitCode = $exitCode
            lastFailureCategory = $failureCategory
            updatedAt = [DateTime]::UtcNow.ToString('o')
        })
        Write-TunnelEvent $configuration 'warning' 'tunnel_disconnected' @{
            exitCode = $exitCode
            failureCategory = $failureCategory
        }

        if ($connectedSeconds -ge [int]$configuration.stableConnectionSeconds) {
            $reconnectDelay = [int]$configuration.initialReconnectDelaySeconds
        }
        else {
            $reconnectDelay = [Math]::Min(
                $reconnectDelay * 2,
                [int]$configuration.maximumReconnectDelaySeconds
            )
        }
        Start-Sleep -Seconds $reconnectDelay
    }

    Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
    Write-TunnelState $configuration ([ordered]@{
        status = 'stopped'
        processId = $null
        updatedAt = [DateTime]::UtcNow.ToString('o')
    })
    Write-TunnelEvent $configuration 'info' 'watchdog_stopped'
    exit 0
}
catch {
    if ($null -ne $configuration) {
        Write-TunnelEvent $configuration 'error' 'watchdog_failed' @{
            category = 'configuration_or_runtime_failure'
        }
    }
    Write-Error 'ASODEF Firebird tunnel watchdog failed closed.'
    exit 1
}
finally {
    if ($hasMutex) {
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}
