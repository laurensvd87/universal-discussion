$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$operator = Join-Path $PSScriptRoot 'invoke.ps1'
$tokens = $null; $parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($operator, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'operator-parse' }
foreach ($name in @('Assert-OrdinaryParent', 'Initialize-Storage')) {
    $definition = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    if ($null -eq $definition) { throw 'operator-function-absent' }
    . ([scriptblock]::Create($definition.Extent.Text))
}
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\')
$testRoot = Join-Path $workspace ('storage-wrapper-synthetic-' + [Guid]::NewGuid().ToString('N'))
$null = [IO.Directory]::CreateDirectory($testRoot)
$expectedSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$storageRoot = Join-Path $testRoot 'private-root'
$passed = 0
try {
    Initialize-Storage
    $passed++
    Initialize-Storage
    $passed++
    $storageRoot = Join-Path $testRoot 'broader-root'
    $null = [IO.Directory]::CreateDirectory($storageRoot)
    $refused = $false
    try { Initialize-Storage } catch { $refused = $true }
    if (-not $refused) { throw 'broader-access-accepted' }
    $passed++
    $target = Join-Path $testRoot 'target'
    $link = Join-Path $testRoot 'link'
    $null = [IO.Directory]::CreateDirectory($target)
    $null = New-Item -ItemType Junction -Path $link -Target $target
    [IO.Directory]::Delete($target, $false)
    $refused = $false
    try { Assert-OrdinaryParent $link } catch { $refused = $true }
    if (-not $refused) { throw 'dangling-junction-accepted' }
    $passed++
    [pscustomobject]@{ Passed = $passed; Failed = 0; SyntheticOnly = $true }
} finally {
    # Only the three exact leaves in our fresh, UUID-scoped synthetic fixture.
    if ([IO.Path]::GetDirectoryName($testRoot) -cne $workspace -or
        [IO.Path]::GetFileName($testRoot) -notmatch '^storage-wrapper-synthetic-[a-f0-9]{32}$') { throw 'test-cleanup-bound' }
    if ($null -ne (Get-Item -LiteralPath (Join-Path $testRoot 'link') -Force -ErrorAction SilentlyContinue)) {
        [IO.Directory]::Delete((Join-Path $testRoot 'link'), $false)
    }
    foreach ($leaf in @('target', 'private-root', 'broader-root')) {
        $path = Join-Path $testRoot $leaf
        if ([IO.Directory]::Exists($path)) { [IO.Directory]::Delete($path, $false) }
    }
    [IO.Directory]::Delete($testRoot, $false)
}
