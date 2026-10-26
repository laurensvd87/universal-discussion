// Invented clients and pure Python only. Never launches a native child/browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as filesystem from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runBlankProfile,runDiagnosticProfiles,childConfiguration,DiagnosticError,ACTUAL_RELEASE,createControlWire,boundedReadFile,boundedReadDirectory,validateNativeReadResult,createBootstrapProgress,BOOTSTRAP_STAGES} from './run.mjs';
import {createRouteCoordinator} from '../playwright-route-coordinator-v1/coordinator.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const policyBytes=await readFile(new URL('../infrastructure-identity-witness-v1/policy.mjs',import.meta.url));
assert.equal(sha(policyBytes),'e8a93c0d2309d8d6a6f2738ba1be3e14f8640473630fde5c8b9109861ef67605');
const {createInfrastructurePolicy}=await import('../infrastructure-identity-witness-v1/policy.mjs');
const {StartupFatal}=await import('../native-extension-startup-dev-v1/run.mjs');
const {NATIVE_LAUNCH_ARGUMENTS}=await import('../native-reader-transfer-v1/browser-capture.mjs');
function emitter(object={}){
 const handlers=new Map();return Object.assign(object,{on(name,callback){handlers.set(name,callback);return this;},emit(name,value){handlers.get(name)?.(value);}});
}
const info=(id,type,url,attached=false)=>({targetId:id,type,url,attached,browserContextId:'context-1'});
function fixture({change=null,failStage=null,unsafe=null,discoveryPending=false,closeFault=null,index=1}={}){
 const calls=[],faults=[],timers=new Map();let timerId=0,now=0,discoveryResolve;
 const targets=[info('anchor','page','about:blank',true),info('ui-root','browser_ui','chrome://omnibox-popup.top-chrome/'),info('ui-aim','browser_ui','chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html')];
 const root=emitter({send(name,args){
  calls.push(name);
  if(name===failStage)return Promise.reject(new StartupFatal('infrastructure-contract'));
  if(name==='Target.setDiscoverTargets'){
   for(const original of targets){const value={...original};change?.(value);root.emit('Target.targetCreated',{targetInfo:value});}
   if(discoveryPending)return new Promise(yes=>{discoveryResolve=yes;});
  }
  if(name==='Target.getTargets')return Promise.resolve({targetInfos:targets.map(t=>({...t}))});
  return Promise.resolve({});
 }});
 const main={url:()=> 'about:blank'};
 const anchor=emitter({url:()=> 'about:blank',mainFrame:()=>main});
 const browser=emitter({newBrowserCDPSession:()=>Promise.resolve(root),close(){
  calls.push('browser.close');browser.emit('disconnected');return Promise.resolve();
 }});
 const context=emitter({browser:()=>browser,pages:()=>[anchor],
  route:()=>{calls.push('http-deny');return Promise.resolve();},
  routeWebSocket:()=>{calls.push('socket-deny');return Promise.resolve();},
  newCDPSession:()=>Promise.resolve({send:name=>{calls.push(name);return Promise.resolve({targetInfo:targets[0]});}}),
  close(){calls.push('context.close');for(const t of targets)root.emit('Target.targetDestroyed',{targetId:t.targetId});
   if(closeFault!==null)return Promise.reject(closeFault);return Promise.resolve();
  }});
 const chromium={launchPersistentContext(path,options){
  calls.push('launch');assert.equal(path,'D:/owned/profile-0'+index);assert.equal(options.chromiumSandbox,true);
  assert.equal(options.serviceWorkers,'block');assert.equal(options.ignoreHTTPSErrors,false);
  assert.equal(options.acceptDownloads,false);assert.deepEqual(options.args,[...NATIVE_LAUNCH_ARGUMENTS,'--host-resolver-rules=MAP * ~NOTFOUND']);
  if(unsafe!==null)return unsafe;
  return Promise.resolve(context);
 }};
 const config={chromium,profilePath:'D:/owned/profile-0'+index,executablePath:'C:/fixed/chrome.exe',index,
  createPolicy:createInfrastructurePolicy,createCoordinator:createRouteCoordinator,launchArguments:NATIVE_LAUNCH_ARGUMENTS,
  startupErrorPrototype:StartupFatal.prototype,guard:()=>{},terminalGuard:()=>{},clock:()=>now,
  schedule:(callback,delay)=>{const id=++timerId;timers.set(id,{callback,delay});return id;},cancel:id=>timers.delete(id),
  onFirstFault:value=>{faults.push(value);return Promise.resolve();}};
 return {config,calls,faults,root,targets,context,browser,timers,
  advance(value){now=value;},
  resolveDiscovery(){discoveryResolve?.({});},
  expire(){now=45001;for(const value of [...timers.values()])value.callback();}};
}
// Explicit offline seam: returns bounded data only; never persists or launches.
export async function pureProfileExamples(){
 const results=[];
 for(const failed of [false,true]){
  const f=fixture({change:failed?t=>{if(t.targetId==='ui-root')t.attached=true;}:null});
  const held=await runBlankProfile(f.config);held.assertPhysical();held.release();results.push(held.result);
 }
 return results;
}
// Captured from the actual pure joined runner, not independently reconstructed.
export const PROFILE_GOLDENS=[{"schema":"startup-profile/v1","profileIndex":1,"status":"healthy","preLoadCensus":{"phase":"pre-load","targets":3,"blankPages":1,"ownExtensionWorkers":0,"otherTargets":0,"ownExtensionEquality":true,"infrastructureTargets":2,"infrastructureEquality":true,"anchorEquality":true,"browserTargets":0},"finalCensus":{"phase":"final","targets":3,"blankPages":1,"ownExtensionWorkers":0,"otherTargets":0,"ownExtensionEquality":true,"infrastructureTargets":2,"infrastructureEquality":true,"anchorEquality":true,"browserTargets":0},"contextCloseAttempts":1,"browserCloseAttempts":1,"contextClosed":true,"browserClosed":true,"physicalOperationsDrained":true,"callbacksDrained":true,"pending":{"originals":0,"callbacks":0,"unsafeOriginal":false,"unsafeObligations":0,"coordinator":{"failure":null,"disposed":false,"events":10,"cleanupIssued":2,"backlog":0,"normalActive":0,"cleanupActive":0,"denialActive":0,"peakNormal":1,"peakCleanup":1,"peakAggregate":1,"peakDenials":0,"peakBacklog":0}},"firstFault":null},{"schema":"startup-profile/v1","profileIndex":1,"status":"failed","preLoadCensus":null,"finalCensus":null,"contextCloseAttempts":1,"browserCloseAttempts":1,"contextClosed":true,"browserClosed":true,"physicalOperationsDrained":true,"callbacksDrained":true,"pending":{"originals":0,"callbacks":0,"unsafeOriginal":false,"unsafeObligations":0,"coordinator":{"failure":null,"disposed":false,"events":8,"cleanupIssued":2,"backlog":0,"normalActive":0,"cleanupActive":0,"denialActive":0,"peakNormal":1,"peakCleanup":1,"peakAggregate":1,"peakDenials":0,"peakBacklog":0}},"firstFault":{"schema":"startup-first-fault/v1","profileIndex":1,"stage":"Target.setDiscoverTargets","rpc":"Target.setDiscoverTargets","code":"infrastructure-identity","witness":{"schema":"native-infrastructure-identity-witness/v1","site":"created","role":"ui-root","predicate":"attached"}}}];
test('actual JS runner outputs equal the exact offline cross-language golden bytes',async()=>{
 assert.equal(JSON.stringify(await pureProfileExamples()),JSON.stringify(PROFILE_GOLDENS));
});
test('actual immutable197 policy and coordinator join through complete healthy startup and both closes',async()=>{
 const f=fixture(),held=await runBlankProfile(f.config);
 assert.equal(held.result.status,'healthy');assert.equal(held.result.preLoadCensus.infrastructureTargets,2);
 assert.equal(held.result.pending.coordinator.cleanupIssued,2);held.assertPhysical();assert.equal(held.afterDrain(),null);held.release();
 assert.deepEqual(f.calls,['launch','http-deny','socket-deny','Browser.setDownloadBehavior','Target.getTargetInfo','Target.setDiscoverTargets','Target.getTargets','Target.getTargets','context.close','browser.close']);
});
test('real197 pending-discovery attached failure retains exact original witness before both closes',async()=>{
 const f=fixture({discoveryPending:true,change:t=>{if(t.targetId==='ui-aim')t.attached=true;}});
 const original=f.root.send;let thrown=null;
 f.config.createPolicy=()=>{const policy=createInfrastructurePolicy();return Object.freeze({...policy,
  created(...args){try{return policy.created(...args);}catch(error){thrown=error;throw error;}}});};
 const running=runBlankProfile(f.config);
 for(let i=0;i<200&&!f.faults.length;i++)await Promise.resolve();
 assert.equal(f.faults.length,1);assert.equal(f.calls.includes('context.close'),false);
 f.resolveDiscovery();const held=await running;
 assert.equal(thrown.constructor,StartupFatal);assert.equal(held.result.status,'failed');
 assert.deepEqual(held.result.firstFault.witness,{schema:'native-infrastructure-identity-witness/v1',site:'created',role:'ui-aim',predicate:'attached'});
 assert.equal(held.result.firstFault.code,'infrastructure-identity');assert.ok(f.calls.includes('context.close'));assert.ok(f.calls.includes('browser.close'));
 held.assertPhysical();held.release();
});
test('unknown target is fatal; strict policy false return cannot be mistaken for admission',async()=>{
 const f=fixture({change:t=>{if(t.targetId==='ui-root')t.url='https://example.org/';}});
 const held=await runBlankProfile(f.config);assert.equal(held.result.status,'failed');assert.equal(held.result.firstFault.code,'unexpected-page-event');
 assert.equal(held.result.preLoadCensus,null);held.assertPhysical();held.release();
});
test('every reachable created identity alternative retains finite witness; no raw target data leaks',async()=>{
 for(const [field,value,predicate]of [['browserContextId','other','context'],['attached',true,'attached'],['parentId','parent','parent'],['openerId','opener','opener']]){
  const f=fixture({change:t=>{if(t.targetId==='ui-root')t[field]=value;}}),held=await runBlankProfile(f.config);
  assert.equal(held.result.firstFault.witness.predicate,predicate);assert.equal(held.result.firstFault.witness.site,'created');
  assert.ok(!JSON.stringify(held.result).includes('chrome://'));assert.ok(!JSON.stringify(held.result).includes('context-1'));
  held.assertPhysical();held.release();
 }
});
test('unsafe native returns retain permanent unknown physical obligation without hooks',async()=>{
 let hooks=0;let settle;
 const evil={then(){hooks++;},get constructor(){hooks++;throw Error('hook');}};
 const f=fixture({unsafe:evil}),held=await runBlankProfile(f.config);
 assert.equal(hooks,0);assert.equal(held.result.pending.unsafeOriginal,true);assert.equal(held.result.pending.unsafeObligations,1);
 assert.equal(held.result.physicalOperationsDrained,false);assert.throws(()=>held.assertPhysical());assert.throws(()=>held.release());
 evil.then=()=>{};assert.throws(()=>held.assertPhysical());
});
test('falsy original rejection stays first and prevents later work while cleanup still runs',async()=>{
 for(const original of [undefined,null,false,0]){
  const f=fixture();f.context.newCDPSession=()=>Promise.reject(original);
  const held=await runBlankProfile(f.config);assert.equal(held.result.status,'failed');
  assert.equal(held.result.firstFault.code,'client-failure');assert.equal(f.faults.length,1);
  assert.equal(f.calls.includes('Target.setDiscoverTargets'),false);
  assert.ok(f.calls.includes('context.close'));assert.ok(f.calls.includes('browser.close'));held.assertPhysical();held.release();
 }
});
test('forged and proxied error codes never gain native StartupFatal projection or invoke hooks',async()=>{
 let hooks=0;const getter={get code(){hooks++;throw Error('getter');}};
 for(const error of [{code:'infrastructure-identity'},getter,new Proxy(new Error(),{get(){hooks++;throw Error('proxy');},getPrototypeOf(){hooks++;throw Error('proxy');}})]){
  const f=fixture();f.context.newCDPSession=()=>Promise.reject(error);
  const held=await runBlankProfile(f.config);assert.equal(held.result.firstFault.code,'client-failure');assert.equal(held.result.firstFault.witness,null);
  held.assertPhysical();held.release();
 }assert.equal(hooks,0);
});
test('late callback after result snapshot blocks the next profile without rewriting snapshot',async()=>{
 const f=fixture(),held=await runBlankProfile(f.config),before=JSON.stringify(held.result);
 f.root.emit('Target.targetCreated',{targetInfo:info('late','page','about:blank',true)});
 assert.notEqual(held.afterDrain(),null);assert.equal(JSON.stringify(held.result),before);
 assert.throws(()=>held.assertPhysical());assert.throws(()=>held.release());
 await held.waitForReport();held.release();
});
test('three fixed profiles sequence after prior physical drain; first failure is terminal',async()=>{
 for(const failing of [0,1,2,3]){
  const calls=[];let result;
  await runDiagnosticProfiles({terminalGuard:()=>{},
   begin:async(i,prior)=>{calls.push('begin'+i);assert.equal(prior,i===1?null:'ack'+(i-1));},
   runProfile:async i=>({result:{profileIndex:i,firstFault:i===failing?{fault:true}:null},
    assertPhysical(){calls.push('physical'+i);},afterDrain(){calls.push('after'+i);return null;},release(){calls.push('release'+i);}}),
   drain:async i=>{calls.push('drain'+i);return 'ack'+i;},
   complete:async(profiles,acks,fault)=>{result={profiles,acks,fault};}});
  assert.equal(result.profiles.length,failing||3);
  for(let i=1;i<result.profiles.length;i++)assert.ok(calls.indexOf('drain'+i)<calls.indexOf('begin'+(i+1)));
 }
});
test('retained originals prevent both healthy and failed drain paths',async()=>{
 let drains=0,completed=0;
 await assert.rejects(runDiagnosticProfiles({terminalGuard:()=>{},begin:async()=>{},
  runProfile:async()=>({result:{firstFault:null},assertPhysical(){throw new DiagnosticError('physical-unsettled');}}),
  drain:async()=>{drains++;},complete:async()=>{completed++;}}));
 assert.equal(drains,0);assert.equal(completed,0);
});

test('actual three-profile runner uses real197 and immutable coordinator for every fixed profile',async()=>{
 for(const failure of [0,1,2,3]){
  const calls=[];let completed;
  await runDiagnosticProfiles({terminalGuard:()=>{},begin:async(i,prior)=>{
   assert.equal(prior,i===1?null:'ack'+(i-1));calls.push('begin'+i);},
   runProfile:async i=>{const f=fixture({index:i,change:failure===i?t=>{if(t.targetId==='ui-root')t.attached=true;}:null});
    const held=await runBlankProfile(f.config);calls.push('closed'+i);return held;},
   drain:async(i,result,failed)=>{assert.equal(result.profileIndex,i);assert.equal(failed,i===failure);calls.push('drain'+i);return 'ack'+i;},
   complete:async(...args)=>{completed=args;}});
  assert.equal(completed[0].length,failure||3);
  for(let i=1;i<completed[0].length;i++)assert.ok(calls.indexOf('drain'+i)<calls.indexOf('begin'+(i+1)));
 }
});

const wireConfig={sourceIdentityHash:'a'.repeat(64),sourcePathsFileSha256:'b'.repeat(64)};
function wireFixture({writeFailure=null,readFailure=null,mutate=x=>x,pendingWrite=false}={}){
 let request,writes=0,resolveWrite,rejectWrite;
 const channel={write(bytes){writes++;request=JSON.parse(bytes.subarray(0,-1));
   if(writeFailure!==null)throw writeFailure.value;
   if(pendingWrite)return new Promise((yes,no)=>{resolveWrite=yes;rejectWrite=no;});return Promise.resolve(true);},
  readChunk(){if(readFailure!==null)throw readFailure.value;
   const payload={schema:'startup-profile-begin-ack/v1',profileIndex:request.payload.profileIndex};
   const ack={schema:'startup-ack/v1',sequence:request.sequence,kind:request.kind,requestHash:sha(Buffer.from(JSON.stringify(request))),
    chainHash:sha(Buffer.from(JSON.stringify({previousChainHash:request.priorChainHash,requestHash:sha(Buffer.from(JSON.stringify(request))),responsePayloadHash:sha(Buffer.from(JSON.stringify(payload)))}))),payload};
   const changed=mutate(ack);return Promise.resolve(Buffer.isBuffer(changed)?changed:Buffer.from(JSON.stringify(changed)+'\n'));},
  assertHealthy(){},snapshot:()=>({physicalExchangePending:pendingWrite,exchangeReserved:pendingWrite})};
 return {wire:createControlWire({channel,config:wireConfig,nodePid:7}),writes:()=>writes,settle(){pendingWrite=false;resolveWrite?.(true);},reject(value){pendingWrite=false;rejectWrite?.(value);}};
}
test('actual control wire commits canonical joined ACK only after original write settlement',async()=>{
 const f=wireFixture({pendingWrite:true}),running=f.wire.exchange('PROFILE_BEGIN',{profileIndex:1,previousDrainAckHash:null});
 assert.equal(f.wire.head().sequence,0);assert.equal(f.writes(),1);f.settle();
 const reply=await running;assert.equal(reply.head.sequence,1);assert.equal(f.wire.head().sequence,1);await f.wire.waitIdle();
});
test('actual control wire sticky falsy transport failure never dispatches a second exchange',async()=>{
 for(const value of [undefined,null,false,0]){
  const f=wireFixture({writeFailure:{value}});
  for(let i=0;i<2;i++){let caught=false;try{await f.wire.exchange('PROFILE_BEGIN',{profileIndex:1});}catch(error){caught=true;assert.equal(error,value);}assert.ok(caught);}
  assert.equal(f.writes(),1);assert.equal(f.wire.head().sequence,0);
 }
});
test('actual control wire retains pending writer before synchronous reader throw',async()=>{
 const error=new Error('invented'),f=wireFixture({pendingWrite:true,readFailure:{value:error}});
 await assert.rejects(f.wire.exchange('PROFILE_BEGIN',{profileIndex:1}),e=>e===error);
 assert.equal(f.wire.isBusy(),true);assert.equal(f.writes(),1);
 await assert.rejects(f.wire.exchange('PROFILE_BEGIN',{profileIndex:1}),e=>e===error);assert.equal(f.writes(),1);
 f.settle();await assert.rejects(f.wire.waitIdle(),e=>e===error);assert.equal(f.wire.head().sequence,0);
});
test('actual wire rejects malformed, duplicate, truncated, wrong hash and extra ACK bytes permanently',async()=>{
 for(const mutate of [a=>({...a,sequence:0}),a=>({...a,kind:'READY'}),a=>({...a,requestHash:'c'.repeat(64)}),
  a=>({...a,payload:{...a.payload,extra:true}}),()=>Buffer.from(''),()=>Buffer.from('{'),
  a=>Buffer.from(JSON.stringify(a)+'\n'+JSON.stringify(a)+'\n')]){
  const f=wireFixture({mutate});await assert.rejects(f.wire.exchange('PROFILE_BEGIN',{profileIndex:1}));
  await assert.rejects(f.wire.exchange('PROFILE_BEGIN',{profileIndex:1}));assert.equal(f.writes(),1);assert.equal(f.wire.head().sequence,0);
 }
});
test('actual wire overlapping exchange poisons first original without committing or redispatch',async()=>{
 const f=wireFixture({pendingWrite:true}),first=f.wire.exchange('PROFILE_BEGIN',{profileIndex:1});
 await assert.rejects(f.wire.exchange('PROFILE_BEGIN',{profileIndex:2}));f.settle();await assert.rejects(first);
 assert.equal(f.writes(),1);assert.equal(f.wire.head().sequence,0);
});

test('actual bounded readers retain post-open handles before a throwing guard',async()=>{
 for(const directory of [false,true]){
  const original=new Error('invented');let guards=0,closes=0,reads=0;
  const handle={close:()=>{closes++;return Promise.resolve();},read:()=>{reads++;return Promise.resolve(null);}};
  const fs={open:()=>Promise.resolve(handle),opendir:()=>Promise.resolve(handle)};
  await assert.rejects(directory?boundedReadDirectory(fs,'fixed',[],()=>{if(++guards===2)throw original;}):
   boundedReadFile(fs,'fixed',1,4,()=>{if(++guards===2)throw original;}),e=>e===original);
  assert.equal(closes,1);assert.equal(reads,0);
 }
});
test('actual bounded file reader detects short, extra and changing-size input and closes every handle',async()=>{
 for(const kind of ['healthy','short','extra','size-change']){
  let closes=0,stats=0;const bytes=Buffer.from(kind==='short'?'a':kind==='extra'?'abcd':'abc');
  const handle={stat:()=>Promise.resolve({size:kind==='size-change'&&++stats===2?4:3}),
   read(buffer,offset,length,position){const count=Math.min(length,Math.max(0,bytes.length-position));bytes.copy(buffer,offset,position,position+count);return Promise.resolve(Object.assign(Object.create(null),{bytesRead:count,buffer}));},
   close:()=>{closes++;return Promise.resolve();}};
  const action=boundedReadFile({open:()=>Promise.resolve(handle)},'fixed',3,4,()=>{});
  if(kind==='healthy')assert.equal((await action).toString(),'abc');else await assert.rejects(action);assert.equal(closes,1);
 }
});
test('actual bounded directory reader rejects extra and mismatched entries without arbitrary traversal',async()=>{
 for(const names of [['a'],['a','b'],['other']]){
  let closes=0,index=0;const action=boundedReadDirectory({opendir:()=>Promise.resolve({
   read:()=>Promise.resolve(index<names.length?{name:names[index++]}:null),close:()=>{closes++;return Promise.resolve();}})},'fixed',['a'],()=>{});
  if(names.length===1&&names[0]==='a')assert.deepEqual(await action,['a']);else await assert.rejects(action);assert.equal(closes,1);
 }
});
test('original RPC and normal-close deadlines hold even when their timer never dispatches',async()=>{
 for(const close of [false,true]){
  const f=fixture();
  if(close){const original=f.context.close;f.context.close=()=>{const result=original();f.advance(45001);return result;};}
  else{const original=f.root.send;f.root.send=(name,...args)=>{const result=original(name,...args);if(name==='Target.setDiscoverTargets')f.advance(10001);return result;};}
  const held=await runBlankProfile(f.config);assert.equal(held.result.status,'failed');assert.equal(held.result.firstFault.code,'deadline');
  assert.equal(held.result.firstFault.rpc,close?'context.close':'Target.setDiscoverTargets');
  assert.equal(held.result.pending.originals,0);assert.equal(held.result.pending.unsafeOriginal,false);
 }
});
test('native file-read validator admits only exact ordinary/null data results without hooks',()=>{
 const buffer=Buffer.alloc(2);let hooks=0;
 for(const prototype of [null,Object.prototype]){
  const value=Object.assign(Object.create(prototype),{bytesRead:1,buffer});
  assert.deepEqual(validateNativeReadResult(value,buffer,2),{bytesRead:1,buffer});
 }
 const result=()=>Object.assign(Object.create(null),{bytesRead:1,buffer});
 const accessor=result();Object.defineProperty(accessor,'bytesRead',{enumerable:true,get(){hooks++;throw 0;}});
 const hidden=result();Object.defineProperty(hidden,'bytesRead',{enumerable:false,value:1});
 const symbol=result();symbol[Symbol('extra')]=1;
 const proxy=new Proxy(result(),{get(){hooks++;throw 0;},getPrototypeOf(){hooks++;throw 0;},ownKeys(){hooks++;throw 0;}});
 for(const value of [proxy,accessor,hidden,symbol,{...result(),extra:1},Object.assign(Object.create({}),result()),
  Object.create({bytesRead:1,buffer}),null,undefined,false])assert.throws(()=>validateNativeReadResult(value,buffer,2));
 for(const bytesRead of [true,-0,-1,0.5,3,NaN,Infinity,'1'])assert.throws(()=>validateNativeReadResult({bytesRead,buffer},buffer,2));
 assert.throws(()=>validateNativeReadResult({bytesRead:1,buffer:Buffer.alloc(2)},buffer,2));assert.equal(hooks,0);
});
test('actual Node fs.open/read/close accepts its native null-prototype result on one fixed CODE file',async()=>{
 const url=new URL('./run.mjs',import.meta.url),expected=await readFile(url);
 const actual=await boundedReadFile(filesystem,fileURLToPath(url),expected.length,4194304,()=>{});
 assert.equal(sha(actual),sha(expected));
});
test('all finite bootstrap refusal stages project without inspecting any thrown object',async()=>{
 const progress=createBootstrapProgress();assert.deepEqual(progress.refusal(),{schema:'startup-bootstrap-refusal/v1',stage:'configuration',code:'refused'});
 let hooks=0;const hostile=new Proxy({},{get(){hooks++;throw 0;},getPrototypeOf(){hooks++;throw 0;}});
 for(const stage of BOOTSTRAP_STAGES){progress.enter(stage);const record=progress.refusal(hostile);
  assert.equal(Object.isFrozen(record),true);assert.deepEqual(record,{schema:'startup-bootstrap-refusal/v1',stage,code:'refused'});assert.ok(Buffer.byteLength(JSON.stringify(record)+'\n')<160);}
 for(const stage of [hostile,'unknown',null,0])assert.throws(()=>progress.enter(stage));assert.equal(hooks,0);
 const protocol=JSON.parse(await readFile(new URL('./protocol.json',import.meta.url),'utf8'));
 assert.deepEqual(protocol.bootstrapRefusalStages,BOOTSTRAP_STAGES);assert.deepEqual(protocol.shapes.bootstrapRefusal,['schema','stage','code']);
 const source=await readFile(new URL('./run.mjs',import.meta.url),'utf8');
 assert.ok(source.indexOf('const bootstrapProgress=createBootstrapProgress()')<source.indexOf('const config=childConfiguration('));
 for(const [stage,operation]of [['held-handshake','channel.start()'],['bootstrap-read',"const bootstrapBytes=await read('control:bootstrap')"],
  ['ready',"const ready=await control.exchange('READY'"],['source-authentication',"const literal=await read('control:source-paths')"],
  ['package-directories',"const prefix='node_modules/playwright-core/'"],['runtime-import',"const {createInfrastructurePolicy}=await import("],
  ['profiles','const bindings='],['pipe-finish','channel.finish()']])assert.ok(source.indexOf("bootstrapProgress.enter('"+stage+"')")<source.indexOf(operation),stage);
 const terminal=source.slice(source.lastIndexOf('actualMain().catch('));
 assert.ok(terminal.includes('catch(()=>'));assert.ok(terminal.includes('process.stderr.write(JSON.stringify(bootstrapProgress.refusal())'));
 for(const forbidden of ['error.','error[','message','stack','stdout.write'])assert.equal(terminal.includes(forbidden),false);
});
test('child exact fixed CLI and entry stay closed, without startup side effects',()=>{
 assert.equal(ACTUAL_RELEASE,'adr199-reviewed-startup/v1');
 const env={MURMINGLE_STARTUP_SUPERVISED:'1',MURMINGLE_STARTUP_SOURCE_IDENTITY:'a'.repeat(64),
  MURMINGLE_STARTUP_SOURCE_PATHS:'b'.repeat(64),MURMINGLE_STARTUP_WALL_MILLISECONDS:'420000'};
 assert.equal(childConfiguration(['--owned-startup'],env,'win32').wallMilliseconds,420000);
 for(const args of [[],['--prepare'],['--owned-startup','profile'],['--run-startup']])assert.throws(()=>childConfiguration(args,env,'win32'));
 assert.throws(()=>childConfiguration(['--owned-startup'],env,'linux'));
});
test('source actual entry has held import ordering, one compile-free profile loop and no forbidden invocations',async()=>{
 const source=await readFile(new URL('./run.mjs',import.meta.url),'utf8');
 assert.ok(source.indexOf('await channel.waitHandshake()')<source.indexOf("await import('../infrastructure-identity-witness-v1/policy.mjs')"));
 assert.ok(source.indexOf("for(const [key,pin]of Object.entries(frozen.sourceHashes))")<source.indexOf("const {chromium}=await import("));
 for(const token of ['Extensions.loadUnpacked','Page.navigate','worker.evaluate','NativeSession',"launchPersistentContext('')"])assert.equal(source.includes(token),false,token);
 const protocol=JSON.parse(await readFile(new URL('./protocol.json',import.meta.url),'utf8'));
 assert.equal(protocol.limits.cpuSeconds,60);assert.equal(protocol.limits.wallSeconds,420);assert.equal(protocol.sourceAcceptance,'adr199-reviewed-startup/v1');
});

export const PYTHON_CHECKS = String.raw`
import ast, io, json, pathlib, stat, types, unittest
root=pathlib.Path.cwd()
path=root/'spikes/topic-resolution/harness/experimental/infrastructure-startup-diagnostic-v2/supervise.py'
tree=ast.parse(path.read_text(encoding='utf8'))
selected=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.FunctionDef,ast.ClassDef,ast.Assign))]
module=types.ModuleType('_adr198_actual_parent_test')
module.__file__=str(path)
exec(compile(ast.Module(body=selected,type_ignores=[]),str(path),'exec'),module.__dict__)
M=module
H='a'*64
def owner(milestone=None):
    published=[]
    config={'sourceIdentityHash':H,'sourcePathsFileSha256':H,'nodePid':7,
      'ready':{'bootstrapHash':H,'creationFiletime':'1'},
      'bindings':{'sourcePathsFileSha256':H,'freezeFileSha256':H,'freezeHash':H,'sourceMapHash':H,
                  'nodePid':7,'creationFiletime':'1','bootstrapFileSha256':H,'baselineHash':None}}
    def publish(name,data):
        published.append((name,data))
        return M.sha(data)
    o=M.ProtocolOwner(config,lambda key:{'pathKey':key,'identity':{'volumeSerial':'1','fileIndex':'2','creationFiletime':'3','fileType':'file'}},
      lambda:{'baselineHash':H},lambda i:None,lambda i:None,publish,lambda:None,milestone=milestone)
    return o,published
def request(o,kind,payload,commit=True):
    r={'schema':'startup-request/v1','sequence':o.sequence+1,'sourceIdentityHash':H,
       'sourcePathsFileSha256':H,'nodePid':7,'kind':kind,'priorChainHash':o.chain,'payload':payload}
    ack=o.prepare(M.wire(r))
    if commit:o.commit_written(ack)
    return ack,r
def fault():
    return {'schema':'startup-first-fault/v1','profileIndex':1,'stage':'Target.setDiscoverTargets',
            'rpc':'Target.setDiscoverTargets','code':'infrastructure-identity',
            'witness':{'schema':'native-infrastructure-identity-witness/v1','site':'created','role':'ui-root','predicate':'attached'}}
def profile(index,failed=False):
    def census(phase):
        return dict(zip(['phase','targets','blankPages','ownExtensionWorkers','otherTargets','ownExtensionEquality',
          'infrastructureTargets','infrastructureEquality','anchorEquality','browserTargets'],[phase,3,1,0,0,True,2,True,True,0]))
    coordinator=dict(zip(M.SHAPES['coordinator'],[None,False,0,2,0,0,0,0,1,1,1,0,0]))
    f=fault();f['profileIndex']=index
    return dict(zip(M.SHAPES['profile'],['startup-profile/v1',index,'failed' if failed else 'healthy',
      census('pre-load'),census('final'),1,1,True,True,True,True,
      {'originals':0,'callbacks':0,'unsafeOriginal':False,'unsafeObligations':0,'coordinator':coordinator},f if failed else None]))
class ParentTests(unittest.TestCase):
    def test_cli_exact(self):
        self.assertIsNone(M.parse_cli([]))
        for a in [['--prepare'],['--prepare','--source-paths-sha256',H,'--source-map-sha256',H,'extra'],
                  ['--run-startup','--source-paths-sha256',H,'--source-map-sha256',H]]:
            with self.assertRaises(Exception):M.parse_cli(a)
        self.assertEqual(M.parse_cli(['--prepare','--source-paths-sha256',H,'--source-map-sha256',H])[0],'--prepare')
    def test_actual_closed(self):
        self.assertEqual(M.main([]),0)
        # Never dispatch a valid real mode, including after a future readiness release.
        with self.assertRaises(Exception):M.main(['--invalid'])
    def test_ack_advances_only_after_write(self):
        o,_=owner()
        ack,_=request(o,'READY',{'bootstrapHash':H,'creationFiletime':'1'},False)
        self.assertFalse(o.ready);self.assertEqual(o.sequence,0)
        with self.assertRaises(Exception):o.commit_written(b'wrong')
        o.commit_written(ack);self.assertTrue(o.ready);self.assertEqual(o.sequence,1)
    def test_false_sequence_pid_reject(self):
        for field,value in [('sequence',True),('nodePid',True),('sequence',0)]:
            o,_=owner()
            r={'schema':'startup-request/v1','sequence':1,'sourceIdentityHash':H,'sourcePathsFileSha256':H,
               'nodePid':7,'kind':'READY','priorChainHash':None,'payload':{'bootstrapHash':H,'creationFiletime':'1'}}
            r[field]=value
            with self.assertRaises(Exception):o.prepare(M.wire(r))
    def test_fault_survives_failed_ack(self):
        o,published=owner()
        request(o,'READY',{'bootstrapHash':H,'creationFiletime':'1'})
        request(o,'PROFILE_BEGIN',{'profileIndex':1,'previousDrainAckHash':None})
        request(o,'STARTUP_FAULT',{'firstFault':fault(),'firstFaultHash':M.digest(fault())},False)
        self.assertEqual(o.fault_observed,fault());self.assertIsNone(o.first_fault)
        self.assertTrue(o.fault_evidence_saved);self.assertEqual(published[0][0],'first-fault.json')
        self.assertEqual(o.sequence,2)
    def test_profile_bool_reject(self):
        o,_=owner();request(o,'READY',{'bootstrapHash':H,'creationFiletime':'1'})
        with self.assertRaises(Exception):request(o,'PROFILE_BEGIN',{'profileIndex':True,'previousDrainAckHash':None})
    def test_ticket_bool_reject(self):
        o,_=owner();request(o,'FS_BEFORE',{'pathKey':'known'})
        with self.assertRaises(Exception):request(o,'FS_AFTER',{'ticket':True,'pathKey':'known'})
    def test_ticket_identity(self):
        o,_=owner();request(o,'FS_BEFORE',{'pathKey':'known'})
        request(o,'FS_AFTER',{'ticket':1,'pathKey':'known'});self.assertEqual(o.tickets,{})
    def test_held_absolute_fence(self):
        p=M.OwnedParent('--run-startup',H,H,0,clock=lambda:31)
        with self.assertRaises(Exception):p.enumeration_fence(cleanup=True,until=100)
    def test_original_stream_not_closed_with_pending_thread(self):
        p=M.OwnedParent('--run-startup',H,H,0,clock=lambda:1)
        closed=[]
        stream=types.SimpleNamespace(close=lambda:closed.append('close'))
        p.child=types.SimpleNamespace(poll=lambda:0,stdin=stream,stdout=stream)
        p.modules={'native':None}
        p.reader=types.SimpleNamespace(join=lambda timeout:None,is_alive=lambda:True)
        self.assertFalse(p.close_owned(False));self.assertEqual(closed,[])
    def test_dead_node_live_descendant_terminated(self):
        p=M.OwnedParent('--run-startup',H,H,0,clock=lambda:1)
        calls=[];members=iter([[99],[]])
        p.job=3;p.assigned=True;p.ids=lambda *a,**k:next(members,[])
        p.modules={'native':types.SimpleNamespace(kernel=types.SimpleNamespace(TerminateJobObject=lambda *a:calls.append('terminate') or 1,CloseHandle=lambda *a:1))}
        stream=types.SimpleNamespace(close=lambda:None)
        p.child=types.SimpleNamespace(poll=lambda:0,stdin=stream,stdout=stream)
        self.assertTrue(p.close_owned(False));self.assertEqual(calls,['terminate']);self.assertTrue(p.emergency)
    def test_unknown_job_membership_terminated(self):
        p=M.OwnedParent('--run-startup',H,H,0,clock=lambda:1)
        calls=[];state=[0]
        def ids(*a,**k):
            state[0]+=1
            if state[0]==1:raise RuntimeError('unknown')
            return []
        p.job=3;p.assigned=True;p.ids=ids
        p.modules={'native':types.SimpleNamespace(kernel=types.SimpleNamespace(TerminateJobObject=lambda *a:calls.append('terminate') or 1,CloseHandle=lambda *a:1))}
        stream=types.SimpleNamespace(close=lambda:None)
        p.child=types.SimpleNamespace(poll=lambda:0,stdin=stream,stdout=stream)
        self.assertTrue(p.close_owned(False));self.assertEqual(calls,['terminate'])
    def test_metadata_resource_order(self):
        method=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='initialize')
        calls=[n for n in ast.walk(method) if isinstance(n,ast.Call)]
        resources=min(n.lineno for n in calls if isinstance(n.func,ast.Attribute) and n.func.attr=='resources')
        auth=min(n.lineno for n in calls if isinstance(n.func,ast.Name) and n.func.id=='authenticate')
        self.assertLess(resources,auth)
    def test_protocol_exact(self):
        value=json.loads((path.parent/'protocol.json').read_text(encoding='utf8'))
        self.assertEqual(value['shapes'],M.SHAPES);self.assertEqual(value['limits'],M.LIMITS)
    def test_all15_roots_and_owned_usage(self):
        source=ast.get_source_segment(path.read_text(encoding='utf8'),next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='all_usage'))
        self.assertIn('range(1,14)',source);self.assertIn("HERE.parent/'infrastructure-startup-diagnostic-v1'/'output',HERE/'output'",source)
        self.assertIn('i==14 and not exists(root)',source)
        self.assertNotIn('study_usage(',source)
    def test_full_three_profile_control_milestones(self):
        records=[]
        def milestone(edge,value):
            records.append((edge,value));return M.digest(value)
        o,published=owner(milestone)
        request(o,'READY',{'bootstrapHash':H,'creationFiletime':'1'})
        for index in range(1,4):
            request(o,'PROFILE_BEGIN',{'profileIndex':index,'previousDrainAckHash':o.acks[-1] if o.acks else None})
            value=profile(index)
            request(o,'PROFILE_DRAIN',{'profileIndex':index,'result':value,'resultHash':M.digest(value),'proofHead':o.head()})
        value={'schema':'startup-result/v1','bindings':o.bindings,'status':'healthy','profiles':o.results,
          'drainAckHashes':o.acks,'firstFault':None,'proofHead':o.head()}
        ack,_=request(o,'COMPLETE',{'result':value,'resultHash':M.digest(value)},False)
        self.assertFalse(o.completed);self.assertIsNone(o.milestones[-1]['committedFileSha256'])
        o.commit_written(ack);self.assertTrue(o.completed)
        self.assertEqual(len(records),16);self.assertEqual(len(o.milestones),8)
        for i in range(0,len(records),2):
            before,after=records[i][1],records[i+1][1]
            self.assertFalse(before['physicalAckWriteSettled']);self.assertTrue(after['physicalAckWriteSettled'])
            self.assertEqual(before['request'],after['request']);self.assertEqual(before['response'],after['response'])
        self.assertEqual(published[-1][0],'result.json');self.assertEqual(o.result_file_sha,M.sha(published[-1][1]))
    def test_failed_and_late_fault_complete_preserve_earlier_results(self):
        for late in (False,True):
            o,published=owner();request(o,'READY',{'bootstrapHash':H,'creationFiletime':'1'})
            request(o,'PROFILE_BEGIN',{'profileIndex':1,'previousDrainAckHash':None})
            value=profile(1,not late)
            if not late:request(o,'STARTUP_FAULT',{'firstFault':fault(),'firstFaultHash':M.digest(fault())})
            request(o,'PROFILE_DRAIN' if late else 'FAILED_PROFILE_DRAIN',
              {'profileIndex':1,'result':value,'resultHash':M.digest(value),'proofHead':o.head()})
            if late:request(o,'STARTUP_FAULT',{'firstFault':fault(),'firstFaultHash':M.digest(fault())})
            with self.assertRaises(Exception):request(o,'PROFILE_BEGIN',{'profileIndex':2,'previousDrainAckHash':o.acks[-1]})
            result={'schema':'startup-result/v1','bindings':o.bindings,'status':'failed','profiles':o.results,
              'drainAckHashes':o.acks,'firstFault':fault(),'proofHead':o.head()}
            request(o,'FAILED_COMPLETE',{'result':result,'resultHash':M.digest(result)})
            self.assertTrue(o.failed_complete);self.assertEqual(o.results[0]['status'],'healthy' if late else 'failed')
            evidence=M.strict(published[0][1]);self.assertEqual(evidence['bindings'],o.bindings)
    def test_actual_all_usage_absent_new_root_and_hostile_root(self):
        p=M.OwnedParent('--prepare',H,H,0,clock=lambda:1);p.modules={'generic':types.SimpleNamespace(resource_error=lambda e:('metadata','unknown'))};p.observer=None
        walked=[]
        def walk(path,*args,**kwargs):walked.append(path);return (1,1)
        def inspect(path):
            if path.name=='stderr.log':raise FileNotFoundError()
            return types.SimpleNamespace(st_mode=stat.S_IFDIR)
        actual=p.all_usage(walk=walk,inspect_root=inspect,exists=lambda path:False)
        self.assertEqual(actual[:3],(14,14,14));self.assertEqual(len(walked),28)
        def hostile(path):
            if path==M.HERE/'output':raise RuntimeError('reparse')
            return inspect(path)
        with self.assertRaises(Exception):p.all_usage(walk=walk,inspect_root=hostile,exists=lambda path:path==M.HERE/'output')
        self.assertEqual(p.resource_failure['scope'],'diagnostic-v2')
        p.resource_failure=None
        def absent_old(path):
            if path==M.HERE.parent/'infrastructure-startup-diagnostic-v1'/'output':raise FileNotFoundError()
            return inspect(path)
        with self.assertRaises(Exception):p.all_usage(walk=walk,inspect_root=absent_old,exists=lambda path:False)
        self.assertEqual(p.resource_failure['scope'],'diagnostic-v1')
    def test_actual_all_usage_aggregate_and_current_caps(self):
        p=M.OwnedParent('--prepare',H,H,0,clock=lambda:1);p.modules={'generic':types.SimpleNamespace()};p.observer=None
        def inspect(path):
            if path.name=='stderr.log':raise FileNotFoundError()
            return types.SimpleNamespace(st_mode=stat.S_IFDIR)
        with self.assertRaises(Exception):p.all_usage(walk=lambda *a,**k:(8192*M.MIB,1),inspect_root=inspect,exists=lambda path:True)
        p.profile_index=1
        def walk(path,*a,**k):return (300*M.MIB,1) if path in [p.leaf/'temp',p.leaf/M.PROFILES[0]] else (1,1)
        with self.assertRaises(Exception):p.all_usage(walk=walk,inspect_root=inspect,exists=lambda path:True)
    def test_actual_bounded_read_rejects_growth_and_namespace_swap(self):
        def metadata(ino=2):return types.SimpleNamespace(st_mode=stat.S_IFREG,st_size=3,st_dev=1,st_ino=ino,st_mtime_ns=1,st_ctime_ns=1)
        for bytes_,swap in [(b'abc',False),(b'abcd',False),(b'abc',True)]:
            inspected=[0]
            def inspect(*args):
                inspected[0]+=1;return metadata(3 if swap and inspected[0]>1 else 2)
            action=lambda:M.read_fixed(path,3,inspect=inspect,open_file=lambda p:io.BytesIO(bytes_),opened_stat=lambda s:metadata())
            if swap or len(bytes_)!=3:
                with self.assertRaises(Exception):action()
            else:self.assertEqual(action(),b'abc')
    def test_actual_metadata_preparation_no_process_dispatch(self):
        p=M.OwnedParent('--prepare',H,H,0,clock=lambda:1)
        p.hashes={M.OWN+'protocol.json':H};saved=[];checks=[]
        p.publish_pair=lambda name,data:saved.append((name,data)) or M.sha(data)
        p.recheck=lambda:checks.append('recheck');p.fence=lambda *a,**k:None
        self.assertEqual(p.prepare_metadata(),0);self.assertEqual(checks,['recheck'])
        value=M.strict(saved[0][1]);body={k:v for k,v in value.items() if k!='freezeHash'}
        self.assertEqual(value['freezeHash'],M.digest(body))
        receipt=M.strict(saved[1][1]);self.assertIs(receipt['nodeStarted'],False);self.assertIs(receipt['jobCreated'],False)
        self.assertIsNone(p.child);self.assertIsNone(p.job)
    def test_preinspection_launch_handle_cleanup(self):
        p=M.OwnedParent('--run-startup',H,H,0,clock=lambda:1);calls=[]
        alive=[True]
        def terminate(*args):calls.append(('terminate',args[0]));alive[0]=False;return 1
        kernel=types.SimpleNamespace(TerminateProcess=terminate,
          WaitForSingleObject=lambda *a:0,CloseHandle=lambda h:calls.append(('close',h)) or 1)
        class Handle(int):
            def Close(self):calls.append(('close',int(self)))
        p.modules={'native':types.SimpleNamespace(kernel=kernel)};p.launch_handle=Handle(42)
        stream=types.SimpleNamespace(close=lambda:None)
        p.child=types.SimpleNamespace(poll=lambda:None if alive[0] else 0,stdin=stream,stdout=stream)
        self.assertTrue(p.close_owned(False));self.assertIn(('terminate',42),calls);self.assertIn(('close',42),calls)
    def test_preinspection_original_exit_race_closes_without_termination(self):
        p=M.OwnedParent('--run-startup',H,H,0,clock=lambda:1);calls=[]
        class Handle(int):
            def Close(self):calls.append('close')
        p.modules={'native':types.SimpleNamespace()};p.launch_handle=Handle(42)
        stream=types.SimpleNamespace(close=lambda:None);states=iter([None,0])
        p.child=types.SimpleNamespace(poll=lambda:next(states,0),stdin=stream,stdout=stream)
        self.assertTrue(p.close_owned(False));self.assertEqual(calls,['close'])
    def test_actual_authentication_pins_before_parse_or_follow(self):
        literal=(path.parent/'source-paths.js').read_bytes()
        context=M.wire({'schema':'startup-reviewed-sources/v1','sourcePathsFileSha256':M.sha(literal),'sourceHashes':{}})
        for failure in ('list','context','baseline'):
            reads=[];package_calls=[]
            def read(target,maximum=4194304):
                reads.append(target)
                return literal if target.name=='source-paths.js' else context if target.name=='reviewed-sources.json' else b'not authenticated JSON'
            with self.assertRaises(Exception):M.authenticate(H if failure=='list' else M.sha(literal),
              H if failure=='context' else M.sha(context),'--prepare',lambda:None,read=read,
              packages=lambda:package_calls.append(True))
            self.assertEqual(len(reads),{'list':1,'context':2,'baseline':3}[failure]);self.assertEqual(package_calls,[])
    def test_actual_code_key_casefold_output_asset_and_package_refusals(self):
        names=M.literal_paths((path.parent/'source-paths.js').read_bytes())
        for extra in ['node_modules/forged.js','apps/local-service/data/forged.json','a/output/forged.js','a/.assets/forged.js',names[0].upper()]:
            value=('export const SOURCE_PATHS=Object.freeze('+json.dumps(sorted(names+[extra]))+');').encode()
            with self.assertRaises(Exception):M.literal_paths(value)
    def test_actual_publication_native_samples_original_identity_and_swap_refusal(self):
        for fault_at in (None,'pending','final','read-final','root','write'):
            p=M.OwnedParent('--prepare',H,H,0,clock=lambda:1);p.leaf_owned=True
            p.resources=lambda **k:None;p.usage_cache=(0,0,0,0)
            state={'data':b'','linked':False,'closed':0,'samples':[],'read':False}
            def metadata():return types.SimpleNamespace(st_dev=1,st_ino=2,st_size=len(state['data']),st_nlink=2 if state['linked'] else 1)
            def native(index=2,directory=False):return {'attributes':0,'identity':{'volumeSerial':'1','fileIndex':str(index),
              'creationFiletime':'3','size':str(0 if directory else len(state['data'])),'fileType':'directory' if directory else 'file'}}
            def sample(key):
                state['samples'].append(key)
                if key=='output:root':return native(8 if fault_at=='root' and len(state['samples'])>2 else 7,True)
                swapped=(fault_at=='pending' and not state['linked']) or (fault_at=='final' and key=='output:result.json') or (fault_at=='read-final' and state['read'])
                return native(99 if swapped else 2)
            def write(fd,data):
                if fault_at=='write':raise RuntimeError('invented')
                state['data']+=data;return len(data)
            def read(*args):state['read']=True;return state['data']
            caps={'exists':lambda target:False,'checked':lambda target:metadata(),'sample':sample,'open':lambda target:9,
              'fstat':lambda fd:metadata(),'opened':lambda fd:native(),'write':write,'sync':lambda fd:None,
              'close':lambda fd:state.update(closed=state['closed']+1),'link':lambda *args:state.update(linked=True),'read':read}
            p.publication_capabilities=lambda:caps
            if fault_at is None:
                self.assertEqual(p.publish_pair('result.json',b'abc'),M.sha(b'abc'))
                self.assertEqual(state['samples'].count('output:result.json'),2)
            else:
                with self.assertRaises(Exception):p.publish_pair('result.json',b'abc')
            self.assertEqual(state['closed'],1)
    def test_actual_ready_does_not_renew_bootstrap_lease(self):
        now=[1];p=M.OwnedParent('--run-startup',H,H,0,clock=lambda:now[0])
        # This actual loop assignment is the only READY lease transition.
        method=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='run_node')
        ready=next(n for n in ast.walk(method) if isinstance(n,ast.If) and ast.unparse(n.test)=="strict(ack, 16384)['kind'] == 'READY'")
        exec(compile(ast.Module(body=ready.body,type_ignores=[]),'actual-ready-transition','exec'),{'self':p})
        self.assertEqual(p.held_until,30);now[0]=31
        with self.assertRaises(Exception):p.fence()
    def test_actual_js_profile_golden_join_to_parent(self):
        text=(path.parent/'test.mjs').read_text(encoding='utf8')
        values=json.loads(text.split('export const PROFILE_GOLDENS=',1)[1].split(';',1)[0])
        for value in values:
            failed=value['status']=='failed';self.assertEqual(M.validate_profile(value,failed),value)
            o,_=owner();request(o,'READY',{'bootstrapHash':H,'creationFiletime':'1'})
            request(o,'PROFILE_BEGIN',{'profileIndex':1,'previousDrainAckHash':None})
            if failed:request(o,'STARTUP_FAULT',{'firstFault':value['firstFault'],'firstFaultHash':M.digest(value['firstFault'])})
            request(o,'FAILED_PROFILE_DRAIN' if failed else 'PROFILE_DRAIN',
              {'profileIndex':1,'result':value,'resultHash':M.digest(value),'proofHead':o.head()})
            self.assertEqual(o.results,[value]);self.assertFalse(o.active)
    def test_actual_assignment_rejects_reused_pid_before_assign(self):
        source=ast.parse((path.parent.parent/'native-specificity-study-v13/supervise.py').read_text(encoding='utf8'))
        function=next(n for n in source.body if isinstance(n,ast.FunctionDef) and n.name=='guarded_assignment')
        scope={'ctypes':M.ctypes,'refuse':lambda code:(_ for _ in ()).throw(RuntimeError(code))}
        exec(compile(ast.Module(body=[function],type_ignores=[]),'actual-immutable-assignment','exec'),scope)
        for changed in (False,True):
            p=M.OwnedParent('--run-startup',H,H,0,clock=lambda:1);p.launch_handle=42;p.job=3
            p.child=types.SimpleNamespace(pid=7);calls=[]
            def identify(handle):return {'pid':7,'creationFiletime':'99' if changed and handle==43 else '1',
               'imagePathSha256':H,'imagePathHashEncoding':'utf-8/lowercase/slash'}
            p.identify=identify
            def belongs(handle,job,output):output._obj.value=1;return 1
            kernel=types.SimpleNamespace(OpenProcess=lambda *a:43,
              AssignProcessToJobObject=lambda *a:calls.append('assign') or 1,IsProcessInJob=belongs)
            generic=types.SimpleNamespace(guarded_assignment=scope['guarded_assignment'])
            action=lambda:p.assign_owned_original(kernel,generic,{'imagePathSha256':H})
            if changed:
                with self.assertRaises(Exception):action()
                self.assertEqual(calls,[]);self.assertFalse(p.assigned)
            else:action();self.assertEqual(calls,['assign']);self.assertTrue(p.assigned)
            self.assertEqual(p.original,43);self.assertEqual(p.launch_handle,42)
    def test_actual_package_walk_bounds_before_sort_and_unknown_descent(self):
        root=pathlib.Path('owned-package');names=['f'+str(i).zfill(3)+'.js' for i in range(115)]
        expected=[M.PREFIX+name for name in names]
        class Entries:
            def __init__(self,names):self.names=iter(names);self.advances=0;self.closed=False
            def __next__(self):self.advances+=1;return types.SimpleNamespace(name=next(self.names))
            def close(self):self.closed=True
        # Use several <=4MiB files while preserving the exact immutable total.
        def inspect(target,base):
            size=3414041 if target.name in names[:3] else 3413933 if target.name==names[3] else 1
            return types.SimpleNamespace(st_mode=stat.S_IFDIR if target==root else stat.S_IFREG,st_size=size)
        for kind in ('healthy','129-entries','empty-directory'):
            iterator=Entries(names if kind=='healthy' else names+['unknown'+str(i) for i in range(14)] if kind=='129-entries' else ['empty'])
            calls=[]
            def children(target):calls.append(target);return iterator
            action=lambda:M.package_files(expected,lambda:None,root,inspect=inspect,children=children)
            if kind=='healthy':self.assertEqual(action(),expected)
            else:
                with self.assertRaises(Exception):action()
            self.assertTrue(iterator.closed);self.assertEqual(calls,[root])
            # Exact115-leaf closure rejects this129-entry fixture on item116,
            # even earlier than the independent129th-item capacity backstop.
            self.assertLessEqual(iterator.advances,116)
    def test_actual_package_walk_original_fence_mid_iteration(self):
        root=pathlib.Path('owned-package');expected=[M.PREFIX+'f'+str(i).zfill(3)+'.js' for i in range(115)]
        state={'guards':0,'closed':False,'next':0}
        def guard():
            state['guards']+=1
            if state['guards']==235:raise RuntimeError('original deadline')
        class Entries:
            def __next__(self):state['next']+=1;return types.SimpleNamespace(name='f000.js')
            def close(self):state['closed']=True
        with self.assertRaises(Exception):M.package_files(expected,guard,root,
          inspect=lambda *a:types.SimpleNamespace(st_mode=stat.S_IFDIR),children=lambda d:Entries())
        self.assertTrue(state['closed']);self.assertLessEqual(state['next'],1)
unittest.main(argv=['adr198-pure-parent'],verbosity=1)
`;

test('embedded Python checks expose actual AST-selected parent code without native execution',async()=>{
 assert.ok(PYTHON_CHECKS.includes('compile(ast.Module'));assert.ok(PYTHON_CHECKS.includes('M.ProtocolOwner'));
 const source=await readFile(new URL('./supervise.py',import.meta.url),'utf8');
 assert.equal(source.includes('NativeSession('),false);assert.equal(source.includes('creationflags=0x8'),true);
 assert.ok(source.indexOf('self.launch_handle=self.child._handle')<source.indexOf('launched=self.assign_owned_original(k,g,selected)'));
 assert.ok(source.includes('members=query'));assert.ok(source.includes('self.held_until'));
 assert.ok(source.includes('startup-refusal/v1'));
});


