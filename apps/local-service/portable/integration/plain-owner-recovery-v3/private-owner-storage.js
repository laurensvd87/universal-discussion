// Read-only ACL verification. Import performs no filesystem/process work.
// The utility port is the existing trusted, bounded fixed PowerShell launcher.
import path from 'node:path';
export const PRIVATE_RUN_ROOT='C:\\Users\\Laurens\\AppData\\Local\\MurmingleRecovery\\plain-automatic18-v3';
const POWERSHELL='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const fail=()=>Object.assign(new Error('Private owner storage refused'),{code:'PRIVATE_STORAGE'});
export function isPrivateRunDirectory(value){return typeof value==='string'&&value.startsWith(PRIVATE_RUN_ROOT+'\\run-')&&/^[0-9a-f]{48}$/u.test(value.slice((PRIVATE_RUN_ROOT+'\\run-').length))&&path.win32.resolve(value)===value;}
const SCRIPT=String.raw`$ErrorActionPreference='Stop';try{
$request=[Console]::In.ReadToEnd()|ConvertFrom-Json;$p=[string]$request.runDirectory
$root='C:\Users\Laurens\AppData\Local\MurmingleRecovery\plain-automatic18-v3'
if($p -cnotmatch ('^'+[regex]::Escape($root)+'\\run-[a-f0-9]{48}$') -or [IO.Path]::GetFullPath($p) -cne $p){exit 1}
$owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$system='S-1-5-18';$inherit=[Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
$paths=@([IO.Path]::GetDirectoryName($root),$root,$p,(Join-Path $p 'output'),(Join-Path $p 'output\temp'))
if($request.clusterReady -eq $true){$cluster=Join-Path $p 'cluster';$paths+=@($cluster)
$children=@(Get-ChildItem -LiteralPath $cluster -Directory -Force)
if($children.Count -ne 1 -or $children[0].Name -cnotmatch '^nhpg-[A-Za-z0-9]+$'){exit 1}
$paths+=@($children[0].FullName)
}
foreach($d in $paths){
$item=Get-Item -LiteralPath $d -Force
if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){exit 1}
$acl=Get-Acl -LiteralPath $d
if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $owner){exit 1}
$rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));$seen=@{}
if($rules.Count -ne 2){exit 1}
foreach($r in $rules){$id=$r.IdentityReference.Value
if(($id -cne $owner -and $id -cne $system) -or $seen.ContainsKey($id) -or $r.AccessControlType -ne 'Allow' -or $r.FileSystemRights -ne 'FullControl' -or $r.InheritanceFlags -ne $inherit -or $r.PropagationFlags -ne 'None'){exit 1};$seen[$id]=$true}
}
[Console]::Out.Write('private-owner-storage-ok')
}catch{exit 1}`;
/** Invented utility/clock seam only; never changes ACLs or creates storage. */
export function createPrivateOwnerStorageVerifier({utility,now}){
 if(typeof utility!=='function'||typeof now!=='function')throw fail();
 return async function verify(runDirectory,deadline,clusterReady=false){
  const check=()=>{if(!Number.isFinite(deadline)||!Number.isFinite(now())||now()>=deadline)throw fail();};
  if(![2,3].includes(arguments.length)||typeof clusterReady!=='boolean'||!isPrivateRunDirectory(runDirectory))throw fail();check();
  const answer=await utility(POWERSHELL,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(SCRIPT,'utf16le').toString('base64')],{input:JSON.stringify({runDirectory,clusterReady}),deadline,collect:true});
  check();if(answer!=='private-owner-storage-ok')throw fail();return true;
 };
}
