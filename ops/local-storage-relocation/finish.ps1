[CmdletBinding()]
param([Parameter(Mandatory)][string]$ExpectedCleanupSha256)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$storageRoot = 'D:\DevStorage\Laurens'
$receiptFile = Join-Path $storageRoot 'relocation-status.json'
$moduleFile = Join-Path $PSScriptRoot 'relocate.ps1'
$cleanupFile = Join-Path $PSScriptRoot 'cleanup.ps1'
$operatorFile = Join-Path $PSScriptRoot 'invoke.ps1'
if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne 'S-1-5-21-2377185244-3967894582-2721622453-1001') { throw 'Wrong account.' }
if ($ExpectedCleanupSha256 -notmatch '^[a-fA-F0-9]{64}$' -or
    (Get-FileHash -LiteralPath $cleanupFile -Algorithm SHA256).Hash -ne $ExpectedCleanupSha256 -or
    (Get-FileHash -LiteralPath $moduleFile -Algorithm SHA256).Hash -ne '5e28ed171eee344ab70a815b152635f49bfe8c4ddbbc93f0666cb05e7f15133e' -or
    (Get-FileHash -LiteralPath $operatorFile -Algorithm SHA256).Hash -ne 'b9d157c6b705ddb660517492069d14397fc015f6abe6505e969b773d0f23d39f') {
    throw 'Reviewed source hashes required.'
}
. $moduleFile
. $cleanupFile
$null = Assert-RelocationPath $storageRoot
$mutex = New-Object Threading.Mutex($false, 'Local\MurmingleDevelopmentStorageRelocation20261023')
if (-not $mutex.WaitOne(0)) { $mutex.Dispose(); throw 'Another relocation is running.' }
$result = $null
try {
    $previous = Join-Path $storageRoot 'offline-relocation-cleanup-before-20261023.json'
    if (Test-RelocationEntry $previous) { throw 'Retained cleanup receipt already exists; review before repeating.' }
    Copy-Item -LiteralPath $receiptFile -Destination $previous
    $result = Remove-VerifiedRelocationOriginal -Original 'C:\Users\Laurens\.vscode\extensions' `
        -Destination 'D:\DevStorage\Laurens\vscode-extensions' `
        -AllowedOriginalParent 'C:\Users\Laurens\.vscode' -AllowedDestinationParent $storageRoot -Apply
    if (-not $result.Complete) { throw 'Some original files were retained.' }
    $statusText = & C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File $operatorFile -Mode Status
    if ($LASTEXITCODE -ne 0) { throw 'Final status failed.' }
    $status = ($statusText -join "`n") | ConvertFrom-Json
    if (@($status.Entries).Count -ne 5 -or
        @($status.Entries | Where-Object { $_.Status -ne 'on-D' -or $_.OriginalCopyRemains }).Count -ne 0) {
        throw 'Final storage status incomplete.'
    }
    [pscustomobject]@{ State = 'complete'; Group = 'Offline'; Phase = 'verified-original-cleanup';
        CleanupResult = $result; Storage = $status } | ConvertTo-Json -Depth 10 |
        Set-Content -LiteralPath $receiptFile -Encoding UTF8
    Get-Content -LiteralPath $receiptFile -Encoding UTF8
} catch {
    [pscustomobject]@{ State = 'stopped-safely'; Group = 'Offline'; Phase = 'verified-original-cleanup';
        CleanupResult = $result; ExceptionType = $_.Exception.GetType().FullName } |
        ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptFile -Encoding UTF8
    Write-Error 'Original cleanup stopped; differing or locked originals were retained.'
    exit 1
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
