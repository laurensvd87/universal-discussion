import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {win32} from 'node:path';
import {ADDITIONS,BASE,V151,V158,V153,V155,V157,sha,digest,inspectSources} from './source-ledger.js';
import {validateStartupAck,drainRequest,validateDrainAck,awaitMetadata,admitStartup,checkStageLayout,FIXED_BROWSER_PATHS,resolveFixedBrowser,createPrelude} from './run.mjs';
const DEV='spikes/topic-resolution/harness/experimental/playwright-dev-v1/',PREFIX='node_modules/playwright-core/';
const integrity='sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==';
function sourceFixture(){
 const names=[BASE+'source-paths.js',DEV+'package-lock.json',...Array.from({length:70},(_,i)=>'code/invented-'+String(i).padStart(2,'0')+'.js')].sort();
 const packages=[PREFIX+'package.json',...Array.from({length:114},(_,i)=>PREFIX+'invented-'+String(i).padStart(3,'0')+'.js')].sort();
 const buffers=Object.fromEntries([...names,...packages].map(key=>[key,Buffer.from('invented CODE')]));
 buffers[BASE+'source-paths.js']=Buffer.from('export const SOURCE_PATHS=Object.freeze('+JSON.stringify(names)+');');
 buffers[DEV+'package-lock.json']=Buffer.from(JSON.stringify({packages:{[PREFIX.slice(0,-1)]:{integrity}}},null,2));
 buffers[PREFIX+'package.json']=Buffer.from(JSON.stringify({name:'playwright-core',version:'1.64.1'},null,2));
 const sourceHashes=Object.fromEntries([...names,...packages].map(key=>[key,sha(buffers[key])]));
 buffers[BASE+'freeze.json']=Buffer.from(JSON.stringify({sourceHashes}));for(const key of ADDITIONS)buffers[key]??=Buffer.from('invented addition');
 const seen=[];const read=async path=>{const p=path.replaceAll('\\','/'),key=p.includes(PREFIX)?PREFIX+p.split(PREFIX)[1]:[...Object.keys(buffers)].find(key=>p.endsWith(key));seen.push(key??p);assert.ok(key,'Only fixed invented reads');return buffers[key];};
 return {buffers,sourceHashes,names,packages,seen,read};
}
test('203 closure exact originals plus16; pin literal BEFORE following names',async()=>{
 const f=sourceFixture(),out=await inspectSources({read:f.read,listPackage:async()=>f.packages,basePin:sha(f.buffers[BASE+'freeze.json']),authenticateSources:()=>{}});
 assert.equal(Object.keys(out.sourceHashes).length,203);assert.deepEqual(Object.keys(out.sourceHashes),[...Object.keys(f.sourceHashes),...ADDITIONS]);assert.equal(ADDITIONS.length,16);
 f.seen.length=0;f.buffers[BASE+'source-paths.js']=Buffer.from('export const SOURCE_PATHS=Object.freeze(["data/private.json"]);');
 await assert.rejects(inspectSources({read:f.read,listPackage:async()=>{throw Error('MUST NOT FOLLOW PACKAGE');},basePin:sha(f.buffers[BASE+'freeze.json']),authenticateSources:()=>{}}));
 assert.deepEqual(f.seen,[BASE+'freeze.json',BASE+'source-paths.js']);
 f.seen.length=0;await assert.rejects(inspectSources({read:f.read,basePin:'f'.repeat(64)}));assert.deepEqual(f.seen,[BASE+'freeze.json']);
});
function handshake(){
 const encoding='win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1';
 const node={pid:10,creationFiletime:'18446744073709551614',imagePathSha256:sha(encoding+'\0c:\\program files\\nodejs\\node.exe'),imagePathHashEncoding:encoding};
 const body={schema:'native-console-baseline/v1',node,console:null},baseline={...body,baselineHash:digest(body)};
 const start={schema:'native-console-start/v1',freezeSha256:'a'.repeat(64),sourceHashesHash:'b'.repeat(64),originalNodePid:10,originalNodeCreationFiletime:node.creationFiletime};
 const ack={schema:'native-console-ack/v1',readySha256:'c'.repeat(64),freezeSha256:start.freezeSha256,sourceHashesHash:start.sourceHashesHash,originalNodePid:10,originalNodeCreationFiletime:node.creationFiletime,baseline,baselineHash:baseline.baselineHash};return {start,ack};
}
test('startup admission blocks first old import/stage/browser callback on bad/late ACK',async()=>{
 const {start,ack}=handshake();assert.equal(validateStartupAck(ack,start,'c'.repeat(64)),ack);let calls=0;
 const invoke=bytes=>admitStartup({ackBytes:bytes,start,readySha:'c'.repeat(64),until:5,clock:()=>0,action:async()=>{calls++;return 'admitted';}});
 await assert.rejects(invoke(Buffer.from(JSON.stringify({...ack,readySha256:'d'.repeat(64)}))));assert.equal(calls,0);
 await assert.rejects(admitStartup({ackBytes:Buffer.from(JSON.stringify(ack)),start,readySha:'c'.repeat(64),until:5,clock:()=>6,action:()=>calls++}));assert.equal(calls,0);
 assert.equal((await invoke(Buffer.from(JSON.stringify(ack)))).value,'admitted');assert.equal(calls,1);
});
test('two drain pairs bind variant/startup/freeze/baseline exactly; late reads fail',async()=>{
 const {start,ack}=handshake(),variant={variant:'block',physicalOperationsDrained:true,callbacksDrained:true,pending:0};
 const request=drainRequest(1,variant,start,'c'.repeat(64),'d'.repeat(64),ack.baselineHash),requestSha=digest(request);
 const response={schema:'baselined-startup-drain-ack/v1',requestSha256:requestSha,variantIndex:1,freezeSha256:start.freezeSha256,sourceHashesHash:start.sourceHashesHash,readySha256:'c'.repeat(64),startupAckSha256:'d'.repeat(64),baselineHash:ack.baselineHash,originalNodePid:10,originalNodeCreationFiletime:start.originalNodeCreationFiletime,browserResidualAbsent:true};
 assert.equal(validateDrainAck(response,request,requestSha),response);
 for(const bad of [{...response,variantIndex:2},{...response,browserResidualAbsent:false},{...response,requestSha256:'f'.repeat(64)},{...response,extra:true}])assert.throws(()=>validateDrainAck(bad,request,requestSha));
 let now=0;await assert.rejects(awaitMetadata(async()=>{now=16;return Buffer.from('ack');},15,{clock:()=>now}));
 now=16;let reads=0;await assert.rejects(awaitMetadata(async()=>{reads++;},15,{clock:()=>now}));assert.equal(reads,0);
});
test('stage requires exact six files/two directories, no extras or reparses',async()=>{
 const stage='D:\\invented-stage',layout={'':['chromium','core','manifest.json','native-adapter.js','native-rights.js','worker.js'],chromium:['page-content-reader.js'],core:['page-content-policy.js']};
 const sub=path=>path===stage?'':path.slice(stage.length+1);
 const metadata=async path=>({directory:path===stage||['chromium','core'].includes(sub(path)),file:!(path===stage||['chromium','core'].includes(sub(path))),symbolic:false,resolved:path});
 const list=async path=>[...layout[sub(path)]];await checkStageLayout(stage,{metadata,list});
 await assert.rejects(checkStageLayout(stage,{metadata,list:async path=>path===stage?[...layout[''],'extra.js']:list(path)}));
 await assert.rejects(checkStageLayout(stage,{list,metadata:async path=>({...await metadata(path),symbolic:path.endsWith('worker.js')})}));
});
test('fixed resolver normalizes Win32 separators and returns only fixed resolved path',async()=>{
 const seen=[],first=win32.resolve(FIXED_BROWSER_PATHS[0]),second=win32.resolve(FIXED_BROWSER_PATHS[1]);
 const resolvePath=literal=>{seen.push(['resolve',literal]);return win32.resolve(literal);};
 const inspect=async path=>{seen.push(['inspect',path]);return {isFile:()=>true,isSymbolicLink:()=>false};};
 const real=async path=>{seen.push(['real',path]);return path;};
 assert.equal(await resolveFixedBrowser({resolvePath,inspect,real}),first);assert.deepEqual(seen,[['resolve',FIXED_BROWSER_PATHS[0]],['inspect',first],['real',first]]);
 seen.length=0;assert.equal(await resolveFixedBrowser({resolvePath,inspect:async path=>{seen.push(['inspect',path]);if(path===first)throw Object.assign(Error('invented absence'),{code:'ENOENT'});return {isFile:()=>true,isSymbolicLink:()=>false};},real}),second);
 assert.deepEqual(seen,[['resolve',FIXED_BROWSER_PATHS[0]],['inspect',first],['resolve',FIXED_BROWSER_PATHS[1]],['inspect',second],['real',second]]);
});
test('fixed resolver never falls back on nonregular/symlink/mismatch/unexpected errors',async()=>{
 const first=win32.resolve(FIXED_BROWSER_PATHS[0]);
 for(const kind of ['nonregular','symlink','mismatched-realpath','unexpected-inspect','unexpected-realpath']){
  const inspected=[];await assert.rejects(resolveFixedBrowser({resolvePath:win32.resolve,
   inspect:async path=>{inspected.push(path);if(kind==='unexpected-inspect')throw Object.assign(Error('private details'),{code:'EACCES'});return {isFile:()=>kind!=='nonregular',isSymbolicLink:()=>kind==='symlink'};},
   real:async path=>{if(kind==='unexpected-realpath')throw Object.assign(Error('race'),{code:'ENOENT'});return kind==='mismatched-realpath'?win32.resolve('C:/invented-other/chrome.exe'):path;},
  }));assert.deepEqual(inspected,[first]);
 }
});
test('finite prelude executes actual strict ordering; failed step has no after or continuation',async()=>{
 const observed=[],actions=[],stages=['coordinator-import','staging-recheck','fixed-browser-resolver','maintained-client-import'];
 const prelude=createPrelude(row=>observed.push(row));
 for(const stage of stages)assert.equal(await prelude.step(stage,async()=>{actions.push(stage);return stage;}),stage);
 assert.deepEqual(actions,stages);assert.equal(observed.length,8);assert.deepEqual(prelude.snapshot(),observed);
 stages.forEach((stage,index)=>assert.deepEqual(observed.slice(index*2,index*2+2),[{schema:'baselined-startup-prelude/v1',stage,event:'before'},{schema:'baselined-startup-prelude/v1',stage,event:'after'}]));
 await assert.rejects(prelude.step('maintained-client-import',async()=>actions.push('FORBIDDEN')));assert.equal(actions.length,4);
 const failed=createPrelude();await failed.step(stages[0],async()=>{});await assert.rejects(failed.step(stages[1],async()=>{throw Error('PRIVATE raw path/error');}));
 assert.deepEqual(failed.snapshot().map(row=>[row.stage,row.event]),[[stages[0],'before'],[stages[0],'after'],[stages[1],'before']]);
 await assert.rejects(failed.step(stages[2],async()=>actions.push('FORBIDDEN')));assert.ok(!JSON.stringify(failed.snapshot()).includes('PRIVATE'));
 const guarded=createPrelude(()=>{},()=>{throw Error('expired');});let calls=0;await assert.rejects(guarded.step(stages[0],async()=>calls++));assert.equal(calls,0);assert.equal(guarded.snapshot().length,0);
});
export const PYTHON_AST_TEST=String.raw`
import ast,pathlib,types,re,json,stat
here=pathlib.Path('spikes/topic-resolution/harness/experimental/baselined-extension-startup-v2').resolve()
assert here.name=='baselined-extension-startup-v2'
tree=ast.parse((here/'supervise.py').read_text());tree.body=[n for n in tree.body if not isinstance(n,ast.If)]
r=types.ModuleType('_invented_161');r.__file__=str(here/'supervise.py');exec(compile(tree,'supervise.py','exec'),r.__dict__)
def reject(fn):
 try:fn()
 except Exception:return
 raise AssertionError('expected rejection')
# Both exact16 literal additions, and full invented203 inventory.
source=(here/'source-ledger.js').read_text();expr=re.search(r'export const ADDITIONS=Object.freeze\((\[[\s\S]*?\])\);',source).group(1)
p=ast.parse(expr,mode='eval');assert all(isinstance(n,(ast.Expression,ast.List,ast.Constant,ast.BinOp,ast.Add,ast.Name,ast.Load)) for n in ast.walk(p))
assert eval(compile(p,'literal','eval'),{'__builtins__':{}},{k:getattr(r,k) for k in ['OWN','BASE','V151','V158','V153','V155','V157']})==r.ADDITIONS
names=sorted([r.BASE+'source-paths.js',r.DEV+'package-lock.json']+['code/invented-%02d.js'%i for i in range(70)])
packages=sorted([r.PREFIX+'package.json']+[r.PREFIX+'invented-%03d.js'%i for i in range(114)])
buffers={key:b'invented CODE' for key in names+packages}
buffers[r.BASE+'source-paths.js']=b'export const SOURCE_PATHS=Object.freeze('+r.wire(names)+b');'
buffers[r.DEV+'package-lock.json']=r.wire({'packages':{r.PREFIX[:-1]:{'integrity':r.INTEGRITY}}})
buffers[r.PREFIX+'package.json']=r.wire({'name':'playwright-core','version':'1.64.1'})
base_map={key:r.sha(buffers[key]) for key in names+packages};buffers[r.BASE+'freeze.json']=r.wire({'sourceHashes':base_map})
for key in r.ADDITIONS:buffers.setdefault(key,b'addition')
seen=[]
def read(path,maximum=4194304):
 text=str(path).replace(chr(92),'/');key=r.PREFIX+text.split(r.PREFIX)[1] if r.PREFIX in text else next(key for key in buffers if text.endswith(key));seen.append(key);return buffers[key]
pin=r.sha(buffers[r.BASE+'freeze.json']);sources,got=r.inventory(read,lambda:packages,pin,lambda b:None)
assert len(sources)==203 and list(sources)==names+packages+r.ADDITIONS
seen=[];buffers[r.BASE+'source-paths.js']=b'export const SOURCE_PATHS=Object.freeze(["data/private.json"]);'
reject(lambda:r.inventory(read,lambda:(_ for _ in ()).throw(AssertionError('followed package')),pin,lambda b:None));assert seen==[r.BASE+'freeze.json',r.BASE+'source-paths.js']
seen=[];reject(lambda:r.inventory(read,lambda:packages,'f'*64,lambda b:None));assert seen==[r.BASE+'freeze.json']
# Component private verified bytes: no oldmain/inventory/global rewriting.
fake_code=b"assert __name__ != '__main__'\nmarker=__file__\ndef load_modules(buffers,sources):return ('win','base','census')\n"
fake_buffers={r.V158+'run.py':fake_code};fake_sources={r.V158+'run.py':r.sha(fake_code)};auth_calls=[]
r.authenticate=lambda b:auth_calls.append(b)
composed,*rest=r.load_components(fake_buffers,fake_sources);assert composed.marker==str(r.REPO/r.V158/'run.py') and rest==['win','base','census'] and len(auth_calls)==1
reject(lambda:r.load_components(fake_buffers,{r.V158+'run.py':'a'*64}))
# Reuse actual pure CODE definitions, never the old guardian/main/native calls.
code=(r.REPO/r.V158/'run.py').read_text();oldtree=ast.parse(code);oldtree.body=[n for n in oldtree.body if not isinstance(n,(ast.If,ast.ImportFrom)) or isinstance(n,ast.ImportFrom) and n.module!='baseline']
c=types.ModuleType('_pure_composed');c.__file__=str(r.REPO/r.V158/'run.py');exec(compile(oldtree,'pure158','exec'),c.__dict__)
base=types.ModuleType('_pure_base');exec(compile((r.REPO/r.V155/'baseline.py').read_text(),'purebase','exec'),base.__dict__)
census=types.ModuleType('_pure_census');exec(compile((r.REPO/r.V157/'census.py').read_text(),'purecensus','exec'),census.__dict__)
def row(pid=10,console=False):return dict(pid=pid,creationFiletime='18446744073709551614',imageBasename='conhost.exe' if console else 'node.exe',imagePathSha256=base.CONSOLE_HASH if console else base.NODE_HASH,imagePathHashEncoding=base.ENCODING,confirmedOwnJob=True,inspectionStatus='confirmed')
node=row();console=row(11,True);p=c.IncrementalPolicy(node,base,census,lambda:False);p.accept(node);p.accept(console);gone=dict(pid=11,creationFiletime=None,imageBasename=None,imagePathSha256=None,imagePathHashEncoding=base.ENCODING,confirmedOwnJob=None,inspectionStatus='gone');p.accept(gone);sealed=p.seal();p.accept(console);reject(lambda:p.accept(row(12,True)))
unknown=row(77,True);unknown['imagePathSha256']='a'*64;reject(lambda:p.accept(unknown))
clock=[31];native=[];helper=types.SimpleNamespace(load_windows=lambda:native.append('WinDLL'),headroom=lambda:None,selected_node_path=lambda:('fixed',{}))
reject(lambda:c.initialize(0,lambda:(helper,base,census),lambda:clock[0]));assert native==[]
loader_calls=[]
def loader(buffers,sources):loader_calls.append(1);return c,helper,base,census
reject(lambda:r.bootstrap_initialize(0,{}, {},loader,lambda:clock[0]));assert loader_calls==[] and native==[]
clock[0]=0
def slow_loader(buffers,sources):loader_calls.append(1);clock[0]=31;return c,helper,base,census
reject(lambda:r.bootstrap_initialize(0,{}, {},slow_loader,lambda:clock[0]));assert loader_calls==[1] and native==[]
reject(lambda:c.before_active(0,lambda:native.append('Popen'),lambda:clock[0]));assert native==[]
clock[0]=0;r.bootstrap_initialize(0,{}, {},loader,lambda:clock[0]);assert native==['WinDLL']
# Layout is metadata-only and exact in Python too; stage contents never inferred.
stage=pathlib.Path('D:/invented-stage');layout={'':['chromium','core','manifest.json','native-adapter.js','native-rights.js','worker.js'],'chromium':['page-content-reader.js'],'core':['page-content-policy.js']}
def inspect(path):return types.SimpleNamespace(st_file_attributes=0,st_mode=stat.S_IFDIR if path==stage or path.parent==stage and path.name in ('chromium','core') else stat.S_IFREG)
def listing(path):return list(layout['' if path==stage else path.name])
r.stage_layout(stage,inspect,listing)
reject(lambda:r.stage_layout(stage,inspect,lambda path:listing(path)+(['extra.js'] if path==stage else [])))
def reparsed(path):v=inspect(path);v.st_file_attributes=0x400 if path.name=='core' else 0;return v
reject(lambda:r.stage_layout(stage,reparsed,listing))
# Bounded residual polling: one non-sliding lease, THEN actual identity sample.
clock=[0];members=[[10,11,90],[10,11]];events=[];poll=lambda:None
def listing():events.append('members');return members.pop(0) if len(members)>1 else list(members[0])
def sample():events.append('exact-census');return [10,11]
def publish(before):before();events.append('ACK')
def pause(dt):clock[0]+=dt
r.barrier(15,10,{10,11},poll,listing,sample,lambda:events.append('sources'),publish,lambda:None,lambda:clock[0],pause)
assert events.index('exact-census')>events.index('members') and events.index('ACK')>events.index('sources')
clock[0]=0;events=[]
reject(lambda:r.barrier(15,10,{10,11},poll,lambda:[10,11,90],sample,lambda:None,publish,lambda:None,lambda:clock[0],pause));assert 'ACK' not in events and 'exact-census' not in events
clock[0]=0
reject(lambda:r.barrier(15,10,{10,11},lambda:0,lambda:[10,11],sample,lambda:None,publish,lambda:None,lambda:clock[0],pause))
reject(lambda:r.barrier(15,10,{10,11},poll,lambda:[11],sample,lambda:None,publish,lambda:None,lambda:clock[0],pause))
def replaced():raise census.PolicyFailure('policy-identity-conflict')
reject(lambda:r.barrier(15,10,{10,11},poll,lambda:[10,11],replaced,lambda:None,publish,lambda:None,lambda:clock[0],pause))
def slow_recheck():clock[0]=16
events=[];reject(lambda:r.barrier(15,10,{10,11},poll,lambda:[10,11],sample,slow_recheck,publish,lambda:None,lambda:clock[0],pause));assert 'ACK' not in events
# Same-PID console incarnation replacement during source IO is caught by the
# actual second identity sample immediately before link, not by PID subset.
clock[0]=0;events=[];changed=[False]
def identity_sample():
 events.append('exact-census')
 if changed[0]:raise census.PolicyFailure('policy-identity-conflict')
 return [10,11]
def replacement_during_recheck():changed[0]=True
reject(lambda:r.barrier(15,10,{10,11},poll,lambda:[10,11],identity_sample,replacement_during_recheck,publish,lambda:None,lambda:clock[0],pause));assert 'ACK' not in events and events.count('exact-census')==2
# Fresh growth immediately prepublication remains fatal; no count equality grant.
clock[0]=0;calls=[0];events=[]
def late_growth():calls[0]+=1;return [10,11] if calls[0]<4 else [10,11,99]
reject(lambda:r.barrier(15,10,{10,11},poll,late_growth,sample,lambda:None,publish,lambda:None,lambda:clock[0],pause));assert 'ACK' not in events
# Both final pending+published copies count against WHOLE output and evidence.
r.reserve_receipt(512*1048576-20,1048576-20,8190,10)
reject(lambda:r.reserve_receipt(512*1048576-19,0,0,10))
reject(lambda:r.reserve_receipt(0,1048576-19,0,10))
reject(lambda:r.reserve_receipt(0,0,8191,10))
# Variant result validates physical/callback settlement and actual close counts.
v=dict(variant='block',status='incompatible',failure={'stage':'launch','safeClass':'native-api-error'},workerObservation='not-reached',nativeApiPresent=False,windowMetadata=None,beginEndCompleted=False,census=None,events=0,contextCloseAttempts=0,browserCloseAttempts=0,contextClosed=False,browserClosed=False,physicalOperationsDrained=True,callbacksDrained=True,pending=0,elapsedMs=1)
assert r.validate_variant(v,'block')==v
for key,value in [('pending',1),('physicalOperationsDrained',False),('callbacksDrained',False),('contextCloseAttempts',1),('elapsedMs',45001)]:reject(lambda key=key,value=value:r.validate_variant(dict(v,**{key:value}),'block'))
# Complete two-variant proof and one exact startup/drain-pair binding.
variants=[v,dict(v,variant='allow')];pairs=[{'requestSha256':'c'*64,'ackSha256':'d'*64,'variantHash':r.sha(r.wire(value))} for value in variants]
trace=[]
for variant in ('block','allow'):
 trace.extend([dict(variant=variant,stage='launch',event='before',safeClass=None),dict(variant=variant,stage='launch',event='after',safeClass='native-api-error')])
frozen={'freezeHash':'f'*64};result=dict(schema='baselined-extension-startup-result/v1',status='complete',freezeHash='f'*64,freezeSha256='a'*64,sourceHashesHash='b'*64,readySha256='c'*64,startupAckSha256='d'*64,baselineHash=sealed['baselineHash'],variants=variants,drainPairs=pairs,trace=trace,sourceHashesRechecked=True,stageBytesRechecked=True,publicNavigations=0,observations=0,modelCalls=0,rawInputPersisted=False,completeOsEgressIsolation=False,productionValidated=False,assignmentAuthority=False)
result_bytes=r.wire(result);completion=dict(schema='baselined-startup-complete/v1',freezeSha256='a'*64,sourceHashesHash='b'*64,readySha256='c'*64,startupAckSha256='d'*64,baselineHash=sealed['baselineHash'],originalNodePid=10,originalNodeCreationFiletime=node['creationFiletime'],resultSha256=r.sha(result_bytes),drainPairs=pairs)
def complete(value=completion,data=result_bytes):return r.validate_completion_record(value,data,frozen,'a'*64,'b'*64,'c'*64,'d'*64,sealed,p.node,variants,pairs)
assert complete()
for key,value in [('readySha256','e'*64),('resultSha256','e'*64),('originalNodeCreationFiletime','123'),('drainPairs',pairs[:1])]:reject(lambda key=key,value=value:complete(dict(completion,**{key:value})))
changed=r.wire(dict(result,stageBytesRechecked=False));reject(lambda:complete(dict(completion,resultSha256=r.sha(changed)),changed))
changed=r.wire(dict(result,variants=list(reversed(variants))));reject(lambda:complete(dict(completion,resultSha256=r.sha(changed)),changed))
# Exact original six stage targets only, no old output/artifact source entries.
assert len(r.STAGE_FILES)==6 and set(r.STAGE_FILES)=={'manifest.json','worker.js','native-adapter.js','native-rights.js','chromium/page-content-reader.js','core/page-content-policy.js'}
for forbidden in ['helper.source_snapshot(','.output_bounds(','.normal_job_drain(','.inventory(','.run(','.main(']:assert forbidden not in (here/'supervise.py').read_text()
assert 'reason=error.code;cleanup_code=error.cleanupCode' in (here/'supervise.py').read_text()
assert 'child=composed.before_active(started,lambda:subprocess.Popen' in (here/'supervise.py').read_text()
print('ADR161 invented composition regressions passed')
`;
test('pure Python AST/injected203/baseline/drain/variant suite',t=>{
 assert.ok(PYTHON_AST_TEST.includes("experimental/baselined-extension-startup-v2').resolve()"));assert.ok(!PYTHON_AST_TEST.includes('baselined-extension-startup-v1'));
 let child;try{child=spawnSync('python',['-c',PYTHON_AST_TEST],{encoding:'utf8'});}catch(error){if(error.code==='OFFLINE_CAPABILITY_DENIED'){t.skip('Subprocess guard; identical pure suite runs separately.');return;}throw error;}
 assert.equal(child.status,0,child.stderr||child.stdout);
});
test('source-only driver gates before dynamic151 import and exact stage rechecks',async()=>{
 const text=await readFile(new URL('./run.mjs',import.meta.url),'utf8');assert.ok(text.indexOf('const f=validateFreeze')<text.indexOf("action:()=>prelude.step('coordinator-import'"));assert.ok(text.includes('await old.runStartupVariant('));assert.ok(text.includes('Object.entries(old.STAGE_FILES)'));
 assert.ok(text.includes("prelude.step('fixed-browser-resolver',()=>resolveFixedBrowser())"));assert.ok(!text.includes('async function executable('));
 assert.ok(!text.includes('runStartupDiagnostic('));assert.ok(!text.includes('prepareStartupDiagnostic('));
});

