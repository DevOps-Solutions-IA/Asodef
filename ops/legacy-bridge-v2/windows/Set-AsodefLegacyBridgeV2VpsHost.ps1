[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigurationPath,

    [Parameter(Mandatory = $true)]
    [string]$NewSshHost,

    [int]$NewSshPort = 22,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedHostFingerprint,

    [switch]$OperatorApproved
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

if (-not $OperatorApproved) {
    throw 'REQUIRES_OPERATOR_APPROVAL: VPS host staging updates bridge configuration and pinned known_hosts.'
}
if ([string]::IsNullOrWhiteSpace($NewSshHost)) {
    throw 'NewSshHost is required.'
}
if ($NewSshPort -lt 1 -or $NewSshPort -gt 65535) {
    throw 'NewSshPort is invalid.'
}
if ($ExpectedHostFingerprint -notmatch '^SHA256:[A-Za-z0-9+/]{43}$') {
    throw 'ExpectedHostFingerprint must be a SHA256 OpenSSH fingerprint.'
}

$resolvedConfigurationPath = (Resolve-Path -LiteralPath $ConfigurationPath).Path
$configuration = Get-Content -LiteralPath $resolvedConfigurationPath -Raw | ConvertFrom-Json
$sshKeygenPath = [string]$configuration.sshKeygenPath
$sshDirectory = Split-Path -Parent $sshKeygenPath
$sshKeyscanPath = Join-Path $sshDirectory 'ssh-keyscan.exe'
$knownHostsPath = [string]$configuration.knownHostsPath
$runtimeDirectory = [string]$configuration.runtimeDirectory

foreach ($path in @($sshKeygenPath, $sshKeyscanPath)) {
    if (-not [IO.Path]::IsPathRooted($path) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw 'Portable OpenSSH key utilities are unavailable.'
    }
}
if (-not [IO.Path]::IsPathRooted($knownHostsPath) -or -not [IO.Path]::IsPathRooted($runtimeDirectory)) {
    throw 'Known-hosts and runtime paths must be absolute.'
}

$secretDirectory = Split-Path -Parent $knownHostsPath
New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
$backupDirectory = Join-Path $runtimeDirectory 'backup'
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$configBackup = Join-Path $backupDirectory ("bridge.config.{0}.json" -f $stamp)
Copy-Item -LiteralPath $resolvedConfigurationPath -Destination $configBackup

if (Test-Path -LiteralPath $knownHostsPath -PathType Leaf) {
    $knownHostsBackup = Join-Path $backupDirectory ("known_hosts.{0}" -f $stamp)
    Copy-Item -LiteralPath $knownHostsPath -Destination $knownHostsBackup
}
else {
    $knownHostsBackup = $null
}

$tempScan = Join-Path $env:TEMP ("asodef-v2-hostscan-{0}.txt" -f ([Guid]::NewGuid().ToString('N')))
try {
    $scanArguments = @('-T', '5', '-t', 'ed25519')
    if ($NewSshPort -ne 22) {
        $scanArguments += @('-p', [string]$NewSshPort)
    }
    $scanArguments += $NewSshHost

    $scan = & $sshKeyscanPath @scanArguments 2>$null
    if ($LASTEXITCODE -ne 0 -or @($scan).Count -lt 1) {
        throw 'Unable to obtain the replacement VPS ED25519 host key.'
    }
    @($scan) | Set-Content -LiteralPath $tempScan -Encoding ASCII

    $fingerprintOutput = (& $sshKeygenPath -lf $tempScan 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0 -or $fingerprintOutput -notmatch [regex]::Escape($ExpectedHostFingerprint)) {
        throw 'Replacement VPS host fingerprint does not match the independently approved fingerprint.'
    }

    $existing = @()
    if (Test-Path -LiteralPath $knownHostsPath -PathType Leaf) {
        $existing = @(Get-Content -LiteralPath $knownHostsPath)
    }
    $work = Join-Path $env:TEMP ("asodef-v2-knownhosts-{0}.txt" -f ([Guid]::NewGuid().ToString('N')))
    try {
        $existing | Set-Content -LiteralPath $work -Encoding ASCII
        & $sshKeygenPath -R $NewSshHost -f $work 2>$null | Out-Null
        & $sshKeygenPath -R ("[{0}]:{1}" -f $NewSshHost, $NewSshPort) -f $work 2>$null | Out-Null

        $merged = @()
        if (Test-Path -LiteralPath $work -PathType Leaf) {
            $merged += @(Get-Content -LiteralPath $work | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        }
        $merged += @(Get-Content -LiteralPath $tempScan | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
        [IO.File]::WriteAllLines($knownHostsPath, [string[]]$merged, $utf8WithoutBom)
    }
    finally {
        Remove-Item -LiteralPath $work -Force -ErrorAction SilentlyContinue
    }

    $configuration.sshHost = $NewSshHost
    $configuration.sshPort = $NewSshPort
    $json = $configuration | ConvertTo-Json -Depth 8
    [IO.File]::WriteAllText($resolvedConfigurationPath, $json, (New-Object System.Text.UTF8Encoding($false)))

    [ordered]@{
        status = 'staged'
        sshHost = $NewSshHost
        sshPort = $NewSshPort
        expectedHostFingerprint = $ExpectedHostFingerprint
        knownHostsPinned = $true
        configurationUpdated = $true
        taskRestarted = $false
        privateKeyEmitted = $false
        configBackup = $configBackup
        knownHostsBackupCreated = ($null -ne $knownHostsBackup)
    } | ConvertTo-Json -Compress
}
finally {
    Remove-Item -LiteralPath $tempScan -Force -ErrorAction SilentlyContinue
}
