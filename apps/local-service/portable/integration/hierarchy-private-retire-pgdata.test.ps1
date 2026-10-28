# Pure/source-selected tests. NEVER invokes the script's main or real probes.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot 'hierarchy-private-retire-pgdata.ps1'
$tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if(@($errors).Count){throw 'retirement source parse failed'}
$tests=0
function Check([bool]$Value){if(-not $Value){throw 'pure retirement regression failed'}}
function Reject([scriptblock]$Work){$failed=$false;try{& $Work}catch{$failed=$true};Check $failed}
$wanted=@('Refuse','Check-Time','Assert-Target','Assert-AclRecords','Assert-Absence','Assert-ParentProof','Assert-LifecycleProof','Assert-PidFileAbsent','Hash-Bytes','Witness','Read-Pinned','Inventory-Pgdata','Prepare-ReceiptDirectory')
$functions=@($ast.FindAll({param($node)$node -is [System.Management.Automation.Language.FunctionDefinitionAst]},$true))
foreach($name in $wanted){$match=@($functions|Where-Object{$_.Name -ceq $name});Check ($match.Count -eq 1);Invoke-Expression $match[0].Extent.Text}
$OwnerSid='S-1-5-21-invented-owner'
$Clock=[pscustomobject]@{Elapsed=[pscustomobject]@{TotalSeconds=0}}
$Target='D:\GITProjekts\universal-discussion-bootstrap\apps\local-service\data\canonical-migration-backups\hierarchy-private-restore-runs\run-e43e1729dd7863897b2fc11ebed934ff7a4537c374f0253c\cluster\nhpg-3TqQ0S\pgdata'

# Managed fake only. No DllImport or actual filesystem handle is used.
Add-Type -TypeDefinition @'
namespace PrivatePgdataRetirement {
 public class Info { public uint Attributes,SizeHigh,SizeLow=3,Links=1,IndexHigh,IndexLow=5,Volume=1,WriteHigh,WriteLow=9; }
 public static class Native {
  public static uint Attributes=0,Links=1;public static bool Success=true;
  public static bool GetFileInformationByHandle(object ignored,out Info value){value=new Info();value.Attributes=Attributes;value.Links=Links;return Success;}
 }
}
'@

Assert-Target $Target
Reject {Assert-Target $Target.Replace('e43e1729dd7863897b2fc11ebed934ff7a4537c374f0253c','446b3ab1615d45d45e522f86a2c6c90c42b78ea4c3e324ca').Replace('nhpg-3TqQ0S','nhpg-DV327b')}
foreach($bad in @($Target.ToLowerInvariant(),($Target+'\x'),($Target+'\..\pgdata'),$Target.Replace('D:','C:'),$Target.Replace('nhpg-3TqQ0S','nhpg-OTHER1'),$Target.Replace('e43e1729dd7863897b2fc11ebed934ff7a4537c374f0253c','2a5d7e4541290b2bccac9edd86498e1a35f722e3e2465640'))){Reject {Assert-Target $bad}};$tests++

# Completed smartstop requires absent PID metadata, never a retained failed-run file.
$script:PidExists=$false
function Test-Path {[CmdletBinding()]param($LiteralPath) Check ($LiteralPath -ceq ($Target+'\postmaster.pid'));return $script:PidExists}
Assert-PidFileAbsent;$script:PidExists=$true;Reject {Assert-PidFileAbsent};$script:PidExists=$false;$tests++

function Rule([string]$Sid,[string]$Type='Allow',[string]$Rights='FullControl',[string]$Flags='ContainerInherit, ObjectInherit'){
 return [pscustomobject]@{IdentityReference=[pscustomobject]@{Value=$Sid};AccessControlType=$Type;FileSystemRights=$Rights;InheritanceFlags=$Flags;PropagationFlags='None'}
}
$rules=@((Rule $OwnerSid),(Rule 'S-1-5-18'));Assert-AclRecords $OwnerSid $rules $true
Assert-AclRecords $OwnerSid @((Rule $OwnerSid 'Allow' 'FullControl' 'None'),(Rule 'S-1-5-18' 'Allow' 'FullControl' 'None')) $false
Reject {Assert-AclRecords 'foreign-owner' $rules $true};Reject {Assert-AclRecords $OwnerSid @((Rule $OwnerSid),(Rule 'S-1-5-32-545')) $true}
Reject {Assert-AclRecords $OwnerSid @((Rule $OwnerSid),(Rule 'S-1-5-18' 'Deny')) $true};Reject {Assert-AclRecords $OwnerSid @((Rule $OwnerSid),(Rule $OwnerSid)) $true}
Reject {Assert-AclRecords $OwnerSid @((Rule $OwnerSid),(Rule 'S-1-5-18' 'Allow' 'Read')) $true};$tests++

$script:ProcessRows=@();$script:ListenerRows=@();$script:CimFails=$false;$script:TcpFails=$false;$script:ProbeEvents=New-Object 'Collections.Generic.List[string]'
function Get-CimInstance {[CmdletBinding()]param($ClassName,$Filter,$OperationTimeoutSec) Check ($ClassName -ceq 'Win32_Process' -and $Filter -ceq 'ProcessId=19776' -and $OperationTimeoutSec -eq 5);$script:ProbeEvents.Add('process');if($script:CimFails){throw 'invented CIM denial'};return $script:ProcessRows}
function Get-NetTCPConnection {[CmdletBinding()]param($State) Check ($State -ceq 'Listen');$script:ProbeEvents.Add('listeners');if($script:TcpFails){throw 'invented TCP denial'};return $script:ListenerRows}
Assert-Absence 19776;Check ($script:ProbeEvents.Count -eq 2)
$script:CimFails=$true;Reject {Assert-Absence 19776};$script:CimFails=$false
$script:TcpFails=$true;Reject {Assert-Absence 19776};$script:TcpFails=$false
$script:ProcessRows=@([pscustomobject]@{ProcessId=19776});Reject {Assert-Absence 19776};$script:ProcessRows=@()
$script:ListenerRows=@([pscustomobject]@{LocalPort=55433});Reject {Assert-Absence 19776};$script:ListenerRows=@([pscustomobject]@{LocalPort=55432});Assert-Absence 19776;$tests++

$Pins=@($null,$null,$null,$null,@('stdout',3134,('a'*64)),@('stderr',0,('b'*64)))
function Parent-Proof {return ([ordered]@{schema='native-hierarchy-postgres-supervisor/v2';accepted=$false;completion=@{accepted=$false;code='exit-status';testPoints=0;outerTests=0;stdoutBytes=3134;stderrBytes=0;stdoutSha256=('a'*64);stderrSha256=('b'*64)};cleanupClassification='verified-normal';endPinsChecked=$true;cleanup=$null;primary=@{code='completion';counter=$null;value=$null};native=@{initialized=$true;processCreated=$true;assigned=$true;membershipVerified=$true;resumed=$true;exited=$true;emergency=$false;allHandlesClosed=$true;completeEmptyJob=$true;stdoutEof=$true;stderrEof=$true;closeFailure=$false;stdoutBytes=3134;stderrBytes=0;exitCode=1;limits=@{flags=8712;jobMemoryBytes=2147483648;activeProcessLimit=32}}}|ConvertTo-Json -Depth 8|ConvertFrom-Json)}
Assert-ParentProof (Parent-Proof)
foreach($key in @('allHandlesClosed','completeEmptyJob','stdoutEof','stderrEof','membershipVerified')){$proof=Parent-Proof;$proof.native.$key=$false;Reject {Assert-ParentProof $proof}}
$proof=Parent-Proof;$proof.native.emergency=$true;Reject {Assert-ParentProof $proof};$proof=Parent-Proof;$proof.accepted=$true;Reject {Assert-ParentProof $proof};$proof=Parent-Proof;$proof.completion.testPoints=25;Reject {Assert-ParentProof $proof};$proof=Parent-Proof;$proof.primary=@{code='resource-limit'};Reject {Assert-ParentProof $proof};$tests++
$Cluster=$Target.Substring(0,$Target.Length-7)
function Lifecycle-Proof {return ([ordered]@{schema='native-hierarchy-postgres-lifecycle/v2';status='failed';syntheticOnly=$false;ownerData=$true;runDirectory=$Cluster;server=@{postmasterPid=19776;port=55433;ownershipVerified=$true};startup=@{pidStart=1793222728};cleanup=@{stopped=$true;childExited=$true;clientsClosed=$true;physicalSettled=$true;directoryRetained=$true;reason='verified-own-server-smart-stopped'};checks=@{status='failed';primary='RESTORE_APPLICATION_CHECKS';pendingAssertions=0;cleanup=@{status='failed';used=1;finished=$true;adminClosed=$true;failures=@();databases=@(@{name='murmingle_hierarchy_fixture_20261026_a';oid='16384';created=$true;closed=$true;dropped=$true;pending=0;sessionCleanupFailures=@()})}}}|ConvertTo-Json -Depth 8|ConvertFrom-Json)}
# Product failure is acceptable ONLY as precisely authenticated normal retirement.
Assert-LifecycleProof (Lifecycle-Proof)
$proof=Lifecycle-Proof;$proof.checks.cleanup.databases[0].dropped=$false;Reject {Assert-LifecycleProof $proof};$proof=Lifecycle-Proof;$proof.checks.cleanup.failures=@('uncertain');Reject {Assert-LifecycleProof $proof};$proof=Lifecycle-Proof;$proof.cleanup.reason='unknown';Reject {Assert-LifecycleProof $proof};$tests++
foreach($key in @('stopped','childExited','clientsClosed','physicalSettled')){$proof=Lifecycle-Proof;$proof.cleanup.$key=$false;Reject {Assert-LifecycleProof $proof}}
$proof=Lifecycle-Proof;$proof.server.postmasterPid=18340;Reject {Assert-LifecycleProof $proof};$proof=Lifecycle-Proof;$proof.startup.pidStart=1793090791;Reject {Assert-LifecycleProof $proof};$proof=Lifecycle-Proof;$proof.runDirectory+='-foreign';Reject {Assert-LifecycleProof $proof};$tests++

$w=Witness ([pscustomobject]@{}) $false;Check ($w.links -eq 1 -and $w.size -eq 3)
[PrivatePgdataRetirement.Native]::Links=2;Reject {Witness ([pscustomobject]@{}) $false};[PrivatePgdataRetirement.Native]::Links=1
[PrivatePgdataRetirement.Native]::Attributes=1024;Reject {Witness ([pscustomobject]@{}) $false};[PrivatePgdataRetirement.Native]::Attributes=16;Reject {Witness ([pscustomobject]@{}) $false};$null=Witness ([pscustomobject]@{}) $true
[PrivatePgdataRetirement.Native]::Attributes=0;[PrivatePgdataRetirement.Native]::Success=$false;Reject {Witness ([pscustomobject]@{}) $false};[PrivatePgdataRetirement.Native]::Success=$true;$tests++

$script:MockFileSize=3
function File-Record {param($Path,$Links,$MetadataCap) return [pscustomobject]@{witness=[pscustomobject]@{size=$script:MockFileSize};sha256='a'*64;bytes=[byte[]](1,2,3)}}
$null=Read-Pinned 'invented-fixed-path' 3 ('a'*64) 1 4096
Reject {Read-Pinned 'invented-fixed-path' 4 ('a'*64) 1 4096};Reject {Read-Pinned 'invented-fixed-path' 3 ('b'*64) 1 4096};$tests++

# Exercise the ACTUAL inventory traversal on a tiny invented tree, not a mirror.
$script:Graph=@{};$script:Children=@{}
function Get-Item {[CmdletBinding()]param($LiteralPath,[switch]$Force) if(-not $script:Graph.ContainsKey($LiteralPath)){throw 'invented missing entry'};return $script:Graph[$LiteralPath]}
function Get-ChildItem {[CmdletBinding()]param($LiteralPath,[switch]$Force) if($script:Children.ContainsKey($LiteralPath)){return $script:Children[$LiteralPath]};return @()}
function Assert-Acl {param($Path,$Directory) if(-not $script:Graph.ContainsKey($Path)){throw 'invented foreign ACL path'}}
function Directory-Witness {param($Path) return [ordered]@{identity=$Path;size=0;write='fixed';links=1}}
$script:Graph[$Target]=[pscustomobject]@{PSIsContainer=$true;Attributes=16}
$smallChildren=@();foreach($leaf in @('b','a')){$name=$Target+'\'+$leaf;$script:Graph[$name]=[pscustomobject]@{PSIsContainer=$false;Attributes=0};$smallChildren+=@([pscustomobject]@{FullName=$name})};$script:Children[$Target]=$smallChildren
$inventory=Inventory-Pgdata;Check ($inventory.files -eq 2 -and $inventory.bytes -eq 6 -and $inventory.entries -eq 3);Check ($inventory.rows[1].path -ceq 'a' -and $inventory.rows[2].path -ceq 'b')
$script:Graph[$Target+'\a'].Attributes=1024;Reject {Inventory-Pgdata};$script:Graph[$Target+'\a'].Attributes=0
$script:Children[$Target]=@([pscustomobject]@{FullName=$Target+'-foreign\data'});Reject {Inventory-Pgdata};$script:Children[$Target]=$smallChildren;$tests++

$largeChildren=@();foreach($number in 1..7){$name=$Target+'\'+$number;$script:Graph[$name]=[pscustomobject]@{PSIsContainer=$false;Attributes=0};$largeChildren+=@([pscustomobject]@{FullName=$name})};$script:Children[$Target]=$largeChildren;$script:MockFileSize=1073741824
Reject {Inventory-Pgdata};$script:MockFileSize=3;$tests++

# Existing protected receipt parent is reusable, never existing nonce leaves.
# These actual guard calls see ONLY mocks; no directory or file is created.
$ProtectedRoot='D:\invented-protected-backups';$RetirementRoot=$ProtectedRoot+'\hierarchy-private-retirements'
$PreReceipt=$RetirementRoot+'\e43e1729dd7863897b2fc11ebed934ff7a4537c374f0253c-preflight.json'
$DoneReceipt=$RetirementRoot+'\e43e1729dd7863897b2fc11ebed934ff7a4537c374f0253c-complete.json'
$script:ReceiptCollision=$null;$script:BadReceiptWitness=$false;$script:BadReceiptAcl=$false;$script:ReceiptEvents=New-Object 'Collections.Generic.List[string]'
function Test-Path {[CmdletBinding()]param($LiteralPath) Check ($LiteralPath -cin @($RetirementRoot,$PreReceipt,$DoneReceipt));$script:ReceiptEvents.Add('exists:'+ $LiteralPath);if($LiteralPath -ceq $RetirementRoot){return $true};return $LiteralPath -ceq $script:ReceiptCollision}
function Assert-Acl {param($Path,$Directory) Check ($Path -cin @($ProtectedRoot,$RetirementRoot));$script:ReceiptEvents.Add('acl:'+ $Path);if($script:BadReceiptAcl -and $Path -ceq $RetirementRoot){throw 'invented unsafe ACL'}}
function Directory-Witness {param($Path) Check ($Path -ceq $RetirementRoot);$script:ReceiptEvents.Add('witness');if($script:BadReceiptWitness){throw 'invented reparse/hardlink/refused directory'};return [ordered]@{identity='invented';size=0;write='fixed';links=1}}
Prepare-ReceiptDirectory;Check ($script:ReceiptEvents.Contains('exists:'+ $PreReceipt) -and $script:ReceiptEvents.Contains('exists:'+ $DoneReceipt));$tests++
foreach($collision in @($PreReceipt,$DoneReceipt)){$script:ReceiptCollision=$collision;Reject {Prepare-ReceiptDirectory}};$script:ReceiptCollision=$null
$script:BadReceiptWitness=$true;Reject {Prepare-ReceiptDirectory};$script:BadReceiptWitness=$false
$script:BadReceiptAcl=$true;Reject {Prepare-ReceiptDirectory};$script:BadReceiptAcl=$false;$tests++

# The actual script's only deletion is the reviewed fixed target, with LiteralPath.
$deletes=@($ast.FindAll({param($node)$node -is [System.Management.Automation.Language.CommandAst] -and $node.GetCommandName() -ceq 'Remove-Item'},$true))
Check ($deletes.Count -eq 1);Check ($deletes[0].Extent.Text -ceq 'Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction Stop')
$parameters=@($ast.ParamBlock.Parameters|ForEach-Object{$_.Name.VariablePath.UserPath});Check (($parameters -join ',') -ceq 'AuditOnly,RetireConsumedScratchPgData')
$text=[IO.File]::ReadAllText($source);Check ($text.IndexOf('$preSha=Publish-Receipt') -lt $deletes[0].Extent.StartOffset);Check ($text.Contains('if($AuditOnly)'));Check ($text.Contains('$PreReceipt=$RetirementRoot+'));Check ($text.IndexOf('Prepare-ReceiptDirectory;$preSha') -gt $text.IndexOf('if($AuditOnly)'))
$control=@($functions|Where-Object{$_.Name -ceq 'Check-Controls'})[0].Extent.Text
Check ($control.Contains("'output\result.json'"));Check ($control.Contains('Assert-LifecycleProof'));Check ($control.Contains('application-proof.pending.json'));Check ($text.Contains('Assert-PidFileAbsent;Assert-Absence'));Check ($control.Contains("@('output\result.json','output\.pending-result.json')"));$tests++
[ordered]@{pureTestsPassed=$tests;sourceParseErrors=0;actualAuditInvoked=$false;actualRetirementInvoked=$false;nativeCalls=$false;probes='managed fakes only'}|ConvertTo-Json -Compress
