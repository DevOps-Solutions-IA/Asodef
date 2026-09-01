[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigurationPath,

    [Parameter(Mandatory = $true)]
    [string]$ExistingKnownHostsPath,

    [switch]$OperatorApproved
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

if (-not $OperatorApproved) {
    throw 'REQUIRES_OPERATOR_APPROVAL: provisioning creates a new SSH private key and updates bridge configuration.'
}

$resolvedConfigurationPath = (Resolve-Path -LiteralPath $ConfigurationPath).Path
$configuration = Get-Content -LiteralPath $resolvedConfigurationPath -Raw | ConvertFrom-Json

$runtimeDirectory = [string]$configuration.runtimeDirectory
$secretDirectory = Join-Path $runtimeDirectory 'secrets'
$keyPath = Join-Path $secretDirectory 'asodef-legacy-bridge-v2-ed25519'
$publicKeyPath = "$keyPath.pub"
$knownHostsPath = Join-Path $secretDirectory 'known_hosts'
$sshKeygenPath = [string]$configuration.sshKeygenPath

if (-not [IO.Path]::IsPathRooted($runtimeDirectory) -or
    -not [IO.Path]::IsPathRooted($sshKeygenPath)) {
    throw 'Runtime and ssh-keygen paths must be absolute.'
}
if (-not (Test-Path -LiteralPath $sshKeygenPath -PathType Leaf)) {
    throw 'ssh-keygen is unavailable.'
}
if (-not (Test-Path -LiteralPath $ExistingKnownHostsPath -PathType Leaf)) {
    throw 'Existing pinned known_hosts is unavailable.'
}
if (Test-Path -LiteralPath $keyPath -or Test-Path -LiteralPath $publicKeyPath) {
    throw 'V2 SSH identity already exists; refusing to overwrite.'
}

$statePath = Join-Path $runtimeDirectory 'state.json'
if (Test-Path -LiteralPath $statePath -PathType Leaf) {
    try {
        $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        if ($null -ne $state.watchdogProcessId) {
            $watchdog = Get-Process -Id ([int]$state.watchdogProcessId) -ErrorAction SilentlyContinue
            if ($null -ne $watchdog) {
                throw 'V2 watchdog is still running; stop it before provisioning identity.'
            }
        }
    }
    catch {
        if ($_.Exception.Message -like 'V2 watchdog is still running*') {
            throw
        }
    }
}

$knownHostFingerprintOutput = (& $sshKeygenPath -lf $ExistingKnownHostsPath 2>&1 | Out-String)
if ($knownHostFingerprintOutput -notmatch [regex]::Escape('SHA256:5fssr6LMKyefDOtowq9LjEI258sO1haAPI9rVOugUA8')) {
    throw 'Pinned ED25519 VPS host fingerprint is not present in existing known_hosts.'
}

New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$currentSid = $currentIdentity.User
$systemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')

$directoryAcl = New-Object Security.AccessControl.DirectorySecurity
$directoryAcl.SetOwner($currentSid)
$directoryAcl.SetAccessRuleProtection($true, $false)
$inheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
$propagation = [Security.AccessControl.PropagationFlags]::None
$allow = [Security.AccessControl.AccessControlType]::Allow
$directoryAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($currentSid, 'FullControl', $inheritance, $propagation, $allow)))
$directoryAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($systemSid, 'FullControl', $inheritance, $propagation, $allow)))
Set-Acl -LiteralPath $secretDirectory -AclObject $directoryAcl

Copy-Item -LiteralPath $ExistingKnownHostsPath -Destination $knownHostsPath

$keygenInfo = New-Object System.Diagnostics.ProcessStartInfo
$keygenInfo.FileName = $sshKeygenPath
$keygenInfo.Arguments = '-q -t ed25519 -N "" -C "asodef-legacy-bridge-v2@WIN-Q0DAPTGTQ4P" -f "' + $keyPath + '"'
$keygenInfo.UseShellExecute = $false
$keygenInfo.CreateNoWindow = $true
$keygen = [System.Diagnostics.Process]::Start($keygenInfo)
$keygen.WaitForExit()
if ($keygen.ExitCode -ne 0) {
    throw 'ssh-keygen failed to create V2 identity.'
}
$keygen.Dispose()

$fileAcl = New-Object Security.AccessControl.FileSecurity
$fileAcl.SetOwner($currentSid)
$fileAcl.SetAccessRuleProtection($true, $false)
$fileAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($currentSid, 'FullControl', $allow)))
$fileAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($systemSid, 'FullControl', $allow)))
Set-Acl -LiteralPath $keyPath -AclObject $fileAcl

$publicAcl = New-Object Security.AccessControl.FileSecurity
$publicAcl.SetOwner($currentSid)
$publicAcl.SetAccessRuleProtection($true, $false)
$publicAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($currentSid, 'FullControl', $allow)))
$publicAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($systemSid, 'FullControl', $allow)))
Set-Acl -LiteralPath $publicKeyPath -AclObject $publicAcl
Set-Acl -LiteralPath $knownHostsPath -AclObject $publicAcl

$publicKey = (Get-Content -LiteralPath $publicKeyPath -Raw).Trim()
$fingerprintOutput = (& $sshKeygenPath -lf $publicKeyPath 2>&1 | Out-String).Trim()
$fingerprint = $null
if ($fingerprintOutput -match '(SHA256:[A-Za-z0-9+/]+)') {
    $fingerprint = $Matches[1]
}
if ([string]::IsNullOrWhiteSpace($fingerprint)) {
    throw 'Unable to derive V2 public-key fingerprint.'
}

$configuration.privateKeyPath = $keyPath
$configuration.knownHostsPath = $knownHostsPath
$configuration | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolvedConfigurationPath -Encoding UTF8

[ordered]@{
    status = 'provisioned'
    identity = $currentIdentity.Name
    privateKeyStored = $true
    privateKeyEmitted = $false
    publicKey = $publicKey
    fingerprint = $fingerprint
    pinnedHostFingerprintVerified = $true
    configurationUpdated = $true
} | ConvertTo-Json -Compress
