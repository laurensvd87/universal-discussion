# Dot-source only. Uses the unchanged reviewed relocation manifest/path helpers.
function Initialize-VerifiedHandleDeletion {
    if ('MurmingleStorageCleanup.Native' -as [type]) { return }
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace MurmingleStorageCleanup {
    public static class Native {
        [StructLayout(LayoutKind.Sequential, Pack = 1)]
        private struct Disposition { public byte DeleteFile; }
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetFileInformationByHandle(
            SafeFileHandle file, int kind, ref Disposition disposition, uint length);
        public static void DeleteOpenedFile(SafeFileHandle file) {
            var disposition = new Disposition { DeleteFile = 1 };
            if (!SetFileInformationByHandle(file, 4, ref disposition, 1))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "verified-handle-delete-failed");
        }
    }
}
'@
}

function Get-CleanupStreamHash([IO.Stream]$Stream) {
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $Stream.Position = 0; return [BitConverter]::ToString($hash.ComputeHash($Stream)).Replace('-', '') }
    finally { $hash.Dispose() }
}

function Assert-CleanupOrdinaryFile([string]$Path) {
    $null = Assert-RelocationPath ([IO.Path]::GetDirectoryName($Path))
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'cleanup-not-ordinary-file' }
    Get-Item -LiteralPath $Path -Stream '*' -ErrorAction Stop | ForEach-Object {
        if ($_.Stream -ne ':$DATA') { throw 'cleanup-stream-refused' }
    }
    return $item
}

function Remove-VerifiedRelocationOriginal {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Original,
        [Parameter(Mandatory)][string]$Destination,
        [Parameter(Mandatory)][string]$AllowedOriginalParent,
        [Parameter(Mandatory)][string]$AllowedDestinationParent,
        [switch]$Apply
    )
    $ErrorActionPreference = 'Stop'
    $null = Assert-RelocationPath $AllowedOriginalParent
    $null = Assert-RelocationPath $AllowedDestinationParent
    $null = Assert-RelocationPath $Destination
    if ([IO.Path]::GetDirectoryName($Original) -cne $AllowedOriginalParent -or
        [IO.Path]::GetDirectoryName($Destination) -cne $AllowedDestinationParent) { throw 'cleanup-parent-bound' }
    $link = Get-Item -LiteralPath $Original -Force
    if ($link.LinkType -ne 'Junction' -or @($link.Target).Count -ne 1 -or
        [IO.Path]::GetFullPath([string]$link.Target[0]).TrimEnd('\') -ine $Destination) { throw 'cleanup-junction-mismatch' }
    $backup = $Original + '.relocation-original-20261023'
    if (-not (Test-RelocationEntry $backup)) {
        return [pscustomobject]@{ Complete = $true; AlreadyComplete = $true; RemovedFiles = 0; RetainedFiles = 0; RemovedBytes = 0L }
    }
    $null = Assert-RelocationPath $backup
    $manifest = Get-RelocationManifest $backup
    if ($Apply) { Initialize-VerifiedHandleDeletion }
    $removed = 0; $retained = 0; $verified = 0; $removedBytes = 0L
    foreach ($row in @($manifest | Where-Object { -not $_.Directory })) {
        $oldPath = $backup + $row.Relative
        $newPath = $Destination + $row.Relative
        $oldStream = $null; $newStream = $null
        $changedReadOnly = $false; $deleteMarked = $false
        try {
            $null = Assert-CleanupOrdinaryFile $oldPath
            $null = Assert-CleanupOrdinaryFile $newPath
            # D is live: prevent writers/deletion for this one comparison, or retain
            # the old copy if existing access cannot be safely shared.
            $newStream = [IO.FileStream]::new($newPath, [IO.FileMode]::Open,
                [IO.FileAccess]::Read, [IO.FileShare]::Read, 65536, [IO.FileOptions]::SequentialScan)
            if ($Apply) {
                # DELETE access + no FILE_SHARE_DELETE binds cleanup to this exact
                # original object. Never delete a path re-opened after verification.
                $rights = [Security.AccessControl.FileSystemRights]::Read -bor
                    [Security.AccessControl.FileSystemRights]::WriteAttributes -bor
                    [Security.AccessControl.FileSystemRights]::Delete
                $oldStream = [IO.FileStream]::new($oldPath, [IO.FileMode]::Open, $rights,
                    [IO.FileShare]::Read, 65536, [IO.FileOptions]::None)
            } else {
                $oldStream = [IO.File]::Open($oldPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
            }
            $oldItem = Get-Item -LiteralPath $oldPath -Force
            $newItem = Get-Item -LiteralPath $newPath -Force
            foreach ($item in @($oldItem, $newItem)) {
                if ($item.Length -ne $row.Length -or $item.LastWriteTimeUtc.Ticks -ne $row.Ticks -or
                    [int]$item.Attributes -ne $row.Attributes -or
                    (Get-RelocationDacl $item.FullName) -cne $row.Dacl) { throw 'cleanup-metadata-differs' }
            }
            if ($oldStream.Length -ne $row.Length -or $newStream.Length -ne $row.Length -or
                (Get-CleanupStreamHash $oldStream) -cne $row.Hash -or
                (Get-CleanupStreamHash $newStream) -cne $row.Hash) { throw 'cleanup-content-differs' }
            $verified++
            if ($Apply) {
                if (($row.Attributes -band [int][IO.FileAttributes]::ReadOnly) -ne 0) {
                    [IO.File]::SetAttributes($oldPath, [IO.FileAttributes]($row.Attributes -band (-bnot [int][IO.FileAttributes]::ReadOnly)))
                    $changedReadOnly = $true
                }
                [MurmingleStorageCleanup.Native]::DeleteOpenedFile($oldStream.SafeFileHandle)
                $deleteMarked = $true
            }
        } catch { $retained++ }
        finally {
            if ($changedReadOnly -and -not $deleteMarked) {
                # The open original handle still denies rename/replacement.
                try { [IO.File]::SetAttributes($oldPath, [IO.FileAttributes]$row.Attributes) } catch { }
            }
            if ($oldStream) { $oldStream.Dispose() }
            if ($newStream) { $newStream.Dispose() }
        }
        if ($deleteMarked) { $removed++; $removedBytes += $row.Length }
    }
    if ($Apply) {
        foreach ($row in @($manifest | Where-Object Directory | Sort-Object { $_.Relative.Length } -Descending)) {
            $directory = $backup + $row.Relative
            try {
                $null = Assert-RelocationPath $directory
                [IO.Directory]::Delete($directory, $false)
            } catch { } # New or retained content always prevents removal.
        }
    }
    return [pscustomobject]@{
        Complete = ($Apply -and -not (Test-RelocationEntry $backup))
        VerificationOnly = (-not $Apply)
        VerifiedFiles = $verified; RemovedFiles = $removed; RetainedFiles = $retained
        RemovedBytes = $removedBytes; OriginalFiles = @($manifest | Where-Object { -not $_.Directory }).Count
    }
}
