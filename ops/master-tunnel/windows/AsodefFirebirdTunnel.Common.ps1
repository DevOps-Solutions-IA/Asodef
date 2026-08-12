Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Expand-TunnelPath {
    param([Parameter(Mandatory = $true)][string]$Value)
    return [Environment]::ExpandEnvironmentVariables($Value)
}

function Get-TunnelConfiguration {
    param([Parameter(Mandatory = $true)][string]$ConfigurationPath)

    $resolvedPath = (Resolve-Path -LiteralPath $ConfigurationPath).Path
    $configuration = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json
    $required = @(
        'sshPath', 'privateKeyPath', 'knownHostsPath', 'sshHost', 'sshPort',
        'sshUser', 'remoteBindAddress', 'remoteBindPort', 'firebirdHost',
        'firebirdPort', 'serverAliveIntervalSeconds', 'serverAliveCountMax',
        'connectTimeoutSeconds', 'initialReconnectDelaySeconds',
        'maximumReconnectDelaySeconds', 'stableConnectionSeconds',
        'healthProbeTimeoutMilliseconds', 'runtimeDirectory',
        'maximumLogBytes', 'retainedLogFiles'
    )

    foreach ($property in $required) {
        if (-not ($configuration.PSObject.Properties.Name -contains $property) -or
            [string]::IsNullOrWhiteSpace([string]$configuration.$property)) {
            throw "Invalid tunnel configuration: missing $property."
        }
    }

    $configuration.sshPath = Expand-TunnelPath $configuration.sshPath
    $configuration.privateKeyPath = Expand-TunnelPath $configuration.privateKeyPath
    $configuration.knownHostsPath = Expand-TunnelPath $configuration.knownHostsPath
    $configuration.runtimeDirectory = Expand-TunnelPath $configuration.runtimeDirectory

    # These boundaries deliberately fail closed. A changed endpoint requires a
    # reviewed source/configuration change, not an operator typo.
    if ($configuration.sshUser -ne 'asodef-tunnel') {
        throw 'Invalid tunnel configuration: the dedicated SSH identity is required.'
    }
    if ($configuration.remoteBindAddress -ne '172.25.51.1' -or
        [int]$configuration.remoteBindPort -ne 33051) {
        throw 'Invalid tunnel configuration: the approved private listener is required.'
    }
    if ($configuration.firebirdHost -ne '10.125.16.253' -or
        [int]$configuration.firebirdPort -ne 3051) {
        throw 'Invalid tunnel configuration: the approved private Firebird endpoint is required.'
    }
    if ([int]$configuration.sshPort -ne 22) {
        throw 'Invalid tunnel configuration: the approved SSH port is required.'
    }

    $boundedValues = @(
        @{ Name = 'serverAliveIntervalSeconds'; Minimum = 10; Maximum = 300 },
        @{ Name = 'serverAliveCountMax'; Minimum = 1; Maximum = 10 },
        @{ Name = 'connectTimeoutSeconds'; Minimum = 3; Maximum = 60 },
        @{ Name = 'initialReconnectDelaySeconds'; Minimum = 1; Maximum = 60 },
        @{ Name = 'maximumReconnectDelaySeconds'; Minimum = 10; Maximum = 600 },
        @{ Name = 'stableConnectionSeconds'; Minimum = 15; Maximum = 3600 },
        @{ Name = 'healthProbeTimeoutMilliseconds'; Minimum = 500; Maximum = 30000 },
        @{ Name = 'maximumLogBytes'; Minimum = 1048576; Maximum = 104857600 },
        @{ Name = 'retainedLogFiles'; Minimum = 1; Maximum = 20 }
    )
    foreach ($bound in $boundedValues) {
        $value = [long]$configuration.($bound.Name)
        if ($value -lt $bound.Minimum -or $value -gt $bound.Maximum) {
            throw "Invalid tunnel configuration: $($bound.Name) is outside the safe range."
        }
    }

    foreach ($path in @(
        $configuration.sshPath,
        $configuration.privateKeyPath,
        $configuration.knownHostsPath
    )) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw 'Required tunnel file is unavailable.'
        }
    }

    if ((Get-Item -LiteralPath $configuration.knownHostsPath).Length -eq 0) {
        throw 'The pinned known_hosts file is empty.'
    }

    $forbiddenSids = @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545')
    $keyAcl = Get-Acl -LiteralPath $configuration.privateKeyPath
    foreach ($rule in $keyAcl.Access) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($forbiddenSids -contains $sid -and
            $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow) {
            throw 'The private key ACL grants access to a broad principal.'
        }
    }

    if (-not (Test-Path -LiteralPath $configuration.runtimeDirectory)) {
        New-Item -ItemType Directory -Path $configuration.runtimeDirectory | Out-Null
    }

    return $configuration
}

function Get-TunnelRuntimePath {
    param(
        [Parameter(Mandatory = $true)]$Configuration,
        [Parameter(Mandatory = $true)][string]$Name
    )
    return Join-Path -Path $Configuration.runtimeDirectory -ChildPath $Name
}

function Rotate-TunnelLog {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][long]$MaximumBytes,
        [Parameter(Mandatory = $true)][int]$RetainedFiles
    )

    if (-not (Test-Path -LiteralPath $Path) -or
        (Get-Item -LiteralPath $Path).Length -lt $MaximumBytes) {
        return
    }

    for ($index = $RetainedFiles - 1; $index -ge 1; $index--) {
        $source = "$Path.$index"
        $destination = "$Path.$($index + 1)"
        if (Test-Path -LiteralPath $source) {
            Move-Item -LiteralPath $source -Destination $destination -Force
        }
    }
    Move-Item -LiteralPath $Path -Destination "$Path.1" -Force
}

function Write-TunnelEvent {
    param(
        [Parameter(Mandatory = $true)]$Configuration,
        [Parameter(Mandatory = $true)][ValidateSet('info', 'warning', 'error')][string]$Level,
        [Parameter(Mandatory = $true)][string]$Event,
        [hashtable]$Details = @{}
    )

    $logPath = Get-TunnelRuntimePath $Configuration 'tunnel.jsonl'
    Rotate-TunnelLog $logPath ([long]$Configuration.maximumLogBytes) ([int]$Configuration.retainedLogFiles)
    $record = [ordered]@{
        timestamp = [DateTime]::UtcNow.ToString('o')
        level = $Level
        event = $Event
    }
    foreach ($key in $Details.Keys) {
        $record[$key] = $Details[$key]
    }
    Add-Content -LiteralPath $logPath -Value ($record | ConvertTo-Json -Compress)
}

function Write-TunnelState {
    param(
        [Parameter(Mandatory = $true)]$Configuration,
        [Parameter(Mandatory = $true)][hashtable]$State
    )
    $statePath = Get-TunnelRuntimePath $Configuration 'state.json'
    $temporaryPath = "$statePath.tmp"
    Set-Content -LiteralPath $temporaryPath -Value ($State | ConvertTo-Json -Compress)
    Move-Item -LiteralPath $temporaryPath -Destination $statePath -Force
}

function Test-TcpEndpoint {
    param(
        [Parameter(Mandatory = $true)][string]$HostName,
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][int]$TimeoutMilliseconds
    )

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $result = $client.BeginConnect($HostName, $Port, $null, $null)
        if (-not $result.AsyncWaitHandle.WaitOne($TimeoutMilliseconds, $false)) {
            return $false
        }
        $client.EndConnect($result)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

function ConvertTo-QuotedProcessArgument {
    param([Parameter(Mandatory = $true)][string]$Value)
    if ($Value.Contains('"')) {
        throw 'A process argument contains a forbidden quote.'
    }
    if ($Value -match '[\s]') {
        return '"' + $Value + '"'
    }
    return $Value
}

function Get-SshFailureCategory {
    param([string[]]$DiagnosticLines)
    $joined = ($DiagnosticLines -join "`n")
    if ($joined -match 'REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed') {
        return 'host_key_verification_failed'
    }
    if ($joined -match 'Permission denied|Authentication failed') {
        return 'public_key_authentication_failed'
    }
    if ($joined -match 'remote port forwarding failed|cannot listen to port') {
        return 'remote_forward_failed'
    }
    if ($joined -match 'Connection timed out|Connection refused|Connection reset|No route to host') {
        return 'transport_unavailable'
    }
    return 'ssh_process_failed'
}
