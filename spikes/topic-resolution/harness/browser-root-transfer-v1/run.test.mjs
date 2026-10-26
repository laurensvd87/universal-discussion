import test from 'node:test';import assert from 'node:assert/strict';import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createArticleCallbacks,createCompletionFence,projectError,SOURCE_FILES,LAUNCH_ARGUMENTS,PACKAGE_INTEGRITY,rethrowGotoRejection,batchOutput,rpcWindow,rpcDeadlineError,openAfterPagePolicy } from './run.mjs';
import { ControlFatal,ControlUnavailable,CURRENT_REQUEST_FAILURE_TEXTS,browserRequestFailureReason } from './policy.js';
function lifecycle(){let now=0,current,failure=null,finishing=false;const article={url:'https://en.wikipedia.org/wiki/Tetris',until:20000,stopping:false,request:{failure:()=>({errorText:'net::ERR_CERT_DATE_INVALID'})},blockedRequests:new WeakSet(),worldId:null};current=article;
 const callbacks=createArticleCallbacks({article,frameId:'frame-main',current:()=>current,resource:()=>{},fail:e=>{failure??=e;},clock:()=>now});
 const fence=createCompletionFence({clock:()=>now,guard:()=>{},current:()=>current,failure:()=>failure,finishing:()=>finishing});
 return {article,callbacks,check:()=>fence(article),replace:()=>{current={};},stop:()=>{article.stopping=true;},finish:()=>{finishing=true;},advance:n=>{now=n;}};
}
test('actual event callbacks fence repeated main navigation, stale loader/URL, context loss and admitted request failure',()=>{
 for(const event of ['navigation','detach','contexts','context','failed']){
  const f=lifecycle();f.callbacks.frameNavigated({frame:{id:'frame-main',loaderId:'loader-one',url:f.article.url}});f.check();
  if(event==='navigation')f.callbacks.frameNavigated({frame:{id:'frame-main',loaderId:'loader-two',url:f.article.url}});
  if(event==='detach')f.callbacks.frameDetached({frameId:'frame-main'});
  if(event==='contexts'){f.article.worldId=5;f.callbacks.contextsCleared();}
  if(event==='context'){f.article.worldId=5;f.callbacks.contextDestroyed({executionContextId:5});}
  if(event==='failed')f.callbacks.requestFailed(f.article.request);
  assert.throws(f.check,e=>e instanceof ControlFatal);
 }
 const f=lifecycle();f.callbacks.frameNavigated({frame:{id:'frame-main',loaderId:'x',url:'https://other.invalid/'}});assert.throws(f.check);
});
test('completion fence checks current incarnation/refusal/finishing/deadline immediately after every await and before sync retention',()=>{
 for(const boundary of ['headers','peer','DCL-delay','frame','world','snapshot','final-frame','before-retain'])for(const fault of ['replace','stop','finish','deadline','refusal']){
  const f=lifecycle();let retained=0;
  if(fault==='deadline')f.advance(20000);else if(fault==='refusal')f.article.refusal='page-header-restricted';else f[fault]();
  assert.throws(()=>{f.check();retained++;},e=>e instanceof ControlFatal||e instanceof ControlUnavailable,boundary);assert.equal(retained,0);
 }
});
test('retired request and old page callbacks cannot pollute next article or cleanup',()=>{
 for(const retiring of ['replace','stop']){const f=lifecycle();f[retiring]();f.callbacks.frameDetached({frameId:'frame-main'});f.callbacks.requestFailed(f.article.request);f.callbacks.contextsCleared();
  // Original fence itself still rejects an obsolete article, rather than minting proof.
  assert.throws(f.check);assert.equal(f.article.committed,undefined);}
 const f=lifecycle(),blocked={};f.article.blockedRequests.add(blocked);f.callbacks.requestFailed(blocked);f.check();f.callbacks.contextDestroyed({executionContextId:99});f.check();
});
test('default/inert source ordering keeps Job handshake before PW import and launch, no weakening browser flags',async()=>{
 const source=await readFile(new URL('./run.mjs',import.meta.url),'utf8');
 const handshake=source.indexOf('await handshake(batch);'),clientImport=source.indexOf("await import(pathToFileURL(resolve(PW_ROOT,'index.mjs')).href)");
 assert.ok(handshake>=0);assert.ok(clientImport>=0);assert.ok(handshake<clientImport);
 assert.ok(source.includes('chromiumSandbox:true'));assert.ok(source.includes('ignoreHTTPSErrors:false'));assert.ok(source.includes("serviceWorkers:'block'"));
 assert.ok(source.indexOf("own.routeWebSocket('**/*'")<source.indexOf('context.newPage()'));
 for(const bad of ['--no-sandbox','--disable-web-security','--ignore-certificate-errors','storageState:','httpCredentials:'])assert.equal(source.includes(bad),false);
 assert.ok(!LAUNCH_ARGUMENTS.some(x=>/user-data-dir|remote-debugging-port|no-sandbox/u.test(x)));assert.ok(PACKAGE_INTEGRITY.startsWith('sha512-'));
 assert.equal(projectError(Error('private url secret')).reason,'client-or-validation-failure');
});
test('Node/Python literal source maps agree exactly and fixed Job/batch scope cannot accept arbitrary paths',async()=>{
 const s=await readFile(new URL('./supervise.py',import.meta.url),'utf8'),block=s.slice(s.indexOf('source_paths = {'),s.indexOf('package_root ='));
 const names=[...block.matchAll(/^    "([^"]+)":/gmu)].map(x=>x[1]);assert.deepEqual(names,Object.keys(SOURCE_FILES));
 assert.ok(s.indexOf('AssignProcessToJobObject(job, process_handle)')<s.indexOf("child.stdin.write(('BROWSER_ROOT_TRANSFER_JOB_ASSIGNED_V1"));
 for(const required of ['IsProcessInJob(handle, job','MEMORY_LIMIT = 1536 * MIB','--max-old-space-size=256','own-job-final-drain-timeout',"'TEMP': str(temp)","'TMP': str(temp)"]){assert.ok(s.includes(required),required);}
 for(const bad of [0,9,'1','../output'])assert.throws(()=>batchOutput(bad));
 assert.ok(s.includes('package_count > 128'));assert.ok(s.includes('package_bytes > 16 * MIB'));assert.ok(s.includes('non_temp_evidence_bytes()'));
 assert.equal(names.some(k=>/output-static|output-browser|input.packet/u.test(k)),false);
});

test('actual Python metadata/drain helpers enforce synthetic capacity/reparse/normal-exit boundaries without Win32 or browser calls',t=>{
 const script=String.raw`
import ast, os, stat, time, types
from pathlib import Path
tree=ast.parse(Path('spikes/topic-resolution/harness/browser-root-transfer-v1/supervise.py').read_text())
helpers=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('owned_tree_metadata','normal_job_drain')],type_ignores=[])
env={'os':os,'stat':stat,'time':time,'job_members':lambda _:None,'PROFILE_MAX_BYTES':512*1048576,'PROFILE_MAX_ENTRIES':8192}
exec(compile(helpers,'synthetic-supervisor-helpers','exec'),env)
metadata=env['owned_tree_metadata']; drain=env['normal_job_drain']
def info(mode,size=0,reparse=0): return types.SimpleNamespace(st_mode=mode,st_size=size,st_file_attributes=reparse)
class Entry:
 def __init__(self,path,metadata): self.path=path; self.metadata=metadata
 def stat(self,follow_symlinks):
  assert follow_symlinks is False
  return self.metadata
class Scan:
 def __init__(self,entries): self.entries=entries
 def __enter__(self): return iter(self.entries)
 def __exit__(self,*args): pass
directory=info(stat.S_IFDIR); regular=lambda n:info(stat.S_IFREG,n)
def run(entries,rootinfo=directory):
 visited=[]
 def scan(path):
  visited.append(path)
  return Scan(entries)
 return metadata('root',scan,lambda _:rootinfo),visited
assert run([Entry('root/file',regular(512*1048576))])[0]==(512*1048576,1)
def refuses(fn,reason):
 try: fn()
 except RuntimeError as error: assert str(error)==reason
 else: raise AssertionError('Expected metadata refusal')
refuses(lambda:run([Entry('root/huge',regular(512*1048576+1))]),'owned-profile-byte-capacity')
refuses(lambda:run(Entry('root/file',regular(0)) for _ in range(8193)),'owned-profile-entry-capacity')
refuses(lambda:run([],info(stat.S_IFDIR,reparse=0x400)),'owned-output-reparse-or-type')
refuses(lambda:run([Entry('root/link',info(stat.S_IFDIR,reparse=0x400))]),'owned-output-reparse-or-type')
assert run([Entry('root/file',regular(12))])[0]==(12,1)
class VanishedEntry:
 path='root/vanished-file'
 def stat(self,follow_symlinks): raise FileNotFoundError()
def cleanup_scan(path):
 assert path=='root'
 return Scan([VanishedEntry(),Entry('root/vanished-directory',directory),Entry('root/remaining',regular(5))])
def cleanup_inspect(path):
 if path!='root': raise FileNotFoundError()
 return directory
assert metadata('root',cleanup_scan,cleanup_inspect)==(5,3)
def removed_between_inspect_and_scan(path):
 if path!='root': raise FileNotFoundError()
 return Scan([Entry('root/removed-nested',directory)])
assert metadata('root',removed_between_inspect_and_scan,lambda _:directory)==(0,1)
for missing_root in ('inspect','scan'):
 def missing_inspect(path):
  if missing_root=='inspect': raise FileNotFoundError()
  return directory
 def missing_scan(path): raise FileNotFoundError()
 try: metadata('root',missing_scan,missing_inspect)
 except FileNotFoundError: pass
 else: raise AssertionError('Missing OUTPUT root must fail')
clock=[0.0]; queried=[0]
def pause(seconds): clock[0]+=seconds
def members_empty(_): return types.SimpleNamespace(assigned=0,listed=0)
assert drain(None,members_empty,lambda:clock[0],pause) is True and clock[0]==0
def survives(_): return types.SimpleNamespace(assigned=1,listed=1)
assert drain(None,survives,lambda:clock[0],pause) is False and 2<=clock[0]<2.1
clock[0]=0
def exits(_):
 queried[0]+=1
 return types.SimpleNamespace(assigned=int(queried[0]<3),listed=int(queried[0]<3))
assert drain(None,exits,lambda:clock[0],pause) is True and clock[0]<2
print('synthetic helpers pass')
`;
 let result;
 try{result=spawnSync('python',['-c',script],{encoding:'utf8',timeout:10000,maxBuffer:8192,windowsHide:true});}
 catch(error){
  if(error?.code==='OFFLINE_CAPABILITY_DENIED'||error?.code==='EPERM'){t.skip('Offline guard refuses Node child creation; execute the same bounded AST helper script separately');return;}
  throw error;
 }
 if(result.error?.code==='EPERM'){t.skip('Sandbox refuses Node child creation; execute the same bounded AST helper script separately');return;}
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'synthetic helpers pass');
});

test('normal completion cannot hide emergency termination and output metadata is sampled continuously plus final',async()=>{
 const source=await readFile(new URL('./supervise.py',import.meta.url),'utf8');
 assert.ok(source.includes("if not normal_job_drain(job):"));
 assert.ok(source.includes("reason = reason or 'emergency-own-job-termination-required'"));
 assert.ok(source.includes("'emergencyOwnJobTermination': emergency_own_job_termination"));
 assert.equal(source.match(/profile_bytes, profile_entries = owned_tree_metadata\(OUTPUT\)/gu).length,2);
 assert.ok(source.indexOf('emergency_own_job_termination = True')<source.indexOf('kernel.TerminateJobObject(job, 1)'));
});


test('exact seven current-request failure strings become private refusal; malformed/unknown/TLS/substrings stay fatal',()=>{
 for(const errorText of CURRENT_REQUEST_FAILURE_TEXTS){
  const f=lifecycle();f.article.request.failure=()=>({errorText});f.callbacks.requestFailed(f.article.request);
  assert.equal(f.article.refusal,'browser-transport-unavailable');assert.throws(f.check,e=>e instanceof ControlUnavailable);
 }
 for(const value of [null,{}, {errorText:null}, {errorText:'net::ERR_CONNECTION_RESET suffix'},{errorText:' net::ERR_CONNECTION_RESET'},{errorText:'net::ERR_CERT_DATE_INVALID'},
  {errorText:'net::ERR_SSL_PROTOCOL_ERROR'},{errorText:'net::ERR_ABORTED'},{errorText:'net::ERR_BLOCKED_BY_CLIENT'},{errorText:'net::ERR_FAILED'}]){
  const f=lifecycle();f.article.request.failure=()=>value;f.callbacks.requestFailed(f.article.request);assert.throws(f.check,e=>e instanceof ControlFatal);
 }
 let calls=0;const hostile={};Object.defineProperty(hostile,'errorText',{enumerable:true,get(){calls++;throw 0}});
 assert.equal(browserRequestFailureReason(hostile),null);assert.equal(calls,0);
});
test('late exact current failure blocks every shared boundary; simultaneous unknown/global failure always wins',()=>{
 for(const boundary of ['headers','peer','DCL-delay','frame','world','snapshot','final-frame','before-retain']){
  const f=lifecycle();f.article.request.failure=()=>({errorText:CURRENT_REQUEST_FAILURE_TEXTS[0]});f.callbacks.requestFailed(f.article.request);
  let retained=0;assert.throws(()=>{f.check();retained++;},e=>e instanceof ControlUnavailable,boundary);assert.equal(retained,0);
  f.article.request.failure=()=>({errorText:'unknown'});f.callbacks.requestFailed(f.article.request);assert.throws(f.check,e=>e instanceof ControlFatal);
 }
 const f=lifecycle();const blocked={failure:()=>{throw Error('must not inspect deliberate block')}};f.article.blockedRequests.add(blocked);f.callbacks.requestFailed(blocked);f.check();
 f.callbacks.requestFailed({failure:()=>({errorText:CURRENT_REQUEST_FAILURE_TEXTS[0]})});assert.throws(f.check,e=>e instanceof ControlFatal);
});
test('only exact goto-client rejection may use already-observed refusal; TypeError/control/protocol and other stages remain fatal',()=>{
 const f=lifecycle();f.article.refusal='browser-transport-unavailable';
 const dependencies={guard:()=>{},failure:()=>null,fence:()=>f.check()};
 assert.throws(()=>rethrowGotoRejection(Error('private client message'),f.article,dependencies),e=>e instanceof ControlUnavailable);
 for(const error of [new TypeError('programming'),new ControlFatal('protocol-failed'),new ControlUnavailable('article-timeout')]){
  assert.throws(()=>rethrowGotoRejection(error,f.article,dependencies),e=>e===error);
 }
 const global=new ControlFatal('absolute-job-deadline');assert.throws(()=>rethrowGotoRejection(Error('client'),f.article,{...dependencies,failure:()=>global}),e=>e===global);
 const aborted=new ControlFatal('aborted');assert.throws(()=>rethrowGotoRejection(Error('client'),f.article,{...dependencies,guard:()=>{throw aborted}}),e=>e===aborted);
});
test('goto11–19s remains in SAME20s lease, other RPC10s max, exact deadline/global race cannot retain late input',()=>{
 for(const now of [0,11000,15000,19000]){
  const w=rpcWindow(now,20000,10000,true);assert.equal(w.waitMs,20000-now);assert.equal(w.articleDeadline,true);
 }
 assert.equal(rpcWindow(0,20000,10000,false).waitMs,10000);assert.equal(rpcWindow(15000,20000,10000,false).waitMs,5000);
 assert.equal(rpcWindow(20000,20000,10000,true).waitMs,0);
 const article={until:20000,stopping:false,gate:{}},closed=[];let current=article;
 const args={article,articleDeadline:true,clock:()=>20000,current:()=>current,finishing:()=>false,guard:()=>{},failure:()=>null,closeGate:g=>closed.push(g)};
 const timed=rpcDeadlineError(args);assert.ok(timed instanceof ControlUnavailable);assert.equal(timed.code,'article-timeout');assert.equal(article.stopping,true);assert.equal(closed.length,1);
 for(const global of [new ControlFatal('absolute-job-deadline'),new ControlFatal('aborted'),new ControlFatal('request-capacity')]){
  article.stopping=false;assert.equal(rpcDeadlineError({...args,failure:()=>global}),global);assert.equal(article.stopping,false);
 }
 article.stopping=false;const protocol=rpcDeadlineError({...args,articleDeadline:false,clock:()=>10000});assert.ok(protocol instanceof ControlFatal);assert.equal(protocol.code,'protocol-failed');
 // An11s commit can still have an early matching DCL;19s DCL cannot gain2s.
 const f=lifecycle();f.advance(19000);f.article.dcl={at:19000};assert.ok(f.article.dcl.at>f.article.until-2000);f.advance(21000);let retained=0;
 assert.throws(()=>{f.check();retained++;});assert.equal(retained,0);
});
test('actual beforePage/context seam preserves typed per-article refusal with ZERO context/navigation/request and global fatal priority',async()=>{
 let contexts=0,navigations=0,requests=0;
 const openContext=()=>{contexts++;navigations++;requests++;return {};};
 const unavailable=new ControlUnavailable('origin-policy-budget');
 const options={beforePage:async()=>{throw unavailable;},url:'https://invented.example/article',guard:()=>{},failure:()=>null,openContext};
 await assert.rejects(openAfterPagePolicy(options),error=>error===unavailable);assert.deepEqual([contexts,navigations,requests],[0,0,0]);
 for(const global of [new ControlFatal('absolute-job-deadline'),new ControlFatal('aborted'),new ControlFatal('request-capacity')]){
  await assert.rejects(openAfterPagePolicy({...options,failure:()=>global}),error=>error===global);
  await assert.rejects(openAfterPagePolicy({...options,guard:()=>{throw global}}),error=>error===global);
 }
 const successful=await openAfterPagePolicy({...options,beforePage:async()=>{}});assert.deepEqual(successful,{});assert.equal(contexts,1);
});

