import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createBurstAdapter,createRouteOwner,createLifecycleCallbacks,closeOwnedPair,fixture,projectFailure,SOURCE_FILES,LAUNCH_ARGUMENTS} from './run.mjs';
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const barrier=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fakeRoute(ordinal,frame,abort=()=>Promise.resolve()){
 const request={frame:()=>frame,method:()=> 'GET',resourceType:()=> 'image',url:()=> 'https://route-burst.invalid/image/'+ordinal};
 return {request:()=>request,abort};
}
test('shared actual callback normal1000 burst serializes genuine native aborts and preserves RPC return values',async()=>{
 const adapter=createBurstAdapter(),frame={},owner=createRouteOwner({page:{},frame,count:1000,adapter});let active=0,peak=0;
 const value={privateResult:true};assert.equal(await adapter.rpc(()=>value),value);
 for(let i=0;i<1000;i++)owner.callback(fakeRoute(i,frame,async()=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;}));
 await owner.drain();assert.equal(peak,1);assert.equal(owner.snapshot().aborted,1000);assert.equal(owner.snapshot().pending,0);
 assert.equal(adapter.snapshot().nativeSettled,1000);assert.equal(adapter.snapshot().peakDenials,1);assert.equal(adapter.snapshot().cleanupIssued,0);
});
test('first native abort succeeds BEFORE completion barrier; queued routes never invoke delayed abort after fatal',async()=>{
 const adapter=createBurstAdapter(),frame={},hold=barrier(),ordinary=barrier();let invoked=0;
 const owner=createRouteOwner({page:{},frame,count:256,adapter,holdFirst:hold});
 for(let i=0;i<256;i++)owner.callback(fakeRoute(i,frame,async()=>{invoked++;}));
 await tick();assert.equal(invoked,1);assert.equal(adapter.snapshot().nativeSettled,1);assert.equal(adapter.snapshot().denialActive,1);assert.ok(adapter.snapshot().backlog>=1);
 const held=Array.from({length:125},()=>adapter.rpc(()=>ordinary.promise).catch(e=>assert.equal(adapter.isExpected(e),true)));
 assert.equal(adapter.snapshot().normalActive,126);adapter.expectedFatal();owner.retire();let closes=0;
 await Promise.all(held);await owner.drain();
 assert.equal(adapter.snapshot().callerRejectedDenials,1);assert.equal(adapter.snapshot().callerRejectedOrdinary,125);assert.equal(adapter.snapshot().callerRejectedQueuedDenials,255);
 assert.deepEqual(await closeOwnedPair(adapter,{close:async()=>{closes++;}},{close:async()=>{closes++;}}),{contextAttempts:1,browserAttempts:1,contextCompleted:true,browserCompleted:true});
 assert.equal(closes,2);assert.equal(adapter.snapshot().normalActive,126);hold.resolve();ordinary.resolve();await Promise.all(held);await owner.drain();await tick();
 assert.equal(invoked,1);assert.equal(adapter.snapshot().physical,0);assert.equal(adapter.snapshot().normalActive,0);assert.equal(adapter.snapshot().cleanupIssued,2);
});
test('unknown native failure after expected fatal independently fails; both owned closes attempted even first rejects',async()=>{
 const adapter=createBurstAdapter(),hold=barrier(),p=adapter.rpc(()=>hold.promise).catch(()=>{});adapter.expectedFatal();
 let contextCalls=0,browserCalls=0;
 assert.deepEqual(await closeOwnedPair(adapter,{close:async()=>{contextCalls++;throw new Error('private');}},{close:async()=>{browserCalls++;}}),{contextAttempts:1,browserAttempts:1,contextCompleted:false,browserCompleted:true});
 assert.equal(contextCalls,1);assert.equal(browserCalls,1);assert.equal(adapter.snapshot().unexpected,'operation-rejected');
 hold.reject(new Error('later private'));await p;await tick();assert.equal(adapter.snapshot().physical,0);
 assert.equal(adapter.isExpected(new Error('external-fatal')),false);
});
test('caller deadline leaves physical operation occupied, with cleanup still admissible',async()=>{
 const timers=[],adapter=createBurstAdapter({clock:()=>0,schedule:fn=>{timers.push(fn);return fn;},cancel:()=>{}}),held=barrier();
 const waiting=adapter.rpc(()=>held.promise);timers[0]();await assert.rejects(waiting,{code:'rpc-deadline'});
 assert.equal(adapter.snapshot().normalActive,1);assert.equal(adapter.snapshot().physical,1);
 let close=0;assert.equal((await closeOwnedPair(adapter,{close:async()=>{close++;}},{close:async()=>{close++;}})).browserCompleted,true);assert.equal(close,2);
 held.resolve();await tick();assert.equal(adapter.snapshot().normalActive,0);
});
test('queued denial has no native RPC deadline until actual invocation; caller cancellation never frees live slots',async()=>{
 const timers=[],hold=barrier(),adapter=createBurstAdapter({schedule:(fn,ms)=>{timers.push({fn,ms});return fn;},cancel:()=>{}});
 const first=adapter.deny(()=>hold.promise).catch(()=>{}),second=adapter.deny(()=>Promise.resolve()).catch(()=>{});
 assert.equal(timers.length,1);assert.equal(timers[0].ms,10000);adapter.expectedFatal();await Promise.all([first,second]);
 assert.equal(adapter.snapshot().denialActive,1);assert.equal(adapter.snapshot().backlog,0);hold.resolve();await tick();assert.equal(adapter.snapshot().denialActive,0);
});

test('4096 normal submissions and overflow cannot exhaust the two separately reserved cleanup ordinals',async()=>{
 for(const overflow of [false,true]){
  const adapter=createBurstAdapter();
  for(let i=0;i<4096;i++)await adapter.deny(()=>Promise.resolve());
  assert.equal(adapter.snapshot().events,4096);assert.equal(adapter.snapshot().normalActive,0);
  if(overflow)assert.throws(()=>adapter.deny(()=>Promise.resolve()),{code:'capacity'});
  else adapter.expectedFatal();
  let closes=0;
  const result=await closeOwnedPair(adapter,{close:async()=>{closes++;}},{close:async()=>{closes++;}});
  assert.deepEqual(result,{contextAttempts:1,browserAttempts:1,contextCompleted:true,browserCompleted:true});
  assert.equal(closes,2);assert.equal(adapter.snapshot().cleanupIssued,2);assert.equal(adapter.snapshot().physical,0);
  assert.throws(()=>adapter.cleanup(()=>{closes++;}),{code:'capacity'});assert.equal(closes,2);
 }
});
test('route duplicate, wrong frame/method/resource/URL and hostile accessors/proxies never qualify',async()=>{
 const cases=[(r)=>r,(r)=>({...r,request:()=>({...r.request(),frame:()=>({})})}),
  r=>({...r,request:()=>({...r.request(),method:()=> 'POST'})}),r=>({...r,request:()=>({...r.request(),resourceType:()=> 'document'})}),
  r=>({...r,request:()=>({...r.request(),url:()=> 'https://route-burst.invalid/image/00'})})];
 for(let i=0;i<cases.length;i++){
  const adapter=createBurstAdapter(),frame={},owner=createRouteOwner({page:{},frame,count:256,adapter}),r=fakeRoute(0,frame);
  if(i===0){owner.callback(r);owner.callback(r);}else owner.callback(cases[i](r));await owner.drain();assert.ok(adapter.snapshot().unexpected);
 }
 let calls=0;const accessor={};Object.defineProperty(accessor,'request',{get(){calls++;throw 0;}});
 for(const r of [accessor,new Proxy({},{get(){calls++;throw 0;},getPrototypeOf(){calls++;throw 0;}})]){
  const adapter=createBurstAdapter(),owner=createRouteOwner({page:{},frame:{},count:256,adapter});owner.callback(r);assert.equal(adapter.snapshot().unexpected,'invalid-route');
 }assert.equal(calls,0);
});
test('retired owner does not become active again when next context starts; observer throw fails separately',async()=>{
 let live=true,aborts=0;const adapter=createBurstAdapter(),frame={},old=createRouteOwner({page:{},frame,count:256,adapter,active:()=>live});
 old.retire();live=false;live=true;old.callback(fakeRoute(0,frame,()=>{aborts++;}));assert.equal(aborts,0);assert.equal(old.snapshot().retired,1);
 const owner=createRouteOwner({page:{},frame,count:256,adapter,onQueued(){throw new Error('secret');}});
 owner.callback(fakeRoute(0,frame));await owner.drain();assert.ok(adapter.snapshot().unexpected);assert.ok(!JSON.stringify(adapter.snapshot()).includes('secret'));
});
test('queued route action is copied once, mutation cannot replace its admitted abort method',async()=>{
 const adapter=createBurstAdapter(),frame={},hold=barrier(),owner=createRouteOwner({page:{},frame,count:256,adapter});let original=0,replacement=0;
 owner.callback(fakeRoute(0,frame,()=>hold.promise));const route=fakeRoute(1,frame,async()=>{original++;});owner.callback(route);
 route.abort=()=>{replacement++;};hold.resolve();await owner.drain();assert.equal(original,1);assert.equal(replacement,0);
});
test('retired route still validates identity before suppression; unknown late route cannot hide behind expected fatal',()=>{
 for(const alter of [r=>({...r,request:()=>({...r.request(),method:()=> 'POST'})}),r=>({...r,request:()=>({...r.request(),frame:()=>({})})}),
  r=>({...r,request:()=>({...r.request(),url:()=> 'https://unexpected.invalid/image/1'})})]){
  const adapter=createBurstAdapter(),frame={},owner=createRouteOwner({page:{},frame,count:256,adapter});owner.retire();adapter.expectedFatal();
  owner.callback(alter(fakeRoute(1,frame)));assert.equal(adapter.snapshot().unexpected,'invalid-route');assert.equal(adapter.snapshot().nativeStarted,0);
 }
 const adapter=createBurstAdapter(),frame={},owner=createRouteOwner({page:{},frame,count:256,adapter});owner.retire();adapter.expectedFatal();
 owner.callback(fakeRoute(1,frame));assert.equal(owner.snapshot().retired,1);assert.equal(adapter.snapshot().unexpected,null);assert.equal(adapter.snapshot().nativeStarted,0);
});
test('shared lifecycle callbacks reject unknown pages/subframes/navigation even after retirement',()=>{
 for(const stopped of [false,true])for(const event of ['page','subframe','url']){
  const adapter=createBurstAdapter(),page={},frame={url:()=> 'about:blank'},state={page,mainFrame:frame,expectingPage:false,retired:stopped};
  if(stopped)adapter.expectedFatal();const callbacks=createLifecycleCallbacks(state,adapter);
  if(event==='page')callbacks.pageCreated({});else if(event==='subframe')callbacks.frameNavigated({url:()=> 'about:blank'});else{frame.url=()=> 'https://unexpected.invalid/';callbacks.frameNavigated(frame);}
  assert.equal(adapter.snapshot().unexpected,'unexpected-event');
 }
 const adapter=createBurstAdapter(),page={},frame={url:()=> 'about:blank'},state={page,mainFrame:frame,expectingPage:false,retired:true};adapter.expectedFatal();
 const callbacks=createLifecycleCallbacks(state,adapter);callbacks.pageCreated(page);callbacks.frameNavigated(frame);assert.equal(adapter.snapshot().unexpected,null);
});
test('throwing browser-close hook remains fatal but cannot prevent actual second cleanup submission',async()=>{
 const adapter=createBurstAdapter();adapter.expectedFatal();let calls=0;
 const result=await closeOwnedPair(adapter,{close:async()=>{calls++;}},{close:async()=>{calls++;}},()=>{throw new Error('private');});
 assert.equal(calls,2);assert.equal(result.contextAttempts,1);assert.equal(result.browserAttempts,1);assert.equal(adapter.snapshot().unexpected,'unexpected-event');
 const noAdmission={cleanup(){throw new Error('not submitted');},fail(){}};
 const missing=await closeOwnedPair(noAdmission,{close(){calls++;}},{close(){calls++;}});assert.equal(missing.contextAttempts,0);assert.equal(missing.browserAttempts,0);
});
test('fixtures are fixed local strings; source maps and inert handshake/import ordering bind exact namespace',()=>{
 const source=readFileSync(new URL('./run.mjs',import.meta.url),'utf8'),python=readFileSync(new URL('./supervise.py',import.meta.url),'utf8');
 assert.equal((fixture(1000).match(/<img /gu)||[]).length,1000);assert.equal((fixture(256).match(/<img /gu)||[]).length,256);assert.throws(()=>fixture(999));
 assert.equal(Object.keys(SOURCE_FILES).length,12);for(const [key,path]of Object.entries(SOURCE_FILES))assert.ok(path.replaceAll('\\','/').endsWith(key));
 const literal=python.match(/SOURCE_NAMES\s*=\s*\[([\s\S]*?)\]/u);assert.ok(literal);
 assert.deepEqual([...literal[1].matchAll(/["']([^"']+)["']/gu)].map(m=>m[1]),Object.keys(SOURCE_FILES));
 const handshake=source.indexOf('await handshake();'),importOffset=source.indexOf('const {chromium}=await import(');assert.ok(handshake>=0&&importOffset>handshake);
 assert.ok(source.includes('chromiumSandbox:true'));assert.ok(!LAUNCH_ARGUMENTS.some(a=>/no-sandbox|disable-web-security|remote-debugging/iu.test(a)));
 assert.ok(!source.includes('route.continue('));assert.ok(!source.includes('page.goto('));assert.ok(!source.includes("from 'playwright"));
});
test('safe failure projection never invokes error code getters/proxy callbacks',()=>{
 let calls=0;const e=new Error();Object.defineProperty(e,'code',{get(){calls++;throw 0;}});
 assert.deepEqual(projectFailure(e),{status:'failed',reason:'integrity'});
 assert.deepEqual(projectFailure(new Proxy({},{getPrototypeOf(){calls++;throw 0;}})),{status:'failed',reason:'integrity'});assert.equal(calls,0);
});
test('actual Python result validator rejects missing/tampered physical/caller/cleanup/source evidence without Win32',t=>{
 const script=String.raw`import ast, hashlib, copy
from pathlib import Path
source=Path('spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/supervise.py').read_text()
tree=ast.parse(source)
names={'exact_fields','require_equal','bounded_integer','fixture_digest','validate_snapshot','validate_owner_snapshot','validate_result'}
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names or isinstance(n,ast.Assign) and any(isinstance(v,ast.Name) and v.id=='SOURCE_NAMES' for v in n.targets)]
assert len(nodes)==8
env={'hashlib':hashlib}
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<synthetic-validator>','exec'),env)
def snap(stage):
 s=dict(failure=None,disposed=False,events=1200,cleanupIssued=0,backlog=0,normalActive=0,cleanupActive=0,denialActive=0,peakNormal=2,peakCleanup=0,peakAggregate=2,peakDenials=1,peakBacklog=1000,nativeStarted=1000,nativeSettled=1000,physical=0,peakPhysical=2,unexpected=None,expectedFatal=False,registered=0,callerRejectedDenials=0,callerRejectedOrdinary=0,callerRejectedQueuedDenials=0)
 if stage!='normal': s.update(events=1400,peakNormal=126,peakAggregate=126,peakPhysical=126,nativeStarted=1001,nativeSettled=1001)
 if stage in ('at-fatal','after-fatal'): s.update(normalActive=126,denialActive=1,physical=126)
 if stage=='at-fatal': s.update(backlog=7,registered=7)
 if stage in ('after-fatal','final'): s.update(failure='external-fatal',expectedFatal=True,callerRejectedDenials=1,callerRejectedOrdinary=125,callerRejectedQueuedDenials=7)
 if stage=='final': s.update(cleanupIssued=2,peakCleanup=1,peakAggregate=127,peakPhysical=127)
 return s
h='a'*64
sources={name:h for name in env['SOURCE_NAMES']}
owner=dict(callbacks=8,uniqueOrdinals=8,aborted=1,retired=0,pending=0)
r=dict(schema='playwright-route-burst-dev-result/v1',phase='dev-bursts',status='complete',normal=dict(references=1000,callbacks=1000,uniqueOrdinals=1000,aborted=1000,retired=0,pending=0,coordinator=snap('normal'),fixtureSha256=env['fixture_digest'](1000),status='complete'),controlled=dict(references=256,observed=owner,atFatal=snap('at-fatal'),afterFatal=snap('after-fatal'),callerRejected=dict(physicalDenials=1,physicalOrdinary=125,queuedDenials=7,total=133),cleanup=dict(contextAttempts=1,browserAttempts=1,contextCompleted=True,browserCompleted=True),fixtureSha256=env['fixture_digest'](256),status='expected-controlled-fatal',expectedFatalStage='adapter-quota-full',finalObserved=owner),final=snap('final'),sourceHashes=sources,freezeHash=h,freezeSha256=h,sourceHashesRechecked=True,protocolCallbacksDrained=True,elapsedMs=1000,noPublicNavigation=True,noNativeAttestation=True,noModelCalls=True,noCanonicalWrites=True,playwrightInternalPendingOrIpcCapsEnforced=False,completeOsEgressIsolation=False,productionValidated=False,assignmentAuthority=False)
validate=lambda value:env['validate_result'](value,sources,h,h,h)
assert validate(r)
def rejects(value):
 try: validate(value)
 except (RuntimeError,KeyError,TypeError): return
 raise AssertionError('tamper accepted')
for key in r:
 x=copy.deepcopy(r);del x[key];rejects(x)
for path,value in [(('final','normalActive'),1),(('final','physical'),1),(('final','unexpected'),'operation-rejected'),(('controlled','afterFatal','normalActive'),0),(('controlled','atFatal','backlog'),0),(('controlled','callerRejected','total'),126),(('controlled','cleanup','browserCompleted'),False),(('normal','aborted'),999),(('controlled','finalObserved','pending'),1),(('elapsedMs',),float('nan')),(('elapsedMs',),165001)]:
 x=copy.deepcopy(r);at=x
 for key in path[:-1]: at=at[key]
 at[path[-1]]=value;rejects(x)
print('synthetic validator pass')`;
 let result;try{result=spawnSync('python',['-c',script],{cwd:fileURLToPath(new URL('../../../../../',import.meta.url)),encoding:'utf8',maxBuffer:4096});}
 catch(error){if(['OFFLINE_CAPABILITY_DENIED','EPERM'].includes(error.code)){t.skip('Offline guard refuses Node child creation; execute same AST-only Python script separately');return;}throw error;}
 if(result.error?.code==='EPERM'){t.skip('Offline guard refuses Node child creation; execute same AST-only Python script separately');return;}
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/synthetic validator pass/u);
});
