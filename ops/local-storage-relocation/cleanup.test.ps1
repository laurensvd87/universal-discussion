$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'relocate.ps1')
. (Join-Path $PSScriptRoot 'cleanup.ps1')
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\')
$testRoot = Join-Path $workspace ('cleanup-synthetic-' + [Guid]::NewGuid().ToString('N'))
$null = [IO.Directory]::CreateDirectory($testRoot)
$passed = 0
function Assert-Test([bool]$Value) { if (-not $Value) { throw 'cleanup-test-assertion' } }
function New-CleanupCase([bool]$ReadOnly = $true) {
    $parent = Join-Path $testRoot ([Guid]::NewGuid().ToString('N'))
    $null = [IO.Directory]::CreateDirectory($parent)
    $original = Join-Path $parent 'extensions'
    $destination = Join-Path $parent 'on-D'
    $backup = $original + '.relocation-original-20261023'
    $null = [IO.Directory]::CreateDirectory($backup)
    $file = Join-Path $backup 'invented.txt'
    [IO.File]::WriteAllText($file, 'synthetic only')
    if ($ReadOnly) { [IO.File]::SetAttributes($file, [IO.FileAttributes]::ReadOnly) }
    # Exercise the actual old failure: fully verified D copy/junction with retained C.
    $copyOriginal = Join-Path $parent 'copy-source'
    [IO.Directory]::Move($backup, $copyOriginal)
    $result = Move-VerifiedDirectoryToJunction -Source $copyOriginal -Destination $destination -AllowedSourceParent $parent -AllowedDestinationParent $parent -ApplicationsClosed
    if ($ReadOnly) {
        [IO.Directory]::Move(($copyOriginal + '.relocation-original-20261023'), $backup)
        Assert-Test (-not $result.CleanupComplete)
    } else {
        $null = [IO.Directory]::CreateDirectory($backup)
        [IO.File]::Copy((Join-Path $destination 'invented.txt'), (Join-Path $backup 'invented.txt'))
    }
    $null = New-Item -ItemType Junction -Path $original -Target $destination
    return @{ Original = $original; Destination = $destination; AllowedOriginalParent = $parent; AllowedDestinationParent = $parent }
}
try {
    $case = New-CleanupCase
    $result = Remove-VerifiedRelocationOriginal @case -Apply
    Assert-Test ($result.Complete -and $result.RemovedFiles -eq 1 -and $result.RetainedFiles -eq 0)
    Assert-Test ([IO.File]::ReadAllText((Join-Path $case.Original 'invented.txt')) -eq 'synthetic only')
    Assert-Test (([IO.File]::GetAttributes((Join-Path $case.Destination 'invented.txt')) -band [IO.FileAttributes]::ReadOnly) -ne 0)
    $passed++
    $result = Remove-VerifiedRelocationOriginal @case -Apply
    Assert-Test ($result.Complete -and $result.AlreadyComplete)
    $passed++

    $case = New-CleanupCase
    $result = Remove-VerifiedRelocationOriginal @case
    Assert-Test ($result.VerificationOnly -and $result.VerifiedFiles -eq 1 -and $result.RemovedFiles -eq 0)
    Assert-Test ([IO.Directory]::Exists($case.Original + '.relocation-original-20261023'))
    $passed++

    $case = New-CleanupCase
    $targetFile = Join-Path $case.Destination 'invented.txt'
    [IO.File]::SetAttributes($targetFile, [IO.FileAttributes]::Normal)
    [IO.File]::WriteAllText($targetFile, 'changed D bytes')
    $result = Remove-VerifiedRelocationOriginal @case -Apply
    Assert-Test (-not $result.Complete -and $result.RetainedFiles -eq 1)
    Assert-Test (([IO.File]::GetAttributes((Join-Path ($case.Original + '.relocation-original-20261023') 'invented.txt')) -band [IO.FileAttributes]::ReadOnly) -ne 0)
    $passed++

    $case = New-CleanupCase
    $targetFile = Join-Path $case.Destination 'invented.txt'
    $savedTime = [IO.File]::GetLastWriteTimeUtc($targetFile)
    $savedAttributes = [IO.File]::GetAttributes($targetFile)
    [IO.File]::SetAttributes($targetFile, [IO.FileAttributes]::Normal)
    [IO.File]::WriteAllText($targetFile, 'different data')
    [IO.File]::SetLastWriteTimeUtc($targetFile, $savedTime)
    [IO.File]::SetAttributes($targetFile, $savedAttributes)
    $result = Remove-VerifiedRelocationOriginal @case -Apply
    Assert-Test (-not $result.Complete -and $result.RetainedFiles -eq 1 -and $result.RemovedFiles -eq 0)
    $passed++

    $case = New-CleanupCase
    $targetFile = Join-Path $case.Destination 'invented.txt'
    $held = [IO.File]::Open($targetFile, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
    try { $result = Remove-VerifiedRelocationOriginal @case -Apply }
    finally { $held.Dispose() }
    Assert-Test (-not $result.Complete -and $result.RetainedFiles -eq 1)
    $passed++

    $case = New-CleanupCase
    $targetFile = Join-Path $case.Destination 'invented.txt'
    [IO.File]::SetAttributes($targetFile, [IO.FileAttributes]::Normal)
    [IO.File]::Delete($targetFile)
    $result = Remove-VerifiedRelocationOriginal @case -Apply
    Assert-Test (-not $result.Complete -and $result.RetainedFiles -eq 1)
    $passed++
    [pscustomobject]@{ Passed = $passed; Failed = 0; SyntheticOnly = $true }
} finally {
    if ([IO.Path]::GetDirectoryName($testRoot) -cne $workspace -or
        [IO.Path]::GetFileName($testRoot) -notmatch '^cleanup-synthetic-[a-f0-9]{32}$') { throw 'cleanup-test-root' }
    $pending = New-Object 'Collections.Generic.Stack[string]'
    $directories = New-Object 'Collections.Generic.List[string]'
    $pending.Push($testRoot)
    while ($pending.Count) {
        $directory = $pending.Pop(); $directories.Add($directory)
        foreach ($entry in [IO.Directory]::EnumerateFileSystemEntries($directory)) {
            $attributes = [IO.File]::GetAttributes($entry)
            if (($attributes -band [IO.FileAttributes]::Directory) -ne 0) {
                if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { [IO.Directory]::Delete($entry, $false) }
                else { $pending.Push($entry) }
            } else { [IO.File]::SetAttributes($entry, [IO.FileAttributes]::Normal); [IO.File]::Delete($entry) }
        }
    }
    foreach ($directory in @($directories | Sort-Object Length -Descending)) { [IO.Directory]::Delete($directory, $false) }
}
