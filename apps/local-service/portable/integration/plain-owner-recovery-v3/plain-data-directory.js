// Fixed owned uncompressed C: directory preparation. No IO or native work at import.
// The real lifecycle exclusively creates this empty pgdata directory first.
import path from 'node:path';
import {PRIVATE_RUN_ROOT} from './private-owner-storage.js';
const POWERSHELL='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const fail=()=>Object.assign(new Error('Compressed owned storage refused'),{code:'PLAIN_STORAGE'});
const SCRIPT=String.raw`$ErrorActionPreference='Stop';try{
$p=[string]([Console]::In.ReadToEnd()|ConvertFrom-Json).dataDirectory
$root='C:\Users\Laurens\AppData\Local\MurmingleRecovery\plain-automatic18-v3'
if($p -cnotmatch ('^'+[regex]::Escape($root)+'\\run-[a-f0-9]{48}\\cluster\\nhpg-[A-Za-z0-9]{1,64}\\pgdata$') -or [IO.Path]::GetFullPath($p) -cne $p){exit 1}
$owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
for($cursor=$p;$cursor;$cursor=[IO.Path]::GetDirectoryName($cursor)){
 $item=Get-Item -LiteralPath $cursor -Force
 if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){exit 1}
 if($cursor.StartsWith($root,[StringComparison]::Ordinal)){
  $acl=Get-Acl -LiteralPath $cursor
  if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $owner){exit 1}
  $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));$seen=@{}
  if($rules.Count -ne 2){exit 1}
  foreach($r in $rules){$sid=$r.IdentityReference.Value
   if(($sid -cne $owner -and $sid -cne 'S-1-5-18') -or $seen.ContainsKey($sid) -or $r.AccessControlType -ne 'Allow' -or $r.FileSystemRights -ne 'FullControl' -or $r.InheritanceFlags -ne 'ContainerInherit, ObjectInherit' -or $r.PropagationFlags -ne 'None'){exit 1};$seen[$sid]=$true}
 }
}
if(@(Get-ChildItem -LiteralPath $p -Force).Count){exit 1}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class PlainOwnedPgData {
 [StructLayout(LayoutKind.Sequential)] struct Info {public uint Attributes,CreateLow,CreateHigh,AccessLow,AccessHigh,WriteLow,WriteHigh,Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string name,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle,out Info info);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool DeviceIoControl(SafeFileHandle handle,uint code,ref ushort input,uint inSize,IntPtr output,uint outSize,out uint returned,IntPtr overlap);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool DeviceIoControl(SafeFileHandle handle,uint code,IntPtr input,uint inSize,out ushort output,uint outSize,out uint returned,IntPtr overlap);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetDiskFreeSpaceW(string root,out uint sectors,out uint bytes,out uint free,out uint total);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetVolumeInformationW(string root,IntPtr label,uint labelSize,IntPtr serial,IntPtr component,out uint flags,System.Text.StringBuilder fs,uint fsSize);
 static void Check(bool value){if(!value)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}
 public static void Prepare(string path){uint sectors,bytes,free,total,flags;Check(GetDiskFreeSpaceW("C:\\",out sectors,out bytes,out free,out total));var fs=new System.Text.StringBuilder(32);Check(GetVolumeInformationW("C:\\",IntPtr.Zero,0,IntPtr.Zero,IntPtr.Zero,out flags,fs,32));if(fs.ToString()!="NTFS"||sectors*bytes>4096||(flags&16)==0)throw new InvalidOperationException();
  using(var h=CreateFileW(path,0xC0000000,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero)){
   if(h.IsInvalid)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());Info before,after;Check(GetFileInformationByHandle(h,out before));if((before.Attributes&0x400)!=0||(before.Attributes&0x10)==0)throw new InvalidOperationException();
   ushort set=0,got;uint count;Check(DeviceIoControl(h,0x9C040,ref set,2,IntPtr.Zero,0,out count,IntPtr.Zero));Check(DeviceIoControl(h,0x9003C,IntPtr.Zero,0,out got,2,out count,IntPtr.Zero));Check(GetFileInformationByHandle(h,out after));
   if(got!=0||count!=2||before.Volume!=after.Volume||before.IndexHigh!=after.IndexHigh||before.IndexLow!=after.IndexLow||(after.Attributes&0x400)!=0)throw new InvalidOperationException();
  }
 }
}
'@
[PlainOwnedPgData]::Prepare($p)
if(@(Get-ChildItem -LiteralPath $p -Force).Count){exit 1}
[Console]::Out.Write('plain-owned-pgdata-ok')
}catch{exit 1}`;
export function createPlainDataDirectory({utility,now}){
 if(typeof utility!=='function'||typeof now!=='function')throw fail();
 return async function prepare(dataDirectory,deadline){
  const check=()=>{const time=now();if(!Number.isFinite(time)||!Number.isFinite(deadline)||time>=deadline)throw fail();};
  if(arguments.length!==2||typeof dataDirectory!=='string'||path.win32.normalize(dataDirectory)!==dataDirectory)throw fail();
  const relative=path.win32.relative(PRIVATE_RUN_ROOT,dataDirectory);
  if(!/^run-[a-f0-9]{48}\\cluster\\nhpg-[A-Za-z0-9]{1,64}\\pgdata$/u.test(relative))throw fail();check();
  const answer=await utility(POWERSHELL,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(SCRIPT,'utf16le').toString('base64')],{input:JSON.stringify({dataDirectory}),deadline,collect:true});
  check();if(answer!=='plain-owned-pgdata-ok')throw fail();return true;
 };
}
