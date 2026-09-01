Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Assert-BridgeAbsolutePath {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value) -or -not [System.IO.Path]::IsPathRooted($Value)) {
        throw "Invalid bridge configuration: $Name must be an absolute path."
    }
    if ($Value -match '%[^%]+%') {
        throw "Invalid bridge configuration: $Name must not depend on environment expansion."
    }
}

function Get-BridgeConfiguration {
    param(
        [Parameter(Mandatory = $true)][string]$ConfigurationPath,
        [switch]$EnsureRuntimeDirectory
    )

    $resolvedPath = (Resolve-Path -LiteralPath $ConfigurationPath).Path
    $configuration = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json

    $required = @(
        'sshPath', 'privateKeyPath', 'knownHostsPath', 'runtimeDirectory',
        'sshHost', 'sshPort', 'sshUser', 'remoteBindAddress', 'remoteBindPort',
        'firebirdHost', 'firebirdPort', 'serverAliveIntervalSeconds',
        'serverAliveCountMax', 'connectTimeoutSeconds',
        'initialReconnectDelaySeconds', 'maximumReconnectDelaySeconds',
        'stableConnectionSeconds', 'healthProbeTimeoutMilliseconds',
        'maximumLogBytes', 'retainedLogFiles'
    )

    foreach ($property in $required) {
        if (-not ($configuration.PSObject.Properties.Name -contains $property) -or
            [string]::IsNullOrWhiteSpace([string]$configuration.$property)) {
            throw "Invalid bridge configuration: missing $property."
        }
    }

    foreach ($pathProperty in @('sshPath', 'privateKeyPath', 'knownHostsPath', 'runtimeDirectory')) {
        Assert-BridgeAbsolutePath -Name $pathProperty -Value ([string]$configuration.$pathProperty)
    }

    if ($configuration.sshHost -ne '169.58.36.138' -or [int]$configuration.sshPort -ne 22) {
        throw 'Invalid bridge configuration: approved VPS endpoint required.'
    }
    if ($configuration.sshUser -ne 'asodef-tunnel') {
        throw 'Invalid bridge configuration: dedicated SSH identity required.'
    }
    if ($configuration.remoteBindAddress -ne '172.25.51.1' -or [int]$configuration.remoteBindPort -ne 33051) {
        throw 'Invalid bridge configuration: approved private listener required.'
    }
    if ($configuration.firebirdHost -ne '10.125.16.253' -or [int]$configuration.firebirdPort -ne 3051) {
        throw 'Invalid bridge configuration: approved Firebird target required.'
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
            throw "Invalid bridge configuration: $($bound.Name) is outside the safe range."
        }
    }

    foreach ($path in @(
        [string]$configuration.sshPath,
        [string]$configuration.privateKeyPath,
        [string]$configuration.knownHostsPath
    )) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw 'Required bridge file is unavailable.'
        }
    }

    if ((Get-Item -LiteralPath $configuration.knownHostsPath).Length -eq 0) {
        throw 'Pinned known_hosts file is empty.'
    }

    $forbiddenSids = @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545')
    $keyAcl = Get-Acl -LiteralPath $configuration.privateKeyPath
    foreach ($rule in $keyAcl.Access) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($forbiddenSids -contains $sid -and
            $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow) {
            throw 'Private key ACL grants access to a broad principal.'
        }
    }

    if ($EnsureRuntimeDirectory -and -not (Test-Path -LiteralPath $configuration.runtimeDirectory)) {
        New-Item -ItemType Directory -Path $configuration.runtimeDirectory -Force | Out-Null
    }

    return $configuration
}

function Get-BridgeRuntimePath {
    param(
        [Parameter(Mandatory = $true)]$Configuration,
        [Parameter(Mandatory = $true)][string]$Name
    )
    return Join-Path -Path ([string]$Configuration.runtimeDirectory) -ChildPath $Name
}

function Test-BridgeTcpEndpoint {
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

function ConvertTo-BridgeQuotedArgument {
    param([Parameter(Mandatory = $true)][string]$Value)

    if ($Value.Contains('"')) {
        throw 'A process argument contains a forbidden quote.'
    }
    if ($Value -match '\s') {
        return '"' + $Value + '"'
    }
    return $Value
}

function Get-BridgeSshFailureCategory {
    param([string[]]$DiagnosticLines)

    $joined = ($DiagnosticLines -join [Environment]::NewLine)
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

function Rotate-BridgeLog {
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

function Write-BridgeEvent {
    param(
        [Parameter(Mandatory = $true)]$Configuration,
        [Parameter(Mandatory = $true)][ValidateSet('info', 'warning', 'error')][string]$Level,
        [Parameter(Mandatory = $true)][string]$Event,
        [hashtable]$Details = @{}
    )

    $logPath = Get-BridgeRuntimePath $Configuration 'bridge.jsonl'
    Rotate-BridgeLog -Path $logPath -MaximumBytes ([long]$Configuration.maximumLogBytes) -RetainedFiles ([int]$Configuration.retainedLogFiles)

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

function Write-BridgeState {
    param(
        [Parameter(Mandatory = $true)]$Configuration,
        [Parameter(Mandatory = $true)][hashtable]$State
    )

    $statePath = Get-BridgeRuntimePath $Configuration 'state.json'
    $temporaryPath = "$statePath.tmp"
    Set-Content -LiteralPath $temporaryPath -Value ($State | ConvertTo-Json -Compress)
    Move-Item -LiteralPath $temporaryPath -Destination $statePath -Force
}

function Get-BridgeState {
    param([Parameter(Mandatory = $true)]$Configuration)

    $statePath = Get-BridgeRuntimePath $Configuration 'state.json'
    if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Test-BridgeManagedSshProcess {
    param(
        [Parameter(Mandatory = $true)]$Configuration,
        $State
    )

    if ($null -eq $State -or $null -eq $State.sshProcessId) {
        return $false
    }

    $pidValue = [int]$State.sshProcessId
    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($null -eq $process -or $process.ProcessName -ne 'ssh') {
        return $false
    }

    try {
        if ($process.Path -ne [string]$Configuration.sshPath) {
            return $false
        }
    }
    catch {
        return $false
    }

    try {
        $cim = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $pidValue) -ErrorAction Stop
        if ($null -eq $cim) {
            return $false
        }
        $expectedForward = '{0}:{1}:{2}:{3}' -f $Configuration.remoteBindAddress, $Configuration.remoteBindPort, $Configuration.firebirdHost, $Configuration.firebirdPort
        if ([string]$cim.CommandLine -notlike "*$expectedForward*" -or
            [string]$cim.CommandLine -notlike "*$($Configuration.sshUser)@$($Configuration.sshHost)*") {
            return $false
        }
    }
    catch {
        return $false
    }

    return $true
}

function Test-BridgeWatchdogProcess {
    param($State)

    if ($null -eq $State -or $null -eq $State.watchdogProcessId) {
        return $false
    }

    $pidValue = [int]$State.watchdogProcessId
    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($null -eq $process -or $process.ProcessName -notin @('powershell', 'pwsh')) {
        return $false
    }

    try {
        $cim = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $pidValue) -ErrorAction Stop
        return ([string]$cim.CommandLine -like '*Start-AsodefLegacyBridgeV2.ps1*')
    }
    catch {
        return $false
    }
}

function Test-BridgeSystemKeyAccess {
    param([Parameter(Mandatory = $true)][string]$PrivateKeyPath)

    $systemSid = 'S-1-5-18'
    $acl = Get-Acl -LiteralPath $PrivateKeyPath
    foreach ($rule in $acl.Access) {
        try {
            $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
            if ($sid -eq $systemSid -and
                $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
                ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Read) -ne 0) {
                return $true
            }
        }
        catch {
        }
    }
    return $false
}
