[CmdletBinding()]
param(
    [string]$WindowsRuntimePath = (Join-Path $PSScriptRoot '..\windows')
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

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

$launcherPath = Join-Path $resolvedRuntimePath 'Start-AsodefFirebirdTunnel.ps1'
$launcher = Get-Content -LiteralPath $launcherPath -Raw
$forbiddenPatterns = @(
    'add_ErrorDataReceived',
    'BeginErrorReadLine',
    'RedirectStandardError\s*=\s*\$true'
)
foreach ($pattern in $forbiddenPatterns) {
    if ($launcher -match $pattern) {
        throw "Windows PowerShell 5.1-unsafe async stderr pattern found: $pattern"
    }
}

$requiredPatterns = @(
    "'-E',\s*\`$sshDiagnosticsPath",
    "'ssh-diagnostics\.log'",
    'Get-SshFailureCategory\s+\$diagnosticLines',
    'Clear-Content.+sshDiagnosticsPath',
    "'ExitOnForwardFailure=yes'",
    "'IdentityAgent=none'",
    "'PasswordAuthentication=no'",
    "'KbdInteractiveAuthentication=no'",
    "'ForwardAgent=no'",
    "'RequestTTY=no'"
)
foreach ($pattern in $requiredPatterns) {
    if ($launcher -notmatch $pattern) {
        throw "Required fail-closed launcher control is missing: $pattern"
    }
}

$registration = Get-Content -LiteralPath (
    Join-Path $resolvedRuntimePath 'Register-AsodefFirebirdTunnelTask.ps1'
) -Raw
$restartMatch = [regex]::Match($registration, '-RestartCount\s+(\d+)')
if (-not $restartMatch.Success) {
    throw 'Task Scheduler RestartCount is unavailable.'
}
$restartCount = [int]$restartMatch.Groups[1].Value
if ($restartCount -lt 1 -or $restartCount -gt 255) {
    throw 'Task Scheduler RestartCount must be between 1 and 255.'
}

[ordered]@{
    status = 'ok'
    parser = $PSVersionTable.PSVersion.ToString()
    scriptsParsed = $scripts.Count
    asyncPowerShellCallbacks = 0
    nativeOpenSshFileLogging = $true
    restartCount = $restartCount
} | ConvertTo-Json -Compress
