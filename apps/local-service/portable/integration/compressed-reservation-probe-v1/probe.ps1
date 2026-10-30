# Public synthetic filesystem evidence only. Never opens PostgreSQL or a backup.
# SourceCheck compiles declarations and tests path guards, without native calls.
[CmdletBinding(PositionalBinding=$false)]
param([switch]$SourceCheck,[switch]$RunOwnedPublicProbe)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if($SourceCheck.IsPresent -eq $RunOwnedPublicProbe.IsPresent){throw 'Select exactly one fixed probe mode'}
$ProbeParent='C:\Users\Laurens\AppData\Local\MurmingleRecovery'
$ProbeReceipt='D:\GITProjekts\universal-discussion-bootstrap\apps\local-service\data\compressed-reservation-public-probe-20261030.json'
$ProbeNames=@('plain-random.bin','compressed-random.bin','compressed-zero.bin')
function Assert-ProbeRoot([string]$Value){
 if($Value -cnotmatch '^C:\\Users\\Laurens\\AppData\\Local\\MurmingleRecovery\\reservation-probe-[0-9a-f]{32}$' -or [IO.Path]::GetFullPath($Value) -cne $Value){throw 'Probe scope refused'}
}
function Assert-ProbeFile([string]$Root,[string]$Value){
 Assert-ProbeRoot $Root
 if([IO.Path]::GetDirectoryName($Value) -cne $Root -or [IO.Path]::GetFileName($Value) -cnotin $ProbeNames){throw 'Probe file refused'}
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class CompressedReservationProbe {
 [StructLayout(LayoutKind.Sequential)] public struct Info {public uint Attributes,CreateLow,CreateHigh,AccessLow,AccessHigh,WriteLow,WriteHigh,Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
 [StructLayout(LayoutKind.Sequential)] public struct Compression {public long Bytes;public ushort Format;public byte UnitShift,ChunkShift,ClusterShift,Reserved0,Reserved1,Reserved2;}
 [StructLayout(LayoutKind.Sequential)] public struct Performance {public uint Size;public UIntPtr CommitTotal,CommitLimit,CommitPeak,PhysicalTotal,PhysicalAvailable,SystemCache,KernelTotal,KernelPaged,KernelNonpaged,PageSize;public uint Handles,Processes,Threads;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool CreateDirectoryW(string name,IntPtr security);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern SafeFileHandle CreateFileW(string name,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetFileInformationByHandle(SafeFileHandle handle,out Info info);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle handle,int kind,out Compression value,uint bytes);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetDiskFreeSpaceExW(string name,out ulong available,out ulong total,out ulong free);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool DeviceIoControl(SafeFileHandle handle,uint code,ref ushort input,uint inSize,IntPtr output,uint outSize,out uint returned,IntPtr overlap);
 [DllImport("psapi.dll",SetLastError=true)] static extern bool GetPerformanceInfo(out Performance info,uint size);
 static void Check(bool value){if(!value)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}
 public static ulong Free(){ulong available,total,free;Check(GetDiskFreeSpaceExW("C:\\",out available,out total,out free));return available;}
 public static ulong[] Memory(){Performance p;Check(GetPerformanceInfo(out p,(uint)Marshal.SizeOf(typeof(Performance))));return new ulong[]{p.PhysicalAvailable.ToUInt64()*p.PageSize.ToUInt64(),(p.CommitLimit.ToUInt64()-p.CommitTotal.ToUInt64())*p.PageSize.ToUInt64()};}
 public static string Identity(string path,bool directory){
  using(var h=CreateFileW(path,128,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero)){
   if(h.IsInvalid)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());Info i;Check(GetFileInformationByHandle(h,out i));
   if((i.Attributes&1024)!=0||((i.Attributes&16)!=0)!=directory||(!directory&&i.Links!=1))throw new InvalidOperationException();
   return i.Volume.ToString("x8")+":"+i.IndexHigh.ToString("x8")+i.IndexLow.ToString("x8");
  }
 }
 public static void Compress(SafeFileHandle handle){ushort format=1;uint returned;Check(DeviceIoControl(handle,0x9C040,ref format,2,IntPtr.Zero,0,out returned,IntPtr.Zero));}
 public static Compression Observe(SafeFileHandle handle){Compression value;Check(GetFileInformationByHandleEx(handle,8,out value,16));return value;}
}
'@
if($SourceCheck){
 $good=$ProbeParent+'\reservation-probe-'+('a'*32);Assert-ProbeRoot $good
 $tests=1
 foreach($bad in @($good.ToLowerInvariant(),$good.Replace('C:','D:'),($good+'\..'),($good+'\x'))){$refused=$false;try{Assert-ProbeRoot $bad}catch{$refused=$true};if(-not $refused){throw 'Scope regression'};$tests++}
 Assert-ProbeFile $good ($good+'\plain-random.bin');$tests++
 foreach($bad in @(($good+'\other.bin'),($ProbeParent+'\plain-random.bin'),($good+'\..\plain-random.bin'))){$refused=$false;try{Assert-ProbeFile $good $bad}catch{$refused=$true};if(-not $refused){throw 'File scope regression'};$tests++}
 [ordered]@{Tests=$tests;Passed=$true;NativeDeclarationsCompiled=$true;NativeMethodsCalled=$false;FilesCreated=$false}|ConvertTo-Json -Compress
 exit 0
}
$ProbeRoot=$ProbeParent+'\reservation-probe-'+[Guid]::NewGuid().ToString('N');Assert-ProbeRoot $ProbeRoot
$ProbeCreated=$false;$ProbeRootIdentity=$null;$ProbeStream=$null;$ProbeFailure=$null;$ProbeCleanupFailure=$null
$ProbeClock=[Diagnostics.Stopwatch]::StartNew();$ProbeFiles=New-Object 'Collections.Generic.List[object]';$ProbeSamples=New-Object 'Collections.Generic.List[object]'
function Check-ProbeBudget {
 $memory=[CompressedReservationProbe]::Memory()
 if($ProbeClock.Elapsed.TotalSeconds -ge 30 -or $memory[0] -lt 1073741824 -or $memory[1] -lt 1073741824 -or [CompressedReservationProbe]::Free() -lt 2147483648 -or ([IO.DriveInfo]::new('D:\')).AvailableFreeSpace -lt 4294967296){throw 'Probe budget refused'}
}
function Observe-Probe([string]$Name,[string]$Stage,$Stream){
 $before=[CompressedReservationProbe]::Free();$value=$null
 if($null -ne $Stream){$c=[CompressedReservationProbe]::Observe($Stream.SafeFileHandle);$value=[ordered]@{ReportedCompressedBytes=$c.Bytes;CompressionFormat=$c.Format;LogicalBytes=$Stream.Length}}
 $ProbeSamples.Add([ordered]@{Name=$Name;Stage=$Stage;ElapsedMs=$ProbeClock.ElapsedMilliseconds;CFreeBeforeMetadata=$before;CFreeAfterMetadata=[CompressedReservationProbe]::Free();File=$value})
}
try{
 Check-ProbeBudget
 # Existing protected parent is verified, never changed or adopted as new.
 $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 for($cursor=$ProbeParent;$cursor;$cursor=[IO.Path]::GetDirectoryName($cursor)){
  $item=Get-Item -LiteralPath $cursor -Force;if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Probe ancestor refused'}
 }
 $acl=Get-Acl -LiteralPath $ProbeParent
 if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $owner -or -not $acl.AreAccessRulesProtected){throw 'Probe parent refused'}
 $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));$seen=@{}
 if($rules.Count -ne 2){throw 'Probe parent rules refused'}
 foreach($r in $rules){$sid=$r.IdentityReference.Value;if(($sid -cne $owner -and $sid -cne 'S-1-5-18') -or $seen.ContainsKey($sid) -or $r.AccessControlType -ne 'Allow' -or $r.FileSystemRights -ne 'FullControl' -or $r.InheritanceFlags -ne 'ContainerInherit, ObjectInherit' -or $r.PropagationFlags -ne 'None'){throw 'Probe parent rule refused'};$seen[$sid]=$true}
 if(-not [CompressedReservationProbe]::CreateDirectoryW($ProbeRoot,[IntPtr]::Zero)){throw 'Fresh probe directory refused'}
 $ProbeCreated=$true;$ProbeRootIdentity=[CompressedReservationProbe]::Identity($ProbeRoot,$true)
 $buffer=New-Object byte[] 65536;$random=[Random]::new(424242);$random.NextBytes($buffer)
 foreach($name in $ProbeNames){
  Check-ProbeBudget;$file=Join-Path $ProbeRoot $name;Assert-ProbeFile $ProbeRoot $file;Observe-Probe $name 'before-create' $null
  $ProbeStream=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::Read)
  $identity=[CompressedReservationProbe]::Identity($file,$false);$ProbeFiles.Add([ordered]@{Name=$name;Path=$file;Identity=$identity;Bytes=8388608})
  if($name.StartsWith('compressed-',[StringComparison]::Ordinal)){[CompressedReservationProbe]::Compress($ProbeStream.SafeFileHandle)}
  $format=([CompressedReservationProbe]::Observe($ProbeStream.SafeFileHandle)).Format
  if(($name.StartsWith('compressed-',[StringComparison]::Ordinal) -and $format -ne 2) -or ($name -ceq 'plain-random.bin' -and $format -ne 0)){throw 'Probe compression mode refused'}
  if($name -ceq 'compressed-zero.bin'){[Array]::Clear($buffer,0,$buffer.Length)}
  Observe-Probe $name 'created' $ProbeStream
  for($n=0;$n -lt 128;$n++){Check-ProbeBudget;$ProbeStream.Write($buffer,0,$buffer.Length)}
  $ProbeStream.Flush($false);Observe-Probe $name 'written-before-durable-flush' $ProbeStream
  $ProbeStream.Flush($true);Observe-Probe $name 'after-durable-flush' $ProbeStream
  $ProbeStream.Dispose();$ProbeStream=$null;Observe-Probe $name 'after-close' $null
  if([CompressedReservationProbe]::Identity($file,$false) -cne $identity -or (Get-Item -LiteralPath $file).Length -ne 8388608){throw 'Probe file changed'}
 }
}catch{$ProbeFailure=$_.Exception.GetType().FullName}
finally{
 if($null -ne $ProbeStream){try{$ProbeStream.Dispose()}catch{$ProbeCleanupFailure='stream-close'}}
 if($ProbeCreated){try{
  Assert-ProbeRoot $ProbeRoot
  if([CompressedReservationProbe]::Identity($ProbeRoot,$true) -cne $ProbeRootIdentity){throw 'Probe root changed'}
  foreach($entry in $ProbeFiles){Assert-ProbeFile $ProbeRoot $entry.Path;if([CompressedReservationProbe]::Identity($entry.Path,$false) -cne $entry.Identity){throw 'Probe file changed'};Remove-Item -LiteralPath $entry.Path -Force -ErrorAction Stop}
  if(@(Get-ChildItem -LiteralPath $ProbeRoot -Force).Count -ne 0){throw 'Probe directory not empty'}
  [IO.Directory]::Delete($ProbeRoot,$false)
 }catch{$ProbeCleanupFailure='fixed-owned-public-cleanup-refused'}}
}
$record=[ordered]@{Schema='compressed-reservation-public-probe/v1';Utc=[DateTime]::UtcNow.ToString('o');Root=$ProbeRoot;Failure=$ProbeFailure;CleanupFailure=$ProbeCleanupFailure;Files=$ProbeFiles.ToArray();Samples=$ProbeSamples.ToArray();RootAbsent=(-not(Test-Path -LiteralPath $ProbeRoot));CFreeAfterCleanup=[CompressedReservationProbe]::Free();TotalPublicPayloadLimitBytes=25165824;FullPostgresCauseProven=$false;LiveDataOrSettingsChanged=$false}
$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($record|ConvertTo-Json -Depth 10 -Compress)+"`n");if($bytes.Length -gt 32768){throw 'Probe receipt bound refused'}
$output=[IO.File]::Open($ProbeReceipt,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$output.Write($bytes,0,$bytes.Length);$output.Flush($true)}finally{$output.Dispose()}
[ordered]@{Passed=($null -eq $ProbeFailure -and $null -eq $ProbeCleanupFailure);RootAbsent=$record.RootAbsent;Samples=$ProbeSamples.Count;Receipt=$ProbeReceipt;FullPostgresCauseProven=$false}|ConvertTo-Json -Compress
if($null -ne $ProbeFailure -or $null -ne $ProbeCleanupFailure){exit 1}
