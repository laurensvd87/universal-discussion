[CmdletBinding()]
param(
    [ValidateSet('Status', 'Caches', 'Offline', 'WaitOffline')]
    [string]$Mode = 'Status',
    [string]$ExpectedModuleSha256 = '',
    [ValidateRange(1, 240)][int]$WaitMinutes = 120
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Owner-local operator: deliberately no generic source/destination arguments.
# Never move credentials, config, SQLite state, application data or page files.
$storageRoot = 'D:\DevStorage\Laurens'
$expectedProfile = 'C:\Users\Laurens'
$moduleFile = Join-Path $PSScriptRoot 'relocate.ps1'
$receiptFile = Join-Path $storageRoot 'relocation-status.json'
$expectedSid = 'S-1-5-21-2377185244-3967894582-2721622453-1001'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if ($identity.User.Value -ne $expectedSid) { throw 'Wrong operating-system account.' }
if ([IO.Path]::GetFullPath([Environment]::GetFolderPath('UserProfile')).TrimEnd('\') -ne $expectedProfile) {
    throw 'Unexpected user profile.'
}

$entries = @(
    @{ Name = 'npm-cache'; Group = 'Caches'; Source = "$expectedProfile\AppData\Local\npm-cache"; Destination = "$storageRoot\npm-cache" },
    @{ Name = 'pip-cache'; Group = 'Caches'; Source = "$expectedProfile\AppData\Local\pip\Cache"; Destination = "$storageRoot\pip-cache" },
    @{ Name = 'uv-cache'; Group = 'Caches'; Source = "$expectedProfile\AppData\Local\uv\cache"; Destination = "$storageRoot\uv-cache" },
    @{ Name = 'codex-sessions'; Group = 'Offline'; Source = "$expectedProfile\.codex\sessions"; Destination = "$storageRoot\codex-sessions" },
    @{ Name = 'vscode-extensions'; Group = 'Offline'; Source = "$expectedProfile\.vscode\extensions"; Destination = "$storageRoot\vscode-extensions" }
)

function Get-BlockedApplications([string]$Group) {
    $processes = @(Get-Process -ErrorAction Stop)
    if ($Group -eq 'Offline') {
        return @($processes | Where-Object { $_.ProcessName -match '^(Code|codex|ChatGPT|OpenAI)' })
    }
    # Node application services do not use the package caches. Refuse any other
    # Node process rather than guess whether it is installing dependencies.
    $serviceStarts = @{ 6644 = 1791911215305L; 7444 = 1792728247792L;
        19868 = 1792387340356L; 36616 = 1792387221254L }
    return @($processes | Where-Object {
        if ($_.ProcessName -match '^(python|pip|npm|uv)') { $true }
        elseif ($_.ProcessName -eq 'node') {
            $expectedStart = $serviceStarts[[int]$_.Id]
            try {
                $actualStart = ([DateTimeOffset]$_.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()
                $null -eq $expectedStart -or $actualStart -ne $expectedStart
            } catch { $true }
        } else { $false }
    })
}

function Assert-Quiescent([string]$Group) {
    if (@(Get-BlockedApplications $Group).Count -ne 0) { throw "Applications still running: $Group" }
}

function Assert-OrdinaryParent([string]$Path) {
    $cursor = [IO.Path]::GetFullPath($Path)
    while ($cursor) {
        $info = Get-Item -LiteralPath $cursor -Force -ErrorAction SilentlyContinue
        if ($null -ne $info) {
            if (-not $info.PSIsContainer -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                throw 'Storage parent is not an ordinary directory.'
            }
        }
        $parent = [IO.Directory]::GetParent($cursor)
        if ($null -eq $parent) { break }
        $cursor = $parent.FullName
    }
}

function Initialize-Storage {
    Assert-OrdinaryParent $storageRoot
    # No inherited Everyone/Users access to private session histories on D:.
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sidText in @($expectedSid, 'S-1-5-18', 'S-1-5-32-544')) {
        $sid = New-Object Security.Principal.SecurityIdentifier($sidText)
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,
            [Security.AccessControl.FileSystemRights]::FullControl,
            ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),
            [Security.AccessControl.PropagationFlags]::None,
            [Security.AccessControl.AccessControlType]::Allow)
        $null = $acl.AddAccessRule($rule)
    }
    if ($null -eq (Get-Item -LiteralPath $storageRoot -Force -ErrorAction SilentlyContinue)) {
        $null = [IO.Directory]::CreateDirectory($storageRoot, $acl)
    }
    # Existing private roots need verification, not another Set-Acl operation
    # (which can request unrelated security-descriptor privileges on Windows).
    $actual = Get-Acl -LiteralPath $storageRoot
    $rules = @($actual.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if ($actual.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $expectedSid -or
        -not $actual.AreAccessRulesProtected -or $rules.Count -ne 3) { throw 'Unexpected storage root permissions.' }
    foreach ($sidText in @($expectedSid, 'S-1-5-18', 'S-1-5-32-544')) {
        $matches = @($rules | Where-Object { $_.IdentityReference.Value -eq $sidText })
        if ($matches.Count -ne 1 -or $matches[0].IsInherited -or
            $matches[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
            $matches[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl -or
            $matches[0].InheritanceFlags -ne ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit) -or
            $matches[0].PropagationFlags -ne [Security.AccessControl.PropagationFlags]::None) {
            throw 'Unexpected storage root permissions.'
        }
    }
}

function Read-Status {
    $rows = foreach ($entry in $entries) {
        $status = 'not-moved'
        $item = Get-Item -LiteralPath $entry.Source -Force -ErrorAction SilentlyContinue
        if ($null -ne $item) {
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                $targets = @($item.Target)
                if ($item.LinkType -eq 'Junction' -and $targets.Count -eq 1 -and
                    [IO.Path]::GetFullPath([string]$targets[0]).TrimEnd('\') -eq $entry.Destination -and
                    (Test-Path -LiteralPath $entry.Destination -PathType Container)) {
                    Assert-OrdinaryParent $entry.Destination
                    $status = 'on-D'
                }
                else { $status = 'unexpected-reparse-point' }
            }
        } else { $status = 'source-absent' }
        [pscustomobject]@{ Name = $entry.Name; Status = $status; Source = $entry.Source; Destination = $entry.Destination;
            OriginalCopyRemains = ($null -ne (Get-Item -LiteralPath ($entry.Source + '.relocation-original-20261023') -Force -ErrorAction SilentlyContinue)) }
    }
    [pscustomobject]@{
        Utc = [DateTime]::UtcNow.ToString('o')
        CFreeBytes = ([IO.DriveInfo]::new('C:\')).AvailableFreeSpace
        DFreeBytes = ([IO.DriveInfo]::new('D:\')).AvailableFreeSpace
        Entries = @($rows)
        OfflineBlockerCount = @(Get-BlockedApplications 'Offline').Count
        CacheBlockerCount = @(Get-BlockedApplications 'Caches').Count
        PageFileChanged = $false
    }
}

if ($Mode -eq 'Status') { Read-Status | ConvertTo-Json -Depth 6; exit 0 }
if ($ExpectedModuleSha256 -notmatch '^[a-fA-F0-9]{64}$' -or
    (Get-FileHash -LiteralPath $moduleFile -Algorithm SHA256).Hash -ne $ExpectedModuleSha256) {
    throw 'Reviewed relocation module hash required.'
}
. $moduleFile
$mutex = New-Object Threading.Mutex($false, 'Local\MurmingleDevelopmentStorageRelocation20261023')
if (-not $mutex.WaitOne(0)) { $mutex.Dispose(); throw 'Another relocation is running.' }
$phase = 'initialize'
try {
    Initialize-Storage
    if ($Mode -eq 'WaitOffline') {
        $phase = 'wait-setup'
        $deadline = [DateTime]::UtcNow.AddMinutes($WaitMinutes)
        [pscustomobject]@{ State = 'waiting-for-development-apps-to-close'; DeadlineUtc = $deadline.ToString('o') } |
            ConvertTo-Json | Set-Content -LiteralPath $receiptFile -Encoding UTF8
        while (@(Get-BlockedApplications 'Offline').Count -gt 0) {
            if ([DateTime]::UtcNow -ge $deadline) { throw 'Offline relocation expired; no applications were stopped.' }
            Start-Sleep -Seconds 5
        }
        Start-Sleep -Seconds 10
        Assert-Quiescent 'Offline'
        $Mode = 'Offline'
    }
    $phase = 'quiescence'
    Assert-Quiescent $Mode
    $results = @()
    foreach ($entry in @($entries | Where-Object { $_.Group -eq $Mode })) {
        Assert-Quiescent $Mode
        $prior = @(Read-Status).Entries | Where-Object { $_.Name -eq $entry.Name }
        if ($prior.Status -eq 'on-D') { $results += [pscustomobject]@{ Name = $entry.Name; Status = 'already-on-D' }; continue }
        if ($prior.Status -eq 'source-absent') { $results += [pscustomobject]@{ Name = $entry.Name; Status = 'source-absent' }; continue }
        if ($prior.Status -ne 'not-moved') { throw 'Unexpected source state.' }
        if (([IO.DriveInfo]::new('D:\')).AvailableFreeSpace -lt 6GB) { throw 'Insufficient reserve on D:.' }
        $group = $Mode
        $guard = { Assert-Quiescent $group }.GetNewClosure()
        $phase = 'relocation'
        $result = Move-VerifiedDirectoryToJunction -Source $entry.Source -Destination $entry.Destination `
            -AllowedSourceParent ([IO.Directory]::GetParent($entry.Source).FullName) `
            -AllowedDestinationParent $storageRoot -ApplicationsClosed -BeforeSwitch $guard
        $results += [pscustomobject]@{ Name = $entry.Name; Result = $result }
        [pscustomobject]@{ State = 'progress'; Results = $results; Storage = (Read-Status) } |
            ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $receiptFile -Encoding UTF8
        if (-not $result.Verified -or -not $result.CleanupComplete) {
            throw 'Verified relocation requires manual review of retained original copy.'
        }
    }
    [pscustomobject]@{ State = 'complete'; Group = $Mode; Results = $results; Storage = (Read-Status) } |
        ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $receiptFile -Encoding UTF8
    Get-Content -LiteralPath $receiptFile -Encoding UTF8
} catch {
    # Never emit a raw exception that may contain a private session filename.
    [pscustomobject]@{ State = 'stopped-safely'; Group = $Mode; Phase = $phase;
        ExceptionType = $_.Exception.GetType().FullName;
        FailureCategory = [string]$_.CategoryInfo.Category; Storage = (Read-Status) } |
        ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptFile -Encoding UTF8
    Write-Error 'Relocation stopped; original paths and retained copies require status review.'
    exit 1
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
