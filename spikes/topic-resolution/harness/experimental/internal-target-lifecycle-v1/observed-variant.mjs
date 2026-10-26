// Observer-only copy of frozen151 variant. Native actions/predicates unchanged.
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {StartupFatal,safeNativeError,createStartupTrace,STAGE_FILES,STAGES} from '../native-extension-startup-dev-v1/run.mjs';
import {NativeCaptureError,createNativeCaptureCoordinator,NATIVE_LAUNCH_ARGUMENTS} from '../native-reader-transfer-v1/browser-capture.mjs';
import {FIXED_CASES} from '../native-reader-transfer-v1/native-adapter.js';
export {StartupFatal,createStartupTrace,STAGE_FILES,STAGES};
class SettledApiError extends Error{constructor(stage,safeClass){super('Settled startup incompatibility');this.stage=stage;this.safeClass=safeClass;}}
function bad(code='contract'){throw new StartupFatal(code);}
function exact(v,keys){if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)bad();assert.deepEqual(Object.keys(v),keys);}
function id(v){if(typeof v!=='string'||!/^[A-Za-z0-9._:-]{1,160}$/u.test(v))bad();return v;}
function integer(v){if(!Number.isSafeInteger(v)||v<0||Object.is(v,-0))bad();return v;}
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const CALLBACKS=new Set(['browser-disconnected','context-page','context-serviceworker','anchor-framenavigated','anchor-dialog','anchor-download','anchor-crash','anchor-worker','http-route','websocket-route','target-created','target-info-changed','target-destroyed','target-crashed']);
const ORIGINS=new Set([...CALLBACKS,'coordinator','variant-catch','cleanup-context','cleanup-browser','observer','terminal']);
const STARTUP_CODES=new Set(['contract','trace-contract','callback-failure','context-deadline','event-capacity','unexpected-disconnect','browser-handle','blank-anchor','unexpected-page','unexpected-worker','unexpected-navigation','unexpected-page-event','target-contract','unexpected-target','extension-id','worker-identity','unattributed-worker','native-api-contract','window-contract','begin-contract','end-contract','observation-failed']);
const CAPTURE_CODES=new Set(['contract','operation-registry','client-operation','coordinator-capacity','article-deadline','rpc-deadline','coordinator-failed','unsettled-operations']);
const TYPES=new Set(['page','service_worker','browser','tab','iframe','worker','shared_worker','other','background_page','webview','auction_worklet','worklet','browser_ui','assistive_technology']);
const ENDPOINTS=new Map([
 ['chrome://omnibox-popup.top-chrome/','omnibox-popup-root'],
 ['chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html','omnibox-popup-aim'],
 ['chrome://omnibox-everywhere.top-chrome/','omnibox-everywhere-root'],
 ['chrome://tab-search.top-chrome/','tab-search-root'],
 ['chrome://webui-browser/','webui-browser-root'],
]);
const CORE_FAILURES=new Set([null,'event-capacity','normal-capacity','cleanup-capacity','operation-rejected','external-fatal','disposed','invalid-task']);
const INVALID=Symbol('invalid');
function plain(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
function data(value,key){if(!plain(value))return INVALID;const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,'value')?d.value:INVALID;}
function present(value,key){return plain(value)&&Object.getOwnPropertyDescriptor(value,key)!==undefined;}
/** Descriptor-only zero-hook projection; unchanged original actions still own
 * their original input handling. No raw unknown strings/IDs/URLs are returned. */
export function projectCallback(input){
 if(!plain(input))throw Error('observation-contract');
 const event=data(input,'event'),ordinal=data(input,'ordinal'),stage=data(input,'stage'),edge=data(input,'edge'),loading=data(input,'loadingExtension'),established=data(input,'extensionIdentityEstablished');
 if(!CALLBACKS.has(event)||!Number.isSafeInteger(ordinal)||ordinal<0||ordinal>4096||!['initial',...STAGES].includes(stage)||!['none','before','after'].includes(edge)||typeof loading!=='boolean'||typeof established!=='boolean')throw Error('observation-contract');
 const row={schema:'startup-callback-observation/v1',event,ordinal,stage,edge,loadingExtension:loading,extensionIdentityEstablished:established};
 if(!['target-created','target-info-changed'].includes(event))return Object.freeze(row);
 const target=data(data(input,'payload'),'targetInfo'),type=data(target,'type'),url=data(target,'url'),expected=data(input,'expectedWorkerUrl');
 let targetType='invalid',urlClass='invalid',urlLength='invalid';
 if(typeof type==='string'&&type.length>0&&type.length<=64)targetType=TYPES.has(type)?type:'unknown-type';
 if(typeof url==='string'){
  urlLength=url.length===0?'empty':url.length<=128?'1-128':url.length<=512?'129-512':url.length<=2048?'513-2048':'oversized';
  if(url.length<=2048){
   if(url==='')urlClass='empty';else if(url==='about:blank')urlClass='exact-about-blank';
   else if(typeof expected==='string'&&expected.length<=2048&&url===expected)urlClass='owned-worker';
   else if(url.startsWith('chrome-extension://'))urlClass='other-extension';else if(url.startsWith('chrome://'))urlClass='chrome-internal';
   else if(url.startsWith('devtools://'))urlClass='devtools';else if(url.startsWith('http://'))urlClass='HTTP';else if(url.startsWith('https://'))urlClass='HTTPS';else urlClass='other';
  }
 }
 const attached=data(target,'attached'),bounded=typeof url==='string'&&url.length<=2048;
 return Object.freeze({...row,targetType,urlClass,urlLength,
  endpoint:bounded?(ENDPOINTS.get(url)??(urlClass==='chrome-internal'?'other-chrome-internal':'not-chrome-internal')):'invalid',
  queryPresent:bounded?url.includes('?'):null,fragmentPresent:bounded?url.includes('#'):null,
  attached:typeof attached==='boolean'?attached:null,contextPresent:present(target,'browserContextId'),openerPresent:present(target,'openerId')});
}
/** Private logical accounting, NOT an assertion about V8 heap allocation:
 * map entry overhead=32 bytes; ASCII keys/retained string values=one byte/char;
 * safe integers=8, booleans/null=1. Header=128. All record field names are
 * charged, including terminal state/tombstones, context maps and anchor state.
 * No serialization, raw URL/title/type retention, filesystem or client calls. */
export function createTargetRegistry(){
 const targets=new Map(),contexts=new Map();let anchor=null,released=false;
 const idPattern=/^[A-Za-z0-9._:-]{1,160}$/u;
 function identity(object,key){
  if(!plain(object))throw Error('registry-contract');
  const d=Object.getOwnPropertyDescriptor(object,key);if(!d)return {state:'absent',value:null};
  if(!Object.hasOwn(d,'value'))throw Error('registry-descriptor');
  const v=d.value;if(types.isProxy(v))throw Error('registry-proxy');
  if(typeof v==='string'&&v.length>160)throw Error('registry-identity-capacity');
  return typeof v==='string'&&idPattern.test(v)?{state:'valid',value:v}:{state:'invalid',value:null};
 }
 const bytesOf=v=>v===null||typeof v==='boolean'?1:typeof v==='number'?8:v.length;
 const fieldBytes=record=>Object.entries(record).reduce((n,[key,value])=>n+key.length+bytesOf(value),0);
 function accounting(){
  let bytes=128;
  for(const [key,record]of targets)bytes+=32+key.length+fieldBytes(record);
  for(const [key,ordinal]of contexts)bytes+=32+key.length+'ordinal'.length+8;
  if(anchor)bytes+=32+fieldBytes(anchor);
  return bytes;
 }
 function counts(){return Object.freeze({targets:targets.size,contexts:contexts.size,
  terminalTargets:[...targets.values()].filter(v=>v.terminal).length,retainedBytes:accounting()});}
 function relation(context){
  if(context.state!=='valid')return context.state;
  if(!anchor||anchor.contextState!=='valid')return 'not-yet-comparable';
  return context.value===anchor.contextId?'same-as-observed-blank':'different-from-observed-blank';
 }
 function reference(value){return value.state!=='valid'?value.state:targets.has(value.value)?'registered':'unregistered';}
 function observe(input){
  if(released)throw Error('registry-released');
  const base=projectCallback(input),event=base.event;if(!event.startsWith('target-'))return [base];
  const closing=data(input,'closing');if(typeof closing!=='boolean')throw Error('registry-closing');
  const payload=data(input,'payload');if(!plain(payload))throw Error('registry-payload');
  const info=['target-created','target-info-changed'].includes(event);
  const object=info?data(payload,'targetInfo'):payload;if(!plain(object))throw Error('registry-target');
  const target=identity(object,'targetId');if(target.state!=='valid')throw Error('registry-target-identity');
  const context=info?identity(object,'browserContextId'):{state:'absent',value:null};
  const parent=info?identity(object,'parentId'):{state:'absent',value:null};
  const opener=info?identity(object,'openerId'):{state:'absent',value:null};
  const prior=targets.get(target.value),newContext=info&&context.state==='valid'&&!contexts.has(context.value);
  if(!prior&&targets.size>=32||newContext&&contexts.size>=32)throw Error('registry-capacity');
  const isBlank=info&&base.targetType==='page'&&base.urlClass==='exact-about-blank';
  if(isBlank&&anchor&&anchor.targetId!==target.value)throw Error('registry-blank-ambiguous');
  if(info&&anchor&&anchor.targetId===target.value&&
   (!isBlank||context.state!==anchor.contextState||context.value!==anchor.contextId))throw Error('registry-anchor-mutation');
  const previous=prior?{...prior}:null;
  const record=prior??{ordinal:targets.size+1,type:'invalid',endpoint:'invalid',urlClass:'invalid',contextState:'absent',contextId:null,created:false,terminal:false,terminalKind:'none'};
  let lifecycle;
  if(event==='target-destroyed'||event==='target-crashed'){
   lifecycle=event==='target-destroyed'?'destroyed':'crashed';
   if(!record.terminal){record.terminal=true;record.terminalKind=lifecycle;}
  }else{
   lifecycle=event==='target-created'?(record.created?'duplicate-created':'created'):(record.created?'changed':'unregistered');
   if(event==='target-created')record.created=true;
   record.type=base.targetType;record.endpoint=base.endpoint;record.urlClass=base.urlClass;
   record.contextState=context.state;record.contextId=context.value;
  }
  targets.set(target.value,record);
  if(newContext)contexts.set(context.value,contexts.size+1);
  const firstBlank=isBlank&&anchor===null;
  if(firstBlank)anchor={targetId:target.value,contextState:context.state,contextId:context.value};
  if(accounting()>32768)throw Error('registry-byte-capacity');
  const row=Object.freeze({...base,targetOrdinal:record.ordinal,lifecycle,terminal:record.terminal,
   terminalKind:record.terminalKind,contextRelation:info?relation(context):'absent',
   parentRelation:reference(parent),openerRelation:reference(opener),
   typeChanged:info&&previous!==null&&previous.type!==record.type,
   endpointChanged:info&&previous!==null&&previous.endpoint!==record.endpoint,
   contextChanged:info&&previous!==null&&(previous.contextState!==record.contextState||previous.contextId!==record.contextId),
   closing,registry:counts()});
  const rows=[row];
  if(firstBlank&&anchor.contextState==='valid'){
   for(const [key,earlier]of targets){
    if(key===anchor.targetId||earlier.contextState!=='valid')continue;
    rows.push(Object.freeze({schema:'startup-target-relation/v1',event:'observed-blank-context-resolved',
     ordinal:base.ordinal,stage:base.stage,edge:base.edge,targetOrdinal:earlier.ordinal,
     contextRelation:relation({state:earlier.contextState,value:earlier.contextId}),closing,registry:counts()}));
   }
  }
  return rows;
 }
 return Object.freeze({observe,snapshot:counts,release(){targets.clear();contexts.clear();anchor=null;released=true;}});
}
/** Actual native Error + exact imported prototype + own primitive CODE only.
 * Never instanceof/name/message/stack/custom hasInstance/getter invocation. */
export function projectFatal(error){
 const unknown=()=>Object.freeze({errorClass:'unclassified-fatal',code:'unclassified-fatal'});
 try{
  if(types.isProxy(error)||!types.isNativeError(error))return unknown();const proto=Object.getPrototypeOf(error);
  if(types.isProxy(proto))return unknown();const d=Object.getOwnPropertyDescriptor(error,'code');
  if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string')return unknown();
  if(proto===StartupFatal.prototype&&STARTUP_CODES.has(d.value))return Object.freeze({errorClass:'startup-fatal',code:d.value});
  if(proto===NativeCaptureError.prototype&&CAPTURE_CODES.has(d.value))return Object.freeze({errorClass:'native-capture-error',code:d.value});
  return unknown();
 }catch{return unknown();}
}
export function projectCounters(value){
 const maximum={events:4096,cleanupIssued:2,backlog:4096,normalActive:126,cleanupActive:2,denialActive:1,physical:128,registered:4096},out={};
 for(const [key,max]of Object.entries(maximum)){const v=data(value,key);if(!Number.isSafeInteger(v)||v<0||v>max)throw Error('counter-contract');out[key]=v;}
 const failure=data(value,'failure');if(!CORE_FAILURES.has(failure))throw Error('counter-contract');return Object.freeze({...out,failure});
}
export function createObservation({emit=()=>{},snapshot=()=>null}={}){
 const callbacks=[],cleanupFailures=[],registry=createTargetRegistry();let firstFault=null,observationFailure=null,afterCleanup=null;
 function failed(code){observationFailure??=code;return false;}
 function send(row){try{emit(row);return true;}catch{return failed('emission-failed');}}
 function counters(){try{return projectCounters(snapshot());}catch{failed('counter-snapshot-failed');return null;}}
 return Object.freeze({callback(input){
  if(callbacks.length>=32)return failed('callback-capacity');let rows;
  try{rows=registry.observe(input);}catch{return failed('projection-failed');}
  // Charge ALL relation resolutions before the first emission. Forwarding still
  // runs the unchanged original action once even if this shared cap is exceeded.
  if(callbacks.length+rows.length>32)return failed('callback-capacity');
  callbacks.push(...rows);let okay=true;for(const row of rows)if(!send(row))okay=false;return okay;
 },fault(error,origin,stage,edge){
  if(['cleanup-context','cleanup-browser'].includes(origin)&&!cleanupFailures.some(row=>row.origin===origin))cleanupFailures.push(Object.freeze({origin,...projectFatal(error)}));
  if(firstFault!==null)return observationFailure===null;
  if(!ORIGINS.has(origin)||!['initial',...STAGES].includes(stage)||!['none','before','after'].includes(edge))return failed('fault-contract');
  firstFault=Object.freeze({schema:'startup-first-fault/v1',origin,stage,edge,...projectFatal(error),counters:counters()});return send(firstFault)&&observationFailure===null;
 },cleanup(){
  if(afterCleanup!==null)return failed('cleanup-observation-duplicate');
  afterCleanup=Object.freeze({schema:'startup-after-cleanup/v1',counters:counters(),registry:registry.snapshot(),cleanupFailures:Object.freeze([...cleanupFailures]),observationFailure});
  try{return send(afterCleanup)&&observationFailure===null;}finally{registry.release();}
 },snapshot:()=>Object.freeze({callbacks:Object.freeze([...callbacks]),firstFault,observationFailure,cleanupFailures:Object.freeze([...cleanupFailures]),afterCleanup})});
}
/** Observation cannot skip the original action/deny or replace its failure. */
export function forwardObservedCallback({observe,action,fail,hasFatal=()=>false}){
 let observed=false,originalFailed=false;
 try{observed=observe()!==false;}catch{observed=false;}
 try{action();}catch(error){originalFailed=true;fail(error);}
 if(!observed&&!originalFailed&&!hasFatal())fail(new StartupFatal('observation-failed'));
}
export async function runStartupVariant({chromium,executablePath,stagedExtensionPath,variant,trace,guard,
 clock=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,onObservation=()=>{}}){
 if(!['block','allow'].includes(variant)||typeof chromium?.launchPersistentContext!=='function'||typeof guard!=='function')bad();
 let fatal=null,context=null,browser=null,anchor=null,session=null,worker=null,extensionId=null,closing=false,events=0;
 let contextAttempts=0,browserAttempts=0,contextClosed=false,browserClosed=false,apiFailure=null,workerObserved=false;
 let nativeApiPresent=false,beginEndCompleted=false,windowMetadata=null,census=null,workerWaitAttempted=false,loadingExtension=false;
 const deferredWorkers=[],deferredTargets=[];
 const callbackJobs=new Set(),started=clock(),until=started+45000;
 let observationStage='initial',observationEdge='none';
 const observer=createObservation({emit:onObservation,snapshot:()=>coordinator.snapshot()});
 const fail=(code,origin='variant-catch')=>{fatal??=code instanceof StartupFatal?code:new StartupFatal('callback-failure');observer.fault(code,origin,observationStage,observationEdge);};
 function check(){guard();if(fatal)throw fatal;if(clock()>=until)bad('context-deadline');}
 const coordinator=createNativeCaptureCoordinator({guard:check,clock,schedule,cancel,until:()=>until,onFailure:e=>fail(e,'coordinator')});
 function callback(event,action){return value=>forwardObservedCallback({
  observe:()=>observer.callback({event,ordinal:events,stage:observationStage,edge:observationEdge,loadingExtension,extensionIdentityEstablished:extensionId!==null,closing,payload:value,expectedWorkerUrl:extensionId===null?null:'chrome-extension://'+extensionId+'/worker.js'}),
  action:()=>{guard();if(++events>4096)bad('event-capacity');action(value);},fail:e=>fail(e,event),hasFatal:()=>fatal!==null,
 });}
 function track(promise){const p=Promise.resolve(promise).catch(e=>fail(e,'coordinator')).finally(()=>callbackJobs.delete(p));callbackJobs.add(p);return p;}
 async function operation(stage,action,{cleanup=false}={}){
  if(!cleanup)check();observationStage=stage;observationEdge='before';trace.record(variant,stage,'before');
  const run=async()=>{try{return {ok:true,value:await action()};}catch(e){const c=safeNativeError(e);if(c===null)throw e;return {ok:false,safeClass:c};}};
  const result=await(cleanup?coordinator.cleanup(run):coordinator.rpc(run));
  observationStage=stage;observationEdge='after';trace.record(variant,stage,'after',result.ok?null:result.safeClass);
  if(!cleanup)check();if(!result.ok)throw new SettledApiError(stage,result.safeClass);return result.value;
 }
 try{
  context=await operation('launch',()=>chromium.launchPersistentContext('',{executablePath,headless:true,chromiumSandbox:true,
   serviceWorkers:variant,ignoreHTTPSErrors:false,acceptDownloads:false,permissions:[],ignoreDefaultArgs:['--disable-extensions'],
   args:[...NATIVE_LAUNCH_ARGUMENTS,'--host-resolver-rules=MAP * ~NOTFOUND'],timeout:10000}));
  browser=context.browser();if(!browser)bad('browser-handle');
  browser.on('disconnected',callback('browser-disconnected',()=>{if(!closing)bad('unexpected-disconnect');}));
  const pages=await operation('blank-anchor',()=>context.pages());if(!Array.isArray(pages)||pages.length!==1||pages[0].url()!=='about:blank')bad('blank-anchor');anchor=pages[0];
  context.on('page',callback('context-page',()=>bad('unexpected-page')));
  context.on('serviceworker',callback('context-serviceworker',value=>{if(loadingExtension&&extensionId===null){if(deferredWorkers.length>=1)bad('unexpected-worker');deferredWorkers.push(value);return;}
   if(extensionId===null||value.url()!=='chrome-extension://'+extensionId+'/worker.js'||worker&&value!==worker)bad('unexpected-worker');}));
  anchor.on('framenavigated',callback('anchor-framenavigated',frame=>{if(frame!==anchor.mainFrame()||frame.url()!=='about:blank')bad('unexpected-navigation');}));
  for(const event of ['dialog','download','crash','worker'])anchor.on(event,callback('anchor-'+event,()=>bad('unexpected-page-event')));
  await operation('http-deny',()=>context.route(/^https?:\/\//u,callback('http-route',route=>{
   try{check();track(coordinator.resolveFetch(()=>route.abort('blockedbyclient')));}catch(e){fail(e,'http-route');}
  })));
  await operation('socket-deny',()=>context.routeWebSocket('**/*',callback('websocket-route',route=>{
   try{check();track(coordinator.rpc(()=>route.close()));}catch(e){fail(e,'websocket-route');}
  })));
  session=await operation('browser-cdp',()=>browser.newBrowserCDPSession());
  await operation('download-deny',()=>session.send('Browser.setDownloadBehavior',{behavior:'deny'}));
  // Local lifecycle listeners only: no original action or native command added.
  for(const [protocolEvent,event]of [['Target.targetInfoChanged','target-info-changed'],['Target.targetDestroyed','target-destroyed'],['Target.targetCrashed','target-crashed']]){
   session.on(protocolEvent,value=>{
    let okay=false;
    try{guard();okay=observer.callback({event,ordinal:events,stage:observationStage,edge:observationEdge,loadingExtension,extensionIdentityEstablished:extensionId!==null,closing,payload:value,expectedWorkerUrl:extensionId===null?null:'chrome-extension://'+extensionId+'/worker.js'});}catch{okay=false;}
    if(!okay)fail(new StartupFatal('observation-failed'),event);
   });
  }
  // Discover before extension load, so no unknown target can hide in the wait.
  session.on('Target.targetCreated',callback('target-created',p=>{
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
  if(context){contextAttempts++;try{await operation('close-context',()=>context.close(),{cleanup:true});contextClosed=true;}catch(e){fail(e,'cleanup-context');}}
  if(browser){browserAttempts++;try{await operation('close-browser',()=>browser.close(),{cleanup:true});browserClosed=true;}catch(e){fail(e,'cleanup-browser');}}
 }
 const observationComplete=observer.cleanup();
 try{guard();if(callbackJobs.size)await Promise.all([...callbackJobs]);coordinator.assertDrained();if(fatal)throw fatal;check();}
 catch(error){observer.fault(error,'coordinator',observationStage,observationEdge);throw error;}
 if(!observationComplete){fail(new StartupFatal('observation-failed'),'observer');throw fatal;}
 const snapshot=coordinator.snapshot();coordinator.dispose();
 return freeze({variant,status:apiFailure?'incompatible':'completed',failure:apiFailure,workerObservation:workerObserved?'observed':workerWaitAttempted?'not-observed-within-8s':'not-reached',
  nativeApiPresent,windowMetadata,beginEndCompleted,census,events,contextCloseAttempts:contextAttempts,browserCloseAttempts:browserAttempts,
  contextClosed,browserClosed,physicalOperationsDrained:true,callbacksDrained:true,pending:snapshot.physical,elapsedMs:clock()-started});
}




