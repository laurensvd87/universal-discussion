[CmdletBinding()]
param(
    [switch]$Apply,
    [ValidateRange(0, 50000)][int]$MaxPages = 0,
    [ValidateRange(-1, 8)][int]$MaxDepth = -1,
    [ValidateRange(0, 50000)][int]$PerHost = 0,
    [ValidateRange(0, 10000)][int]$PerSection = 0,
    [ValidateRange(0, 10080)][int]$MaxMinutes = 0,
    [switch]$RebaseState
)

$ErrorActionPreference = 'Stop'
$crawlerNode = (Get-Command node -ErrorAction Stop).Source
$crawlerCli = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\src\ops\crawl-cli.js'))
$crawlerArguments = @(
    $crawlerCli,
    '--token-stdin',
    '--max-pages', [string]$MaxPages,
    '--max-depth', [string]$MaxDepth,
    '--per-host', [string]$PerHost,
    '--per-section', [string]$PerSection,
    '--max-minutes', [string]$MaxMinutes
)
if ($Apply) { $crawlerArguments += '--apply' }
if ($RebaseState) { $crawlerArguments += '--rebase-state' }

if ($Apply) {
    Write-Host 'Apply mode: selected staged pages may change provisional Topic assignments.'
} else {
    Write-Host 'Preview mode: public pages will be fetched and staged; the canonical database will not be changed.'
}

$crawlerSecureToken = Read-Host 'Local service pairing token' -AsSecureString
$crawlerTokenPointer = [IntPtr]::Zero
$crawlerPlainToken = $null
$crawlerExitCode = 1
try {
    $crawlerTokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($crawlerSecureToken)
    $crawlerPlainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($crawlerTokenPointer)
    $crawlerPlainToken | & $crawlerNode @crawlerArguments
    $crawlerExitCode = $LASTEXITCODE
} finally {
    $crawlerPlainToken = $null
    if ($crawlerTokenPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($crawlerTokenPointer)
    }
    $crawlerSecureToken.Dispose()
}
exit $crawlerExitCode
