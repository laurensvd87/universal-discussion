# ONE bounded filesystem proof, not PostgreSQL/restore/browser authority.
# Only fresh public probe files under a new protected C: nonce directory.
$ErrorActionPreference='Stop'
$taskReportPath='D:\GITProjekts\universal-discussion-bootstrap\apps\local-service\data\compressed-owner-storage-probe-v2-20261030.json'
if(Test-Path -LiteralPath $taskReportPath){throw 'Probe receipt already exists'}
$taskParent='C:\Users\Laurens\AppData\Local\MurmingleRecovery'
$taskRoot=Join-Path $taskParent 'compression-probe-v2'
$taskOwner=[Security.Principal.WindowsIdentity]::GetCurrent().User
$taskSystem=New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
$taskCreated=New-Object 'System.Collections.Generic.List[object]'
$taskFileResults=New-Object 'System.Collections.Generic.List[object]'
$taskResources=New-Object 'System.Collections.Generic.List[object]'
$taskStage='native-bindings';$taskFailure=$null;$taskRemoved=0;$taskDirectoryHandle=$null
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class MurmingleOwnedCompressionProbe {
 [StructLayout(LayoutKind.Sequential)] public struct Info {public uint Attributes,CreateLow,CreateHigh,AccessLow,AccessHigh,WriteLow,WriteHigh,Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
 [StructLayout(LayoutKind.Sequential)] public struct Performance {public uint Size;public UIntPtr CommitTotal,CommitLimit,CommitPeak,PhysicalTotal,PhysicalAvailable,SystemCache,KernelTotal,KernelPaged,KernelNonpaged,PageSize;public uint Handles,Processes,Threads;}
 [StructLayout(LayoutKind.Sequential)] public struct Compression {public long Bytes;public ushort Format;public byte Unit,Chunk,Cluster,Reserved1,Reserved2,Reserved3;}
 [StructLayout(LayoutKind.Sequential)] struct SecurityAttributes {public uint Length;public IntPtr Descriptor;[MarshalAs(UnmanagedType.Bool)] public bool Inherit;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateDirectoryW(string name,ref SecurityAttributes security);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string name,uint access,uint sharing,IntPtr security,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool DeviceIoControl(SafeFileHandle handle,uint code,ref ushort input,uint inSize,IntPtr output,uint outSize,out uint returned,IntPtr overlap);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool DeviceIoControl(SafeFileHandle handle,uint code,IntPtr input,uint inSize,out ushort output,uint outSize,out uint returned,IntPtr overlap);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle,out Info info);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle handle,uint kind,out Compression value,uint size);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetDiskFreeSpaceW(string root,out uint sectors,out uint bytes,out uint free,out uint total);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetVolumeInformationW(string root,IntPtr label,uint labelSize,IntPtr serial,IntPtr component,out uint flags,System.Text.StringBuilder fs,uint fsSize);
 [DllImport("psapi.dll",SetLastError=true)] static extern bool GetPerformanceInfo(out Performance info,uint size);
 static void Check(bool ok){if(!ok)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}
 public static void CreatePrivateDirectory(string name,byte[] descriptor){var pinned=GCHandle.Alloc(descriptor,GCHandleType.Pinned);try{var security=new SecurityAttributes{Length=(uint)Marshal.SizeOf(typeof(SecurityAttributes)),Descriptor=pinned.AddrOfPinnedObject(),Inherit=false};Check(CreateDirectoryW(name,ref security));}finally{pinned.Free();}}
 public static SafeFileHandle Directory(string name){var h=CreateFileW(name,0xC0000000,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero);if(h.IsInvalid){h.Dispose();throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}return h;}
 public static Info Inspect(SafeFileHandle handle){Info i;Check(GetFileInformationByHandle(handle,out i));if((i.Attributes&0x400)!=0)throw new InvalidOperationException("Reparse refused");return i;}
 public static string Identity(SafeFileHandle handle){var i=Inspect(handle);return i.Volume+":"+i.IndexHigh+":"+i.IndexLow;}
 public static ushort Format(SafeFileHandle handle){ushort value;uint count;Check(DeviceIoControl(handle,0x9003C,IntPtr.Zero,0,out value,2,out count,IntPtr.Zero));if(count!=2)throw new InvalidOperationException("Format response refused");return value;}
 public static void Compress(SafeFileHandle handle){ushort value=1;uint count;Check(DeviceIoControl(handle,0x9C040,ref value,2,IntPtr.Zero,0,out count,IntPtr.Zero));if(Format(handle)!=2)throw new InvalidOperationException("Compression readback refused");}
 public static ulong Allocated(SafeFileHandle handle){Compression value;Check(GetFileInformationByHandleEx(handle,8,out value,(uint)Marshal.SizeOf(typeof(Compression))));if(value.Bytes<0||value.Format!=2)throw new InvalidOperationException("Allocation response refused");return (ulong)value.Bytes;}
 public static ulong[] Memory(){Performance p;Check(GetPerformanceInfo(out p,(uint)Marshal.SizeOf(typeof(Performance))));return new ulong[]{p.PhysicalAvailable.ToUInt64()*p.PageSize.ToUInt64(),(p.CommitLimit.ToUInt64()-p.CommitTotal.ToUInt64())*p.PageSize.ToUInt64()};}
 public static string Volume(){uint sectors,bytes,free,total,flags;Check(GetDiskFreeSpaceW("C:\\",out sectors,out bytes,out free,out total));var fs=new System.Text.StringBuilder(32);Check(GetVolumeInformationW("C:\\",IntPtr.Zero,0,IntPtr.Zero,IntPtr.Zero,out flags,fs,32));if(fs.ToString()!="NTFS"||sectors*bytes>4096||(flags&16)==0)throw new InvalidOperationException("Volume compression refused");return fs+":"+(sectors*bytes);}
}
'@
function Test-TaskResources {
 $memory=[MurmingleOwnedCompressionProbe]::Memory();$c=[IO.DriveInfo]::new('C:\').AvailableFreeSpace;$d=[IO.DriveInfo]::new('D:\').AvailableFreeSpace
 $value=[ordered]@{Utc=[DateTime]::UtcNow.ToString('o');PhysicalFree=[uint64]$memory[0];CommitFree=[uint64]$memory[1];CFree=[long]$c;DFree=[long]$d}
 $taskResources.Add($value)
 if($memory[0] -lt 1073741824 -or $memory[1] -lt 1073741824 -or $c -lt (2147483648+4194304) -or $d -lt 4294967296){throw 'Probe resource floor refused'}
}
function Test-TaskDirectory($path) {
 $item=Get-Item -LiteralPath $path -Force
 if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or [IO.Path]::GetFullPath($path) -cne $path){throw 'Probe directory refused'}
}
function Test-TaskPrivateAcl($path) {
 $acl=Get-Acl -LiteralPath $path
 if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $taskOwner.Value -or -not $acl.AreAccessRulesProtected){throw 'Probe ACL owner refused'}
 $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));if($rules.Count -ne 2){throw 'Probe ACL count refused'}
 $seen=@{};foreach($rule in $rules){$sid=$rule.IdentityReference.Value
  if(($sid -cne $taskOwner.Value -and $sid -cne $taskSystem.Value) -or $seen.ContainsKey($sid) -or $rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne 'FullControl' -or $rule.InheritanceFlags -ne 'ContainerInherit, ObjectInherit' -or $rule.PropagationFlags -ne 'None'){throw 'Probe ACL rule refused'};$seen[$sid]=$true}
}
function New-TaskProtectedDirectory($path) {
 $created=$false
 if(-not (Test-Path -LiteralPath $path)){
  $acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetOwner($taskOwner);$acl.SetAccessRuleProtection($true,$false)
  foreach($sid in @($taskOwner,$taskSystem)){$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit, ObjectInherit','None','Allow');$acl.AddAccessRule($rule)}
  # Atomic native create: an existing directory/racing creator is never claimed.
  [MurmingleOwnedCompressionProbe]::CreatePrivateDirectory($path,$acl.GetSecurityDescriptorBinaryForm());$created=$true
 }
 Test-TaskDirectory $path;Test-TaskPrivateAcl $path
 $handle=[MurmingleOwnedCompressionProbe]::Directory($path)
 try{$identity=[MurmingleOwnedCompressionProbe]::Identity($handle)}finally{$handle.Dispose()}
 if($created){$taskCreated.Add([ordered]@{Path=$path;Identity=$identity})}
}
try{
 $taskStage='volume-and-resources';$taskVolume=[MurmingleOwnedCompressionProbe]::Volume();Test-TaskResources
 for($cursor=[IO.Path]::GetDirectoryName($taskParent);$cursor;$cursor=[IO.Path]::GetDirectoryName($cursor)){Test-TaskDirectory $cursor}
 $taskStage='owned-directories';New-TaskProtectedDirectory $taskParent;New-TaskProtectedDirectory $taskRoot
 $rng=[Security.Cryptography.RandomNumberGenerator]::Create();$nonce=New-Object byte[] 24
 try{$rng.GetBytes($nonce)}finally{$rng.Dispose()};$taskRun=Join-Path $taskRoot ('probe-'+[BitConverter]::ToString($nonce).Replace('-','').ToLowerInvariant());[Array]::Clear($nonce,0,$nonce.Length)
 if(Test-Path -LiteralPath $taskRun){throw 'Probe nonce collision'};New-TaskProtectedDirectory $taskRun
 $taskStage='directory-compression';if(@(Get-ChildItem -LiteralPath $taskRun -Force).Count){throw 'Probe directory not empty'}
 $taskDirectoryHandle=[MurmingleOwnedCompressionProbe]::Directory($taskRun);$taskDirectoryId=[MurmingleOwnedCompressionProbe]::Identity($taskDirectoryHandle)
 [MurmingleOwnedCompressionProbe]::Compress($taskDirectoryHandle)
 if(@(Get-ChildItem -LiteralPath $taskRun -Force).Count){throw 'Probe directory changed'}
 foreach($kind in @('zeros','random')){
  $taskStage='public-'+$kind+'-file';Test-TaskResources
  $data=New-Object byte[] 1048576;$patch=New-Object byte[] 8192;$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  try{if($kind -eq 'random'){$rng.GetBytes($data)};$rng.GetBytes($patch)}finally{$rng.Dispose()}
  [Array]::Copy($patch,0,$data,65536,$patch.Length);$name=Join-Path $taskRun ($kind+'.bin');$stream=$null;$hash=[Security.Cryptography.SHA256]::Create()
  try{
   $expected=[BitConverter]::ToString($hash.ComputeHash($data)).Replace('-','')
   $stream=[IO.FileStream]::new($name,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None,4096,[IO.FileOptions]::DeleteOnClose)
   # Deliberately exercise page-sized writes, a seek/overwrite, durable flush
   # and readback. This is filesystem evidence, not a PostgreSQL recovery test.
   for($offset=0;$offset -lt $data.Length;$offset+=8192){$stream.Write($data,$offset,8192)}
   $stream.Position=65536;$stream.Write($patch,0,$patch.Length);$stream.Flush($true)
   $info=[MurmingleOwnedCompressionProbe]::Inspect($stream.SafeFileHandle)
   if($info.Links -ne 1 -or [MurmingleOwnedCompressionProbe]::Format($stream.SafeFileHandle) -ne 2 -or $stream.Length -ne 1048576){throw 'Probe inherited compression refused'}
   $stream.Position=0;$actual=[BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','')
   if($actual -cne $expected){throw 'Probe byte readback refused'}
   $allocated=[MurmingleOwnedCompressionProbe]::Allocated($stream.SafeFileHandle)
   if($allocated -gt 2097152 -or ($kind -eq 'zeros' -and $allocated -ge 524288)){throw 'Probe allocation refused'}
   $taskFileResults.Add([ordered]@{Kind=$kind;LogicalBytes=$stream.Length;AllocatedBytes=$allocated;Sha256=$actual;Lznt1Inherited=$true;DurableFlushAndRandomPageReadback=$true})
  }finally{if($stream){$stream.Dispose()};$hash.Dispose();[Array]::Clear($data,0,$data.Length);[Array]::Clear($patch,0,$patch.Length)}
  if(Test-Path -LiteralPath $name){throw 'Probe borrowed file not retired'}
 }
 Test-TaskResources;$taskStage='owned-cleanup'
}catch{$taskFailure=[ordered]@{Stage=$taskStage;ExceptionType=$_.Exception.GetType().FullName}}
finally{
 if($taskDirectoryHandle){$taskDirectoryHandle.Dispose();$taskDirectoryHandle=$null}
 for($i=$taskCreated.Count-1;$i -ge 0;$i--){$entry=$taskCreated[$i]
  try{
   $path=$entry.Path
   if([IO.Path]::GetFullPath($path) -cne $path -or -not ($path -ceq $taskParent -or $path.StartsWith($taskParent+'\',[StringComparison]::Ordinal))){throw 'Probe cleanup scope refused'}
   Test-TaskDirectory $path;Test-TaskPrivateAcl $path;$handle=[MurmingleOwnedCompressionProbe]::Directory($path)
   try{if([MurmingleOwnedCompressionProbe]::Identity($handle) -cne $entry.Identity){throw 'Probe cleanup identity refused'}}finally{$handle.Dispose()}
   if(@(Get-ChildItem -LiteralPath $path -Force).Count){throw 'Probe cleanup not empty'}
   [IO.Directory]::Delete($path,$false);$taskRemoved++
  }catch{if($null -eq $taskFailure){$taskFailure=[ordered]@{Stage='owned-cleanup';ExceptionType=$_.Exception.GetType().FullName}}}
 }
}
$taskPassed=($null -eq $taskFailure -and $taskFileResults.Count -eq 2 -and $taskRemoved -eq $taskCreated.Count)
$taskRecord=[ordered]@{Schema='compressed-owner-storage-probe/v2';Utc=[DateTime]::UtcNow.ToString('o');Passed=$taskPassed;Failure=$taskFailure;Volume=$taskVolume;Files=$taskFileResults.ToArray();Resources=$taskResources.ToArray();DirectoriesCreated=$taskCreated.Count;DirectoriesRemoved=$taskRemoved;AllOwnedPublicFilesRetired=$taskPassed;ExistingUserDirectoriesModified=$false;DatabaseOpened=$false;ArchiveRead=$false;PostgresCompatibilityProven=$false;LiveServicesChanged=$false}
$taskJson=($taskRecord|ConvertTo-Json -Depth 8 -Compress)+"`n";$taskBytes=[Text.UTF8Encoding]::new($false).GetBytes($taskJson)
if($taskBytes.Length -gt 32768){throw 'Probe report bound refused'}
$taskReport=[IO.File]::Open($taskReportPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$taskReport.Write($taskBytes,0,$taskBytes.Length);$taskReport.Flush($true)}finally{$taskReport.Dispose()}
[Console]::Out.WriteLine($taskJson.TrimEnd());if(-not $taskPassed){exit 1}
