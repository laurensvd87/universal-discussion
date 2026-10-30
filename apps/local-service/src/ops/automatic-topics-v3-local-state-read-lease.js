// Fixed local-state read leases only. Import never spawns or opens state.
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const LOCAL_STATE_SLOTS=Object.freeze([
 ...['demo.sqlite','accounts.sqlite','private-conversations.sqlite','topic-crawler.sqlite','topic-growth.sqlite','topic-growth-v2.sqlite'].flatMap(name=>[name,name+'-wal',name+'-shm',name+'-journal']),
 'account-key.protected','pairing.json','pairing-recovery/pairing-token.txt','chatgpt-registration.json','topic-space-policy.json',
 'ridge1-topic-adapter-v1.json','diagonal-adapter-v1.json','body-topic-metric-v1.json','postgres-hierarchy-runtime-manifest.json',
 'postgres-runtime-manifest.json','postgres-hierarchy-release-20261027-manifest.json','postgres-hierarchy-release-20261028-manifest.json','postgres-hierarchy-release-20261028-final-manifest.json','postgres-hierarchy-release-20261029-http-priority-manifest.json',
 'postgres-hierarchy-release-20261029-nature-heads-manifest.json','postgres-hierarchy-release-20261030-automatic-topics-manifest.json','postgres-hierarchy-release-20261030-named-v3-manifest.json',
 'provider-current','provider-legacy',
]);
const DATA=path.resolve(fileURLToPath(new URL('../../data/',import.meta.url)));
const failure=()=>Object.assign(new Error('Local state read lease unavailable'),{code:'local-state-lease'});
function slotsFrom(value){if(!Array.isArray(value)||value.length!==LOCAL_STATE_SLOTS.length)throw failure();return Object.freeze(value.map((s,i)=>{
 if(!s||typeof s!=='object'||Object.keys(s).sort().join()!=='bytes,id,leaf,modified,path,present'||s.id!==LOCAL_STATE_SLOTS[i]||typeof s.present!=='boolean'||!Number.isSafeInteger(s.bytes)||s.bytes<0||s.bytes>2147483648||!s.present&&s.bytes!==0)throw failure();
 if(s.id.startsWith('provider-')){if(!(s.leaf===null&&s.path===null&&!s.present||typeof s.leaf==='string'&&/^chatgpt-refresh-[a-f0-9]{32}\.dpapi$/u.test(s.leaf)&&typeof s.path==='string'&&path.isAbsolute(s.path)&&path.basename(s.path)===s.leaf))throw failure();}
 else if(s.path!==path.join(DATA,...s.id.split('/'))||s.leaf!==s.id.split('/').at(-1))throw failure();
 if(s.present?typeof s.modified!=='string'||!/^\d{1,20}$/u.test(s.modified):s.modified!==null)throw failure();
 return Object.freeze({...s});
}));}
const SCRIPT=String.raw`
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$handles=@{};$slots=@();$ok=$false;$parents=@{}
function Ordinary($p,$directory) {
 $cursor=$p
 while($cursor) {
  $item=Get-Item -LiteralPath $cursor -Force
  if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or ($cursor -ne $p -and -not $item.PSIsContainer)) {throw 'invalid'}
  if($cursor -eq $p -and $item.PSIsContainer -ne $directory) {throw 'invalid'}
  if($item.PSIsContainer){$identity=$item.CreationTimeUtc.Ticks.ToString();if($parents.ContainsKey($cursor)){if($parents[$cursor] -cne $identity){throw 'changed-parent'}}else{$parents[$cursor]=$identity}}
  $cursor=[IO.Path]::GetDirectoryName($cursor)
 }
}
function Parent($p){$parent=[IO.Path]::GetDirectoryName($p);while(-not(Test-Path -LiteralPath $parent)){$parent=[IO.Path]::GetDirectoryName($parent);if(-not $parent){throw 'parent'}};Ordinary $parent $true}
try {
 $cfg=[Console]::In.ReadLine()|ConvertFrom-Json
 $data=[string]$cfg.data
 if(-not [IO.Path]::IsPathRooted($data) -or [IO.Path]::GetFullPath($data) -cne $data -or [IO.Path]::GetFileName($data) -cne 'data') {throw 'invalid'}
 Ordinary $data $true
 $names=@('demo.sqlite','accounts.sqlite','private-conversations.sqlite','topic-crawler.sqlite','topic-growth.sqlite','topic-growth-v2.sqlite')
 $ids=@();foreach($n in $names){$ids+=$n;$ids+=($n+'-wal');$ids+=($n+'-shm');$ids+=($n+'-journal')}
 $ids+=@('account-key.protected','pairing.json','pairing-recovery/pairing-token.txt','chatgpt-registration.json','topic-space-policy.json','ridge1-topic-adapter-v1.json','diagonal-adapter-v1.json','body-topic-metric-v1.json','postgres-hierarchy-runtime-manifest.json','postgres-runtime-manifest.json','postgres-hierarchy-release-20261027-manifest.json','postgres-hierarchy-release-20261028-manifest.json','postgres-hierarchy-release-20261028-final-manifest.json','postgres-hierarchy-release-20261029-http-priority-manifest.json','postgres-hierarchy-release-20261029-nature-heads-manifest.json','postgres-hierarchy-release-20261030-automatic-topics-manifest.json','postgres-hierarchy-release-20261030-named-v3-manifest.json')
 foreach($id in $ids) {
  $p=[IO.Path]::Combine($data,$id.Replace('/','\'));$present=Test-Path -LiteralPath $p
  if($present){Ordinary $p $false;$f=New-Object IO.FileStream($p,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);$handles[$id]=$f;$bytes=$f.Length;$modified=(Get-Item -LiteralPath $p).LastWriteTimeUtc.Ticks.ToString()}
  else {Parent $p;$bytes=0;$modified=$null }
  $slots+=@{id=$id;path=$p;present=[bool]$present;bytes=$bytes;modified=$modified;leaf=[IO.Path]::GetFileName($p)}
 }
 $registration=$slots|Where-Object {$_.id -ceq 'chatgpt-registration.json'}
 $hostKey=$null
 if($registration.present){$f=$handles['chatgpt-registration.json'];if($f.Length -gt 16384){throw 'registration'};$b=New-Object byte[] ([int]$f.Length);$offset=0;while($offset -lt $b.Length){$n=$f.Read($b,$offset,$b.Length-$offset);if($n -le 0){throw 'registration'};$offset+=$n};$f.Position=0
  $r=([Text.Encoding]::UTF8.GetString($b)|ConvertFrom-Json);[Array]::Clear($b,0,$b.Length)
  if($r.schema -cne 'chatgpt-registration/v1' -or [string]$r.hostId -cnotmatch '^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'){throw 'registration'}
  $sha=[Security.Cryptography.SHA256]::Create();try{$hostKey=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($r.hostId)))).Replace('-','').ToLowerInvariant().Substring(0,32)}finally{$sha.Dispose()}
 }
 $app=[Environment]::GetFolderPath('LocalApplicationData')
 foreach($pair in @(@('provider-current','Murmingle'),@('provider-legacy','UniversalDiscussionLayer'))) {
  $id=$pair[0];$leaf=if($hostKey){'chatgpt-refresh-'+$hostKey+'.dpapi'}else{$null};$p=if($leaf){[IO.Path]::Combine($app,$pair[1],$leaf)}else{$null};$present=$p -and (Test-Path -LiteralPath $p)
  if($present){Ordinary $p $false;$f=New-Object IO.FileStream($p,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);$handles[$id]=$f;$bytes=$f.Length;$modified=(Get-Item -LiteralPath $p).LastWriteTimeUtc.Ticks.ToString()}
  else{if($p){Parent $p};$bytes=0;$modified=$null}
  $slots+=@{id=$id;path=$p;present=[bool]$present;bytes=$bytes;modified=$modified;leaf=$leaf}
 }
 if(($slots|Where-Object {$_.id -ceq 'accounts.sqlite'}).present -and -not ($slots|Where-Object {$_.id -ceq 'account-key.protected'}).present){throw 'key'}
 # Missing provider folders/host mapping are retained as absent slots. Their
 # creation is fenced by the trusted owner quiescence producer, not a directory lock.
 foreach($s in $slots){if($s.present){Ordinary $s.path $false}}
 [Console]::Out.WriteLine((@{ready=$true;slots=$slots}|ConvertTo-Json -Depth 5 -Compress))
 while($true){$line=[Console]::In.ReadLine();if($line -ceq 'verify'){
  foreach($s in $slots){if($s.path){$exists=Test-Path -LiteralPath $s.path;if($exists -ne $s.present){throw 'changed'};if($exists){Ordinary $s.path $false;if($handles[$s.id].Length -ne $s.bytes -or (Get-Item -LiteralPath $s.path).LastWriteTimeUtc.Ticks.ToString() -cne $s.modified){throw 'changed'}}else{Parent $s.path}}}
  foreach($parent in @($parents.Keys)){Ordinary $parent $true}
  [Console]::Out.WriteLine('{"verified":true}')
 }elseif($line -ceq 'close'){$ok=$true;break}else{throw 'closed'}}
}catch{exit 1}finally{foreach($h in $handles.Values){$h.Dispose()}}
if(-not $ok){exit 1}
`;

function start(deps){return new Promise((resolve,reject)=>{
 let child,closed=false,eofOut=false,eofErr=false,failed=false,settled=false,buffer='',pending=null,timer,originalResolve,stderrBytes=0;
 const original=new Promise(r=>{originalResolve=r;});
 function stop(){failed=true;try{child?.kill();}catch{}}
 function retire(){if(closed&&eofOut&&eofErr){if(buffer.trim())failed=true;clearTimeout(timer);originalResolve();if(!settled){settled=true;reject(failure());}pending?.reject(failure());pending=null;}}
 function message(value){if(!settled){if(!value||Object.keys(value).sort().join()!=='ready,slots'||value.ready!==true){stop();return;}const slots=slotsFrom(value.slots);settled=true;let closing=null;
  resolve(Object.freeze({slots,
   verify(){if(failed||closed||closing!==null||pending) return Promise.reject(failure());return new Promise((res,rej)=>{pending={resolve:res,reject:rej};child.stdin.write('verify\n',error=>{if(error)stop();});});},
   close(){if(!closing){closing=(async()=>{if(!closed){try{child.stdin.end('close\n');}catch{stop();}}await original;if(failed)throw failure();})();}return closing;},
  }));
 }else if(pending){const p=pending;pending=null;if(value?.verified===true&&Object.keys(value).join()==='verified')p.resolve();else{p.reject(failure());stop();}}else stop();}
 try{child=deps.spawn(deps.executable,['-NoLogo','-NoProfile','-NonInteractive','-Command',SCRIPT],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
 child.on('error',stop);child.stdin.on('error',stop);child.stdout.on('data',raw=>{if(!Buffer.isBuffer(raw)){stop();return;}buffer+=raw.toString('utf8');if(Buffer.byteLength(buffer)>65536){stop();return;}let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);try{message(JSON.parse(line));}catch{stop();}}});
 child.stderr.on('data',raw=>{if(!Buffer.isBuffer(raw)||(stderrBytes+=raw.length)>8192)stop();});child.stdout.on('end',()=>{eofOut=true;retire();});child.stderr.on('end',()=>{eofErr=true;retire();});child.once('close',code=>{closed=true;if(code!==0)failed=true;retire();});
 timer=setTimeout(stop,360000);child.stdin.write(JSON.stringify({data:DATA})+'\n',error=>{if(error)stop();});
 }catch{if(child)stop();else{clearTimeout(timer);settled=true;reject(failure());}}
});}
export function createWindowsLocalStateReadLease(){if(arguments.length||process.platform!=='win32')throw failure();return Object.freeze({acquire:()=>start({spawn,executable:path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe')})});}
export function createWindowsLocalStateReadLeaseForTest({spawn:spawnImpl,executable}){if(typeof spawnImpl!=='function'||typeof executable!=='string')throw failure();return Object.freeze({acquire:()=>start({spawn:spawnImpl,executable})});}
