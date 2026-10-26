// Default inert. ADR151 startup-only diagnostic; no native work on import.
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {createHash} from 'node:crypto';
import {readFile,lstat,realpath,mkdir,writeFile,link} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {inspectNativeSources,PACKAGE_ROOT} from '../native-reader-transfer-v1/source-ledger.js';
import {createNativeCaptureCoordinator,NATIVE_LAUNCH_ARGUMENTS} from '../native-reader-transfer-v1/browser-capture.mjs';
import {FIXED_CASES} from '../native-reader-transfer-v1/native-adapter.js';

export const HERE=dirname(fileURLToPath(import.meta.url)),REPO=resolve(HERE,'../../../../..'),OUTPUT=resolve(HERE,'output');
export const OWN='spikes/topic-resolution/harness/experimental/native-extension-startup-dev-v1/';
export const OLD='spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/';
export const OLD_FREEZE_SHA256='770eb68ef044dadbb6ef0f2edf2c927b643480e7d06cbf496319b1cab9d457ec';
export const SOURCE_FILES=Object.freeze([
 OWN+'run.mjs',OWN+'run.test.mjs',OWN+'protocol.json',OWN+'README.md',OWN+'supervise.py',OWN+'supervise.test.mjs',
 'decisions/ADR-151-native-extension-startup-diagnostic.md',
]);
const OLD_FREEZE_PATH=OLD+'freeze.json';
export const STAGE_FILES=Object.freeze({
 'manifest.json':OLD+'manifest.json','worker.js':OLD+'worker.js','native-adapter.js':OLD+'native-adapter.js','native-rights.js':OLD+'native-rights.js',
 'chromium/page-content-reader.js':'spikes/topic-resolution/browser/chromium/page-content-reader.js',
 'core/page-content-policy.js':'spikes/topic-resolution/browser/core/page-content-policy.js',
});
export const STAGES=Object.freeze(['launch','blank-anchor','http-deny','socket-deny','browser-cdp','download-deny','extension-load',
 'worker-lookup','target-census','worker-wait','native-api','native-window','begin-study','end-study','close-context','close-browser']);
const HASH=/^[a-f0-9]{64}$/u,sha=b=>createHash('sha256').update(b).digest('hex'),digest=v=>sha(JSON.stringify(v));
const parse=b=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const pause=ms=>new Promise(yes=>setTimeout(yes,ms));
export class StartupFatal extends Error{constructor(code){super('Startup diagnostic failed');this.name='StartupFatal';this.code=code;}}
class SettledApiError extends Error{constructor(stage,safeClass){super('Settled startup incompatibility');this.stage=stage;this.safeClass=safeClass;}}
function bad(code='contract'){throw new StartupFatal(code);}
function exact(v,keys){if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)bad();assert.deepEqual(Object.keys(v),keys);}
function id(v){if(typeof v!=='string'||!/^[A-Za-z0-9._:-]{1,160}$/u.test(v))bad();return v;}
function integer(v){if(!Number.isSafeInteger(v)||v<0||Object.is(v,-0))bad();return v;}
export function safeNativeError(error){
 if(types.isProxy(error)||!types.isNativeError(error))return null;
 const programming=[TypeError.prototype,RangeError.prototype,ReferenceError.prototype,SyntaxError.prototype,URIError.prototype,EvalError.prototype,AggregateError.prototype];
 let at=Object.getPrototypeOf(error),nativeBase=false;
 for(let depth=0;at!==null&&depth<8;depth++){
  if(types.isProxy(at)||programming.includes(at))return null;
  if(at===Error.prototype){nativeBase=true;break;}at=Object.getPrototypeOf(at);
 }
 if(!nativeBase)return null;
 const d=Object.getOwnPropertyDescriptor(error,'name');
 if(d&&!Object.hasOwn(d,'value'))return null;
 const name=d?.value;
 if((name===undefined||name==='Error')&&Object.getPrototypeOf(error)===Error.prototype)return 'native-api-error';
 if(name==='TimeoutError')return 'native-timeout';
 return null;
}
export function createStartupTrace(onRecord=()=>{}){
 const rows=[];return Object.freeze({record(variant,stage,event,safeClass=null){
  if(!['block','allow'].includes(variant)||!STAGES.includes(stage)||!['before','after'].includes(event)||
   ![null,'native-api-error','native-timeout'].includes(safeClass)||rows.length>=256)bad('trace-contract');
  const row=Object.freeze({variant,stage,event,safeClass});rows.push(row);onRecord(row);
 },snapshot:()=>Object.freeze([...rows])});
}
/** Pure injected client coordinator. Every native promise settles physically;
 * wrappers never free unresolved capacity. Not an extension/native authority. */
export async function runStartupVariant({chromium,executablePath,stagedExtensionPath,variant,trace,guard,
 clock=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}){
 if(!['block','allow'].includes(variant)||typeof chromium?.launchPersistentContext!=='function'||typeof guard!=='function')bad();
 let fatal=null,context=null,browser=null,anchor=null,session=null,worker=null,extensionId=null,closing=false,events=0;
 let contextAttempts=0,browserAttempts=0,contextClosed=false,browserClosed=false,apiFailure=null,workerObserved=false;
 let nativeApiPresent=false,beginEndCompleted=false,windowMetadata=null,census=null,workerWaitAttempted=false,loadingExtension=false;
 const deferredWorkers=[],deferredTargets=[];
 const callbackJobs=new Set(),started=clock(),until=started+45000;
 const fail=code=>{fatal??=code instanceof StartupFatal?code:new StartupFatal('callback-failure');};
 function check(){guard();if(fatal)throw fatal;if(clock()>=until)bad('context-deadline');}
 const coordinator=createNativeCaptureCoordinator({guard:check,clock,schedule,cancel,until:()=>until,onFailure:fail});
 function callback(action){return value=>{try{guard();if(++events>4096)bad('event-capacity');action(value);}catch(e){fail(e);}};}
 function track(promise){const p=Promise.resolve(promise).catch(e=>fail(e)).finally(()=>callbackJobs.delete(p));callbackJobs.add(p);return p;}
 async function operation(stage,action,{cleanup=false}={}){
  if(!cleanup)check();trace.record(variant,stage,'before');
  const run=async()=>{try{return {ok:true,value:await action()};}catch(e){const c=safeNativeError(e);if(c===null)throw e;return {ok:false,safeClass:c};}};
  const result=await(cleanup?coordinator.cleanup(run):coordinator.rpc(run));
  trace.record(variant,stage,'after',result.ok?null:result.safeClass);
  if(!cleanup)check();if(!result.ok)throw new SettledApiError(stage,result.safeClass);return result.value;
 }
 try{
  context=await operation('launch',()=>chromium.launchPersistentContext('',{executablePath,headless:true,chromiumSandbox:true,
   serviceWorkers:variant,ignoreHTTPSErrors:false,acceptDownloads:false,permissions:[],ignoreDefaultArgs:['--disable-extensions'],
   args:[...NATIVE_LAUNCH_ARGUMENTS,'--host-resolver-rules=MAP * ~NOTFOUND'],timeout:10000}));
  browser=context.browser();if(!browser)bad('browser-handle');
  browser.on('disconnected',callback(()=>{if(!closing)bad('unexpected-disconnect');}));
  const pages=await operation('blank-anchor',()=>context.pages());if(!Array.isArray(pages)||pages.length!==1||pages[0].url()!=='about:blank')bad('blank-anchor');anchor=pages[0];
  context.on('page',callback(()=>bad('unexpected-page')));
  context.on('serviceworker',callback(value=>{if(loadingExtension&&extensionId===null){if(deferredWorkers.length>=1)bad('unexpected-worker');deferredWorkers.push(value);return;}
   if(extensionId===null||value.url()!=='chrome-extension://'+extensionId+'/worker.js'||worker&&value!==worker)bad('unexpected-worker');}));
  anchor.on('framenavigated',callback(frame=>{if(frame!==anchor.mainFrame()||frame.url()!=='about:blank')bad('unexpected-navigation');}));
  for(const event of ['dialog','download','crash','worker'])anchor.on(event,callback(()=>bad('unexpected-page-event')));
  await operation('http-deny',()=>context.route(/^https?:\/\//u,callback(route=>{
   try{check();track(coordinator.resolveFetch(()=>route.abort('blockedbyclient')));}catch(e){fail(e);}
  })));
  await operation('socket-deny',()=>context.routeWebSocket('**/*',callback(route=>{
   try{check();track(coordinator.rpc(()=>route.close()));}catch(e){fail(e);}
  })));
  session=await operation('browser-cdp',()=>browser.newBrowserCDPSession());
  await operation('download-deny',()=>session.send('Browser.setDownloadBehavior',{behavior:'deny'}));
  // Discover before extension load, so no unknown target can hide in the wait.
  session.on('Target.targetCreated',callback(p=>{
   const t=p?.targetInfo;if(!t||typeof t.type!=='string'||t.type.length>64||typeof t.url!=='string'||t.url.length>2048)bad('target-contract');
   if(t.type==='page'&&t.url==='about:blank')return;
   if(t.type==='service_worker'&&loadingExtension&&extensionId===null){if(deferredTargets.length>=1)bad('unexpected-target');deferredTargets.push(t);return;}
   if(t.type==='service_worker'&&extensionId&&t.url==='chrome-extension://'+extensionId+'/worker.js')return;
   bad('unexpected-target');
  }));
  await operation('browser-cdp',()=>session.send('Target.setDiscoverTargets',{discover:true}));
  loadingExtension=true;const loaded=await operation('extension-load',()=>session.send('Extensions.loadUnpacked',{path:stagedExtensionPath}));
  if(!loaded||typeof loaded.id!=='string'||!/^[a-p]{32}$/u.test(loaded.id))bad('extension-id');extensionId=loaded.id;
  const workerUrl='chrome-extension://'+extensionId+'/worker.js';
  loadingExtension=false;
  if(deferredWorkers.some(w=>w.url()!==workerUrl)||deferredTargets.some(t=>t.url!==workerUrl))bad('unexpected-worker');
  const workers=await operation('worker-lookup',()=>context.serviceWorkers());
  if(!Array.isArray(workers)||workers.length>1||workers.some(w=>w.url()!==workerUrl))bad('worker-identity');worker=workers[0]??null;
  async function targetCensus(){
   const value=await operation('target-census',()=>session.send('Target.getTargets'));
   if(!Array.isArray(value?.targetInfos)||value.targetInfos.length>128)bad('target-contract');
   let page=0,ownExtension=0,other=0;
   for(const t of value.targetInfos){if(!t||typeof t.type!=='string'||typeof t.url!=='string'||t.url.length>2048)bad('target-contract');
    if(t.type==='page'&&t.url==='about:blank')page++;
    else if(t.type==='service_worker'&&t.url===workerUrl)ownExtension++;
    else if(t.type==='browser'&&t.url===''){}else other++;
   }
   if(page!==1||other!==0||ownExtension>1)bad('unexpected-target');
   return {targets:value.targetInfos.length,blankPages:page,ownExtensionWorkers:ownExtension,otherTargets:other,ownExtensionEquality:true};
  }
  census=await targetCensus();
  if(!worker){workerWaitAttempted=true;try{worker=await operation('worker-wait',()=>context.waitForEvent('serviceworker',{predicate:w=>w.url()===workerUrl,timeout:8000}));}
   catch(e){if(e instanceof SettledApiError&&e.stage==='worker-wait'&&e.safeClass==='native-timeout')apiFailure={stage:'worker-wait',safeClass:'native-timeout'};else throw e;}}
  if(worker){
   if(worker.url()!==workerUrl||context.serviceWorkers().some(w=>w!==worker))bad('worker-identity');workerObserved=true;
   nativeApiPresent=await operation('native-api',()=>worker.evaluate(()=>Boolean(
    typeof globalThis.chrome?.scripting?.executeScript==='function'&&typeof globalThis.chrome?.tabs?.query==='function'&&
    typeof globalThis.chrome?.windows?.getLastFocused==='function'&&typeof globalThis.nativeReaderTransfer?.beginStudy==='function'&&
    typeof globalThis.nativeReaderTransfer?.endStudy==='function'&&typeof globalThis.nativeDocumentRights?.locate==='function'&&
    typeof globalThis.nativeDocumentRights?.snapshot==='function')));
   if(typeof nativeApiPresent!=='boolean')bad('native-api-contract');
   if(!nativeApiPresent)throw new SettledApiError('native-api','native-api-unavailable');
   windowMetadata=await operation('native-window',()=>worker.evaluate(async()=>{const w=await chrome.windows.getLastFocused({populate:false});return {windowId:w.id,type:w.type,incognito:w.incognito,focused:w.focused};}));
   exact(windowMetadata,['windowId','type','incognito','focused']);integer(windowMetadata.windowId);
   if(typeof windowMetadata.type!=='string'||!['normal','popup','panel','app','devtools'].includes(windowMetadata.type)||typeof windowMetadata.incognito!=='boolean'||typeof windowMetadata.focused!=='boolean')bad('window-contract');
   const identity=await operation('begin-study',()=>worker.evaluate(input=>globalThis.nativeReaderTransfer.beginStudy(input),
    {studyId:'startup-dev-'+variant,windowId:windowMetadata.windowId,cases:FIXED_CASES}));
   exact(identity,['schema','studyId','studyRevision','eventEpoch','caseCount']);
   if(identity.schema!=='native-reader-study/v1'||identity.studyId!=='startup-dev-'+variant||identity.caseCount!==32)bad('begin-contract');id(identity.studyRevision);integer(identity.eventEpoch);
   const ended=await operation('end-study',()=>worker.evaluate(input=>globalThis.nativeReaderTransfer.endStudy(input),{studyId:identity.studyId,studyRevision:identity.studyRevision}));
   exact(ended,['schema','studyId','studyRevision','eventEpoch']);integer(ended.eventEpoch);
   if(ended.schema!=='native-reader-study-ended/v1'||ended.studyId!==identity.studyId||ended.studyRevision!==identity.studyRevision||ended.eventEpoch<=identity.eventEpoch)bad('end-contract');
   beginEndCompleted=true;
  }
  check();
 }catch(e){if(e instanceof SettledApiError&&!fatal)apiFailure={stage:e.stage,safeClass:e.safeClass};else{fail(e);}}
 finally{
  if(extensionId===null&&(deferredWorkers.length||deferredTargets.length))fail(new StartupFatal('unattributed-worker'));
  closing=true;
  if(context){contextAttempts++;try{await operation('close-context',()=>context.close(),{cleanup:true});contextClosed=true;}catch(e){fail(e);}}
  if(browser){browserAttempts++;try{await operation('close-browser',()=>browser.close(),{cleanup:true});browserClosed=true;}catch(e){fail(e);}}
 }
 guard();if(callbackJobs.size)await Promise.all([...callbackJobs]);coordinator.assertDrained();if(fatal)throw fatal;check();
 const snapshot=coordinator.snapshot();coordinator.dispose();
 return freeze({variant,status:apiFailure?'incompatible':'completed',failure:apiFailure,workerObservation:workerObserved?'observed':workerWaitAttempted?'not-observed-within-8s':'not-reached',
  nativeApiPresent,windowMetadata,beginEndCompleted,census,events,contextCloseAttempts:contextAttempts,browserCloseAttempts:browserAttempts,
  contextClosed,browserClosed,physicalOperationsDrained:true,callbacksDrained:true,pending:snapshot.physical,elapsedMs:clock()-started});
}

export async function runStartupDiagnostic({runVariant,betweenContexts,beforeVariant=()=>{},guard,recheckSources,trace}){
 const variants=[];guard();await beforeVariant(1);guard();variants.push(await runVariant('block'));guard();
 await betweenContexts(digest(variants[0]));guard();await beforeVariant(2);guard();variants.push(await runVariant('allow'));guard();
 await recheckSources();guard();return freeze({variants,trace:trace.snapshot()});
}
async function checkedBytes(path,maximum=4194304){
 const absolute=resolve(path),rel=relative(REPO,absolute);if(!rel||rel.startsWith('..')||rel.includes(':'))bad('source-path');
 let at=REPO;for(const part of rel.split(sep)){at=resolve(at,part);const s=await lstat(at);if(s.isSymbolicLink()||(await realpath(at)).toLowerCase()!==at.toLowerCase())bad('source-path');}
 const before=await lstat(absolute);if(!before.isFile()||before.size<=0||before.size>maximum)bad('source-size');
 const b=await readFile(absolute),after=await lstat(absolute);assert.deepEqual([after.size,after.mtimeMs,after.ctimeMs],[before.size,before.mtimeMs,before.ctimeMs]);assert.equal(b.length,before.size);return b;
}
export async function inspectStartupSources(){
 const old=await inspectNativeSources(),oldBytes=await checkedBytes(resolve(REPO,OLD_FREEZE_PATH),65536);
 assert.equal(sha(oldBytes),OLD_FREEZE_SHA256);const oldFreeze=parse(oldBytes),{freezeHash,...material}=oldFreeze;
 assert.equal(digest(material),freezeHash);assert.equal(oldFreeze.schema,'native-reader-root-transfer-freeze/v1');assert.deepEqual(old.sourceHashes,oldFreeze.sourceHashes);
 assert.equal(Object.keys(old.sourceHashes).length,187);const sourceHashes={...old.sourceHashes};
 for(const name of SOURCE_FILES)sourceHashes[name]=sha(await checkedBytes(resolve(REPO,name)));
 sourceHashes[OLD_FREEZE_PATH]=sha(oldBytes);assert.equal(Object.keys(sourceHashes).length,195);return freeze({sourceHashes});
}
async function absent(path){try{await lstat(path);}catch(e){if(e?.code==='ENOENT')return;throw e;}bad('existing-output');}
export async function prepareStartupDiagnostic(){
 await absent(resolve(HERE,'freeze.json'));await absent(OUTPUT);const {sourceHashes}=await inspectStartupSources();
 const material={schema:'native-extension-startup-dev-freeze/v1',sourceHashes,protocolSha256:sourceHashes[OWN+'protocol.json'],oldFreezeSha256:OLD_FREEZE_SHA256};
 assert.deepEqual((await inspectStartupSources()).sourceHashes,sourceHashes);await absent(resolve(HERE,'freeze.json'));await absent(OUTPUT);
 await writeFile(resolve(HERE,'freeze.json'),JSON.stringify({...material,freezeHash:digest(material)}),{flag:'wx'});
}
async function stageSources(sourceHashes){
 const stage=resolve(OUTPUT,'staged-extension');await mkdir(stage);await mkdir(resolve(stage,'chromium'));await mkdir(resolve(stage,'core'));
 for(const [target,source]of Object.entries(STAGE_FILES)){const b=await checkedBytes(resolve(REPO,source));assert.equal(sha(b),sourceHashes[source]);await writeFile(resolve(stage,target),b,{flag:'wx'});}
 return {path:stage,recheck:async()=>{for(const [target,source]of Object.entries(STAGE_FILES))assert.equal(sha(await checkedBytes(resolve(stage,target))),sourceHashes[source]);}};
}
export async function startupHandshake({input=process.stdin,supervised=process.env.MURMINGLE_NATIVE_EXTENSION_STARTUP_DEV_V1_SUPERVISED}={}){
 assert.equal(supervised,'1');const expected=Buffer.from('NATIVE_EXTENSION_STARTUP_DEV_JOB_ASSIGNED_V1\n');
 await new Promise((yes,no)=>{let wire=Buffer.alloc(0);const timer=setTimeout(()=>done(new StartupFatal('handshake-deadline')),5000);
  function done(e){clearTimeout(timer);input.off('data',data);input.off('end',end);input.pause();e?no(e):yes();}
  function data(chunk){if(!Buffer.isBuffer(chunk))return done(new StartupFatal('handshake'));wire=Buffer.concat([wire,chunk]);if(wire.length>expected.length||!wire.equals(expected.subarray(0,wire.length)))return done(new StartupFatal('handshake'));if(wire.length===expected.length)done();}
  const end=()=>done(new StartupFatal('handshake'));input.on('data',data);input.on('end',end);input.resume();
 });
}
export async function awaitBetweenContexts({freezeSha256,firstVariantHash,guard,writePending,publish,readAck,clock=()=>performance.now(),wait=pause,originalNodePid=process.pid}){
 const request={schema:'native-startup-between-contexts-request/v1',freezeSha256,firstVariantHash},bytes=Buffer.from(JSON.stringify(request)),requestSha256=sha(bytes),until=clock()+15000;
 guard();await writePending(bytes);guard();await publish();guard();
 while(true){guard();if(clock()>=until)bad('barrier-deadline');let b;try{b=await readAck();}catch(e){if(e?.code!=='ENOENT')throw e;}
  if(b!==undefined){if(!Buffer.isBuffer(b)||b.length===0||b.length>4096)bad('barrier-contract');const a=parse(b);
   exact(a,['schema','requestSha256','originalNodePid','browserDescendantsAbsent','freezeSha256']);
   if(a.schema!=='native-startup-between-contexts-ack/v1'||a.requestSha256!==requestSha256||a.originalNodePid!==originalNodePid||a.browserDescendantsAbsent!==true||a.freezeSha256!==freezeSha256)bad('barrier-contract');
   guard();return {requestSha256,ackSha256:sha(b)};}
  await wait(25);
 }
}
async function executable(){for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']){
 let s;try{s=await lstat(p);}catch(e){if(e?.code==='ENOENT')continue;throw e;}if(!s.isFile()||s.isSymbolicLink()||(await realpath(p)).toLowerCase()!==p.toLowerCase())bad('chrome-path');return p;
 }bad('chrome-unavailable');}
async function runDev(){
 await startupHandshake();const started=performance.now(),until=started+165000;const guard=()=>{if(performance.now()>=until)bad('global-deadline');};
 const freezeBytes=await checkedBytes(resolve(HERE,'freeze.json'),65536),f=parse(freezeBytes),{freezeHash,...material}=f;
 exact(f,['schema','sourceHashes','protocolSha256','oldFreezeSha256','freezeHash']);assert.equal(f.schema,'native-extension-startup-dev-freeze/v1');assert.equal(digest(material),freezeHash);
 assert.equal(f.oldFreezeSha256,OLD_FREEZE_SHA256);assert.equal(f.protocolSha256,f.sourceHashes[OWN+'protocol.json']);
 const initial=await inspectStartupSources();assert.deepEqual(initial.sourceHashes,f.sourceHashes);guard();
 const stage=await stageSources(f.sourceHashes),executablePath=await executable();guard();
 const {chromium}=await import(pathToFileURL(resolve(PACKAGE_ROOT,'index.mjs')).href);guard();
 const trace=createStartupTrace(row=>process.stdout.write(JSON.stringify({schema:'native-startup-operation/v1',...row})+'\n'));let barrier;
 const result=await runStartupDiagnostic({guard,trace,
  runVariant:variant=>runStartupVariant({chromium,executablePath,stagedExtensionPath:stage.path,variant,trace,guard}),
  beforeVariant:async variantIndex=>{const b=Buffer.from(JSON.stringify({schema:'native-startup-variant-started/v1',freezeSha256:sha(freezeBytes),variantIndex}));
   await writeFile(resolve(OUTPUT,'variant-'+variantIndex+'.started.pending'),b,{flag:'wx'});guard();
   await link(resolve(OUTPUT,'variant-'+variantIndex+'.started.pending'),resolve(OUTPUT,'variant-'+variantIndex+'.started.json'));guard();},
  betweenContexts:async firstVariantHash=>{await stage.recheck();guard();barrier=await awaitBetweenContexts({freezeSha256:sha(freezeBytes),firstVariantHash,guard,
   writePending:b=>writeFile(resolve(OUTPUT,'between-contexts.request.pending'),b,{flag:'wx'}),
   publish:()=>link(resolve(OUTPUT,'between-contexts.request.pending'),resolve(OUTPUT,'between-contexts.request.json')),
   readAck:()=>checkedBytes(resolve(OUTPUT,'between-contexts.ack.json'),4096)});},
  recheckSources:async()=>{await stage.recheck();assert.deepEqual((await inspectStartupSources()).sourceHashes,f.sourceHashes);assert.equal(sha(await checkedBytes(resolve(HERE,'freeze.json'),65536)),sha(freezeBytes));},
 });guard();
 const evidence={schema:'native-extension-startup-dev-result/v1',status:'complete',freezeHash,freezeSha256:sha(freezeBytes),protocolSha256:f.protocolSha256,
  oldFreezeSha256:OLD_FREEZE_SHA256,sourceHashes:f.sourceHashes,variants:result.variants,trace:result.trace,barrier,
  sourceHashesRechecked:true,stageBytesRechecked:true,publicNavigations:0,observations:0,modelCalls:0,rawInputPersisted:false,
  completeOsEgressIsolation:false,productionValidated:false,assignmentAuthority:false,elapsedMs:performance.now()-started};
 const b=Buffer.from(JSON.stringify(evidence));assert.ok(b.length<=65536);guard();await writeFile(resolve(OUTPUT,'result.json'),b,{flag:'wx'});guard();
}
export function phaseFor(args){if(!Array.isArray(args))bad();if(args.length===0)return null;if(args.length!==1||!['--prepare','--run-dev'].includes(args[0]))bad();return args[0];}
async function main(){const phase=phaseFor(process.argv.slice(2));if(phase===null){process.stdout.write('No action. Separate review, freeze and guardian permission required.\n');return;}
 if(phase==='--prepare')return prepareStartupDiagnostic();await runDev();}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const unexpected=()=>{process.stderr.write('{"schema":"native-extension-startup-dev-failure/v1","reason":"unexpected-process-failure"}\n');process.exit(1);};
 process.once('uncaughtException',unexpected);process.once('unhandledRejection',unexpected);
 main().catch(()=>{process.stderr.write('{"schema":"native-extension-startup-dev-failure/v1","reason":"diagnostic-failed"}\n');process.exitCode=1;});
}
