# Windows PowerShell 5.1. Dot-sourcing defines functions only; no migration runs.
# Caller must keep all writers closed throughout. This is not a concurrent filesystem sandbox.
function Test-RelocationEntry {
    param([string]$Path)
    return ($null -ne (Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue))
}

function Assert-RelocationPath {
    param([string]$Path, [switch]$AllowMissing)
    if ($Path -notmatch '^[A-Za-z]:\\' -or $Path.Contains('/') -or $Path.Substring(2).Contains(':')) { throw 'path-format' }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($full -cne $Path -or $full.Length -le 3) { throw 'path-canonical' }
    $cursor = $full
    $first = $true
    while ($cursor) {
        if (Test-RelocationEntry $cursor) {
            $a = [IO.File]::GetAttributes($cursor)
            if (($a -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or ($a -band [IO.FileAttributes]::Directory) -eq 0) { throw 'path-not-ordinary-directory' }
        } elseif (-not ($first -and $AllowMissing)) { throw 'path-missing' }
        $first = $false
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    return $full
}

function Get-RelocationDacl {
    param([string]$Path)
    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    # Materialize inherited ACEs before copying across volumes/parents. No D: inheritance.
    $acl.SetAccessRuleProtection($true, $true)
    $sddl = $acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
    # Auto-inheritance bookkeeping can change at creation although ACEs and protection
    # are identical. Compare the protected DACL and every ACE, excluding only that flag.
    $raw = [Security.AccessControl.RawSecurityDescriptor]::new($sddl)
    $flags = [int]$raw.ControlFlags -band (-bnot ([int][Security.AccessControl.ControlFlags]::DiscretionaryAclAutoInherited -bor [int][Security.AccessControl.ControlFlags]::DiscretionaryAclAutoInheritRequired))
    $raw.SetFlags([Security.AccessControl.ControlFlags]$flags)
    return $raw.GetSddlForm([Security.AccessControl.AccessControlSections]::Access)
}

function Get-RelocationManifest {
    param([string]$Root)
    $null = Assert-RelocationPath $Root
    $rows = New-Object 'Collections.Generic.List[object]'
    $pending = New-Object 'Collections.Generic.Stack[string]'
    $pending.Push($Root)
    [long]$bytes = 0
    while ($pending.Count) {
        $path = $pending.Pop()
        $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'tree-reparse' }
        if (($item.Attributes -band ([IO.FileAttributes]::Encrypted -bor [IO.FileAttributes]::SparseFile -bor [IO.FileAttributes]::Compressed -bor [IO.FileAttributes]::Offline)) -ne 0) { throw 'unsupported-storage-attributes' }
        # No silent loss of alternate streams, including on directories. Refuse rather
        # than copy private stream data through an unverified secondary path.
        Get-Item -LiteralPath $path -Stream '*' -ErrorAction Stop | ForEach-Object {
            if ($_.Stream -ne ':$DATA') { throw 'alternate-data-stream' }
        }
        if ($rows.Count -ge 100000) { throw 'entry-cap' }
        $relative = $path.Substring($Root.Length)
        $directory = $item.PSIsContainer
        $length = 0L
        $hash = $null
        if ($directory) {
            # Enumerate lazily and bound outstanding paths as well as processed rows.
            foreach ($child in [IO.Directory]::EnumerateFileSystemEntries($path)) {
                if (($pending.Count + $rows.Count) -ge 100000) { throw 'entry-cap' }
                $pending.Push($child)
            }
        } else {
            $length = $item.Length
            $bytes += $length
            if ($bytes -gt 16GB) { throw 'byte-cap' }
            $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256 -ErrorAction Stop).Hash
            $item.Refresh()
            if ($length -ne $item.Length) { throw 'source-changing' }
        }
        $rows.Add([pscustomobject]@{ Relative=$relative; Directory=[bool]$directory; Length=$length; Hash=$hash; Ticks=$item.LastWriteTimeUtc.Ticks; Attributes=[int]$item.Attributes; Dacl=(Get-RelocationDacl $path) })
    }
    return ,@($rows | Sort-Object Relative)
}

function Assert-RelocationManifestEqual {
    param([object[]]$Expected, [object[]]$Actual)
    if ($Expected.Count -ne $Actual.Count) { throw 'manifest-count' }
    for ($i=0; $i -lt $Expected.Count; $i++) {
        foreach ($key in @('Relative','Directory','Length','Hash','Ticks','Attributes','Dacl')) {
            if ($Expected[$i].$key -cne $Actual[$i].$key) { throw ('manifest-mismatch-' + $key) }
        }
    }
}

function New-RelocationJunction {
    param([string]$Path, [string]$Target)
    $null = New-Item -ItemType Junction -Path $Path -Target $Target -ErrorAction Stop
}

function Move-VerifiedDirectoryToJunction {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Source,
        [Parameter(Mandatory)][string]$Destination,
        [Parameter(Mandatory)][string]$AllowedSourceParent,
        [Parameter(Mandatory)][string]$AllowedDestinationParent,
        [Parameter(Mandatory)][switch]$ApplicationsClosed,
        [scriptblock]$BeforeSwitch
    )
    if (-not $ApplicationsClosed) { throw 'applications-must-be-closed' }
    $ErrorActionPreference = 'Stop'
    $null = Assert-RelocationPath $AllowedSourceParent
    $null = Assert-RelocationPath $AllowedDestinationParent
    $null = Assert-RelocationPath $Source
    $null = Assert-RelocationPath $Destination -AllowMissing
    # Exact immediate parent scopes, not wildcard prefixes or arbitrary descendants.
    if ([IO.Path]::GetDirectoryName($Source) -ine $AllowedSourceParent -or [IO.Path]::GetDirectoryName($Destination) -ine $AllowedDestinationParent) { throw 'parent-bound' }
    if ($Source -ieq $Destination -or $Destination.StartsWith($Source+'\',[StringComparison]::OrdinalIgnoreCase) -or $Source.StartsWith($Destination+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'overlapping-paths' }
    $staging = $Source + '.relocation-original-20261023'
    if (Test-RelocationEntry $Destination) { throw 'destination-occupied' }
    if (Test-RelocationEntry $staging) { throw 'staging-occupied' }
    $before = Get-RelocationManifest $Source
    [long]$copyBytes = ($before | Measure-Object Length -Sum).Sum
    $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($Destination))
    if ($drive.AvailableFreeSpace -lt ($copyBytes + 4GB)) { throw 'destination-reserve' }
    $rootRow = @($before | Where-Object Relative -eq '')[0]
    $security = New-Object Security.AccessControl.DirectorySecurity
    $security.SetSecurityDescriptorSddlForm($rootRow.Dacl, [Security.AccessControl.AccessControlSections]::Access)
    # Atomic restrictive DACL at directory creation, before any private files are copied.
    $null = [IO.Directory]::CreateDirectory($Destination, $security)
    foreach ($row in @($before | Where-Object Directory | Sort-Object { $_.Relative.Length })) {
        $target = $Destination + $row.Relative
        if ($row.Relative) {
            $security = New-Object Security.AccessControl.DirectorySecurity
            $security.SetSecurityDescriptorSddlForm($row.Dacl, [Security.AccessControl.AccessControlSections]::Access)
            $null = [IO.Directory]::CreateDirectory($target, $security)
        }
    }
    foreach ($row in @($before | Where-Object { -not $_.Directory })) {
        $target = $Destination + $row.Relative
        $security = New-Object Security.AccessControl.FileSecurity
        $security.SetSecurityDescriptorSddlForm($row.Dacl, [Security.AccessControl.AccessControlSections]::Access)
        $inputStream = $null
        $outputStream = $null
        try {
            $inputStream = [IO.File]::Open($Source + $row.Relative, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
            $outputStream = [IO.FileStream]::new($target, [IO.FileMode]::CreateNew, [Security.AccessControl.FileSystemRights]::Write, [IO.FileShare]::None, 65536, [IO.FileOptions]::None, $security)
            $buffer = New-Object byte[] 65536
            [long]$remaining = $row.Length
            while ($remaining -gt 0) {
                $read = $inputStream.Read($buffer, 0, [int][Math]::Min($remaining, $buffer.Length))
                if ($read -eq 0) { throw 'copy-source-shortened' }
                $outputStream.Write($buffer, 0, $read)
                $remaining -= $read
            }
            if ($inputStream.ReadByte() -ne -1) { throw 'copy-source-grew' }
        } finally {
            if ($outputStream) { $outputStream.Dispose() }
            if ($inputStream) { $inputStream.Dispose() }
        }
        [IO.File]::SetLastWriteTimeUtc($target, [DateTime]::new($row.Ticks, [DateTimeKind]::Utc))
        [IO.File]::SetAttributes($target, [IO.FileAttributes]$row.Attributes)
    }
    foreach ($row in @($before | Where-Object Directory | Sort-Object { $_.Relative.Length } -Descending)) {
        [IO.Directory]::SetLastWriteTimeUtc($Destination + $row.Relative, [DateTime]::new($row.Ticks, [DateTimeKind]::Utc))
        [IO.File]::SetAttributes($Destination + $row.Relative, [IO.FileAttributes]$row.Attributes)
    }
    Assert-RelocationManifestEqual $before (Get-RelocationManifest $Destination)
    Assert-RelocationManifestEqual $before (Get-RelocationManifest $Source)
    $null = Assert-RelocationPath $Source
    $null = Assert-RelocationPath $Destination
    if (Test-RelocationEntry $staging) { throw 'staging-occupied' }
    if ($BeforeSwitch) { $null = & $BeforeSwitch }
    # Recheck after the caller's final host/process fence as well.
    Assert-RelocationManifestEqual $before (Get-RelocationManifest $Source)
    Assert-RelocationManifestEqual $before (Get-RelocationManifest $Destination)
    if ($BeforeSwitch) { $null = & $BeforeSwitch }
    [IO.Directory]::Move($Source, $staging)
    try {
        New-RelocationJunction $Source $Destination
        $junction = Get-Item -LiteralPath $Source -Force
        if ($junction.LinkType -ne 'Junction' -or @($junction.Target).Count -ne 1 -or $junction.Target[0] -ine $Destination) { throw 'junction-verification' }
        Assert-RelocationManifestEqual $before (Get-RelocationManifest $Destination)
        Assert-RelocationManifestEqual $before (Get-RelocationManifest $staging)
    } catch {
        # Remove only the link itself. Never recursively delete the original or target.
        if (Test-RelocationEntry $Source) {
            $link = Get-Item -LiteralPath $Source -Force
            if ($link.LinkType -eq 'Junction' -and $link.Target[0] -ieq $Destination) { [IO.Directory]::Delete($Source, $false) }
        }
        if (-not (Test-RelocationEntry $Source)) { [IO.Directory]::Move($staging, $Source) }
        throw 'switch-failed-original-retained'
    }
    $removed = 0
    $cleanupComplete = $false
    try {
        # Frozen exact snapshot only; no recursive deletion, no directory rediscovery.
        foreach ($row in @($before | Where-Object { -not $_.Directory })) {
            $path = $staging + $row.Relative
            $null = Assert-RelocationPath ([IO.Path]::GetDirectoryName($path))
            $item = Get-Item -LiteralPath $path -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.Length -ne $row.Length -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -cne $row.Hash -or $item.LastWriteTimeUtc.Ticks -ne $row.Ticks) { throw 'cleanup-changed' }
            [IO.File]::Delete($path)
            $removed++
        }
        foreach ($row in @($before | Where-Object Directory | Sort-Object { $_.Relative.Length } -Descending)) {
            $path = $staging + $row.Relative
            $null = Assert-RelocationPath $path
            [IO.Directory]::Delete($path, $false)
            $removed++
        }
        $cleanupComplete = $true
    } catch { $cleanupComplete = $false }
    [pscustomobject]@{ Status=$(if ($cleanupComplete) {'Relocated'} else {'RelocatedOriginalCleanupIncomplete'}); Entries=$before.Count; Files=@($before | Where-Object { -not $_.Directory }).Count; Bytes=($before | Measure-Object Length -Sum).Sum; RemovedEntries=$removed; Verified=$true; CleanupComplete=$cleanupComplete }
}
