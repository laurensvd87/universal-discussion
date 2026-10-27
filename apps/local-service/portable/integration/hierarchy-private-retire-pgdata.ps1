# Fixed one-off disposition of an audited, completed private HTTP scratch cluster's PGDATA.
# SOURCE review only until a separate decision authorizes either real mode.
[CmdletBinding(PositionalBinding=$false)]
param([switch]$AuditOnly,[switch]$RetireConsumedScratchPgData)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($AuditOnly.IsPresent -eq $RetireConsumedScratchPgData.IsPresent){throw 'Select exactly one reviewed retirement mode'}
$Run='D:\GITProjekts\universal-discussion-bootstrap\apps\local-service\data\canonical-migration-backups\hierarchy-private-restore-runs\run-446b3ab1615d45d45e522f86a2c6c90c42b78ea4c3e324ca'
$Cluster=$Run+'\cluster\nhpg-DV327b'
$Target=$Cluster+'\pgdata'
$ProtectedRoot='D:\GITProjekts\universal-discussion-bootstrap\apps\local-service\data\canonical-migration-backups'
$AuditPath='D:\GITProjekts\universal-discussion-bootstrap\apps\local-service\data\hierarchy-private-http-storage-corrected-actual-audit-20261027.json'
$RetirementRoot=$ProtectedRoot+'\hierarchy-private-retirements'
$PreReceipt=$RetirementRoot+'\446b3ab1615d45d45e522f86a2c6c90c42b78ea4c3e324ca-preflight.json'
$DoneReceipt=$RetirementRoot+'\446b3ab1615d45d45e522f86a2c6c90c42b78ea4c3e324ca-complete.json'
$OwnerSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$Clock=[Diagnostics.Stopwatch]::StartNew()
$Pins=@(
 @('run.json',397,'8bdebf01452dd93bd7c0b7cb08b34b0e2dec383e4138a29ed1b831053de4cb50'),
 @('child.claim',286,'45fd3a6b8d5a6ec08897b39e0056d64741b47f94d9d4bf3a60af3eedad31d4e8'),
 @('reviewed-sources.json',379238,'ced9a517bb4d0aa9188cae325ec82e3148936224ca20cc88b46855d85d589361'),
 @('output\result.json',862,'e3eb3e3e83dbc0a4cd1eb93ae829b24efcd2629c02652c0e5eeb43588f005c29'),
 @('output\stdout.bin',3226,'bf838c4bbf14abb4190f52d0b2fd5963f5ac813cdcb8ceb5c551458f90f26291'),
 @('output\stderr.bin',0,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'),
 @('cluster\nhpg-DV327b\ownership.json',346,'4903cf613589b5cd0abcc130b25badedb697968f1f718793e2dd1059a55f6c8a'))

function Refuse { throw 'Fixed private PGDATA retirement refused' }
function Check-Time { if($Clock.Elapsed.TotalSeconds -ge 360){Refuse} }
function Hash-Bytes([byte[]]$Bytes){$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function Assert-Target([string]$Value){
 if($Value -cne 'D:\GITProjekts\universal-discussion-bootstrap\apps\local-service\data\canonical-migration-backups\hierarchy-private-restore-runs\run-446b3ab1615d45d45e522f86a2c6c90c42b78ea4c3e324ca\cluster\nhpg-DV327b\pgdata' -or [IO.Path]::GetFullPath($Value) -cne $Value){Refuse}
}
function Assert-AclRecords([string]$ActualOwner,[object[]]$Rules,[bool]$Directory){
 if($ActualOwner -cne $OwnerSid -or $Rules.Count -ne 2){Refuse};$seen=@{}
 foreach($r in $Rules){$sid=$r.IdentityReference.Value
  if(($sid -cne $OwnerSid -and $sid -cne 'S-1-5-18') -or $seen.ContainsKey($sid) -or $r.AccessControlType.ToString() -cne 'Allow' -or $r.FileSystemRights.ToString() -cne 'FullControl' -or $r.PropagationFlags.ToString() -cne 'None'){Refuse}
  if($Directory -and $r.InheritanceFlags.ToString() -cne 'ContainerInherit, ObjectInherit'){Refuse}
  if(-not $Directory -and $r.InheritanceFlags.ToString() -cne 'None'){Refuse};$seen[$sid]=$true
 }
}
function Assert-Acl([string]$Path,[bool]$Directory){
 $acl=Get-Acl -LiteralPath $Path -ErrorAction Stop
 Assert-AclRecords $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) $Directory
}
function Assert-Absence([uint32]$PostmasterPid){
 Check-Time
 # A failed query is never interpreted as absence. Query all listeners because
 # -LocalPort on an absent port can itself return an ObjectNotFound error.
 $processes=@(Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId='+$PostmasterPid) -OperationTimeoutSec 5 -ErrorAction Stop)
 if($processes.Count -ne 0){Refuse}
 $listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop)
 if($listeners.Count -gt 65536){Refuse}
 foreach($listener in $listeners){if($listener.LocalPort -eq 55433){Refuse}}
 Check-Time
}
function Assert-ParentProof($Value){
 if($Value.schema -cne 'native-hierarchy-postgres-supervisor/v2' -or $Value.accepted -cne $true -or $Value.cleanupClassification -cne 'verified-normal' -or $Value.endPinsChecked -cne $true -or $null -ne $Value.primary -or $null -ne $Value.cleanup){Refuse}
 $c=$Value.completion
 if($c.accepted -cne $true -or $c.code -cne 'complete' -or $c.testPoints -ne 25 -or $c.outerTests -ne 3 -or $c.stdoutBytes -ne 3226 -or $c.stderrBytes -ne 0 -or $c.stdoutSha256 -cne $Pins[4][2] -or $c.stderrSha256 -cne $Pins[5][2]){Refuse}
 $n=$Value.native
 foreach($key in @('initialized','processCreated','assigned','membershipVerified','resumed','exited','allHandlesClosed','completeEmptyJob','stdoutEof','stderrEof')){if($n.$key -cne $true){Refuse}}
 if($n.emergency -cne $false -or $n.closeFailure -cne $false -or $n.stdoutBytes -ne 3226 -or $n.stderrBytes -ne 0 -or $n.exitCode -ne 0 -or $n.limits.flags -ne 8712 -or $n.limits.jobMemoryBytes -ne 1073741824 -or $n.limits.activeProcessLimit -ne 32){Refuse}
}
function Assert-LifecycleProof($Value){
 if($Value.schema -cne 'native-hierarchy-postgres-lifecycle/v2' -or $Value.status -cne 'passed' -or $Value.syntheticOnly -cne $false -or $Value.ownerData -cne $true -or $Value.runDirectory -cne $Cluster){Refuse}
 if($Value.server.postmasterPid -ne 15412 -or $Value.server.port -ne 55433 -or $Value.server.ownershipVerified -cne $true -or $Value.startup.pidStart -ne 1793094079){Refuse}
 foreach($key in @('stopped','childExited','clientsClosed','physicalSettled','directoryRetained')){if($Value.cleanup.$key -cne $true){Refuse}}
 if($Value.cleanup.reason -cne 'verified-own-server-smart-stopped' -or $Value.checks.status -cne 'passed' -or $null -ne $Value.checks.primary -or $Value.checks.pendingAssertions -ne 0){Refuse}
}
function Assert-PidFileAbsent {
 # Normal smartstop removes this file. Never treat a surviving PID file as safe.
 if(Test-Path -LiteralPath ($Target+'\postmaster.pid') -ErrorAction Stop){Refuse}
}

# Read-only Win32 file witnesses; no filesystem mutation occurs in this ABI.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace PrivatePgdataRetirement {
 [StructLayout(LayoutKind.Sequential)] public struct Info {
  public uint Attributes,CreationLow,CreationHigh,AccessLow,AccessHigh,WriteLow,WriteHigh,Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;
 }
 public static class Native {
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern SafeFileHandle CreateFileW(string name,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetFileInformationByHandle(SafeFileHandle handle,out Info value);
 }
}
'@
function Witness($Handle,[bool]$Directory,[uint32]$Links=1){
 $value=New-Object PrivatePgdataRetirement.Info
 if(-not [PrivatePgdataRetirement.Native]::GetFileInformationByHandle($Handle,[ref]$value)){Refuse}
 if(($value.Attributes -band 1024) -ne 0 -or (($value.Attributes -band 16) -ne 0) -ne $Directory -or $value.Links -ne $Links){Refuse}
 return [ordered]@{identity=('{0:x8}:{1:x8}{2:x8}' -f $value.Volume,$value.IndexHigh,$value.IndexLow);size=([uint64]$value.SizeHigh*4294967296+[uint64]$value.SizeLow);write=('{0:x8}{1:x8}' -f $value.WriteHigh,$value.WriteLow);links=$value.Links}
}
function Directory-Witness([string]$Path){
 Check-Time;$item=Get-Item -LiteralPath $Path -Force -ErrorAction Stop
 if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){Refuse}
 $handle=[PrivatePgdataRetirement.Native]::CreateFileW($Path,128,1,[IntPtr]::Zero,3,35651584,[IntPtr]::Zero)
 try{if($handle.IsInvalid){Refuse};return Witness $handle $true}finally{$handle.Dispose()}
}
function File-Record([string]$Path,[uint32]$Links=1,[int]$MetadataCap=0){
 Check-Time;$item=Get-Item -LiteralPath $Path -Force -ErrorAction Stop
 if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){Refuse}
 $stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 try{
  $before=Witness $stream.SafeFileHandle $false $Links
  if($before.size -gt 1073741824 -or ($MetadataCap -gt 0 -and $before.size -gt $MetadataCap)){Refuse}
  $digest=[Security.Cryptography.SHA256]::Create();$buffer=New-Object byte[] 65536;$small=$null
  if($MetadataCap -gt 0){$small=New-Object IO.MemoryStream};$total=[uint64]0
  try{while(($read=$stream.Read($buffer,0,$buffer.Length)) -gt 0){Check-Time;$total+=$read;$null=$digest.TransformBlock($buffer,0,$read,$buffer,0);if($null -ne $small){$small.Write($buffer,0,$read)}}
   $null=$digest.TransformFinalBlock((New-Object byte[] 0),0,0);$sum=([BitConverter]::ToString($digest.Hash)).Replace('-','').ToLowerInvariant()
   $after=Witness $stream.SafeFileHandle $false $Links
   if(($before|ConvertTo-Json -Compress) -cne ($after|ConvertTo-Json -Compress) -or $total -ne $before.size){Refuse}
   return [pscustomobject]@{witness=$after;sha256=$sum;bytes=$(if($null -ne $small){$small.ToArray()}else{$null})}
  }finally{$digest.Dispose();if($null -ne $small){$small.Dispose()};[Array]::Clear($buffer,0,$buffer.Length)}
 }finally{$stream.Dispose()}
}
function Read-Pinned([string]$Path,[int64]$Size,[string]$Sha,[uint32]$Links=1,[int]$Cap=4096){
 $record=File-Record $Path $Links $Cap
 if($record.witness.size -ne $Size -or $record.sha256 -cne $Sha){Refuse};return $record
}
function Assert-Ancestors {
 Assert-Target $Target;$cursor=$Target
 while($true){$null=Directory-Witness $cursor
  if($cursor.StartsWith($ProtectedRoot,[StringComparison]::Ordinal)){Assert-Acl $cursor $true}
  $parent=[IO.Path]::GetDirectoryName($cursor);if([string]::IsNullOrEmpty($parent)){break};$cursor=$parent
 }
}
function Check-Controls {
 $audit=Read-Pinned $AuditPath 20698 'f5f6215c725bcdc9ed5fe09cf3adb211edfc36c287379dfa3f31fed9ba9f12f4' 1 32768
 $records=@{}
 foreach($pin in $Pins){$name=$pin[0];$links=1;if($name -in @('run.json','child.claim','output\result.json','cluster\nhpg-DV327b\ownership.json')){$links=2}
  $records[$name]=Read-Pinned (Join-Path $Run $name) $pin[1] $pin[2] $links $(if($name -eq 'reviewed-sources.json'){1048576}else{4096})
 }
 foreach($pair in @(@('run.json','run.pending'),@('child.claim','child.pending'),@('output\result.json','output\.pending-result.json'),@('cluster\nhpg-DV327b\ownership.json','cluster\nhpg-DV327b\ownership.pending'))){
  $mate=File-Record (Join-Path $Run $pair[1]) 2 4096;$original=$records[$pair[0]]
  if($mate.sha256 -cne $original.sha256 -or $mate.witness.identity -cne $original.witness.identity){Refuse}
 }
 $decode=New-Object Text.UTF8Encoding($false,$true)
 $marker=$decode.GetString($records['run.json'].bytes)|ConvertFrom-Json
 $claim=$decode.GetString($records['child.claim'].bytes)|ConvertFrom-Json
 $ownership=$decode.GetString($records['cluster\nhpg-DV327b\ownership.json'].bytes)|ConvertFrom-Json
 $parent=$decode.GetString($records['output\result.json'].bytes)|ConvertFrom-Json
 if($marker.schema -cne 'private-hierarchy-native-owned-run' -or $marker.runDirectory -cne $Run -or $marker.nonce -cne '446b3ab1615d45d45e522f86a2c6c90c42b78ea4c3e324ca' -or $marker.catalogSha256 -cne $Pins[2][2]){Refuse}
 if($claim.schema -cne 'private-hierarchy-native-child-claim' -or $claim.nonce -cne $marker.nonce -or $claim.catalogSha256 -cne $marker.catalogSha256 -or $claim.markerSha256 -cne $Pins[0][2] -or $claim.pid -ne 12840){Refuse}
 if($ownership.schema -cne 'private-native-hierarchy-postgres/maintained' -or $ownership.runDirectory -cne $Cluster -or $ownership.nonce -cne '999b6eb1a6aed90f325274963576597ffed322303703cba3'){Refuse}
 Assert-ParentProof $parent
 $life=Read-Pinned ($Cluster+'\native-result.json') 3899 'bead7a6cb32e49cc70ebc1884c6eb51c8e6b9879aba55937355db7b26f1af531' 1 4096
 Assert-LifecycleProof ($decode.GetString($life.bytes)|ConvertFrom-Json)
 return $true
}
function Inventory-Pgdata {
 $queue=New-Object 'Collections.Generic.Stack[string]';$queue.Push($Target);$rows=New-Object 'Collections.Generic.List[object]';$total=[uint64]0;$files=0
 while($queue.Count){Check-Time;$name=$queue.Pop()
  if($name -cne $Target -and -not $name.StartsWith($Target+'\',[StringComparison]::Ordinal)){Refuse}
  $relative=if($name -ceq $Target){'.'}else{$name.Substring($Target.Length+1)}
  if($relative.Length -gt 512 -or ($relative -split '\\').Count -gt 32 -or $rows.Count -ge 8192){Refuse}
  $item=Get-Item -LiteralPath $name -Force -ErrorAction Stop
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){Refuse};Assert-Acl $name $item.PSIsContainer
  if($item.PSIsContainer){$w=Directory-Witness $name;$rows.Add([ordered]@{path=$relative;kind='directory';witness=$w;sha256=$null})
   $children=@(Get-ChildItem -LiteralPath $name -Force -ErrorAction Stop);if($children.Count -gt 8192){Refuse}
   $names=[string[]]@($children|ForEach-Object{$_.FullName});[Array]::Sort($names,[StringComparer]::Ordinal);for($i=$names.Length-1;$i -ge 0;$i--){$queue.Push($names[$i])}
  }else{$r=File-Record $name;$total+=$r.witness.size;$files++;if($total -gt 6442450944){Refuse};$rows.Add([ordered]@{path=$relative;kind='file';witness=$r.witness;sha256=$r.sha256})}
 }
 $data=ConvertTo-Json -InputObject @($rows.ToArray()) -Depth 8 -Compress
 return [pscustomobject]@{entries=$rows.Count;files=$files;bytes=$total;sha256=(Hash-Bytes ([Text.Encoding]::UTF8.GetBytes($data)));rows=$rows.ToArray()}
}
function Publish-Receipt([string]$Path,$Value){
 if($Path -cne $PreReceipt -and $Path -cne $DoneReceipt){Refuse};Assert-Acl ([IO.Path]::GetDirectoryName($Path)) $true
 $bytes=[Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 12 -Compress)+"`n");if($bytes.Length -gt 4194304){Refuse}
 $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 Assert-Acl $Path $false;$r=File-Record $Path 1
 if($r.sha256 -cne (Hash-Bytes $bytes)){Refuse};return $r.sha256
}
function Prepare-ReceiptDirectory {
 # Actual mode only; never add files to the original consumed run/output.
 Assert-Acl $ProtectedRoot $true
 $existing=Test-Path -LiteralPath $RetirementRoot -ErrorAction Stop
 if($existing){$null=Directory-Witness $RetirementRoot;Assert-Acl $RetirementRoot $true}
 foreach($leaf in @($PreReceipt,$DoneReceipt)){if(Test-Path -LiteralPath $leaf -ErrorAction Stop){Refuse}}
 if(-not $existing){$null=[IO.Directory]::CreateDirectory($RetirementRoot)}
 $null=Directory-Witness $RetirementRoot;Assert-Acl $RetirementRoot $true
}

try {
 Assert-Ancestors;$null=Check-Controls
 Assert-PidFileAbsent
 $pidMetadata=[ordered]@{pid=15412;pidStart=1793094079;port=55433;dataDirectory=$Target;proofDomain='Authenticated completed lifecycle cleanup identity; PID file absent'}
 Assert-Absence $pidMetadata.pid
 $inventory=Inventory-Pgdata
 if($AuditOnly){[ordered]@{auditPassed=$true;removed=$false;target=$Target;entries=$inventory.entries;files=$inventory.files;bytes=$inventory.bytes;inventorySha256=$inventory.sha256;pid=$pidMetadata.pid;pidStart=$pidMetadata.pidStart;scope='Read-only fixed consumed scratch PGDATA disposition check; no new restore proof'}|ConvertTo-Json -Compress;exit 0}
 $receipt=[ordered]@{schema='fixed-private-pgdata-retirement/preflight';target=$Target;ownerProof='audited normal smartstop/empty-Job/closed-handles plus fresh successful absence';acceptedAsRestore=$false;pid=$pidMetadata;pidFileAbsent=$true;controlPins=$Pins;entries=$inventory.entries;files=$inventory.files;bytes=$inventory.bytes;inventorySha256=$inventory.sha256;inventory=$inventory.rows;deletionCompleted=$false}
 Prepare-ReceiptDirectory;$preSha=Publish-Receipt $PreReceipt $receipt
 # Rehash EVERY entry and rejoin controls, ACLs and successful absence at the
 # last boundary. This is sampled owner-private storage, not a hostile-OS sandbox.
 Assert-Ancestors;$null=Check-Controls;Assert-PidFileAbsent;Assert-Absence $pidMetadata.pid
 $last=Inventory-Pgdata;if($last.sha256 -cne $inventory.sha256 -or $last.entries -ne $inventory.entries -or $last.bytes -ne $inventory.bytes){Refuse};Check-Time;Assert-Target $Target;Assert-PidFileAbsent;Assert-Absence $pidMetadata.pid
 Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction Stop
 if(Test-Path -LiteralPath $Target -ErrorAction Stop){Refuse};$null=Check-Controls
 $done=[ordered]@{schema='fixed-private-pgdata-retirement/complete';target=$Target;preflightSha256=$preSha;removed=$true;retiredBytes=$inventory.bytes;acceptedAsRestore=$false;liveOrBackupDeleted=$false}
 $doneSha=Publish-Receipt $DoneReceipt $done
 [ordered]@{removed=$true;retiredBytes=$inventory.bytes;preflightSha256=$preSha;completionSha256=$doneSha;acceptedAsRestore=$false}|ConvertTo-Json -Compress
}catch{[Console]::Error.WriteLine('Fixed private PGDATA retirement refused or incomplete; retained evidence is not cleanup success.');exit 1}
