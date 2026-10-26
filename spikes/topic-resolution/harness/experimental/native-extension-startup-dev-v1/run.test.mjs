import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {readFileSync} from 'node:fs';
import {runStartupVariant,runStartupDiagnostic,createStartupTrace,safeNativeError,StartupFatal,
 phaseFor,startupHandshake,awaitBetweenContexts,SOURCE_FILES,STAGE_FILES,OLD_FREEZE_SHA256,STAGES} from './run.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const timeout=()=>{const e=new Error('must not retain this secret URL');e.name='TimeoutError';return e;};
function fixture({missingWorker=false,missingRights=false,endChange=()=>{},failureStage=null,error=new Error('private detail'),callbackFailure=false,closeFailure=false,callbackDuringLoad=false}={}){
 const calls=[],context=new EventEmitter(),browser=new EventEmitter(),session=new EventEmitter(),page=new EventEmitter();
 const frame={url:()=> 'about:blank'},worker={url:()=> 'chrome-extension://'+'a'.repeat(32)+'/worker.js'};
 page.url=()=> 'about:blank';page.mainFrame=()=>frame;
 browser.newBrowserCDPSession=async()=>{calls.push('browser-cdp');return session;};
 browser.close=async()=>{calls.push('close-browser');browser.emit('disconnected');};
 context.browser=()=>browser;context.pages=()=>[page];context.serviceWorkers=()=>missingWorker?[]:[worker];
 context.close=async()=>{calls.push('close-context');if(closeFailure)throw new Error('private close error');};
 context.route=async(_pattern,callback)=>{calls.push('http-deny');context.http=callback;};
 context.routeWebSocket=async(_pattern,callback)=>{calls.push('socket-deny');context.socket=callback;};
 context.waitForEvent=async(event,options)=>{calls.push('worker-wait');assert.equal(event,'serviceworker');assert.equal(options.timeout,8000);throw timeout();};
 session.send=async(method)=>{
  calls.push(method);if(failureStage===method)throw error;
  if(method==='Extensions.loadUnpacked'){
   assert.ok(context.http&&context.socket);
   if(callbackDuringLoad){context.emit('serviceworker',worker);session.emit('Target.targetCreated',{targetInfo:{type:'service_worker',url:worker.url()}});}
   return {id:'a'.repeat(32)};
  }
  if(method==='Target.getTargets')return {targetInfos:[{type:'page',url:'about:blank'},...(!missingWorker?[{type:'service_worker',url:worker.url()}]:[])]};
  return {};
 };
 worker.evaluate=async(fn,input)=>{
  const stage=input?.cases?'begin-study':input?'end-study':String(fn).includes('Boolean(')?'native-api':'native-window';calls.push(stage);
  if(callbackFailure&&stage==='native-window')context.emit('page',{});
  if(failureStage===stage)throw error;
  if(stage==='native-api'){assert.match(String(fn),/typeof globalThis\.nativeDocumentRights\?\.locate==='function'/);assert.match(String(fn),/typeof globalThis\.nativeDocumentRights\?\.snapshot==='function'/);return !missingRights;}
  if(stage==='native-window')return {windowId:7,type:'normal',incognito:false,focused:false};
  if(stage==='begin-study'){assert.equal(input.cases.length,32);return {schema:'native-reader-study/v1',studyId:input.studyId,studyRevision:'r1',eventEpoch:0,caseCount:32};}
  const ended={schema:'native-reader-study-ended/v1',studyId:input.studyId,studyRevision:input.studyRevision,eventEpoch:1};endChange(ended);return ended;
 };
 const chromium={launchPersistentContext:async(profile,options)=>{
  calls.push('launch');assert.equal(profile,'');assert.equal(options.chromiumSandbox,true);assert.equal(options.ignoreHTTPSErrors,false);
  assert.ok(options.args.includes('--host-resolver-rules=MAP * ~NOTFOUND'));assert.ok(options.args.includes('--no-proxy-server'));
  assert.deepEqual(options.ignoreDefaultArgs,['--disable-extensions']);
  if(failureStage==='launch')throw error;return context;
 }};
 return {chromium,calls,context,browser,session,page};
}
const args=f=>({chromium:f.chromium,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',stagedExtensionPath:'D:/owned/staged-extension',variant:'block',trace:createStartupTrace(),guard:()=>{}});

test('default inert, fixed two modes and handshake before client import',()=>{
 assert.equal(phaseFor([]),null);for(const mode of ['--prepare','--run-dev'])assert.equal(phaseFor([mode]),mode);
 for(const a of [['--run-study'],['--run-dev','extra'],['x']])assert.throws(()=>phaseFor(a));
 const source=readFileSync(new URL('./run.mjs',import.meta.url),'utf8');
 const handshake=source.indexOf('await startupHandshake();'),client=source.indexOf("await import(pathToFileURL(resolve(PACKAGE_ROOT,'index.mjs'))");
 assert.ok(handshake>=0&&client>handshake);
 assert.equal(SOURCE_FILES.length,7);assert.equal(new Set(SOURCE_FILES).size,7);assert.equal(Object.keys(STAGE_FILES).length,6);
 assert.equal(OLD_FREEZE_SHA256,'770eb68ef044dadbb6ef0f2edf2c927b643480e7d06cbf496319b1cab9d457ec');
 assert.match(source,/Object\.keys\(old\.sourceHashes\)\.length,187/);assert.match(source,/Object\.keys\(sourceHashes\)\.length,195/);
 assert.doesNotMatch(source,/loadNativeStudyPreparation|\.observe\(|skipUnavailable|createEmbedder|\.goto\(/);
 assert.match(source,/old\.sourceHashes,oldFreeze\.sourceHashes/);
 assert.match(source,/assert\.equal\(sha\(oldBytes\),OLD_FREEZE_SHA256\)/);
 assert.match(source,/stage\.recheck\(\)[\s\S]+inspectStartupSources\(\)/);
});
test('genuine handshake exact bytes and sentinel only',async()=>{
 const input=new PassThrough();const p=startupHandshake({input,supervised:'1'});input.write(Buffer.from('NATIVE_EXTENSION_STARTUP_DEV_JOB_ASSIGNED_V1\n'));await p;
 await assert.rejects(startupHandshake({input:new PassThrough(),supervised:'0'}));
 const bad=new PassThrough(),q=startupHandshake({input:bad,supervised:'1'});bad.end(Buffer.from('bad'));await assert.rejects(q);
});
test('actual injected stages complete, module/window fields remain actual, bounded safe trace',async()=>{
 const f=fixture({callbackDuringLoad:true}),trace=createStartupTrace();const r=await runStartupVariant({...args(f),trace});
 assert.equal(r.status,'completed');assert.equal(r.workerObservation,'observed');assert.equal(r.beginEndCompleted,true);
 assert.equal(r.windowMetadata.focused,false);assert.equal(r.contextCloseAttempts,1);assert.equal(r.browserCloseAttempts,1);
 assert.equal(r.pending,0);assert.equal(r.callbacksDrained,true);assert.equal(r.physicalOperationsDrained,true);
 assert.ok(f.calls.indexOf('http-deny')<f.calls.indexOf('Extensions.loadUnpacked'));
 assert.ok(f.calls.indexOf('socket-deny')<f.calls.indexOf('Extensions.loadUnpacked'));
 assert.ok(f.calls.includes('begin-study')&&f.calls.includes('end-study'));assert.ok(Object.isFrozen(r));
 const rows=trace.snapshot();assert.equal(rows.length%2,0);assert.ok(rows.every(x=>STAGES.includes(x.stage)));
 assert.doesNotMatch(JSON.stringify(rows),/chrome-extension|private|secret|worker\.js/);
});
test('settled eight-second worker wait records bounded nonobservation, never a rescue/read',async()=>{
 const f=fixture({missingWorker:true}),r=await runStartupVariant(args(f));
 assert.equal(r.status,'incompatible');assert.equal(r.workerObservation,'not-observed-within-8s');assert.equal(r.nativeApiPresent,false);
 assert.deepEqual(r.failure,{stage:'worker-wait',safeClass:'native-timeout'});assert.equal(r.beginEndCompleted,false);
 assert.ok(f.calls.indexOf('Target.getTargets')<f.calls.indexOf('worker-wait'));
});
test('rights module presence required but never invoked; actual end ACK identity and epoch checked',async()=>{
 const f=fixture({missingRights:true}),r=await runStartupVariant(args(f));assert.equal(r.status,'incompatible');
 assert.deepEqual(r.failure,{stage:'native-api',safeClass:'native-api-unavailable'});assert.equal(r.beginEndCompleted,false);assert.ok(!f.calls.includes('begin-study'));
 for(const endChange of [x=>delete x.eventEpoch,x=>x.studyRevision='wrong',x=>x.studyId='wrong',x=>x.schema='wrong',x=>x.eventEpoch=0,x=>x.eventEpoch=-0,x=>x.extra=true]){
  const g=fixture({endChange});await assert.rejects(runStartupVariant(args(g)),StartupFatal);assert.ok(g.calls.includes('close-browser'));
 }
});
test('settled API incompatibility ends variant but both native closes still genuinely submit',async()=>{
 const f=fixture({failureStage:'Browser.setDownloadBehavior'}),r=await runStartupVariant(args(f));
 assert.equal(r.status,'incompatible');assert.deepEqual(r.failure,{stage:'download-deny',safeClass:'native-api-error'});
 assert.equal(r.workerObservation,'not-reached');assert.deepEqual(f.calls.slice(-2),['close-context','close-browser']);
});
test('unattributed startup worker cannot hide behind a settled extension load failure',async()=>{
 const f=fixture(),original=f.session.send;f.session.send=async(method,...rest)=>{
  if(method==='Extensions.loadUnpacked'){f.context.emit('serviceworker',{url:()=> 'chrome-extension://'+'b'.repeat(32)+'/worker.js'});throw new Error('private native rejection');}
  return original(method,...rest);
 };
 await assert.rejects(runStartupVariant(args(f)),StartupFatal);assert.ok(f.calls.includes('close-browser'));
});
test('unknown callback, programming error and failed cleanup cannot become ordinary incompatibility',async()=>{
 for(const options of [{callbackFailure:true},{failureStage:'Extensions.loadUnpacked',error:new TypeError('private')},{closeFailure:true}]){
  const f=fixture(options);await assert.rejects(runStartupVariant(args(f)),StartupFatal);assert.ok(f.calls.includes('close-browser'));
 }
 const proxy=new Proxy({}, {get(){throw new Error('never invoke');}});assert.equal(safeNativeError(proxy),null);
 assert.equal(safeNativeError(new TypeError('bad')),null);assert.equal(safeNativeError(new Error('private')),'native-api-error');
 for(const C of [TypeError,RangeError,ReferenceError,SyntaxError,URIError,EvalError,AggregateError]){
  const e=C===AggregateError?new C([],'private'):new C('private');e.name='TimeoutError';assert.equal(safeNativeError(e),null);
 }
 const getter=new Error();Object.defineProperty(getter,'name',{get(){throw new Error('must not execute');}});assert.equal(safeNativeError(getter),null);
});
test('all denied HTTP/socket callbacks count and drain; bounded unknown targets are fatal',async()=>{
 const f=fixture(),original=f.session.send;
 f.session.send=async(method,...rest)=>{
  const value=await original(method,...rest);
  if(method==='Extensions.loadUnpacked'){
   let aborted=0,closed=0;f.context.http({abort:async()=>{aborted++;}});f.context.socket({close:async()=>{closed++;}});
   await Promise.resolve();await Promise.resolve();assert.equal(aborted,1);assert.equal(closed,1);
  }return value;
 };
 const r=await runStartupVariant(args(f));assert.equal(r.pending,0);assert.equal(r.events,3); // HTTP, socket and actual owned disconnect.
 const g=fixture(),native=g.session.send;g.session.send=async(method,...rest)=>{const result=await native(method,...rest);
  if(method==='Extensions.loadUnpacked')g.session.emit('Target.targetCreated',{targetInfo:{type:'worker',url:'private-unknown'}});return result;};
 await assert.rejects(runStartupVariant(args(g)),StartupFatal);
});
test('unsettled native action never releases physical capacity or permits second variant',async()=>{
 const f=fixture(),timers=[];f.chromium.launchPersistentContext=()=>new Promise(()=>{});
 const p=runStartupVariant({...args(f),schedule:fn=>{timers.push(fn);return fn;},cancel:()=>{}});
 await Promise.resolve();assert.ok(timers.length);timers[0]();await assert.rejects(p);assert.equal(f.calls.length,0);
});
test('two variants sequentially require genuine completion and barrier then end recheck',async()=>{
 const calls=[],trace=createStartupTrace();const first={variant:'block',physicalOperationsDrained:true};
 const r=await runStartupDiagnostic({trace,guard:()=>{},beforeVariant:async i=>calls.push('marker'+i),
  runVariant:async v=>{calls.push(v);return v==='block'?first:{variant:v};},
  betweenContexts:async h=>{assert.equal(h,sha(JSON.stringify(first)));calls.push('barrier');},recheckSources:async()=>calls.push('recheck')});
 assert.deepEqual(calls,['marker1','block','barrier','marker2','allow','recheck']);assert.equal(r.variants.length,2);
 const noSecond=[];await assert.rejects(runStartupDiagnostic({trace,guard:()=>{},runVariant:async v=>{noSecond.push(v);return first;},betweenContexts:async()=>{throw new StartupFatal('barrier');},recheckSources:async()=>{}}));
 assert.deepEqual(noSecond,['block']);
});
test('atomic barrier writes close before publication and validates exact guardian ACK',async()=>{
 let request,clock=0;const calls=[],H='a'.repeat(64);
 const r=await awaitBetweenContexts({freezeSha256:H,firstVariantHash:H,guard:()=>{},originalNodePid:42,clock:()=>clock,wait:async ms=>{clock+=ms;},
  writePending:async b=>{request=b;calls.push('closed-write');},publish:async()=>calls.push('publish'),
  readAck:async()=>Buffer.from(JSON.stringify({schema:'native-startup-between-contexts-ack/v1',requestSha256:sha(request),originalNodePid:42,browserDescendantsAbsent:true,freezeSha256:H}))});
 assert.deepEqual(calls,['closed-write','publish']);assert.equal(r.requestSha256,sha(request));
 await assert.rejects(awaitBetweenContexts({freezeSha256:H,firstVariantHash:H,guard:()=>{},originalNodePid:42,clock:()=>clock,wait:async ms=>{clock+=ms;},writePending:async()=>{},publish:async()=>{},readAck:async()=>undefined}),/Startup diagnostic failed/);
});
test('trace cap and hostile observer failure are fatal without raw exception retention',()=>{
 const trace=createStartupTrace();for(let i=0;i<256;i++)trace.record('block','launch','before');assert.throws(()=>trace.record('block','launch','after'),StartupFatal);
 assert.throws(()=>createStartupTrace(()=>{throw new Error('private');}).record('block','launch','before'));
 assert.throws(()=>trace.record('block','arbitrary','before'));
});
