import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {SOURCE_KEYS,inventory,sha,strict,validateAck,waitAck} from './node.mjs';
const digest=x=>sha(JSON.stringify(x));
test('explicit13 inventory follows only literals, including ignored malicious metadata',async()=>{
 const seen=[],sources=await inventory({read:async path=>{seen.push(path.replaceAll('\\','/'));return Buffer.from('{"sourceHashes":{"data/private.json":"ignored"}}');}});
 assert.equal(SOURCE_KEYS.length,13);assert.equal(new Set(SOURCE_KEYS).size,13);assert.deepEqual(Object.keys(sources),SOURCE_KEYS);assert.equal(seen.length,13);
 SOURCE_KEYS.forEach((key,i)=>assert.ok(seen[i].endsWith(key)));assert.ok(seen.every(p=>!p.endsWith('data/private.json')));
 const changed=await inventory({read:async()=>Buffer.from('changed')});assert.notDeepEqual(changed,sources);
});
test('ACK exact binary identities/string FILETIME and ordered compact JSON',()=>{
 const enc='win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1',creation='18446744073709551614';
 const node={pid:10,creationFiletime:creation,imagePathSha256:sha(enc+'\0c:\\program files\\nodejs\\node.exe'),imagePathHashEncoding:enc};
 const b={schema:'native-console-baseline/v1',node,console:null},baseline={...b,baselineHash:digest(b)};
 const start={freezeSha256:'a'.repeat(64),sourceHashesHash:'b'.repeat(64),originalNodePid:10,originalNodeCreationFiletime:creation};
 const ack={schema:'native-console-ack/v1',readySha256:'c'.repeat(64),...start,baseline,baselineHash:baseline.baselineHash};
 assert.equal(validateAck(ack,start,'c'.repeat(64)),ack);
 for(const mutation of [x=>x.originalNodeCreationFiletime=Number(creation),x=>x.readySha256='d'.repeat(64),x=>x.baseline.node.pid=11,x=>x.extra=true]){const v=structuredClone(ack);mutation(v);assert.throws(()=>validateAck(v,start,'c'.repeat(64)));}
 for(const s of ['{"x":1,"x":1}','{"x":-0}',' {"x":1}','{"x":1e999}'])assert.throws(()=>strict(Buffer.from(s)));
});
test('ACK monotonic deadline rejects late existence and reads crossing bound',async()=>{
 let now=6,reads=0;await assert.rejects(waitAck({until:5,clock:()=>now,read:async()=>{reads++;return Buffer.from('ack');}}));assert.equal(reads,0);
 now=0;await assert.rejects(waitAck({until:5,clock:()=>now,read:async()=>{now=6;return Buffer.from('ack');}}));
 now=0;assert.equal((await waitAck({until:5,clock:()=>now,read:async()=>Buffer.from('ack')})).toString(),'ack');
});
export const PYTHON_AST_TEST=String.raw`
import ast,pathlib,types,re,json
here=pathlib.Path('spikes/topic-resolution/harness/experimental/composed-owned-bootstrap-dev-v1').resolve()
tree=ast.parse((here/'run.py').read_text());tree.body=[n for n in tree.body if not isinstance(n,ast.If)]
r=types.ModuleType('_invented_composed');r.__file__=str(here/'run.py');exec(compile(tree,'run.py','exec'),r.__dict__)
def reject(fn):
 try:fn()
 except Exception:return
 raise AssertionError('expected rejection')
# Both language lists are literal expressions, not paths obtained from metadata.
text=(here/'node.mjs').read_text();expr=re.search(r'export const SOURCE_KEYS=Object.freeze\((\[[\s\S]*?\])\);',text).group(1)
parsed=ast.parse(expr,mode='eval')
assert all(isinstance(n,(ast.Expression,ast.List,ast.Constant,ast.BinOp,ast.Add,ast.Name,ast.Load)) for n in ast.walk(parsed))
keys=eval(compile(parsed,'literal','eval'),{'__builtins__':{}},dict(OWN=r.OWN,OLD153=r.OLD153,OLD155=r.OLD155,PART=r.PART))
assert keys==r.SOURCE_KEYS and len(keys)==13
seen=[]
def read(path,maximum):seen.append(str(path));return b'{"sourceHashes":{"data/private.json":"ignored"}}'
sources,buffers=r.inventory(read);assert list(sources)==keys and len(seen)==13
assert all(path.replace(chr(92),'/').endswith(key) for path,key in zip(seen,keys))
# Fake exact module buffers, fixed metadata pins BEFORE any private exec.
code=b"assert __name__ != '__main__'\nmarker=__file__\n"
meta153=r.wire({'sourceHashes':{r.OLD153+'run.py':r.sha(code)}})
meta155=r.wire({'sourceHashes':{r.OLD155+'baseline.py':r.sha(code)}})
r.PIN153=r.sha(meta153);r.PIN155=r.sha(meta155);r.HELPER_PIN=r.BASELINE_PIN=r.sha(code)
buffers={key:b'CODE' for key in keys}
for key in (r.OLD153+'run.py',r.OLD155+'baseline.py',r.PART+'census.py'):buffers[key]=code
buffers[r.OLD153+'freeze.json']=meta153;buffers[r.OLD155+'freeze.json']=meta155
pins={key:r.sha(value) for key,value in buffers.items()}
mods=r.load_modules(buffers,pins)
for module,key in zip(mods,[r.OLD153+'run.py',r.OLD155+'baseline.py',r.PART+'census.py']):assert module.marker==str(r.REPO/key) and module.__name__!='__main__' and 'kernel' not in module.__dict__
changed=dict(buffers);changed[r.OLD153+'run.py']=b"raise AssertionError('must not execute')";reject(lambda:r.load_modules(changed,pins))
changed=dict(buffers);changed[r.PART+'census.py']=b"raise AssertionError('must not execute')";reject(lambda:r.load_modules(changed,pins))
changed=dict(buffers);changed[r.OLD155+'freeze.json']=b'{}';reject(lambda:r.load_modules(changed,pins))
body={'schema':'composed-owned-bootstrap-freeze/v1','sourceHashes':pins};f={**body,'freezeHash':r.sha(r.wire(body))};assert r.validate_freeze(f,pins)==f
reject(lambda:r.validate_freeze(dict(f,freezeHash='a'*64),pins))
# Reuse reviewed pure baseline/census CODE only; never their guardian/main.
base=types.ModuleType('_pure_baseline');exec(compile((r.REPO/r.OLD155/'baseline.py').read_text(),'pure-baseline','exec'),base.__dict__)
census=types.ModuleType('_pure_census');exec(compile((r.REPO/r.PART/'census.py').read_text(),'pure-census','exec'),census.__dict__)
def row(pid=10,console=False,creation='18446744073709551614'):
 return dict(pid=pid,creationFiletime=creation,imageBasename='conhost.exe' if console else 'node.exe',imagePathSha256=base.CONSOLE_HASH if console else base.NODE_HASH,imagePathHashEncoding=base.ENCODING,confirmedOwnJob=True,inspectionStatus='confirmed')
node=row();console=row(11,True);exit_allowed=[False]
policy=r.IncrementalPolicy(node,base,census,lambda:exit_allowed[0]);policy.accept(node);policy.accept(console)
gone=dict(pid=11,creationFiletime=None,imageBasename=None,imagePathSha256=None,imagePathHashEncoding=base.ENCODING,confirmedOwnJob=None,inspectionStatus='gone')
policy.accept(gone);sealed=policy.seal();assert sealed['console']['pid']==11
policy.accept(console);reject(lambda:policy.accept(row(12,True)));reject(lambda:policy.accept(row(11,True,'123')))
reject(lambda:policy.accept(dict(gone,pid=12)));reject(lambda:policy.accept(dict(gone,pid=10)))
reject(lambda:policy.final({'livePids':[]}));exit_allowed[0]=True;policy.accept(dict(gone,pid=10));policy.final({'livePids':[]})
other=r.IncrementalPolicy(node,base,census,lambda:False);other.seal();reject(lambda:other.accept(console))
unknown=row(77,True);unknown['imagePathSha256']='a'*64;reject(lambda:other.accept(unknown))
# Growing census actually calls incremental policy; no invented current row.
ids=[10];handles={};closed=[]
def identify(handle):
 if handle==10 and 11 not in ids:ids.append(11)
 value=row(handle,handle==11);return {k:value[k] for k in ['pid','creationFiletime','imageBasename','imagePathSha256','imagePathHashEncoding']}
p=r.IncrementalPolicy(node,base,census,lambda:False)
result=census.inspect_growing_job('own',list_members=lambda job:list(ids),open_member=lambda pid:pid,belongs=lambda handle,job:True,identity=identify,close_member=lambda h:closed.append(h),validate_row=p.accept)
p.final(result);assert result['livePids']==[10,11] and p.console['pid']==11 and closed==[10,11]
# READY first-seen/read crossing and successful fast path use actual wait helper.
clock=[0];reads=[]
def late_exists():clock[0]=16;return True
reject(lambda:r.wait_ready(late_exists,lambda:reads.append(1),lambda:None,15,lambda:clock[0]));assert not reads
clock[0]=0
def slow_read():clock[0]=16;return b'ready'
reject(lambda:r.wait_ready(lambda:True,slow_read,lambda:None,15,lambda:clock[0]))
clock[0]=0;assert r.wait_ready(lambda:True,lambda:b'ready',lambda:None,15,lambda:clock[0])==b'ready'
# Actual completion pair validator and publication/normal-exit race proof.
ready=dict(schema='native-console-ready/v1',freezeSha256='a'*64,sourceHashesHash='b'*64,originalNodePid=10,originalNodeCreationFiletime=node['creationFiletime'],baselineHash='pending')
ack=base.make_ack(ready,'c'*64,'a'*64,'b'*64,sealed)
complete=dict(schema='native-console-complete/v1',readySha256='c'*64,ackSha256=base.digest(ack),freezeSha256='a'*64,sourceHashesHash='b'*64,originalNodePid=10,originalNodeCreationFiletime=node['creationFiletime'],baselineHash=sealed['baselineHash'],noBrowserImport=True,noModelCalls=True,noContentRead=True,noCanonicalWrites=True)
assert base.validate_completion(complete,'c'*64,base.digest(ack),'a'*64,'b'*64,sealed)
reject(lambda:base.validate_completion(dict(complete,ackSha256='e'*64),'c'*64,base.digest(ack),'a'*64,'b'*64,sealed))
proof_calls=[]
def exit_proof():
 proof_calls.append('actual-poll0');base.validate_completion(complete,'c'*64,base.digest(ack),'a'*64,'b'*64,sealed);return True
p=r.IncrementalPolicy(node,base,census,exit_proof);p.final({'livePids':[]});assert proof_calls==['actual-poll0']
clock[0]=26;proof=[]
reject(lambda:r.confirm_normal_exit(lambda:0,lambda:proof.append(1),25,lambda:clock[0]));assert not proof
clock[0]=24
def crossed_completion():proof.append(1);clock[0]=26
reject(lambda:r.confirm_normal_exit(lambda:0,crossed_completion,25,lambda:clock[0]))
clock[0]=24;assert r.confirm_normal_exit(lambda:0,lambda:None,25,lambda:clock[0])
assert not r.confirm_normal_exit(lambda:None,lambda:(_ for _ in ()).throw(AssertionError()),25,lambda:clock[0])
# Actual initialization and pre-Popen continuation helpers reject expired budget.
events=[];clock[0]=31
fake=types.SimpleNamespace(load_windows=lambda:events.append('WinDLL'),headroom=lambda:events.append('headroom'),selected_node_path=lambda:('fixed-node',{}))
def loader():events.append('loader');return fake,None,None
reject(lambda:r.initialize(0,loader,lambda:clock[0]));assert events==[]
clock[0]=0
def slow_loader():events.append('loader');clock[0]=31;return fake,None,None
reject(lambda:r.initialize(0,slow_loader,lambda:clock[0]));assert events==['loader']
events=[];clock[0]=31
reject(lambda:r.before_active(0,lambda:events.append('Popen'),lambda:clock[0]));assert events==[]
clock[0]=0;assert r.initialize(0,loader,lambda:clock[0])[3]=='fixed-node' and events==['loader','WinDLL','headroom']
clock[0]=float('nan');reject(lambda:r.active_deadline(0,lambda:clock[0]))
# Crossing inside Popen still assigns the retained child before deadline failure;
# no handshake continuation runs, and the own Job is available for cleanup.
events=[];clock[0]=29;owned=[]
def launch():events.append('Popen');clock[0]=31;return {'pid':10}
child=r.before_active(0,launch,lambda:clock[0]);events.append('OpenProcess');original='retained-original-handle'
def assign(handle):events.append('Assign');owned.append(child['pid']);return True
try:
 r.assign_then_check(0,original,assign,lambda:clock[0]);events.append('handshake')
except RuntimeError as error:assert str(error)=='active-deadline'
else:raise AssertionError('late launch continued')
assert events==['Popen','OpenProcess','Assign'] and owned==[10] and original=='retained-original-handle'
events=[];reject(lambda:r.assign_then_check(0,None,lambda h:events.append('Assign'),lambda:0));assert events==[]
reject(lambda:r.assign_then_check(0,original,lambda h:False,lambda:0))
# Normal drain still calls identity sample and rejects late replacement.
ticks=[0];samples=[]
def sample():samples.append(1);return [11] if len(samples)==1 else []
def pause(dt):ticks[0]+=dt
r.drain(sample,lambda:0,lambda:ticks[0],pause);assert len(samples)==2
reject(lambda:r.drain(lambda:(_ for _ in ()).throw(census.PolicyFailure('policy-late-member')),lambda:0))
ticks[0]=0;reject(lambda:r.drain(lambda:[],lambda:None,lambda:ticks[0],pause))
# Primary/cleanup source data is preserved, and false close is fatal in component.
try:census.inspect_growing_job('own',list_members=lambda job:[10],open_member=lambda pid:pid,belongs=lambda h,j:True,identity=lambda h:{k:v for k,v in node.items() if k not in ['confirmedOwnJob','inspectionStatus']},close_member=lambda h:0,validate_row=lambda row:(_ for _ in ()).throw(census.PolicyFailure('policy-unknown-member')))
except census.CensusFailure as error:assert error.code=='policy-unknown-member' and error.cleanupCode=='census-close-failed'
else:raise AssertionError('dual failure hidden')
source=(here/'run.py').read_text()
for forbidden in ['helper.source_snapshot(','.output_bounds(','.normal_job_drain(','.main(','.run(']:assert forbidden not in source
assert 'reason=error.code;cleanup_code=error.cleanupCode' in source and 'normal_exit_confirmed=confirm_normal_exit' in source
assert 'except census.PolicyFailure as error:\n            reason=error.code' in source
assert source.index('child_started=time.monotonic()')<source.index('child=before_active(started,lambda:subprocess.Popen(')
assert source.index('original=k.OpenProcess(')<source.index('assign_then_check(started,original,lambda handle:k.AssignProcessToJobObject')
assert 'sys.dont_write_bytecode=True' in source
print('ADR158 invented composed regressions passed')
`;
test('pure injected Python composition (no WinDLL/native/process/main)',t=>{
 let child;try{child=spawnSync('python',['-c',PYTHON_AST_TEST],{encoding:'utf8'});}catch(e){if(e.code==='OFFLINE_CAPABILITY_DENIED'){t.skip('Subprocess guard; identical pure AST suite runs separately.');return;}throw e;}
 assert.equal(child.status,0,child.stderr||child.stdout);
});
test('default child has builtins-only imports and no old source inventory',async()=>{
 const text=await readFile(new URL('./node.mjs',import.meta.url),'utf8');for(const match of text.matchAll(/from '([^']+)'/gu))assert.ok(match[1].startsWith('node:'));
 assert.ok(!text.includes('inspectBootstrapSources'));assert.ok(!text.includes('node_modules'));
});
