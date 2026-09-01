[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigurationPath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'AsodefLegacyBridgeV2.Common.ps1')

try {
    $resolvedPath = (Resolve-Path -LiteralPath $ConfigurationPath).Path
    $raw = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json

    $contractOk = (
        [string]$raw.sshHost -eq '169.58.36.138' -and
        [int]$raw.sshPort -eq 22 -and
        [string]$raw.sshUser -eq 'asodef-tunnel' -and
        [string]$raw.remoteBindAddress -eq '172.25.51.1' -and
        [int]$raw.remoteBindPort -eq 33051 -and
        [string]$raw.firebirdHost -eq '10.125.16.253' -and
        [int]$raw.firebirdPort -eq 3051
    )

    $pathsAbsolute = $true
    foreach ($property in @('sshPath', 'privateKeyPath', 'knownHostsPath', 'runtimeDirectory')) {
        $value = [string]$raw.$property
        if ([string]::IsNullOrWhiteSpace($value) -or
            -not [IO.Path]::IsPathRooted($value) -or
            $value -match '%[^%]+%') {
            $pathsAbsolute = $false
        }
    }

    $sshExists = Test-Path -LiteralPath ([string]$raw.sshPath) -PathType Leaf
    $keyExists = Test-Path -LiteralPath ([string]$raw.privateKeyPath) -PathType Leaf
    $knownHostsExists = Test-Path -LiteralPath ([string]$raw.knownHostsPath) -PathType Leaf
    $knownHostsNonEmpty = $knownHostsExists -and (Get-Item -LiteralPath ([string]$raw.knownHostsPath)).Length -gt 0

    $keyAclSafe = $false
    if ($keyExists) {
        try {
            $forbiddenSids = @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545')
            $unsafe = $false
            $acl = Get-Acl -LiteralPath ([string]$raw.privateKeyPath)
            foreach ($rule in $acl.Access) {
                $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
                if ($forbiddenSids -contains $sid -and
                    $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow) {
                    $unsafe = $true
                }
            }
            $keyAclSafe = -not $unsafe
        }
        catch {
            $keyAclSafe = $false
        }
    }

    $firebirdTcp = $false
    $vpsTcp = $false

    if ($contractOk) {
        $firebirdTcp = Test-BridgeTcpEndpoint -HostName ([string]$raw.firebirdHost) -Port ([int]$raw.firebirdPort) -TimeoutMilliseconds 3000
        $vpsTcp = Test-BridgeTcpEndpoint -HostName ([string]$raw.sshHost) -Port ([int]$raw.sshPort) -TimeoutMilliseconds 3000
    }

    $ok = $contractOk -and $pathsAbsolute -and $sshExists -and $keyExists -and $knownHostsNonEmpty -and $keyAclSafe -and $firebirdTcp -and $vpsTcp

    [ordered]@{
        status = $(if ($ok) { 'ok' } else { 'blocked' })
        contract = $contractOk
        absolutePaths = $pathsAbsolute
        ssh = $sshExists
        key = $keyExists
        knownHosts = $knownHostsNonEmpty
        keyAclSafe = $keyAclSafe
        firebirdTcp = $firebirdTcp
        vpsTcp = $vpsTcp
    } | ConvertTo-Json -Compress

    if ($ok) { exit 0 }
    exit 1
}
catch {
    [ordered]@{
        status = 'error'
        code = 'LEGACY_BRIDGE_V2_PREFLIGHT_ERROR'
    } | ConvertTo-Json -Compress
    exit 2
}
