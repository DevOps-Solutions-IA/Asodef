[CmdletBinding()]
param(
    [string]$WindowsRuntimePath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($WindowsRuntimePath)) {
    $WindowsRuntimePath = Join-Path -Path (Split-Path -Parent $PSScriptRoot) -ChildPath 'windows'
}

$resolvedRuntimePath = (Resolve-Path -LiteralPath $WindowsRuntimePath).Path
$scripts = @(Get-ChildItem -LiteralPath $resolvedRuntimePath -Filter '*.ps1')
$parseErrors = @()

foreach ($script in $scripts) {
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $script.FullName,
        [ref]$tokens,
        [ref]$errors
    )
    $parseErrors += @($errors)
}

if ($parseErrors.Count -gt 0) {
    throw ('PowerShell parser errors: {0}' -f (($parseErrors | ForEach-Object {
        $_.Message
    }) -join '; '))
}

$config = Get-Content -LiteralPath (
    Join-Path $resolvedRuntimePath 'bridge.config.example.json'
) -Raw | ConvertFrom-Json

foreach ($property in @('sshPath', 'privateKeyPath', 'knownHostsPath', 'runtimeDirectory')) {
    $value = [string]$config.$property
    if (-not [IO.Path]::IsPathRooted($value) -or $value -match '%[^%]+%') {
        throw "V2 path must be absolute and environment-independent: $property"
    }
}

if ($config.sshHost -ne '169.58.36.138' -or [int]$config.sshPort -ne 22) {
    throw 'Approved VPS endpoint changed.'
}
if ($config.remoteBindAddress -ne '172.25.51.1' -or [int]$config.remoteBindPort -ne 33051) {
    throw 'Approved private listener changed.'
}
if ($config.firebirdHost -ne '10.125.16.253' -or [int]$config.firebirdPort -ne 3051) {
    throw 'Approved Firebird target changed.'
}

$launcher = Get-Content -LiteralPath (
    Join-Path $resolvedRuntimePath 'Start-AsodefLegacyBridgeV2.ps1'
) -Raw

$requiredLauncherPatterns = @(
    "'-F',\s*'NUL'",
    "'ExitOnForwardFailure=yes'",
    "'IdentityAgent=none'",
    "'PasswordAuthentication=no'",
    "'KbdInteractiveAuthentication=no'",
    "'StrictHostKeyChecking=yes'",
    "'ForwardAgent=no'",
    "'RequestTTY=no'",
    "'PermitLocalCommand=no'",
    "FileShare\]::None",
    "'stop\.requested'",
    "watchdogProcessId",
    "sshProcessId"
)
foreach ($pattern in $requiredLauncherPatterns) {
    if ($launcher -notmatch $pattern) {
        throw "Required V2 launcher control is missing: $pattern"
    }
}

$forbiddenLauncherPatterns = @(
    'SYSDBA',
    '3050',
    'PasswordAuthentication=yes',
    'StrictHostKeyChecking=no',
    '0\.0\.0\.0:33051',
    '\[::\]:33051'
)
foreach ($pattern in $forbiddenLauncherPatterns) {
    if ($launcher -match $pattern) {
        throw "Forbidden V2 launcher pattern found: $pattern"
    }
}


$registration = Get-Content -LiteralPath (
    Join-Path $resolvedRuntimePath 'Register-AsodefLegacyBridgeV2StartupTask.ps1'
) -Raw

foreach ($forbidden in @('WindowStyle Hidden', 'ExecutionPolicy Bypass', '-EncodedCommand')) {
    if ($registration -match [regex]::Escape($forbidden)) {
        throw "Endpoint-protection-unfriendly scheduled-task option found: $forbidden"
    }
}
if ($registration -match 'Start-AsodefLegacyBridgeV2\.ps1') {
    throw 'Persistent startup must not depend on the PowerShell watchdog launcher.'
}
foreach ($required in @('schtasks.exe', '/SC ONSTART', '/RU SYSTEM', 'RemoteForward', 'ExitOnForwardFailure yes', 'StrictHostKeyChecking yes', 'IdentityAgent none', 'direct_ssh_config')) {
    if ($registration -notmatch [regex]::Escape($required)) {
        throw "Direct SSH startup control missing: $required"
    }
}
if ($registration -notmatch '-RestartCount 3' -or $registration -notmatch 'New-TimeSpan -Minutes 5') {
    throw 'Startup task restart policy must remain bounded.'
}

$health = Get-Content -LiteralPath (
    Join-Path $resolvedRuntimePath 'Get-AsodefLegacyBridgeV2Health.ps1'
) -Raw

if ($health -notmatch 'Test-BridgeWatchdogProcess' -or
    $health -notmatch 'Test-BridgeManagedSshProcess' -or
    $health -notmatch 'scheduled_task_direct_ssh' -or
    $health -notmatch 'staleStateRejected') {
    throw 'V2 health must reject stale state and verify live processes.'
}

[ordered]@{
    status = 'ok'
    scriptsParsed = $scripts.Count
    absolutePaths = $true
    staleStateRejected = $true
    endpointContractPinned = $true
} | ConvertTo-Json -Compress
