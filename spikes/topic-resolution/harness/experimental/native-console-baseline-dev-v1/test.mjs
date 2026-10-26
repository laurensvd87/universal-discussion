import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {authenticateInventory,inspectNewSources,ADDITIONS,validateAck,sha,strict,OLD} from './node.mjs';
const digest=x=>sha(JSON.stringify(x));
const enc='win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1';
function fixture(){
 const id=(pid,path)=>({pid,creationFiletime:'18446744073709551614',imagePathSha256:sha(enc+'\0'+path),imagePathHashEncoding:enc});
 const start={schema:'native-console-start/v1',freezeSha256:'a'.repeat(64),sourceHashesHash:'b'.repeat(64),originalNodePid:10,originalNodeCreationFiletime:'18446744073709551614'};
 const base={schema:'native-console-baseline/v1',node:id(10,'c:\\program files\\nodejs\\node.exe'),console:id(11,'c:\\windows\\system32\\conhost.exe')};
 const baseline={...base,baselineHash:digest(base)};
 return {start,ack:{schema:'native-console-ack/v1',readySha256:'c'.repeat(64),freezeSha256:start.freezeSha256,sourceHashesHash:start.sourceHashesHash,originalNodePid:10,originalNodeCreationFiletime:start.originalNodeCreationFiletime,baseline,baselineHash:baseline.baselineHash}};
}
test('ACK binds exact string FILETIME, ordered identity, one READY and baseline',()=>{
 const {start,ack}=fixture();assert.equal(validateAck(ack,start,'c'.repeat(64)),ack);
 for(const mutate of [x=>x.originalNodeCreationFiletime=Number(x.originalNodeCreationFiletime),x=>x.readySha256='d'.repeat(64),x=>x.baseline.console.pid=10,x=>x.baseline.console.imagePathSha256='e'.repeat(64),x=>x.extra=true]){
  const clone=structuredClone(ack);mutate(clone);assert.throws(()=>validateAck(clone,start,'c'.repeat(64)));
 }
});
test('strict canonical JSON refuses duplicate aliases and nonfinite forms',()=>{
 for(const s of ['{"x":1,"x":1}','{"x":-0}','{"x":1e999}',' {"x":1}','{"x":1.0}'])assert.throws(()=>strict(Buffer.from(s)));
 assert.deepEqual(strict(Buffer.from('{"x":"é","n":"18446744073709551614"}')),{x:'é',n:'18446744073709551614'});
});
test('child pins fixed freeze then fixed module bytes BEFORE importer or paths',async()=>{
 const code=Buffer.from('invented pure module'),metadata=Buffer.from(JSON.stringify({sourceHashes:{[OLD+'node.mjs']:sha(code)}}));
 const seen=[];let imports=0;
 const read=async p=>{seen.push(p.replaceAll('\\','/'));return seen.length===1?metadata:code;};
 const got=await authenticateInventory({read,importer:async()=>{imports++;return {invented:true};},pins:{freeze:sha(metadata),node:sha(code)}});
 assert.equal(got.module.invented,true);assert.equal(imports,1);assert.equal(seen.length,2);assert.ok(seen[0].endsWith(OLD+'freeze.json'));assert.ok(seen[1].endsWith(OLD+'node.mjs'));
 let reads=0;await assert.rejects(authenticateInventory({read:async()=>{reads++;return metadata;},importer:async()=>{throw Error('MUST NOT IMPORT');},pins:{freeze:'f'.repeat(64),node:sha(code)}}));assert.equal(reads,1);
 reads=0;imports=0;await assert.rejects(authenticateInventory({read:async()=>++reads===1?metadata:Buffer.from('changed'),importer:async()=>{imports++;},pins:{freeze:sha(metadata),node:sha(code)}}));assert.equal(reads,2);assert.equal(imports,0);
});
test('new208 assembly follows only literal six additions and fixed old freeze',async()=>{
 const sourceHashes=Object.fromEntries(Array.from({length:201},(_,i)=>['invented/'+i,'a'.repeat(64)]));
 const bytes=Buffer.from('invented fixed metadata'),auth={bytes,metadata:{sourceHashes},module:{inspectBootstrapSources:async()=>({sourceHashes:{...sourceHashes}})}};
 const paths=[],read=async path=>{const p=path.replaceAll('\\','/');paths.push(p);return p.endsWith(OLD+'freeze.json')?bytes:Buffer.from('new CODE');};
 const out=await inspectNewSources(auth,{read});assert.equal(Object.keys(out).length,208);assert.deepEqual(Object.keys(out),[...Object.keys(sourceHashes),...ADDITIONS,OLD+'freeze.json']);
 assert.equal(paths.length,7);ADDITIONS.forEach((p,i)=>assert.ok(paths[i].endsWith(p)));
 paths.length=0;auth.metadata={sourceHashes:{...sourceHashes,'apps/local-service/data/private.json':'b'.repeat(64)}};
 await assert.rejects(inspectNewSources(auth,{read}));assert.equal(paths.length,0);
});

export const PYTHON_AST_TEST=String.raw`
import ast, pathlib, types, sys, hashlib, json, builtins
here=pathlib.Path('spikes/topic-resolution/harness/experimental/native-console-baseline-dev-v1').resolve()
b=types.ModuleType('_pure_baseline');exec(compile((here/'baseline.py').read_text(),'baseline.py','exec'),b.__dict__)
sys.modules['baseline']=b
tree=ast.parse((here/'run.py').read_text())
tree.body=[n for n in tree.body if not isinstance(n,ast.If)]
r=types.ModuleType('_pure_guardian');r.__file__=str(here/'run.py');exec(compile(tree,'run.py','exec'),r.__dict__)
def rejected(fn):
    try:fn()
    except (RuntimeError,TypeError,ValueError):return
    raise AssertionError('expected refusal')
def row(pid=10,console=False,creation='18446744073709551614'):
    return dict(pid=pid,creationFiletime=creation,imageBasename='conhost.exe' if console else 'node.exe',imagePathSha256=b.CONSOLE_HASH if console else b.NODE_HASH,imagePathHashEncoding=b.ENCODING,confirmedOwnJob=True,inspectionStatus='confirmed')
n=row();c=row(11,True)
state=b.ExactConsoleBaseline(n);state.observe([n,c],[10,11]);state.observe([n],[10]);sealed=state.seal()
assert sealed['console']['pid']==11
for i in range(100):state.observe([n],[10])
state.observe([n,c],[10,11])
rejected(lambda:state.observe([n,row(12,True)],[10,12]))
rejected(lambda:state.observe([n,row(11,True,'123')],[10,11]))
rejected(lambda:state.observe([n,c,row(12,True)],[10,11,12]))
wrong=row(12,True);wrong['imagePathSha256']='a'*64;rejected(lambda:b.ExactConsoleBaseline(n).observe([n,wrong],[10,12]))
bad=row();bad['creationFiletime']=18446744073709551614;rejected(lambda:b.ExactConsoleBaseline(bad))
bad=row();bad['confirmedOwnJob']=False;rejected(lambda:b.ExactConsoleBaseline(bad))
gone=dict(pid=10,creationFiletime=None,imageBasename=None,imagePathSha256=None,imagePathHashEncoding=b.ENCODING,confirmedOwnJob=None,inspectionStatus='gone')
rejected(lambda:state.observe([gone],[],False));state.observe([gone],[],True)
unknown=dict(gone,pid=77);rejected(lambda:state.observe([unknown],[],True))
rejected(lambda:state.observe([gone],[10],True))
empty=b.ExactConsoleBaseline(n);empty.observe([n],[10]);empty.seal();rejected(lambda:empty.observe([n,c],[10,11]))
ready=dict(schema='native-console-ready/v1',freezeSha256='a'*64,sourceHashesHash='b'*64,originalNodePid=10,originalNodeCreationFiletime=n['creationFiletime'],baselineHash='pending')
ack=b.make_ack(ready,'c'*64,'a'*64,'b'*64,sealed)
completion=dict(schema='native-console-complete/v1',readySha256='c'*64,ackSha256=b.digest(ack),freezeSha256='a'*64,sourceHashesHash='b'*64,originalNodePid=10,originalNodeCreationFiletime=n['creationFiletime'],baselineHash=sealed['baselineHash'],noBrowserImport=True,noModelCalls=True,noContentRead=True,noCanonicalWrites=True)
assert b.validate_completion(completion,'c'*64,b.digest(ack),'a'*64,'b'*64,sealed)
rejected(lambda:b.validate_completion(dict(completion,ackSha256='d'*64),'c'*64,b.digest(ack),'a'*64,'b'*64,sealed))
rejected(lambda:b.validate_completion(dict(completion,noModelCalls=1),'c'*64,b.digest(ack),'a'*64,'b'*64,sealed))
# Pin-before-exec spies. No actual old metadata/module/output reads.
code=b"assert __name__ != '__main__'\nassert __file__.replace(chr(92),'/').endswith('native-bootstrap-process-dev-v1/run.py')\nmarker='definitions-only'\n"
metadata=r.wire({'sourceHashes':{r.OLD+'run.py':r.sha(code)}})
r.OLD_FREEZE_SHA=r.sha(metadata);r.HELPER_SHA=r.sha(code)
seen=[]
def read(p,maximum=4194304):
    seen.append(str(p));return metadata if len(seen)==1 else code
module,meta,frozen=r.load_helper(read);assert module.marker=='definitions-only' and len(seen)==2 and 'kernel' not in module.__dict__
seen=[];r.OLD_FREEZE_SHA='f'*64;rejected(lambda:r.load_helper(read));assert len(seen)==1
r.OLD_FREEZE_SHA=r.sha(metadata);seen=[]
def drift(p,maximum=4194304):
    seen.append(str(p));return metadata if len(seen)==1 else b"raise AssertionError('executed wrong source')"
rejected(lambda:r.load_helper(drift));assert len(seen)==2
# Same-buffer frozen metadata and fixed new additions, never JSON-supplied paths.
oldmap={str(i):'a'*64 for i in range(201)}
fake=types.SimpleNamespace(source_snapshot=lambda:dict(oldmap))
paths=[]
def bounded(path,maximum=4194304):
    paths.append(str(path));return metadata if str(path).replace(chr(92),'/').endswith(r.OLD+'freeze.json') else b'invented new CODE'
fake.bounded_bytes=bounded
snap=r.source_snapshot(fake,{'sourceHashes':oldmap},metadata)
assert len(snap)==208 and len(paths)==7 and list(snap)[-1]==r.OLD+'freeze.json'
assert all(p.replace(chr(92),'/').endswith(key) for p,key in zip(paths[:6],r.ADDITIONS))
rejected(lambda:r.source_snapshot(fake,{'sourceHashes':dict(oldmap,forbidden='b'*64)},metadata))
assert len(paths)==7 # Mismatched old map never follows its supplied key.
# Actual waiting helper rejects first observed READY after deadline and slow read.
clock=[0];reads=[]
def late_exists():clock[0]=16;return True
rejected(lambda:r.ready_bytes(late_exists,lambda:reads.append(1),lambda:None,15,lambda:clock[0]))
assert reads==[]
clock[0]=0
def slow_read():reads.append(1);clock[0]=16;return b'ready'
rejected(lambda:r.ready_bytes(lambda:True,slow_read,lambda:None,15,lambda:clock[0]))
clock[0]=0;assert r.ready_bytes(lambda:True,lambda:b'ready',lambda:None,15,lambda:clock[0])==b'ready'
# Frozen definitions retain original globals and no old main is called.
source=(here/'run.py').read_text();assert 'normal_job_drain(' not in source and '.output_bounds(' not in source
assert 'sys.dont_write_bytecode=True' in source and source.index('sys.dont_write_bytecode=True')<source.index('from baseline import')
# Distinct retention, not a 50ms healthy-poll capacity failure.
rows=[]
for i in range(1000):r.retain_unique(rows,[n,c])
assert len(rows)==2
for i in range(12,42):r.retain_unique(rows,[row(i,True)])
rejected(lambda:r.retain_unique(rows,[row(42,True)]))
# Normal drain invokes identity-bearing sample until empty; late errors propagate.
calls=[];clock=[0]
def sample(allowed):calls.append(allowed);return [11] if len(calls)==1 else []
def pause(v):clock[0]+=v
assert r.normal_drain(sample,lambda:0,True,lambda:clock[0],pause) and calls==[True,True]
rejected(lambda:r.normal_drain(lambda allowed:(_ for _ in ()).throw(RuntimeError('late-replacement')),lambda:0,True))
clock[0]=0;rejected(lambda:r.normal_drain(lambda allowed:[],lambda:None,True,lambda:clock[0],pause))
# Full lexical name check: reject unbound copied-model locals in all functions.
assert not any(isinstance(x,ast.Name) and x.id in {'model_started_at','model_phase_elapsed','normal_job_drain','output_bounds'} for x in ast.walk(tree))
assert 'consume_completion()' in source and 'if child.poll()==0:' in source
print('ADR155 synthetic helpers passed')
`;
test('pure Python baseline/loader/drain regressions (no WinDLL/native/main)',t=>{
 let child;try{child=spawnSync('python',['-c',PYTHON_AST_TEST],{encoding:'utf8'});}catch(e){if(e.code==='OFFLINE_CAPABILITY_DENIED'){t.skip('Offline child-process guard; run same AST script separately.');return;}throw e;}
 if(child.error?.code==='OFFLINE_CAPABILITY_DENIED'){t.skip('Offline child-process guard; run same AST script separately.');return;}
 assert.equal(child.status,0,child.stderr||child.stdout);
});
test('five source files and fixed guard/constants remain scoped',async()=>{
 const py=await readFile(new URL('./run.py',import.meta.url),'utf8'),node=await readFile(new URL('./node.mjs',import.meta.url),'utf8');
 assert.match(py,/0x1000\|0x0100\|0x0001/u);assert.match(py,/len\(sources\)!=208/u);assert.match(node,/Object\.keys\(out\)\.length,208/u);
 assert.ok(!node.includes('playwright'));assert.match(py,/module\.__file__=str\(REPO\/OLD\/'run.py'\)/u);
});
