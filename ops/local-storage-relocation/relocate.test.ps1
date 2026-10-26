$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'relocate.ps1')
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\')
$testRoot = Join-Path $workspace ('relocation-synthetic-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $testRoot
$passed = 0
function Assert-Test { param([bool]$Condition) if (-not $Condition) { throw 'test-assertion' } }
function New-TestCase {
    $case = Join-Path $testRoot ([Guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $case
    $sourceParent = Join-Path $case 'origin'
    $destParent = Join-Path $case 'target'
    $null = New-Item -ItemType Directory -Path $sourceParent
    $null = New-Item -ItemType Directory -Path $destParent
    $source = Join-Path $sourceParent 'sample'
    $null = New-Item -ItemType Directory -Path $source
    $null = New-Item -ItemType Directory -Path (Join-Path $source 'nested')
    $null = New-Item -ItemType Directory -Path (Join-Path $source 'empty')
    [IO.File]::WriteAllText((Join-Path $source 'nested\synthetic.txt'), 'invented test bytes')
    return @{ Source=$source; Destination=(Join-Path $destParent 'sample'); AllowedSourceParent=$sourceParent; AllowedDestinationParent=$destParent; ApplicationsClosed=$true }
}
function Assert-Refused { param([scriptblock]$Action) $refused=$false; try { $null = & $Action } catch { $refused=$true }; Assert-Test $refused }
try {
    $case = New-TestCase
    $before = Get-RelocationManifest $case.Source
    $result = Move-VerifiedDirectoryToJunction @case
    Assert-Test ($result.Verified -and $result.CleanupComplete -and $result.Status -eq 'Relocated')
    Assert-Test ((Get-Item -LiteralPath $case.Source -Force).LinkType -eq 'Junction')
    Assert-Test ([IO.File]::ReadAllText((Join-Path $case.Source 'nested\synthetic.txt')) -eq 'invented test bytes')
    Assert-RelocationManifestEqual $before (Get-RelocationManifest $case.Destination)
    Assert-Test (-not (Test-Path -LiteralPath ($case.Source+'.relocation-original-20261023')))
    $passed++

    $case = New-TestCase
    $null = New-Item -ItemType Directory -Path $case.Destination
    Assert-Refused { Move-VerifiedDirectoryToJunction @case }
    Assert-Test ((Get-Item -LiteralPath $case.Source).LinkType -ne 'Junction')
    $passed++

    $case = New-TestCase
    $null = New-Item -ItemType Directory -Path ($case.Source+'.relocation-original-20261023')
    Assert-Refused { Move-VerifiedDirectoryToJunction @case }
    Assert-Test (-not (Test-Path -LiteralPath $case.Destination))
    $passed++

    $case = New-TestCase
    $null = New-Item -ItemType Junction -Path (Join-Path $case.Source 'link') -Target $case.AllowedDestinationParent
    Assert-Refused { Move-VerifiedDirectoryToJunction @case }
    Assert-Test (-not (Test-Path -LiteralPath $case.Destination))
    $passed++

    $case = New-TestCase
    function New-RelocationJunction { param([string]$Path,[string]$Target) throw 'injected-junction-failure' }
    Assert-Refused { Move-VerifiedDirectoryToJunction @case }
    Assert-Test ([IO.Directory]::Exists($case.Source) -and (Get-Item -LiteralPath $case.Source).LinkType -ne 'Junction')
    Assert-Test ([IO.Directory]::Exists($case.Destination))
    Assert-RelocationManifestEqual (Get-RelocationManifest $case.Source) (Get-RelocationManifest $case.Destination)
    $passed++
    . (Join-Path $PSScriptRoot 'relocate.ps1')

    $case = New-TestCase
    $sourceForMutation = $case.Source
    Assert-Refused { Move-VerifiedDirectoryToJunction @case -BeforeSwitch { [IO.File]::WriteAllText((Join-Path $sourceForMutation 'changed.txt'), 'new invented bytes') } }
    Assert-Test ((Get-Item -LiteralPath $case.Source).LinkType -ne 'Junction')
    $passed++
    $case = New-TestCase
    $case.ApplicationsClosed = $false
    Assert-Refused { Move-VerifiedDirectoryToJunction @case }
    $passed++
    $case = New-TestCase
    Assert-Refused { Move-VerifiedDirectoryToJunction @case -BeforeSwitch { throw 'synthetic-process-guard' } }
    Assert-Test ((Get-Item -LiteralPath $case.Source).LinkType -ne 'Junction')
    Assert-RelocationManifestEqual (Get-RelocationManifest $case.Source) (Get-RelocationManifest $case.Destination)
    $passed++
    $case = New-TestCase
    Set-Content -LiteralPath (Join-Path $case.Source 'nested\synthetic.txt') -Stream 'synthetic-stream' -Value 'invented stream'
    Assert-Refused { Move-VerifiedDirectoryToJunction @case }
    Assert-Test (-not (Test-Path -LiteralPath $case.Destination))
    $passed++
    [pscustomobject]@{ Passed=$passed; Failed=0; SyntheticOnly=$true }
} finally {
    # Fresh UUID-owned workspace scope only. Never recursive: unlink junctions first,
    # then exact enumerated leaves/directories. Refuse any unexpected root location.
    if ([IO.Path]::GetDirectoryName($testRoot) -cne $workspace -or [IO.Path]::GetFileName($testRoot) -notmatch '^relocation-synthetic-[a-f0-9]{32}$') { throw 'test-cleanup-bound' }
    $pending = New-Object 'Collections.Generic.Stack[string]'
    $dirs = New-Object 'Collections.Generic.List[string]'
    $pending.Push($testRoot)
    while ($pending.Count) {
        $dir = $pending.Pop(); $dirs.Add($dir)
        foreach ($entry in [IO.Directory]::EnumerateFileSystemEntries($dir)) {
            $a = [IO.File]::GetAttributes($entry)
            if (($a -band [IO.FileAttributes]::Directory) -ne 0) {
                if (($a -band [IO.FileAttributes]::ReparsePoint) -ne 0) { [IO.Directory]::Delete($entry,$false) }
                else { $pending.Push($entry) }
            } else { [IO.File]::Delete($entry) }
        }
    }
    foreach ($dir in @($dirs | Sort-Object Length -Descending)) { [IO.Directory]::Delete($dir,$false) }
}
