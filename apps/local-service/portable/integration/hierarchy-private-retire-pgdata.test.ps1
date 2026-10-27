# Pure/source-selected tests. NEVER invokes the script's main or real probes.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot 'hierarchy-private-retire-pgdata.ps1'
$tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if(@($errors).Count){throw 'retirement source parse failed'}
$tests=0
function Check([bool]$Value){if(-not $Value){throw 'pure retirement regression failed'}}
function Reject([scriptblock]$Work){$failed=$false;try{& $Work}catch{$failed=$true};Check $failed}
$wanted=@('Refuse','Check-Time','Assert-Target','Assert-AclRecords','Assert-Absence','Assert-ParentProof','Parse-PidMetadata','Hash-Bytes','Witness','Read-Pinned','Inventory-Pgdata')
$functions=@($ast.FindAll({param($node)$node -is [System.Management.Automation.Language.FunctionDefinitionAst]},$true))
foreach($name in $wanted){$match=@($functions|Where-Object{$_.Name -ceq $name});Check ($match.Count -eq 1);Invoke-Expression $match[0].Extent.Text}
$OwnerSid='S-1-5-21-invented-owner'
$Clock=[pscustomobject]@{Elapsed=[pscustomobject]@{TotalSeconds=0}}
$Target='D:\GITProjekts\universal-discussion-bootstrap\apps\local-service\data\canonical-migration-backups\hierarchy-private-restore-runs\run-2a5d7e4541290b2bccac9edd86498e1a35f722e3e2465640\cluster\nhpg-EDfH2R\pgdata'

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
foreach($bad in @($Target.ToLowerInvariant(),($Target+'\x'),($Target+'\..\pgdata'),$Target.Replace('D:','C:'),$Target.Replace('nhpg-EDfH2R','nhpg-OTHER1'))){Reject {Assert-Target $bad}};$tests++

$validPid="32820`n$($Target.Replace('\','/'))`n1793083187`n55433`n"
$p=Parse-PidMetadata $validPid;Check ($p.pid -eq 32820 -and $p.pidStart -eq 1793083187 -and $p.port -eq 55433)
foreach($bad in @($validPid.Replace('32820','032820'),$validPid.Replace('1793083187','1793083188'),$validPid.Replace('55433','55432'),$validPid.Replace('nhpg-EDfH2R','nhpg-OTHER1'),('x'*4097))){Reject {Parse-PidMetadata $bad}};$tests++

function Rule([string]$Sid,[string]$Type='Allow',[string]$Rights='FullControl',[string]$Flags='ContainerInherit, ObjectInherit'){
 return [pscustomobject]@{IdentityReference=[pscustomobject]@{Value=$Sid};AccessControlType=$Type;FileSystemRights=$Rights;InheritanceFlags=$Flags;PropagationFlags='None'}
}
$rules=@((Rule $OwnerSid),(Rule 'S-1-5-18'));Assert-AclRecords $OwnerSid $rules $true
Assert-AclRecords $OwnerSid @((Rule $OwnerSid 'Allow' 'FullControl' 'None'),(Rule 'S-1-5-18' 'Allow' 'FullControl' 'None')) $false
Reject {Assert-AclRecords 'foreign-owner' $rules $true};Reject {Assert-AclRecords $OwnerSid @((Rule $OwnerSid),(Rule 'S-1-5-32-545')) $true}
Reject {Assert-AclRecords $OwnerSid @((Rule $OwnerSid),(Rule 'S-1-5-18' 'Deny')) $true};Reject {Assert-AclRecords $OwnerSid @((Rule $OwnerSid),(Rule $OwnerSid)) $true}
Reject {Assert-AclRecords $OwnerSid @((Rule $OwnerSid),(Rule 'S-1-5-18' 'Allow' 'Read')) $true};$tests++

$script:ProcessRows=@();$script:ListenerRows=@();$script:CimFails=$false;$script:TcpFails=$false;$script:ProbeEvents=New-Object 'Collections.Generic.List[string]'
function Get-CimInstance {[CmdletBinding()]param($ClassName,$Filter,$OperationTimeoutSec) Check ($ClassName -ceq 'Win32_Process' -and $Filter -ceq 'ProcessId=32820' -and $OperationTimeoutSec -eq 5);$script:ProbeEvents.Add('process');if($script:CimFails){throw 'invented CIM denial'};return $script:ProcessRows}
function Get-NetTCPConnection {[CmdletBinding()]param($State) Check ($State -ceq 'Listen');$script:ProbeEvents.Add('listeners');if($script:TcpFails){throw 'invented TCP denial'};return $script:ListenerRows}
Assert-Absence 32820;Check ($script:ProbeEvents.Count -eq 2)
$script:CimFails=$true;Reject {Assert-Absence 32820};$script:CimFails=$false
$script:TcpFails=$true;Reject {Assert-Absence 32820};$script:TcpFails=$false
$script:ProcessRows=@([pscustomobject]@{ProcessId=32820});Reject {Assert-Absence 32820};$script:ProcessRows=@()
$script:ListenerRows=@([pscustomobject]@{LocalPort=55433});Reject {Assert-Absence 32820};$script:ListenerRows=@([pscustomobject]@{LocalPort=55432});Assert-Absence 32820;$tests++

function Parent-Proof {return ('{"schema":"native-hierarchy-postgres-supervisor/v2","accepted":false,"completion":null,"cleanupClassification":"owned-emergency","endPinsChecked":true,"native":{"initialized":true,"processCreated":true,"assigned":true,"membershipVerified":true,"resumed":true,"exited":true,"emergency":true,"allHandlesClosed":true,"completeEmptyJob":true,"stdoutEof":true,"stderrEof":true,"closeFailure":false,"stdoutBytes":0,"stderrBytes":0,"exitCode":1,"limits":{"flags":8712,"jobMemoryBytes":1073741824,"activeProcessLimit":32}},"primary":{"code":"resource-limit","counter":"jobCpuSeconds","value":60.015625}}'|ConvertFrom-Json)}
Assert-ParentProof (Parent-Proof)
foreach($key in @('allHandlesClosed','completeEmptyJob','stdoutEof','stderrEof','emergency','membershipVerified')){$proof=Parent-Proof;$proof.native.$key=$false;Reject {Assert-ParentProof $proof}}
$proof=Parent-Proof;$proof.accepted=$true;Reject {Assert-ParentProof $proof};$proof=Parent-Proof;$proof.primary.counter='unknown';Reject {Assert-ParentProof $proof};$tests++

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

# The actual script's only deletion is the reviewed fixed target, with LiteralPath.
$deletes=@($ast.FindAll({param($node)$node -is [System.Management.Automation.Language.CommandAst] -and $node.GetCommandName() -ceq 'Remove-Item'},$true))
Check ($deletes.Count -eq 1);Check ($deletes[0].Extent.Text -ceq 'Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction Stop')
$parameters=@($ast.ParamBlock.Parameters|ForEach-Object{$_.Name.VariablePath.UserPath});Check (($parameters -join ',') -ceq 'AuditOnly,RetireKnownFailedPgData')
$text=[IO.File]::ReadAllText($source);Check ($text.IndexOf('$preSha=Publish-Receipt') -lt $deletes[0].Extent.StartOffset);Check ($text.Contains('if($AuditOnly)'));Check ($text.Contains('$PreReceipt=$RetirementRoot+'));Check ($text.IndexOf('Prepare-ReceiptDirectory;$preSha') -gt $text.IndexOf('if($AuditOnly)'))
$control=@($functions|Where-Object{$_.Name -ceq 'Check-Controls'})[0].Extent.Text
Check ($control.Contains("'output\result.json'"));Check ($control.Contains("@('output\result.json','output\.pending-result.json')"));$tests++
[ordered]@{pureTestsPassed=$tests;sourceParseErrors=0;actualAuditInvoked=$false;actualRetirementInvoked=$false;nativeCalls=$false;probes='managed fakes only'}|ConvertTo-Json -Compress
