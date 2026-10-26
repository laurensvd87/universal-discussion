// Read only CODE and extract pure Python helpers. Never execute guardian main.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SOURCE_PATHS} from '../native-reader-transfer-v1/source-paths.js';
const source=readFileSync(new URL('./supervise.py',import.meta.url),'utf8');
test('default inert and literal195 source closure excludes actual old artifacts/body/model assets',()=>{
 assert.ok(source.indexOf('if len(sys.argv) == 1:')<source.indexOf('kernel = ctypes.WinDLL'));
 assert.match(source,/sys\.argv\[1\] != '--run-dev'/);assert.equal(SOURCE_PATHS.length,72);
 assert.match(source,/OLD_FREEZE_SHA = '770eb68ef044dadbb6ef0f2edf2c927b643480e7d06cbf496319b1cab9d457ec'/);
 assert.match(source,/files != 115 or total != 13656167 or len\(paths\) != 187/);
 assert.match(source,/len\(hashes\) != 195 or len\(hashes\) > 256/);
 assert.match(source,/old_freeze\['sourceHashes'\] != hashes/);
 assert.match(source,/for name in NEW_SOURCE_PATHS:/);assert.match(source,/hashes\[OLD_FREEZE\] = sha\(old_bytes\)/);
 assert.doesNotMatch(source,/ARTIFACT_FILES|artifact_snapshot|root-model\.json|root-policy\.json|\.assets|input\.packet/);
 assert.doesNotMatch(source,/model_phase_elapsed|model_started_at|bounded_bytes\(HERE \/ 'source-paths\.js'\)/);
 assert.doesNotMatch(source,/taskkill|killall|rmtree|unlink\(/i);
});
test('guardian ownJob assignment, scrubbed hidden process and immutable resource bounds precede import handshake',()=>{
 assert.ok(source.indexOf('kernel.AssignProcessToJobObject(job, process_handle)')<source.indexOf("child.stdin.write(b'NATIVE_EXTENSION_STARTUP_DEV_JOB_ASSIGNED_V1\\n')"));
 assert.match(source,/0x0100 \| 0x0001 \| 0x1000/);assert.match(source,/limits\.basic\.limitFlags = 0x2000 \| 0x200/);
 assert.match(source,/creationflags=subprocess.CREATE_NO_WINDOW/);assert.match(source,/allowed = \{'SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT'\}/);
 assert.match(source,/--max-old-space-size=256/);assert.match(source,/MEMORY_LIMIT = 1536 \* MIB/);
 assert.match(source,/WALL_LIMIT = 180\nACTIVE_LIMIT = 170\nDRAIN_LIMIT = 15\nVARIANT_LIMIT = 45/);
 assert.match(source,/MAX_BYTES = 256 \* 1024/);assert.match(source,/PROFILE_MAX_BYTES = 512 \* MIB/);
 assert.match(source,/PROFILE_MAX_ENTRIES = 8192/);assert.match(source,/log_bytes > 64 \* 1024/);assert.match(source,/st_size > 128 \* 1024/);
 assert.equal((source.match(/if sampled_member_absent\(job, pid\):/g)||[]).length,3);
 assert.match(source,/if path == OUTPUT \/ 'temp':\n\s+if not stat\.S_ISDIR/);
});
test('external45s variant clocks and Node-only15s ACK cannot be reset or bypassed by ordinary Node exit',()=>{
 const loop=source.slice(source.indexOf('while child.poll() is None:'));
 assert.match(loop,/variant_deadline\(variant_started\[0\] if ack_sha is None else variant_started\[1\], now\)/);
 assert.match(loop,/second-variant-before-ack/);assert.match(loop,/descendant-before-first-variant-marker/);
 assert.match(loop,/descendant-before-second-variant-marker/);assert.match(loop,/variant-marker-removed/);
 const ack=loop.indexOf("paths['between_ack_pending'].open('xb')");
 assert.ok(loop.indexOf('end_identity(source_hashes, freeze_sha)')<ack);
 assert.ok(loop.indexOf('only_original_node(job_members(job), child.pid)')<ack);
 assert.match(loop,/os\.link\(paths\['between_ack_pending'\], paths\['between_ack'\]\)/);
 assert.match(loop,/if not normal_job_drain\(job\)/);assert.match(loop,/emergency_own_job_termination = True/);
 assert.match(loop,/second_variant_elapsed = variant_deadline\(variant_started\[1\], time\.monotonic\(\)\)/);
 assert.match(loop,/final-variant-marker-drift/);
});
export const PYTHON_AST_TEST=String.raw`
import ast, builtins, copy, hashlib, json, math, re, stat, time
from pathlib import Path
from types import SimpleNamespace as NS
base=Path('spikes/topic-resolution/harness/experimental/native-extension-startup-dev-v1')
tree=ast.parse((base/'supervise.py').read_text())
names={'ordered_json','sha','strict_json','exact_fields','hash_value','count','parse_source_names','source_snapshot','validate_freeze','validate_between_request','validate_variant_marker','variant_deadline','only_original_node','confirmed_node_exit','make_between_ack','milliseconds','validate_variant','validate_result','sampled_member_absent','normal_job_drain','owned_tree_metadata'}
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('STAGES','NEW_SOURCE_PATHS') for t in n.targets)]
assert len(nodes)==len(names)+2
# Whole-source name-binding regression catches copied final-block references,
# even when main and WinDLL are intentionally never executed by these tests.
bound=set(dir(builtins))|{'__file__','__name__','__package__','__builtins__'}
for node in ast.walk(tree):
 if isinstance(node,ast.Name) and isinstance(node.ctx,ast.Store):bound.add(node.id)
 if isinstance(node,(ast.FunctionDef,ast.ClassDef)):bound.add(node.name)
 if isinstance(node,ast.arg):bound.add(node.arg)
 if isinstance(node,ast.ExceptHandler) and node.name:bound.add(node.name)
 if isinstance(node,(ast.Import,ast.ImportFrom)):
  for alias in node.names:bound.add(alias.asname or alias.name.split('.')[0])
unbound={node.id for node in ast.walk(tree) if isinstance(node,ast.Name) and isinstance(node.ctx,ast.Load)}-bound
assert not unbound,unbound
old='spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/'
own='spikes/topic-resolution/harness/experimental/native-extension-startup-dev-v1/'
H='a'*64;B='b'*64;C='c'*64
env=dict(hashlib=hashlib,json=json,math=math,re=re,stat=stat,time=time,os=NS(scandir=None,lstat=None),job_members=lambda job:None,VARIANT_LIMIT=45,PROFILE_MAX_BYTES=512*1048576,PROFILE_MAX_ENTRIES=8192,OLD=old,OWN=own,OLD_FREEZE_SHA='770eb68ef044dadbb6ef0f2edf2c927b643480e7d06cbf496319b1cab9d457ec')
exec(compile(ast.Module(body=nodes,type_ignores=[]),'pure-supervisor','exec'),env)
def call(name,*a,**kw):return env[name](*a,**kw)
def rejects(fn):
 try:fn()
 except (RuntimeError,FileNotFoundError,KeyError,TypeError):return
 raise AssertionError('tamper accepted')
oldpaths=call('parse_source_names',Path(old+'source-paths.js').read_bytes());assert len(oldpaths)==72
rejects(lambda:call('parse_source_names',b'export const SOURCE_PATHS=Object.freeze([]);'))
rejects(lambda:call('strict_json',b'{"a":1,"a":2}'))
rejects(lambda:call('strict_json',b'{"a":NaN}'))
sources={own+'protocol.json':H}
f=dict(schema='native-extension-startup-dev-freeze/v1',sourceHashes=sources,protocolSha256=H,oldFreezeSha256=env['OLD_FREEZE_SHA'])
f['freezeHash']=call('sha',call('ordered_json',f));assert call('validate_freeze',f,sources) is f
for key in f:
 x=copy.deepcopy(f);del x[key];rejects(lambda:call('validate_freeze',x,sources))
assert call('variant_deadline',None,100) is None
assert call('variant_deadline',1,45.999)==44.999
rejects(lambda:call('variant_deadline',1,46));rejects(lambda:call('variant_deadline',2,1))
marker=dict(schema='native-startup-variant-started/v1',freezeSha256=H,variantIndex=1)
assert call('validate_variant_marker',marker,H,1)==marker
rejects(lambda:call('validate_variant_marker',marker,H,2))
rejects(lambda:call('validate_variant_marker',{**marker,'variantIndex':True},H,1))
members=NS(assigned=1,listed=1,pids=[17])
assert call('only_original_node',members,17)
assert not call('only_original_node',NS(assigned=0,listed=0,pids=[]),17)
assert not call('only_original_node',NS(assigned=2,listed=2,pids=[17,18]),17)
assert call('confirmed_node_exit',NS(assigned=0,listed=0,pids=[]),0)
assert not call('confirmed_node_exit',NS(assigned=0,listed=0,pids=[]),None)
assert call('sampled_member_absent',None,18,members=lambda _:members)
rejects(lambda:call('sampled_member_absent',None,18,members=lambda _:(_ for _ in()).throw(RuntimeError())))
def variant(name):
 return dict(variant=name,status='completed',failure=None,workerObservation='observed',nativeApiPresent=True,windowMetadata=dict(windowId=4,type='normal',incognito=False,focused=False),beginEndCompleted=True,census=dict(targets=3,blankPages=1,ownExtensionWorkers=1,otherTargets=0,ownExtensionEquality=True),events=8,contextCloseAttempts=1,browserCloseAttempts=1,contextClosed=True,browserClosed=True,physicalOperationsDrained=True,callbacksDrained=True,pending=0,elapsedMs=100)
variants=[variant('block'),variant('allow')]
request=dict(schema='native-startup-between-contexts-request/v1',freezeSha256=H,firstVariantHash=call('sha',call('ordered_json',variants[0])))
assert call('validate_between_request',request,H)==request
rejects(lambda:call('validate_between_request',{**request,'extra':1},H))
ack=call('make_between_ack',B,17,H)
assert ack==dict(schema='native-startup-between-contexts-ack/v1',requestSha256=B,originalNodePid=17,browserDescendantsAbsent=True,freezeSha256=H)
trace=[]
for name in ('block','allow'):
 for stage in ('launch','begin-study','end-study','close-context','close-browser'):
  for event in ('before','after'):trace.append(dict(variant=name,stage=stage,event=event,safeClass=None))
r=dict(schema='native-extension-startup-dev-result/v1',status='complete',freezeHash=f['freezeHash'],freezeSha256=H,protocolSha256=H,oldFreezeSha256=env['OLD_FREEZE_SHA'],sourceHashes=sources,variants=variants,trace=trace,barrier=dict(requestSha256=B,ackSha256=C),sourceHashesRechecked=True,stageBytesRechecked=True,publicNavigations=0,observations=0,modelCalls=0,rawInputPersisted=False,completeOsEgressIsolation=False,productionValidated=False,assignmentAuthority=False,elapsedMs=1000)
validate=lambda value:call('validate_result',value,f,H,sources,request,B,C)
assert validate(r)
for key in r:
 x=copy.deepcopy(r);del x[key];rejects(lambda:validate(x))
for path,value in [(('variants',0,'physicalOperationsDrained'),False),(('variants',1,'pending'),1),(('variants',0,'contextCloseAttempts'),0),(('variants',0,'contextClosed'),False),(('variants',0,'callbacksDrained'),False),(('variants',1,'elapsedMs'),45001),(('variants',0,'census','otherTargets'),1),(('barrier','ackSha256'),H),(('trace',0,'stage'),'raw-url'),(('trace',1,'event'),'before'),(('elapsedMs',),float('nan'))]:
 x=copy.deepcopy(r);at=x
 for key in path[:-1]:at=at[key]
 at[path[-1]]=value;rejects(lambda:validate(x))
# A genuinely settled launch incompatibility is diagnostic data, not a pass.
x=copy.deepcopy(r);v=x['variants'][0];v.update(status='incompatible',failure=dict(stage='launch',safeClass='native-api-error'),workerObservation='not-reached',nativeApiPresent=False,windowMetadata=None,beginEndCompleted=False,census=None,contextCloseAttempts=0,browserCloseAttempts=0,contextClosed=False,browserClosed=False)
x['trace']=[dict(variant='block',stage='launch',event='before',safeClass=None),dict(variant='block',stage='launch',event='after',safeClass='native-api-error')]+[z for z in trace if z['variant']=='allow']
request['firstVariantHash']=call('sha',call('ordered_json',v));assert validate(x)
rejects(lambda:call('validate_variant',{**v,'failure':dict(stage='launch',safeClass='raw-error-message')},'block'))
# Normal drain and metadata-only owned-tree scan use invented metadata only.
ticks=iter([0,.1,.2]);lists=iter([NS(assigned=1,listed=1),NS(assigned=0,listed=0)])
assert call('normal_job_drain',None,members=lambda _:next(lists),clock=lambda:next(ticks),pause=lambda _:None)
rejects(lambda:call('owned_tree_metadata','virtual',inspect=lambda _:NS(st_file_attributes=0x400,st_mode=stat.S_IFDIR),scan=None))
# Execute the ACTUAL inventory function against a fully invented filesystem.
# No source/artifact/profile/package file is opened by this injected reader.
class VPath:
 def __init__(self,value):self.value=str(value).rstrip('/')
 def __truediv__(self,name):return VPath(self.value+'/'+str(name))
 def __str__(self):return self.value
 @property
 def name(self):return self.value.rsplit('/',1)[-1]
 def resolve(self):return self
 def is_symlink(self):return False
 def lstat(self):return NS(st_file_attributes=0,st_mode=stat.S_IFREG if self.value in fake else stat.S_IFDIR,st_size=len(fake.get(self.value,b'')))
 def relative_to(self,parent):
  assert self.value.startswith(str(parent)+'/');return VPath(self.value[len(str(parent))+1:])
 def as_posix(self):return self.value
 def iterdir(self):
  assert self.value==str(package)
  return [VPath(key) for key in fake if key.startswith(str(package)+'/')]
repo=VPath('/invented-repository');package=repo/'package/node_modules/playwright-core';fake={};reads=[]
dev='spikes/topic-resolution/harness/experimental/playwright-dev-v1/'
integrity='invented-package-integrity'
for name in oldpaths:fake[str(repo/name)]=('invented-code-'+name).encode()
literal=('export const SOURCE_PATHS=Object.freeze('+json.dumps(oldpaths)+');').encode()
fake[str(repo/(old+'source-paths.js'))]=literal
fake[str(repo/(dev+'package-lock.json'))]=call('ordered_json',{'packages':{'node_modules/playwright-core':{'integrity':integrity}}})
pkg=call('ordered_json',{'name':'playwright-core','version':'1.64.1'})
fake[str(package/'package.json')]=pkg
size=(13656167-len(pkg))//114;remainder=(13656167-len(pkg))%114
for i in range(114):fake[str(package/('module'+str(i).zfill(3)+'.js'))]=b'x'*(size+(1 if i<remainder else 0))
old_hashes={name:call('sha',fake[str(repo/name)]) for name in oldpaths}
for path in sorted([key for key in fake if key.startswith(str(package)+'/')]):old_hashes['node_modules/playwright-core/'+path.rsplit('/',1)[-1]]=call('sha',fake[path])
assert len(old_hashes)==187
old_bytes=call('ordered_json',{'schema':'native-reader-root-transfer-freeze/v1','sourceHashes':old_hashes,'artifactHashes':{'DO-NOT-FOLLOW-THIS-ARTIFACT-PATH':H}})
for name in env['NEW_SOURCE_PATHS']:fake[str(repo/name)]=('invented-new-code-'+name).encode()
old_file=old+'freeze.json';fake[str(repo/old_file)]=old_bytes
def read(path,maximum=4*1048576):
 key=str(path);reads.append(key)
 assert key in fake,'UNEXPECTED FILE READ '+key
 data=fake[key];assert 0<len(data)<=maximum;return data
env.update(REPO=repo,HERE=repo/own,OLD_FREEZE=old_file,OLD_FREEZE_SHA=call('sha',old_bytes),PACKAGE_ROOT=package,PACKAGE_PREFIX='node_modules/playwright-core/',DEV=dev,MIB=1048576,PACKAGE_INTEGRITY=integrity,bounded_bytes=read)
actual=call('source_snapshot');assert len(actual)==195
assert actual[old_file]==call('sha',old_bytes)
assert list(actual)==list(old_hashes)+env['NEW_SOURCE_PATHS']+[old_file]
assert set(reads)==set(fake)
assert str(repo/own/'source-paths.js') not in reads
literal_reads=0
def drift(path,maximum=4*1048576):
 global literal_reads
 if str(path)==str(repo/(old+'source-paths.js')):
  literal_reads+=1
  if literal_reads>1:return b'drifted-source-literal'
 return read(path,maximum)
env['bounded_bytes']=drift;rejects(lambda:call('source_snapshot'))
print('AST-only startup supervisor helpers pass')
`;
test('extracted Python guards validate invented markers/barrier/result/resource state with no WinDLL or native main',t=>{
 let result;try{result=spawnSync('python',['-c',PYTHON_AST_TEST],{cwd:fileURLToPath(new URL('../../../../../',import.meta.url)),encoding:'utf8',maxBuffer:8192});}
 catch(e){if(['OFFLINE_CAPABILITY_DENIED','EPERM'].includes(e.code)){t.skip('Offline guard blocks Node child; run identical AST-only Python separately');return;}throw e;}
 if(result.error?.code==='EPERM'){t.skip('Offline guard blocks Node child; run identical AST-only Python separately');return;}
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/AST-only startup supervisor helpers pass/u);
});
