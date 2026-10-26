import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SOURCE_PATHS} from '../native-reader-transfer-v1/source-paths.js';
import {BASE,OLD,OWN,OLD_ADDITIONS,NEW_ADDITIONS,inspectBootstrapSources,validateBootstrapFreeze,parseCodePaths} from './node.mjs';
const source=readFileSync(new URL('./run.py',import.meta.url),'utf8'),nodeSource=readFileSync(new URL('./node.mjs',import.meta.url),'utf8');
const REPO=fileURLToPath(new URL('../../../../../',import.meta.url)),PREFIX='node_modules/playwright-core/';
const DEV='spikes/topic-resolution/harness/experimental/playwright-dev-v1/';
const sha=x=>createHash('sha256').update(x).digest('hex'),digest=x=>sha(JSON.stringify(x)),bytes=x=>Buffer.from(JSON.stringify(x));
const INTEGRITY='sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==';
function fixture(){
 const files=new Map(),hashes={};for(const n of SOURCE_PATHS)files.set(resolve(REPO,n),Buffer.from('invented-code-'+n));
 files.set(resolve(REPO,BASE+'source-paths.js'),Buffer.from('export const SOURCE_PATHS=Object.freeze('+JSON.stringify(SOURCE_PATHS)+');'));
 files.set(resolve(REPO,DEV+'package-lock.json'),bytes({packages:{'node_modules/playwright-core':{integrity:INTEGRITY}}}));
 const packages=Array.from({length:114},(_,i)=>PREFIX+'module'+String(i).padStart(3,'0')+'.js').concat(PREFIX+'package.json');
 for(const n of packages)files.set(resolve(REPO,DEV,n),n.endsWith('package.json')?bytes({name:'playwright-core',version:'1.64.1'}):Buffer.from('invented-package-code'));
 for(const n of SOURCE_PATHS)hashes[n]=sha(files.get(resolve(REPO,n)));
 for(const n of packages)hashes[n]=sha(files.get(resolve(REPO,DEV,n)));
 const base=bytes({schema:'native-reader-root-transfer-freeze/v1',sourceHashes:{...hashes},artifactHashes:{'NEVER-FOLLOW-MODEL-PATH':'x'}});
 files.set(resolve(REPO,BASE+'freeze.json'),base);
 for(const n of OLD_ADDITIONS){files.set(resolve(REPO,n),Buffer.from('invented-old-code-'+n));hashes[n]=sha(files.get(resolve(REPO,n)));}
 hashes[BASE+'freeze.json']=sha(base);assert.equal(Object.keys(hashes).length,195);
 const old=bytes({schema:'native-extension-startup-dev-freeze/v1',sourceHashes:{...hashes}});
 files.set(resolve(REPO,OLD+'freeze.json'),old);
 for(const n of NEW_ADDITIONS)files.set(resolve(REPO,n),Buffer.from('invented-new-code-'+n));
 const reads=[];return {files,packages,reads,pins:{base:sha(base),old:sha(old)},
 read:async path=>{reads.push(path);assert.ok(files.has(path),'Unexpected read '+path);return Buffer.from(files.get(path));}};
}
test('builtins-only child inventories exact201 injected CODE/metadata files and never follows artifact JSON paths',async()=>{
 const f=fixture(),value=await inspectBootstrapSources({read:f.read,listPackage:async()=>f.packages,pins:f.pins});
 assert.equal(Object.keys(value.sourceHashes).length,201);assert.equal(value.sourceHashesHash,digest(value.sourceHashes));
 assert.deepEqual(new Set(f.reads),new Set(f.files.keys()));
 assert.ok(f.reads.every(n=>!n.includes('NEVER-FOLLOW-MODEL-PATH')));
 assert.deepEqual([...nodeSource.matchAll(/^import .+ from '([^']+)';$/gmu)].map(m=>m[1]).filter(n=>!n.startsWith('node:')),[]);
 assert.ok(!nodeSource.includes("import("));assert.ok(!nodeSource.includes('child_process'));
});
test('inventory refuses mutated fixed bytes, missing/extra package and invalid CODE paths',async()=>{
 for(const change of [f=>f.pins.base='a'.repeat(64),f=>f.pins.old='b'.repeat(64),f=>f.packages.pop(),f=>f.packages[0]='../outside',
 f=>f.files.set(resolve(REPO,SOURCE_PATHS[0]),Buffer.from('changed')),f=>f.files.set(resolve(REPO,BASE+'source-paths.js'),Buffer.from('bad CODE'))]){
  const f=fixture();change(f);await assert.rejects(inspectBootstrapSources({read:f.read,listPackage:async()=>f.packages,pins:f.pins}));
 }
 assert.throws(()=>parseCodePaths(Buffer.from('export const SOURCE_PATHS=Object.freeze([]);')));
 assert.throws(()=>validateBootstrapFreeze({},{}));
});
test('authenticated literal bytes precede every parsed path: a valid sorted forbidden path causes zero forbidden reads',async()=>{
 const f=fixture(),changed=[...SOURCE_PATHS];changed[0]='apps/local-service/data/forbidden-private.json';changed.sort();
 assert.equal(parseCodePaths(Buffer.from('export const SOURCE_PATHS=Object.freeze('+JSON.stringify(changed)+');')).length,72);
 f.files.set(resolve(REPO,BASE+'source-paths.js'),Buffer.from('export const SOURCE_PATHS=Object.freeze('+JSON.stringify(changed)+');'));
 let packageCalls=0;
 await assert.rejects(inspectBootstrapSources({read:f.read,listPackage:async()=>{packageCalls++;return f.packages;},pins:f.pins}));
 assert.deepEqual(f.reads,[resolve(REPO,BASE+'freeze.json'),resolve(REPO,BASE+'source-paths.js')]);
 assert.equal(packageCalls,0);assert.equal(f.reads.includes(resolve(REPO,changed[0])),false);
});
test('guardian source keeps default inert/one selection/Node-only/creation-string/ownJob-only constraints',()=>{
 assert.equal((source.match(/shutil\.which\('node'\)/gu)||[]).length,0);
 assert.match(source,/SELECTED_NODE = 'C:\/Program Files\/nodejs\/node\.exe'/);
 assert.match(source,/path = Path\(SELECTED_NODE\)/);
 assert.match(source,/creationFiletime=str\(data\['creationFiletime'\]\)/);
 assert.match(source,/if any\(row\['pid'\] != child\.pid for row in inspected\)/);
 assert.match(source,/live != \[child\.pid\]/);assert.match(source,/len\(rows\) \+ len\(inspected\) > 32/);
 assert.match(source,/len\(ids\) > 8/);assert.match(source,/IMAGE_BUFFER_UNITS = 32768/);
 assert.match(source,/kernel\.GetProcessId\(handle\)/);assert.match(source,/kernel\.GetProcessTimes/);assert.match(source,/kernel\.QueryFullProcessImageNameW/);
 assert.match(source,/kernel\.AssignProcessToJobObject[\s\S]+child\.stdin\.write/);
 assert.ok(source.indexOf("rows.append({'pid':child.pid")<source.indexOf("raise RuntimeError('selected-node-image-mismatch')"));
 assert.match(source,/creationflags=subprocess.CREATE_NO_WINDOW/);assert.match(source,/shell=False/);
 assert.match(source,/ACTIVE_LIMIT = 30\nWALL_LIMIT = 40/);assert.match(source,/CENSUS_SECONDS = 2/);
 assert.doesNotMatch(source,/taskkill|killall|rmtree|CreateToolhelp|Win32_Process|QueryInformationProcess|ReadProcessMemory|read_bytes\(\).*image/i);
 assert.ok(source.indexOf('load_windows()')<source.indexOf('kernel.QueryFullProcessImageNameW.argtypes'));
});
export const PYTHON_AST_TEST=String.raw`
import ast,builtins,hashlib,json,ntpath,re,stat,time
from pathlib import Path
from types import SimpleNamespace as NS
base=Path('spikes/topic-resolution/harness/experimental/native-bootstrap-process-dev-v1')
tree=ast.parse((base/'run.py').read_text())
bound=set(dir(builtins))|{'__file__','__name__','__package__','__builtins__'}
for n in ast.walk(tree):
 if isinstance(n,ast.Name) and isinstance(n.ctx,ast.Store):bound.add(n.id)
 if isinstance(n,(ast.FunctionDef,ast.ClassDef)):bound.add(n.name)
 if isinstance(n,ast.arg):bound.add(n.arg)
 if isinstance(n,ast.ExceptHandler) and n.name:bound.add(n.name)
 if isinstance(n,(ast.Import,ast.ImportFrom)):
  for a in n.names:bound.add(a.asname or a.name.split('.')[0])
assert not ({n.id for n in ast.walk(tree) if isinstance(n,ast.Name) and isinstance(n.ctx,ast.Load)}-bound)
names={'ordered_json','sha','strict_json','exact_fields','hash_value','count','image_identity','inspect_job_members','parse_source_names','source_snapshot','validate_freeze','validate_node_result'}
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names or isinstance(n,ast.ClassDef) and n.name=='CensusFailure' or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('CENSUS_ERRORS','OLD_ADDITIONS','NEW_ADDITIONS') for t in n.targets)]
env=dict(hashlib=hashlib,json=json,ntpath=ntpath,re=re,time=time,stat=stat,IMAGE_BUFFER_UNITS=32768,IMAGE_HASH_ENCODING='win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1',CENSUS_SECONDS=2,BASE='spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/',OLD='spikes/topic-resolution/harness/experimental/native-extension-startup-dev-v1/',OWN='spikes/topic-resolution/harness/experimental/native-bootstrap-process-dev-v1/',OLD_FREEZE_SHA='a'*64,BASE_FREEZE_SHA='b'*64)
exec(compile(ast.Module(body=nodes,type_ignores=[]),'pure-bootstrap-helpers','exec'),env)
def call(n,*a,**kw):return env[n](*a,**kw)
def fail(fn,code=None):
 try:fn()
 except RuntimeError as e:
  if code:assert str(e)==code,(str(e),code)
  return e
 raise AssertionError('expected refusal')
a=call('image_identity','C:/Program Files/Nodejs/Node.EXE')
b=call('image_identity',r'\\?\C:\program files\nodejs\node.exe')
assert a['imagePathSha256']==b['imagePathSha256']
assert a['imageBasename']=='Node.EXE'
for path in ['relative.exe','C:\\x\\'+('x'*129),'C:\\x\\..\\node.exe','C:\\x\\bad\x00.exe','x'*32768]:
 fail(lambda:call('image_identity',path))
live=[11,12];opened=[];closed=[]
def lists(job):return list(live)
def opens(pid):opened.append(pid);return pid
def identity(handle):return dict(pid=handle,creationFiletime=18446744073709551614,imagePath='C:\\Windows\\System32\\'+('node.exe' if handle==11 else 'conhost.exe'))
rows=call('inspect_job_members',None,[11,12],lists,opens,lambda h,j:True,identity,lambda h:closed.append(h))
assert len(rows)==2 and rows[0]['creationFiletime']=='18446744073709551614' and all(r['confirmedOwnJob'] for r in rows)
assert opened==[11,12] and closed==[11,12]
# Gone is proved only by this Job's fresh list; never inspect the absent PID.
live[:]=[11];opened.clear()
rows=call('inspect_job_members',None,[11,12],lists,opens,lambda h,j:True,identity,lambda h:None)
assert opened==[11] and rows[1]['inspectionStatus']=='gone' and rows[1]['creationFiletime'] is None
live[:]=[11,12]
e=fail(lambda:call('inspect_job_members',None,[11,12],lists,opens,lambda h,j:True,lambda h:(_ for _ in()).throw(RuntimeError('PRIVATE')),lambda h:None),'census-member-inspection-failed')
assert e.rows[-1]['inspectionStatus']=='inspection-failed'
e=fail(lambda:call('inspect_job_members',None,[11],lambda j:(_ for _ in()).throw(RuntimeError('PRIVATE secret')),opens,lambda h,j:True,identity,lambda h:None),'census-failed')
assert e.rows==[]
fail(lambda:call('inspect_job_members',None,list(range(1,10)),lists,opens,lambda h,j:True,identity,lambda h:None),'census-snapshot-overflow')
fail(lambda:call('inspect_job_members',None,[11],lists,opens,lambda h,j:False,identity,lambda h:None),'census-member-inspection-failed')
fail(lambda:call('inspect_job_members',None,[11],lists,opens,lambda h,j:True,lambda h:dict(pid=h+1,creationFiletime=1,imagePath=r'C:\node.exe'),lambda h:None),'census-member-inspection-failed')
ticks=iter([0,3])
fail(lambda:call('inspect_job_members',None,[11],lists,opens,lambda h,j:True,identity,lambda h:None,clock=lambda:next(ticks)),'census-deadline')
# A post-inspection disappearance discards identity rather than retaining a PID lookup.
live[:]=[11]
def disappearing(handle):live.clear();return identity(handle)
rows=call('inspect_job_members',None,[11],lists,opens,lambda h,j:True,disappearing,lambda h:None)
assert rows[0]['inspectionStatus']=='gone' and rows[0]['imagePathSha256'] is None
# Execute the actual Python inventory with synthetic files only, just as Node's
# injected inventory is tested above; the only real read here is old CODE.
class VPath:
 def __init__(self,value):self.value=str(value).rstrip('/')
 def __truediv__(self,name):return VPath(self.value+'/'+str(name))
 def __str__(self):return self.value
 @property
 def name(self):return self.value.rsplit('/',1)[-1]
 def resolve(self):return self
 def is_symlink(self):return False
 def lstat(self):return NS(st_file_attributes=0,st_mode=stat.S_IFREG if self.value in files else stat.S_IFDIR,st_size=len(files.get(self.value,b'')))
 def relative_to(self,parent):return VPath(self.value[len(str(parent))+1:])
 def as_posix(self):return self.value
 def iterdir(self):
  assert self.value==str(package);return [VPath(k) for k in files if k.startswith(str(package)+'/')]
repo=VPath('/invented-repo');package=repo/'package';files={};reads=[]
base_path=env['BASE'];old_path=env['OLD'];dev='spikes/topic-resolution/harness/experimental/playwright-dev-v1/'
literal=Path(base_path+'source-paths.js').read_bytes();oldnames=call('parse_source_names',literal)
for name in oldnames:files[str(repo/name)]=('invented-code-'+name).encode()
files[str(repo/(base_path+'source-paths.js'))]=literal
files[str(repo/(dev+'package-lock.json'))]=call('ordered_json',{'packages':{'node_modules/playwright-core':{'integrity':'synthetic'}}})
pkg=call('ordered_json',{'name':'playwright-core','version':'1.64.1'});files[str(package/'package.json')]=pkg
size,remainder=divmod(13656167-len(pkg),114)
for i in range(114):files[str(package/('module'+str(i).zfill(3)+'.js'))]=b'x'*(size+(i<remainder))
hashes={n:call('sha',files[str(repo/n)]) for n in oldnames}
for path in sorted(k for k in files if k.startswith(str(package)+'/')):hashes['node_modules/playwright-core/'+path.rsplit('/',1)[-1]]=call('sha',files[path])
base_bytes=call('ordered_json',dict(schema='native-reader-root-transfer-freeze/v1',sourceHashes=dict(hashes),artifactHashes={'MUST-NOT-FOLLOW':123}))
files[str(repo/(base_path+'freeze.json'))]=base_bytes
for n in env['OLD_ADDITIONS']:files[str(repo/n)]=n.encode();hashes[n]=call('sha',n.encode())
hashes[base_path+'freeze.json']=call('sha',base_bytes);assert len(hashes)==195
old_bytes=call('ordered_json',dict(schema='native-extension-startup-dev-freeze/v1',sourceHashes=dict(hashes)))
files[str(repo/(old_path+'freeze.json'))]=old_bytes
for n in env['NEW_ADDITIONS']:files[str(repo/n)]=n.encode()
def reader(path,maximum=4194304):
 key=str(path);reads.append(key);assert key in files,'UNEXPECTED READ '+key
 data=files[key];assert 0<len(data)<=maximum;return data
env.update(REPO=repo,PACKAGE_ROOT=package,PACKAGE_PREFIX='node_modules/playwright-core/',DEV=dev,PACKAGE_INTEGRITY='synthetic',MIB=1048576,bounded_bytes=reader,
 BASE_FREEZE=base_path+'freeze.json',OLD_FREEZE=old_path+'freeze.json',BASE_FREEZE_SHA=call('sha',base_bytes),OLD_FREEZE_SHA=call('sha',old_bytes))
assert len(call('source_snapshot'))==201;assert set(reads)==set(files)
changed=list(oldnames);changed[0]='apps/local-service/data/forbidden-private.json';changed.sort()
changed_literal=('export const SOURCE_PATHS=Object.freeze('+json.dumps(changed)+');').encode()
assert len(call('parse_source_names',changed_literal))==72
files[str(repo/(base_path+'source-paths.js'))]=changed_literal;reads.clear()
fail(lambda:call('source_snapshot'),'source-code-literal-pin')
assert reads==[str(repo/(base_path+'freeze.json')),str(repo/(base_path+'source-paths.js'))]
assert str(repo/'apps/local-service/data/forbidden-private.json') not in reads
files[str(repo/(base_path+'source-paths.js'))]=literal
files[str(repo/(old_path+'freeze.json'))]+=b' ';fail(lambda:call('source_snapshot'),'old-freeze-drift')
print('AST-only bootstrap census helpers pass')
`;
test('injected pure Python census tests run without WinDLL/Popen/process lookup',t=>{
 let r;try{r=spawnSync('python',['-c',PYTHON_AST_TEST],{cwd:REPO,encoding:'utf8',maxBuffer:8192});}
 catch(e){if(['OFFLINE_CAPABILITY_DENIED','EPERM'].includes(e.code)){t.skip('Run identical AST-only script separately; offline guard blocks child');return;}throw e;}
 if(r.error?.code==='EPERM'){t.skip('Run identical AST-only script separately; offline guard blocks child');return;}
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/AST-only bootstrap census helpers pass/u);
});
