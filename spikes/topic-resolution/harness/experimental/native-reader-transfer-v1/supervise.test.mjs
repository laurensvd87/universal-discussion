// Source assertions and extracted pure Python helpers only. Never run guardian.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {SOURCE_PATHS} from './source-paths.js';
const path=new URL('./supervise.py',import.meta.url);
const source=readFileSync(path,'utf8');
const ledger=readFileSync(new URL('./source-ledger.js',import.meta.url),'utf8');

test('default inert precedes WinDLL, paths and inputs are fixed CODE literals',()=>{
 assert.ok(source.indexOf('if len(sys.argv) == 1:')<source.indexOf('kernel = ctypes.WinDLL'));
 assert.match(source,/sys\.argv\[1\] != '--run-study'/);
 assert.equal(SOURCE_PATHS.length,72);assert.equal(new Set(SOURCE_PATHS).size,72);
 assert.deepEqual(SOURCE_PATHS,[...SOURCE_PATHS].sort());
 assert.match(source,/files != 115 or total != 13656167 or len\(paths\) != 187/);
 assert.match(source,/len\(paths\) > 256/);
 assert.match(source,/names = parse_source_names\(literal\)/);
 assert.match(source,/data = literal if name == OWN \+ 'source-paths.js'/);
 assert.doesNotMatch(source,/taskkill|killall|psutil|rmtree|unlink\(/i);
});
test('own Job is assigned before one stdin handshake; minimal environment and limits',()=>{
 const assign=source.indexOf('if not process_handle or not kernel.AssignProcessToJobObject');
 const handshake=source.indexOf("child.stdin.write(b'NATIVE_ROOT_STUDY_JOB_ASSIGNED_V1\\n')");
 assert.ok(assign>=0&&handshake>assign);assert.match(source,/child\.stdin\.close\(\)/);
 assert.match(source,/0x0100 \| 0x0001 \| 0x1000/);
 assert.match(source,/allowed = \{'SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT'\}/);
 assert.match(source,/creationflags=subprocess.CREATE_NO_WINDOW/);
 assert.match(source,/limits\.basic\.limitFlags = 0x2000 \| 0x200/);
 assert.match(source,/WALL_LIMIT = 1800/);assert.match(source,/ACTIVE_LIMIT = 1700/);
 assert.match(source,/MEMORY_LIMIT = 1536 \* MIB/);assert.match(source,/MAX_BYTES = 1048576/);
 assert.match(source,/PROFILE_MAX_BYTES = 512 \* MIB/);assert.match(source,/PROFILE_MAX_ENTRIES = 8192/);
 assert.match(source,/log_bytes > 64 \* 1024/);assert.match(source,/st_size > 512 \* 1024/);
 assert.match(source,/time\.sleep\(\.05\)/);
});
test('drain permission requires Node-only same Job and fresh closure, never just an empty Job',()=>{
 const block=source.slice(source.indexOf('if only_original_node(members, child.pid):'));
 const pending=block.indexOf("paths['drain_ack_pending'].open('xb')"),publish=block.indexOf("os.link(paths['drain_ack_pending'], paths['drain_ack'])");
 assert.ok(pending>=0&&block.indexOf('end_identity(')<pending&&publish>pending);
 assert.match(source,/descendant-created-after-browser-drain/);
 assert.match(source,/if confirmed_node_exit\(members, child\.poll\(\)\):\n\s+break/);
 assert.match(source,/child\.wait\(\)[\s\S]+if child\.returncode != 0:[\s\S]+if not normal_job_drain\(job\)/);
 assert.match(source,/drain-evidence-drift/);assert.match(source,/browser-drain-deadline/);
 assert.match(source,/emergency_own_job_termination = True\n\s+reason = reason or 'emergency-own-job-termination-required'/);
 assert.match(source,/if not normal_job_drain\(job\)/);
 assert.match(source,/kernel\.IsProcessInJob[\s\S]+psapi\.GetProcessMemoryInfo/);
 assert.equal((source.match(/if sampled_member_absent\(job, pid\):/g)||[]).length,3);
});
test('external model deadline begins before ACK and covers end checks independently of Node cooperation',()=>{
 assert.match(source,/MODEL_LIMIT = 180/);
 const loop=source.slice(source.indexOf('while child.poll() is None:'));
 assert.match(loop,/model_phase_elapsed\(model_started_at, time\.monotonic\(\)\)\n\s+headroom/);
 assert.match(loop,/model_started_at = time\.monotonic\(\)\n\s+drain_deadline = model_started_at \+ DRAIN_LIMIT/);
 assert.ok((loop.match(/model_phase_elapsed\(model_started_at, time\.monotonic\(\)\)/g)||[]).length>=4);
 assert.match(source,/'modelPhaseStartBasis':'first-supervisor-observed-drain-request'/);
});
test('literal artifact closure is eleven CODE specs, never evidence-followed paths',()=>{
 const fields=[...source.matchAll(/^    '([A-Za-z]+)': \(([^\n]+)\),?$/gm)].map(m=>m[1]);
 assert.equal(fields.length,11);for(const key of fields)assert.match(ledger,new RegExp('\\b'+key+':\\{path:'));
 for(const pin of source.matchAll(/, '([a-f0-9]{64})'\)/g))assert.ok(ledger.includes(pin[1])||pin[1]==='d6843c87347a111277c04baf65062cf246ccd75fc883631d8c69e31563288052');
 assert.match(source,/for path, maximum, pinned in ARTIFACT_FILES.values\(\)/);
 assert.match(source,/source_hashes_rechecked = artifact_hashes_rechecked = True/);
});

// Extract selected PURE helpers via AST. No main, WinDLL, artifact snapshot,
// subprocess, package inventory, network, browser or model call is executed.
const script=String.raw`
import ast, hashlib, json, re, stat, time
from pathlib import Path
from types import SimpleNamespace as NS
base=Path('spikes/topic-resolution/harness/experimental/native-reader-transfer-v1')
tree=ast.parse((base/'supervise.py').read_text(encoding='utf8'))
names={'ordered_json','sha','strict_json','exact_fields','hash_value','count','parse_source_names','validate_freeze','validate_drain_request','only_original_node','confirmed_node_exit','make_drain_ack','validate_result','model_phase_elapsed','sampled_member_absent','owned_tree_metadata','normal_job_drain'}
env={'hashlib':hashlib,'json':json,'re':re,'stat':stat,'time':time,'os':NS(scandir=None,lstat=None),'job_members':lambda job:None,'MODEL_LIMIT':180,'PROFILE_MAX_ENTRIES':8192,'PROFILE_MAX_BYTES':512*1048576,'OWN':'spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/'}
selected=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
assert len(selected)==len(names)
exec(compile(ast.Module(body=selected,type_ignores=[]),'extracted-pure-helpers','exec'),env)
def call(name,*a,**kw):return env[name](*a,**kw)
def rejects(fn):
 try:fn()
 except (RuntimeError,FileNotFoundError):return
 raise AssertionError('expected rejection')
H='a'*64; B='b'*64; C='c'*64; own=env['OWN']
assert call('strict_json',b'{"a":1}')=={'a':1}
rejects(lambda:call('strict_json',b'{"a":1,"a":2}'))
rejects(lambda:call('strict_json',b'{"a":NaN}'))
paths=call('parse_source_names',(base/'source-paths.js').read_bytes())
assert len(paths)==72 and len(set(paths))==72
rejects(lambda:call('parse_source_names',b'export const SOURCE_PATHS=Object.freeze([]);'))
sources={own+'protocol.json':H};artifacts={'fixed/path':B}
profile={'schema':'native-root-target-producer-profile/v1','producerId':'native-browser-current','inputConstructionHash':H,'extractorVersions':['article-container-prefix/v1','main-text-prefix/v1'],'effectiveTitleRule':'trim-or-hostname/v1'}
profile['producerProfileHash']=call('sha',call('ordered_json',profile))
f={'schema':'native-reader-root-transfer-freeze/v1','sourceHashes':sources,'artifactHashes':artifacts,'protocolSha256':H,'artifactReuseReceiptSha256':C,'targetProfile':profile,'encoderHash':B}
f['freezeHash']=call('sha',call('ordered_json',f))
assert call('validate_freeze',f,sources,artifacts,C) is f
for key in ['sourceHashes','artifactHashes','protocolSha256','artifactReuseReceiptSha256','encoderHash','freezeHash']:
 bad=json.loads(json.dumps(f));bad[key]=B if f[key]==H else H
 rejects(lambda:call('validate_freeze',bad,sources,artifacts,C))
bad=json.loads(json.dumps(f));bad['targetProfile']['producerProfileHash']=H
bad['freezeHash']=call('sha',call('ordered_json',{k:v for k,v in bad.items() if k!='freezeHash'}))
rejects(lambda:call('validate_freeze',bad,sources,artifacts,C))
r={'schema':'native-root-browser-drain-request/v1','freezeSha256':H,'captureHash':B,'accounted':32,'available':3,'producerProfileHash':profile['producerProfileHash']}
assert call('validate_drain_request',r,H,profile['producerProfileHash']) is r
for key,value in [('available',True),('available',33),('accounted',31),('freezeSha256',B),('captureHash','bad'),('producerProfileHash',C)]:
 bad={**r,key:value};rejects(lambda:call('validate_drain_request',bad,H,profile['producerProfileHash']))
rejects(lambda:call('validate_drain_request',{**r,'extra':0},H,profile['producerProfileHash']))
members=lambda ids:NS(assigned=len(ids),listed=len(ids),pids=ids)
assert call('only_original_node',members([42]),42)
for ids in [[],[41],[42,43]]:assert not call('only_original_node',members(ids),42)
# Exit 1 may leave the polling loop, but MUST fail the actual outside exit gate.
assert call('confirmed_node_exit',members([]),0)
assert call('confirmed_node_exit',members([]),1)
assert not call('confirmed_node_exit',members([]),None)
for ids in [[42],[43],[42,43]]:
 for code in [None,0,1]:assert not call('confirmed_node_exit',members(ids),code)
ack=call('make_drain_ack',H,42,B)
assert list(ack)==['schema','requestSha256','originalNodePid','browserDescendantsAbsent','freezeSha256'] and ack['browserDescendantsAbsent'] is True
assert call('sampled_member_absent','own',43,members=lambda job:members([42]))
assert not call('sampled_member_absent','own',42,members=lambda job:members([42]))
def broken(job):raise RuntimeError('unverifiable')
rejects(lambda:call('sampled_member_absent','own',42,members=broken))
# Simulated independent supervisor samples: hung Node callbacks do not reset or
# cooperate with this timer; pre-ACK waiting is part of the same 180 seconds.
assert call('model_phase_elapsed',None,999) is None
assert call('model_phase_elapsed',10,189.999)==179.999
for now in [190,191,9]:rejects(lambda:call('model_phase_elapsed',10,now))
out={'schema':'native-root-study-result/v1','status':'complete','freezeHash':f['freezeHash'],'freezeSha256':H,'protocolSha256':H,'artifactReuseReceiptSha256':C,'sourceHashes':sources,'artifactHashes':artifacts,'drainRequestSha256':H,'drainAckSha256':B,'captureHash':B,'producerProfileHash':profile['producerProfileHash'],'rawInputPersisted':False,'rawInputRetained':False,'vectorInputsPersisted':False,'productionValidated':False,'assignmentAuthority':False,'sourceHashesRechecked':True,'assetHashesRechecked':True,'stageBytesRechecked':True,'capture':{'accounted':32,'available':3},'outcomes':[{'caseId':'producer-transfer-'+str(i).zfill(3),'ordinal':i,'status':'classified' if i<=3 else 'unavailable'} for i in range(1,33)],'encoderCalls':6}
def validate(v):return call('validate_result',v,f,H,sources,artifacts,r,H,B)
assert validate(out)
for key in ['freezeHash','freezeSha256','protocolSha256','artifactReuseReceiptSha256','sourceHashes','artifactHashes','drainRequestSha256','drainAckSha256','captureHash','producerProfileHash','rawInputPersisted','rawInputRetained','vectorInputsPersisted','productionValidated','assignmentAuthority']:
 bad={**out};del bad[key];rejects(lambda:validate(bad))
for change in [{'encoderCalls':8},{'encoderCalls':True},{'outcomes':out['outcomes'][:-1]},{'capture':{'accounted':32,'available':True}}]:rejects(lambda:validate({**out,**change}))
for key in ['sourceHashesRechecked','assetHashesRechecked','stageBytesRechecked']:rejects(lambda:validate({**out,key:False}))
bad=json.loads(json.dumps(out));bad['outcomes'][0]['status']='unavailable';rejects(lambda:validate(bad))
# Metadata-only owned-tree sampling: vanished discovered paths are safe, missing
# root, type/reparse/cap errors are not. No real profile or filesystem is read.
meta=lambda mode=stat.S_IFDIR,size=0,attrs=0:NS(st_mode=mode,st_size=size,st_file_attributes=attrs)
class Entry:
 def __init__(self,path,info=None):self.path=path;self.info=info
 def stat(self,**kw):
  if self.info is None:raise FileNotFoundError()
  return self.info
class Scan:
 def __init__(self,entries):self.entries=entries
 def __enter__(self):return iter(self.entries)
 def __exit__(self,*args):pass
def inspect(path):
 if path=='root/gone':raise FileNotFoundError()
 return meta()
assert call('owned_tree_metadata','root',inspect=inspect,scan=lambda p:Scan([Entry('root/gone',meta()),Entry('root/vanished')]) if p=='root' else Scan([]))==(0,2)
def missing(path):raise FileNotFoundError()
rejects(lambda:call('owned_tree_metadata','root',inspect=missing,scan=lambda p:Scan([])))
for info in [meta(stat.S_IFREG),meta(attrs=0x400)]:rejects(lambda:call('owned_tree_metadata','root',inspect=lambda p:info,scan=lambda p:Scan([])))
rejects(lambda:call('owned_tree_metadata','root',inspect=inspect,scan=lambda p:Scan([Entry('root/big',meta(stat.S_IFREG,513*1048576))])))
clock=[0.0]
def pause(delta):clock[0]+=delta
assert call('normal_job_drain','own',members=lambda job:members([]),clock=lambda:clock[0],pause=pause)
assert not call('normal_job_drain','own',members=lambda job:members([42]),clock=lambda:clock[0],pause=pause)
print('Pure Python guardian helpers PASS; no WinDLL/artifact/package/native execution')
`;

test('Python AST pure helper regressions (guarded spawn may be explicitly denied)',t=>{
 let result;
 try{result=spawnSync('python',['-c',script],{encoding:'utf8',timeout:10000,maxBuffer:32768});}
 catch(e){if(['OFFLINE_CAPABILITY_DENIED','EPERM'].includes(e?.code)){t.skip('Offline capability guard denies Python child; run extracted AST script separately.');return;}throw e;}
 if(result.error?.code==='EPERM'){t.skip('Sandbox denies Python child; run extracted AST script separately.');return;}
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr||result.stdout);
 assert.match(result.stdout,/Pure Python guardian helpers PASS/);
});
