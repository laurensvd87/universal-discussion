# Fixed one-off disposition of an audited, failed private restore's PGDATA.
# SOURCE review only until a separate decision authorizes either real mode.
[CmdletBinding(PositionalBinding=$false)]
param([switch]$AuditOnly,[switch]$RetireKnownFailedPgData)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($AuditOnly.IsPresent -eq $RetireKnownFailedPgData.IsPresent){throw 'Select exactly one reviewed retirement mode'}
$Run='D:\GITProjekts\universal-discussion-bootstrap\apps\local-service\data\canonical-migration-backups\hierarchy-private-restore-runs\run-aaa554dbcf8fc863644e1aafc631b4b7446f8737e06d55a1'
$Cluster=$Run+'\cluster\nhpg-pALDNp'
$Target=$Cluster+'\pgdata'
$ProtectedRoot='D:\GITProjekts\universal-discussion-bootstrap\apps\local-service\data\canonical-migration-backups'
$AuditPath='D:\GITProjekts\universal-discussion-bootstrap\apps\local-service\data\hierarchy-private-http-actual-audit-20261027.json'
$RetirementRoot=$ProtectedRoot+'\hierarchy-private-retirements'
$PreReceipt=$RetirementRoot+'\aaa554dbcf8fc863644e1aafc631b4b7446f8737e06d55a1-preflight.json'
$DoneReceipt=$RetirementRoot+'\aaa554dbcf8fc863644e1aafc631b4b7446f8737e06d55a1-complete.json'
$OwnerSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$Clock=[Diagnostics.Stopwatch]::StartNew()
$Pins=@(
 @('run.json',397,'ec4c6fa8d5c287a43ff3c39cd67d595fa719474092c7662220dfea826077037e'),
 @('child.claim',286,'801bc0e75c15eb059471448529fe08b3b8b5190ec76e8028fed28f3026e2eab0'),
 @('reviewed-sources.json',379237,'117028cbca8710a20cd9d3a696faa896af5f4a62a3e63bcefb8300c20e283660'),
 @('output\result.json',612,'282c701ffa37dc841e6d707372f890d84b820dd92bb6558dc527d92c48e61cdb'),
 @('output\stdout.bin',0,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'),
 @('output\stderr.bin',0,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'),
 @('cluster\nhpg-pALDNp\ownership.json',346,'07d1d0b4d0588ccd7de64273dd0f625c1b9d053458f040ea5c90e3c9064458e3'))

function Refuse { throw 'Fixed private PGDATA retirement refused' }
function Check-Time { if($Clock.Elapsed.TotalSeconds -ge 360){Refuse} }
function Hash-Bytes([byte[]]$Bytes){$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function Assert-Target([string]$Value){
 if($Value -cne 'D:\GITProjekts\universal-discussion-bootstrap\apps\local-service\data\canonical-migration-backups\hierarchy-private-restore-runs\run-aaa554dbcf8fc863644e1aafc631b4b7446f8737e06d55a1\cluster\nhpg-pALDNp\pgdata' -or [IO.Path]::GetFullPath($Value) -cne $Value){Refuse}
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
 if($Value.schema -cne 'native-hierarchy-postgres-supervisor/v2' -or $Value.accepted -cne $false -or $null -ne $Value.completion -or $Value.cleanupClassification -cne 'owned-emergency' -or $Value.endPinsChecked -cne $true){Refuse}
 $n=$Value.native
 foreach($key in @('initialized','processCreated','assigned','membershipVerified','resumed','exited','emergency','allHandlesClosed','completeEmptyJob','stdoutEof','stderrEof')){if($n.$key -cne $true){Refuse}}
 if($n.closeFailure -cne $false -or $n.stdoutBytes -ne 0 -or $n.stderrBytes -ne 0 -or $n.exitCode -ne 1 -or $n.limits.flags -ne 8712 -or $n.limits.jobMemoryBytes -ne 1073741824 -or $n.limits.activeProcessLimit -ne 32){Refuse}
 if($Value.primary.code -cne 'resource-limit' -or $Value.primary.counter -cne 'jobCpuSeconds' -or $Value.primary.value -ne 300.078125){Refuse}
}
function Parse-PidMetadata([string]$Text){
 if([Text.Encoding]::UTF8.GetByteCount($Text) -gt 4096){Refuse};$lines=$Text -split '\r?\n'
 if($lines.Count -lt 4 -or $lines[0] -cne '18340' -or $lines[2] -cne '1793090791' -or $lines[3] -cne '55433' -or [IO.Path]::GetFullPath($lines[1]) -cne $Target){Refuse}
 return [ordered]@{pid=18340;pidStart=1793090791;port=55433;dataDirectory=$Target;proofDomain='PID-file cleanup ownership only; not SQL startup identity'}
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
 $audit=Read-Pinned $AuditPath 14372 '5c10b647e1e01fc84dd059ae0b45af959287f67e8cd4b646be6951a273045ca1' 1 32768
 $records=@{}
 foreach($pin in $Pins){$name=$pin[0];$links=1;if($name -in @('run.json','child.claim','output\result.json','cluster\nhpg-pALDNp\ownership.json')){$links=2}
  $records[$name]=Read-Pinned (Join-Path $Run $name) $pin[1] $pin[2] $links $(if($name -eq 'reviewed-sources.json'){1048576}else{4096})
 }
 foreach($pair in @(@('run.json','run.pending'),@('child.claim','child.pending'),@('output\result.json','output\.pending-result.json'),@('cluster\nhpg-pALDNp\ownership.json','cluster\nhpg-pALDNp\ownership.pending'))){
  $mate=File-Record (Join-Path $Run $pair[1]) 2 4096;$original=$records[$pair[0]]
  if($mate.sha256 -cne $original.sha256 -or $mate.witness.identity -cne $original.witness.identity){Refuse}
 }
 $decode=New-Object Text.UTF8Encoding($false,$true)
 $marker=$decode.GetString($records['run.json'].bytes)|ConvertFrom-Json
 $claim=$decode.GetString($records['child.claim'].bytes)|ConvertFrom-Json
 $ownership=$decode.GetString($records['cluster\nhpg-pALDNp\ownership.json'].bytes)|ConvertFrom-Json
 $parent=$decode.GetString($records['output\result.json'].bytes)|ConvertFrom-Json
 if($marker.schema -cne 'private-hierarchy-native-owned-run' -or $marker.runDirectory -cne $Run -or $marker.nonce -cne 'aaa554dbcf8fc863644e1aafc631b4b7446f8737e06d55a1' -or $marker.catalogSha256 -cne $Pins[2][2]){Refuse}
 if($claim.schema -cne 'private-hierarchy-native-child-claim' -or $claim.nonce -cne $marker.nonce -or $claim.catalogSha256 -cne $marker.catalogSha256 -or $claim.markerSha256 -cne $Pins[0][2] -or $claim.pid -ne 11320){Refuse}
 if($ownership.schema -cne 'private-native-hierarchy-postgres/maintained' -or $ownership.runDirectory -cne $Cluster -or $ownership.nonce -cne 'cae454a3a7e1d3f409272040fdd618fb5657c8bcc9243fab'){Refuse}
 Assert-ParentProof $parent
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
 $pidRecord=Read-Pinned ($Target+'\postmaster.pid') 253 '9caf83e7b60bffac3f3d965d8e78a39c9679c9228cba707eb837f237279e6b2f' 1 4096
 $pidMetadata=Parse-PidMetadata ((New-Object Text.UTF8Encoding($false,$true)).GetString($pidRecord.bytes))
 Assert-Absence $pidMetadata.pid
 $inventory=Inventory-Pgdata
 if($AuditOnly){[ordered]@{auditPassed=$true;removed=$false;target=$Target;entries=$inventory.entries;files=$inventory.files;bytes=$inventory.bytes;inventorySha256=$inventory.sha256;pid=$pidMetadata.pid;pidStart=$pidMetadata.pidStart;scope='Read-only fixed failed PGDATA disposition check, not restore proof'}|ConvertTo-Json -Compress;exit 0}
 $receipt=[ordered]@{schema='fixed-private-pgdata-retirement/preflight';target=$Target;ownerProof='audited owned-emergency/empty-Job/closed-handles plus fresh successful absence';acceptedAsRestore=$false;pid=$pidMetadata;pidFileSha256=$pidRecord.sha256;controlPins=$Pins;entries=$inventory.entries;files=$inventory.files;bytes=$inventory.bytes;inventorySha256=$inventory.sha256;inventory=$inventory.rows;deletionCompleted=$false}
 Prepare-ReceiptDirectory;$preSha=Publish-Receipt $PreReceipt $receipt
 # Rehash EVERY entry and rejoin controls, ACLs and successful absence at the
 # last boundary. This is sampled owner-private storage, not a hostile-OS sandbox.
 Assert-Ancestors;$null=Check-Controls;Assert-Absence $pidMetadata.pid
 $last=Inventory-Pgdata;if($last.sha256 -cne $inventory.sha256 -or $last.entries -ne $inventory.entries -or $last.bytes -ne $inventory.bytes){Refuse};Check-Time;Assert-Target $Target;Assert-Absence $pidMetadata.pid
 Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction Stop
 if(Test-Path -LiteralPath $Target -ErrorAction Stop){Refuse};$null=Check-Controls
 $done=[ordered]@{schema='fixed-private-pgdata-retirement/complete';target=$Target;preflightSha256=$preSha;removed=$true;retiredBytes=$inventory.bytes;acceptedAsRestore=$false;liveOrBackupDeleted=$false}
 $doneSha=Publish-Receipt $DoneReceipt $done
 [ordered]@{removed=$true;retiredBytes=$inventory.bytes;preflightSha256=$preSha;completionSha256=$doneSha;acceptedAsRestore=$false}|ConvertTo-Json -Compress
}catch{[Console]::Error.WriteLine('Fixed private PGDATA retirement refused or incomplete; retained evidence is not cleanup success.');exit 1}
