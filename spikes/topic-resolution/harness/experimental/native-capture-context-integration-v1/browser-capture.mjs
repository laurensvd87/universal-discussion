// ADR195: bounded terminal descendant events after private read revocation.
// No IO/client load on import. Labels are observation points, not causal proof.
import {createHash,randomUUID} from 'node:crypto';
import {SPECIFICITY_DRIVER_FAILURE_STAGES} from '../native-specificity-study-v19/driver.mjs';
import {types} from 'node:util';
import {inspectPageUrl} from '../../../browser/core/page-content-policy.js';
import {createRouteCoordinator} from '../playwright-route-coordinator-v1/coordinator.mjs';
import {createInfrastructurePolicy} from '../infrastructure-identity-witness-v1/policy.mjs';
import {StartupFatal} from '../native-extension-startup-dev-v1/run.mjs';
import {createPublicJourney,FACTS,REPLAY_CATEGORIES,IGNORED_LIFECYCLE,PublicJourneyError,CODES as JOURNEY_CODES} from '../native-specificity-public-journey-v3/journey.mjs';
import {createArticleOwner,createCallbackObservation,ArticleOwnerError,fields,dense,identity} from './article-owner.mjs';
import {validateSpecificityBatch,deriveBatchNetworkScope,dataCopy} from '../native-specificity-study-v19/manifest.js';
import {collectOriginPolicies} from '../native-specificity-study-v19/origin-policy.js';
import {headerPolicy,ControlUnavailable,ControlFatal} from '../../current-producer-final-v2/policy.js';
import {compileSpecificityNetworkScope,describeSpecificityNetworkScope,describeNativeDnsPins,nativeHostResolverArgument,nativeHostPinned,createNativeArticleNetworkGate,admitNativePageRequest,admitNativeMainResponse,verifyNativeNavigationLoader,closeNativeArticleNetworkGate,describeNativeArticleNetworkGate,NativeNetworkError} from '../native-specificity-study-v19/network-policy.js';
const sha=v=>createHash('sha256').update(v).digest('hex'),digest=v=>sha(JSON.stringify(v));
const nativePromiseConstructor=Promise,nativePromisePrototype=Promise.prototype,nativePromiseThen=Promise.prototype.then;
const RETAINED_BYTES=256,ownedCaptureMapForEach=Map.prototype.forEach;
function navigationSite(p){switch((p-1)%6){case 0:return 'fresh';case 1:return 'within';case 2:return 'public';case 3:return 'read';case 4:return 'seal';case 5:return 'retire';}}
function navigationState(p){switch(Math.floor((p-1)/6)%5){case 0:return 'active';case 1:return 'sealed';case 2:return 'retiring';case 3:return 'released';case 4:return 'unavailable';}}
function navigationBalance(p){switch(Math.floor((p-1)/30)%3){case 0:return 'matched';case 1:return 'unmatched';case 2:return 'unavailable';}}
function navigationUrl(p){switch(Math.floor((p-1)/90)){case 0:return 'not-examined';case 1:return 'exact';case 2:return 'different';case 3:return 'blank';case 4:return 'unavailable';}}
function terminalSite(p){return p<1003?'cdp-frame':p===1003?'cdp-within':'playwright';}
function terminalPredicate(p){return p===1001?'parent-absent':p===1002?'parent-mismatch':p===1004?'main-detached':'main';}
function terminalRelation(p){return p===1001?'nonmain':p===1002?'child':p===1004?'unexamined':'main';}
function terminalDetached(p){return p<1004?null:p===1004;}
function makeView(p){
 if(p>=1000)return Object.freeze({schema:'native-terminal-navigation-observation/v1',site:terminalSite(p),predicate:terminalPredicate(p),frameRelation:terminalRelation(p),mainDetached:terminalDetached(p)});
 return Object.freeze({schema:'native-main-navigation-observation/v1',site:navigationSite(p),state:navigationState(p),balance:navigationBalance(p),urlRelation:navigationUrl(p)});
}


// Cleanup only: no authority/facts, and no caller constructor/species/then hooks.
function observeSafeRejectedRowPromise(value){
 if(types.isProxy(value)||!types.isPromise(value)||Object.getPrototypeOf(value)!==nativePromisePrototype)return;
 const descriptors=Object.getOwnPropertyDescriptors(value);
 if(Object.hasOwn(descriptors,'constructor')||Object.hasOwn(descriptors,'then')||
  Reflect.ownKeys(descriptors).some(k=>!Object.hasOwn(descriptors[k],'value')))return;
 nativePromiseThen.call(value,()=>undefined,()=>undefined);
}
export function createMainNavigationAccounting(config){
const invalid=code=>{const e=new Error('Main navigation accounting refused');e.name='MainNavigationAccountingError';e.code=code;return e;};
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function need(value,code='contract'){if(!value)throw invalid(code);}
function record(value,keys){
 need(value!==null&&typeof value==='object'&&!types.isProxy(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)));
 need(Reflect.ownKeys(value).length===keys.length);const out={};
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);need(d?.enumerable&&Object.hasOwn(d,'value'));out[k]=d.value;}return out;
}
function capability(value){need(value!==null&&typeof value==='object'&&!types.isProxy(value));return value;}
function callable(value){need(typeof value==='function'&&!types.isProxy(value));return value;}
function method(value,key){capability(value);const d=Object.getOwnPropertyDescriptor(value,key);need(d?.enumerable&&Object.hasOwn(d,'value'));return callable(d.value);}
function identity(value){need(typeof value==='string'&&/^[A-Za-z0-9._:-]{1,160}$/u.test(value));return value;}
function time(value){need(typeof value==='number'&&Number.isFinite(value)&&value>=0&&!Object.is(value,-0),'deadline');return value;}
function clearSlot(slot){if(slot){slot.open=false;slot.projection=null;slot.receiver=null;slot.fn=null;slot.token=null;slot.recordFailure=null;}}
// This closure captures ONLY the revocable slot, not freshCommit's input frame.
function actionFor(slot,lateRefusal){return function(){
 if(!slot.open)return lateRefusal();
 if(arguments.length!==0||slot.calls!==0){const e=invalid('journey-dispatch');slot.recordFailure(e);throw e;}
 slot.calls++;
 const recordFailure=slot.recordFailure;
 try{const value=Reflect.apply(slot.fn,slot.receiver,[slot.token,slot.projection]);need(value===undefined,'operator-return');}
 catch(e){recordFailure(e);throw e;}
};}

 need(arguments.length===1);
 const a=record(config,['page','mainFrame','session','token','frameId','blankLoaderId','caseUrl','until','clock','guard','owner','journey','journeyCall']);
 for(const k of ['page','mainFrame','session','token','owner','journey'])capability(a[k]);
 identity(a.frameId);identity(a.blankLoaderId);
 need(typeof a.caseUrl==='string'&&a.caseUrl.isWellFormed()&&a.caseUrl.length<=2048&&!a.caseUrl.includes('#'));
 let policy=inspectPageUrl(a.caseUrl);need(policy.supported&&policy.url===a.caseUrl&&a.caseUrl.startsWith('https://'));policy=null;
 time(a.until);callable(a.clock);callable(a.guard);callable(a.journeyCall);
 const s={...a,ownerCommit:method(a.owner,'commit'),ownerPage:method(a.owner,'pageNavigation'),ownerReading:method(a.owner,'assertReading'),
  journeyCommit:method(a.journey,'commit'),journeyComplete:method(a.journey,'assertComplete')};
 config=null;for(const k of Object.keys(a))a[k]=null;
 let state='active',failed=false,error,busy=false,events=0,publicCount=0,freshCount=0,sameDocumentCount=0,freshLoader=null,slot=null;
 let charge=1024+2*(s.caseUrl.length+s.frameId.length+s.blankLoaderId.length)+320;
 function latch(e){if(state!=='released'&&!failed){failed=true;error=e;}}
 function check(){
  if(state==='released')throw invalid('released');if(failed)throw error;
  need(time(Reflect.apply(s.clock,undefined,[]))<s.until,'deadline');
  need(Reflect.apply(s.guard,undefined,[])===undefined,'guard-return');
  if(state==='released')throw invalid('released');if(failed)throw error;
  need(time(Reflect.apply(s.clock,undefined,[]))<s.until,'deadline');
 }
 function run(count,action){
  if(state==='released')throw invalid('released');if(failed)throw error;
  try{need(!busy,'reentry');busy=true;check();if(count){need(state==='active','lifecycle');need(events<1024,'event-capacity');events++;}
   action();check();
  }catch(e){if(state!=='released'&&!failed){failed=true;error=e;}throw failed?error:e;}finally{busy=false;}
 }
 function bound(session,page,token){need(session===s.session&&page===s.page&&token===s.token,'binding');}
 function zeroDebt(){return publicCount===freshCount+sameDocumentCount;}
 function lateRefusal(){if(state==='released')throw invalid('released');if(!failed){failed=true;error=invalid('journey-dispatch');}throw error;}
 function readable(){
  need(state==='active'||state==='sealed','lifecycle');need(freshCount===1&&zeroDebt(),'unmatched');
  need(Reflect.apply(s.journeyComplete,s.journey,[s.token])===true,'operator-return');check();
  need(Reflect.apply(s.ownerReading,s.owner,[])===undefined,'operator-return');
  check();
 }
 const api={
  freshCommit(session,page,token,projection){run(true,()=>{
   need(arguments.length===4);bound(session,page,token);
   const raw=record(projection,['frame']);
   const p=freeze({frame:dataCopy(raw.frame,{values:4096,units:32768,depth:12,array:64,properties:24,string:32768})});
   let first,firstPresent=false,ownerCaught=false,wrapperFailed=false,wrapperError;
   try{need(Reflect.apply(s.ownerCommit,s.owner,[p])===undefined,'operator-return');}catch(e){first=e;firstPresent=true;ownerCaught=true;latch(e);}
   if(state==='released')throw firstPresent?first:invalid('released');
   // Invocation-local failure survives release ONLY to propagate this ongoing
   // synchronous call. Escaped actions lose its callback when their slot clears.
   const actionFailure={present:false,error:undefined};
   slot={open:true,calls:0,projection:p,receiver:s.journey,fn:s.journeyCommit,token:s.token,
    recordFailure(e){if(!actionFailure.present){actionFailure.present=true;actionFailure.error=e;}latch(e);}};
   const current=slot;
   try{
    try{need(Reflect.apply(s.journeyCall,undefined,['commit',p,actionFor(current,lateRefusal),ownerCaught])===undefined,'operator-return');}
    catch(e){wrapperFailed=true;wrapperError=e;}
    if(!firstPresent&&actionFailure.present){first=actionFailure.error;firstPresent=true;}
    if(!firstPresent&&wrapperFailed){first=wrapperError;firstPresent=true;}
    if(!firstPresent&&state==='released'){first=invalid('released');firstPresent=true;}
    if(!firstPresent&&current.calls!==1){first=invalid('journey-dispatch');firstPresent=true;}
   }finally{clearSlot(current);if(slot===current)slot=null;actionFailure.error=undefined;actionFailure.present=false;}
   if(firstPresent)throw first;
   check();need(freshCount===0,'fresh-repeated');const f=recordFields(p.frame);
   need(f.id===s.frameId&&f.url===s.caseUrl&&!Object.hasOwn(f,'parentId'),'fresh-binding');identity(f.loaderId);need(f.loaderId!==s.blankLoaderId,'blank-loader');
   freshLoader=f.loaderId;freshCount=1;
  });},
  sameDocument(session,page,token,payload){run(true,()=>{
   need(arguments.length===4);bound(session,page,token);const d=record(payload,['frameId','url','navigationType']);
   need(freshCount===1&&freshLoader!==null,'before-fresh');need(d.frameId===s.frameId&&d.url===s.caseUrl,'same-document-binding');
   need(['fragment','historyApi','other'].includes(d.navigationType),'navigation-type');sameDocumentCount++;
  });},
  pageNavigation(page,token,frame,url){run(true,()=>{
   need(arguments.length===4);need(page===s.page&&token===s.token&&frame===s.mainFrame,'binding');
   if(url==='about:blank'){need(Reflect.apply(s.ownerPage,s.owner,[frame,s.mainFrame,url])===undefined,'operator-return');check();return;}
   need(typeof url==='string'&&url===s.caseUrl,'public-url');
   if(publicCount===0){need(Reflect.apply(s.ownerPage,s.owner,[frame,s.mainFrame,url])===undefined,'operator-return');check();}
   publicCount++;
  });},
  status(){need(arguments.length===0);return Object.freeze({state,failed,publicCount,freshCount,sameDocumentCount,matched:state!=='released'&&freshCount===1&&zeroDebt()});},
  assertBalanced(){run(false,()=>{need(arguments.length===0);readable();});},
  seal(){run(false,()=>{need(arguments.length===0&&state==='active','lifecycle');readable();state='sealed';});},
  retire(){run(false,()=>{need(arguments.length===0&&(state==='active'||state==='sealed'),'lifecycle');need(zeroDebt(),'unmatched');state='retiring';});},
  retainedBytes(){need(arguments.length===0);return charge;},
  release(){need(arguments.length===0);state='released';clearSlot(slot);slot=null;for(const k of Object.keys(s))s[k]=null;
   failed=false;error=undefined;freshLoader=null;events=publicCount=freshCount=sameDocumentCount=0;charge=1024;}
 };
 // No constructor-time operator call; the original absolute deadline is checked
 // on every work method. Accounting readers never recurse through guard.
 return Object.freeze(api);
function recordFields(value){
 need(value!==null&&typeof value==='object'&&!types.isProxy(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)));
 const out=Object.create(null);for(const k of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,k);need(typeof k==='string'&&d?.enumerable&&Object.hasOwn(d,'value'));out[k]=d.value;}return out;
}
}

export class NativeCaptureError extends Error{constructor(code='contract'){super('Specificity capture refused');this.code=code;}}
export class ArticleUnavailable extends Error{constructor(reason){super('Specificity article unavailable');this.reason=reason;}}
const UNAVAILABLE=new Set(['origin-policy-unavailable','origin-policy-refused','article-unavailable','document-policy-unavailable','document-policy-refused','reader-unavailable','foreground-changed','restricted-rendering']);
function bad(code='contract'){throw new NativeCaptureError(code);}
function terminalNavigationRefusal(observe,state,site,predicate,relation,detached){
 const error=new NativeCaptureError('terminal-frame-navigation');
 try{observe('terminal-observation',state,error,site,predicate,relation,detached);}catch{}
 throw error;
}
function rec(value,keys){const d=fields(value);if(Reflect.ownKeys(d).length!==keys.length||keys.some(k=>!Object.hasOwn(d,k)))bad();return d;}
const list=dense,field=(v,k)=>{const d=fields(v);if(!Object.hasOwn(d,k))bad('descriptor');return d[k];};
const id=identity;
function number(v,max){if(!Number.isSafeInteger(v)||Object.is(v,-0)||v<0||v>max)bad();return v;}
// Maintained Playwright Frame capabilities, not arbitrary getters or CDP IDs.
function frameMethod(frame,key){
 if(!frame||typeof frame!=='object'||types.isProxy(frame))bad('pw-child-contract');
 let at=frame;for(let depth=0;at!==null&&depth<32;depth++){
  if(types.isProxy(at))bad('pw-child-contract');const d=Object.getOwnPropertyDescriptor(at,key);
  if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function'||types.isProxy(d.value))bad('pw-child-contract');return Reflect.apply(d.value,frame,[]);}
  at=Object.getPrototypeOf(at);
 }bad('pw-child-contract');
}
export function createPlaywrightChildFrameGraph(page,main){
 const members=new Map();let retired=false;
 return Object.freeze({observe(frame){
  if(retired||frame===main)bad('pw-child-lifecycle');const chain=[],seen=new Set();let at=frame;
  while(at!==main){
   if(chain.length>=16||seen.has(at))bad('pw-child-capacity');seen.add(at);
   if(frameMethod(at,'page')!==page)bad('pw-child-page');const parent=frameMethod(at,'parentFrame');
   if(!parent||typeof parent!=='object'||types.isProxy(parent))bad('pw-child-parent');
   const previous=members.get(at);if(previous&&(previous.parent!==parent||previous.status!=='live'))bad('pw-child-parent');
   chain.push({frame:at,parent});at=parent;
  }
  if(frameMethod(main,'page')!==page)bad('pw-child-page');
  const added=chain.filter(row=>!members.has(row.frame));if(members.size+added.length>16)bad('pw-child-capacity');
  for(const row of added)members.set(row.frame,{parent:row.parent,status:'live'});
 },observeTerminal(frame){
  if(retired||frame===main)bad('pw-child-lifecycle');const chain=[],seen=new Set();let at=frame;
  if(frameMethod(main,'page')!==page||frameMethod(main,'isDetached')!==false)bad('pw-child-page');
  while(at!==main){
   if(chain.length>=16||seen.has(at))bad('pw-child-capacity');seen.add(at);
   if(frameMethod(at,'page')!==page||frameMethod(at,'isDetached')!==false)bad('pw-child-page');
   const parent=frameMethod(at,'parentFrame');if(!parent||typeof parent!=='object'||types.isProxy(parent))bad('pw-child-parent');
   const previous=members.get(at);if(previous&&(previous.parent!==parent||previous.status!=='live'))bad('pw-child-parent');
   chain.push({frame:at,parent});at=parent;
  }
  const added=chain.filter(row=>!members.has(row.frame));if(members.size+added.length>16)bad('pw-child-capacity');
  for(const row of added)members.set(row.frame,{parent:row.parent,status:'live'});
 },retire(){if(retired)bad('pw-child-lifecycle');retired=true;for(const row of members.values())row.status='parent-destroyed';},
 retainedBytes(){return 64+members.size*160;}});
}
function hash(v){if(typeof v!=='string'||!/^[a-f0-9]{64}$/u.test(v))bad();return v;}
function frozen(v){if(v&&typeof v==='object'){for(const x of Object.values(v))frozen(x);Object.freeze(v);}return v;}
const FAILURE_STAGES=new Set(['admission','origin-policy','launch','anchor-setup','target-discovery','extension-load','worker-lookup','native-window','native-begin','article-policy','article-create','article-setup','article-navigation','article-read','article-retirement','native-end','final-census','final-checks','cleanup-context','cleanup-browser','late-callback','unclassified']);
const FAILURE_RPCS=new Set(['context.launch','browser.root-session','Browser.setDownloadBehavior','context.anchor-session','Target.getTargetInfo','Target.setDiscoverTargets','Target.getTargets','Extensions.loadUnpacked','context.worker-wait','worker.window','worker.begin','worker.end','worker.skip','worker.locate','worker.snapshot','worker.observe','context.new-page','page.websocket-route','websocket.close','context.article-session','owner.await-authentication','page.bring-front','Page.enable','Page.getFrameTree','Page.setLifecycleEventsEnabled','Network.enable','Network.setBypassServiceWorker','Network.setCacheDisabled','Fetch.enable','Page.navigate','worker.tab-query','page.close','owner.await-retired','context.close','browser.close','Fetch.continueRequest','Fetch.continueResponse','Fetch.failRequest','unclassified']);
const FAILURE_CODES=Object.freeze({
 startup:new Set(['infrastructure-contract','infrastructure-identity','infrastructure-lifecycle','infrastructure-census','anchor-contract']),
 capture:new Set(['contract','diagnostic-contract','aborted','admitted-main-id-reuse','anchor','anchor-event','anchor-mutation','article-deadline','article-page','async-row','batch-deadline','batch-health','batch-release','begin-contract','blocked-failure-contradiction','browser-handle','current-frame-mismatch','descriptor','dns-batch-identity','dom-policy-contract','duplicate-fetch','duplicate-main-response','duplicate-or-late-finished','encoded-resource-capacity','end-contract','event-capacity','extension-id','extension-worker','final-native-document-changed','incomplete-batch','initial-frame','journey-registry','late-article','late-article-callback','late-frame-attach','late-lifecycle','late-main-response','late-navigation','late-unknown-fetch','late-websocket','main-frame-detached','main-response-identity','main-response-type','native-document-id','native-document-mismatch','native-fields-contract','native-locator-identity','native-policy-identity','native-unavailable-contract','native-window','normal-close-proof','operation-registry','origin-policy-capacity','previous-batch-not-released','registry-capacity','request-headers','resource-transport-loss','response-contract','response-error-unknown','retired-payload-live','row-evidence-capacity','row-order','skip-contract','summary-capacity','unexpected-disconnect','unexpected-page','unexpected-page-event','unexpected-worker','unknown-loading-finished','unknown-native-refusal','unknown-network-data','unknown-network-failure','unknown-network-response','unsettled-operations','unsettled-retirement','client-operation','coordinator-capacity','coordinator-failed','rpc-deadline','coordinator-deadline']),
 'article-owner':new Set(['contract','descriptor','identity','event-capacity','article-deadline','registry-capacity','target-capacity','target-contract','unexpected-page','article-identity','article-unmatched','article-slot','article-navigation','article-revival','unexpected-target','target-duplicate','article-lifecycle','navigation-repeated','navigation-journey','late-read','article-retirement','census-duplicate','census-revival','census-omission','released']),
 'public-journey':new Set(JOURNEY_CODES),
 network:new Set(['contract','dns-contract','non-public-dns-or-peer','peer-pin-mismatch','unavailable-dns-host','main-response-identity','main-tls-unverified','main-response-unavailable','request-contract','request-capacity','redirect-refused','navigation-loader']),
 'control-fatal':new Set(['invalid-contract','absolute-job-deadline','aborted','unhandled-transport','source-integrity','response-integrity','request-capacity','callback-failed','protocol-failed','setup-deadline','navigation-transport-failure','unsettled-callbacks','diagnostic-capacity']),
 'control-unavailable':new Set(['origin-policy-timeout','origin-policy-http-refused','origin-policy-malformed','origin-policy-budget','origin-robots-denied','origin-tdm-reserved','origin-transport-unavailable','origin-representation-unavailable']),
 unclassified:new Set(['unclassified'])
});
for(const code of ['child-frame-contract','child-frame-capacity','child-frame-duplicate','child-frame-parent','child-frame-navigation','child-frame-detach','child-retirement'])FAILURE_CODES.capture.add(code);
for(const code of ['retirement-denial-state','retirement-denial-frame','retirement-denial-stage','retirement-denial-type','retirement-denial-identity','retirement-denial-metadata','retirement-denial-capacity','retirement-denial-contradiction','retirement-denial-original','retirement-denial-unsettled'])FAILURE_CODES.capture.add(code);
for(const code of ['terminal-lifecycle-state','terminal-lifecycle-frame','terminal-lifecycle-descriptor','terminal-lifecycle-name','terminal-lifecycle-timestamp','terminal-lifecycle-loader'])FAILURE_CODES.capture.add(code);
for(const code of ['terminal-frame-state','terminal-frame-contract','terminal-frame-parent','terminal-frame-navigation'])FAILURE_CODES.capture.add(code);
for(const code of ['pw-child-contract','pw-child-lifecycle','pw-child-capacity','pw-child-page','pw-child-parent'])FAILURE_CODES.capture.add(code);
for(const code of ['local-image-contract','local-image-sequence','local-image-capacity','local-image-unsettled'])FAILURE_CODES.capture.add(code);
const UNKNOWN_NETWORK_EVENTS=Object.freeze({'unknown-network-response':'response','unknown-network-data':'data','unknown-loading-finished':'finished','unknown-network-failure':'failed'});
const NETWORK_SCHEMES=new Set(['http','https','data','blob','file','about','extension','other','unavailable']);
const NETWORK_TYPES=new Set(['Document','Stylesheet','Image','Media','Font','Script','TextTrack','XHR','Fetch','Prefetch','EventSource','WebSocket','Manifest','SignedExchange','Ping','CSPViolationReport','Preflight','FedCM','Other','other','unavailable']);
function projectNetworkWitness(value){
 const d=rec(value,['schema','event','scheme','resourceType','frameRelation','loaderRelation']);
 if(d.schema!=='native-network-observation-witness/v1'||!['response','data','finished','failed'].includes(d.event)||!NETWORK_SCHEMES.has(d.scheme)||!NETWORK_TYPES.has(d.resourceType)||
  !['main','child','other','absent','unavailable'].includes(d.frameRelation)||!['main','blank','other','absent','unavailable'].includes(d.loaderRelation))bad('diagnostic-contract');
 return {schema:d.schema,event:d.event,scheme:d.scheme,resourceType:d.resourceType,frameRelation:d.frameRelation,loaderRelation:d.loaderRelation};
}
let diagnosticLatched=false,diagnosticValue=null,contextBridge=null;
const JOURNEY_SITES=new Set(['reply','commit','response','lifecycle']),JOURNEY_PHASES=new Set(['prepared','dispatched','resolved','retired']);
const LIFECYCLE_NAMES=new Set([...REPLAY_CATEGORIES,'non-lifecycle','unavailable']);
const INFRASTRUCTURE_SITES=new Set(['created','changed','census','worker']);
const INFRASTRUCTURE_ROLES=new Set(['anchor','ui-root','ui-aim','worker','other']);
const INFRASTRUCTURE_PREDICATES=new Set(['terminal','type','url','context','attached','parent','opener','duplicate-created','duplicate-role','duplicate-id','target-capacity','worker-present']);
function projectInfrastructureWitness(value){
 const d=rec(value,['schema','site','role','predicate']);
 if(d.schema!=='native-infrastructure-identity-witness/v1'||!INFRASTRUCTURE_SITES.has(d.site)||!INFRASTRUCTURE_ROLES.has(d.role)||!INFRASTRUCTURE_PREDICATES.has(d.predicate))bad('diagnostic-contract');
 return {schema:d.schema,site:d.site,role:d.role,predicate:d.predicate};
}
function projectJourneyWitness(value){
 const d=rec(value,['site','phase','blankLoaderMatch','lifecycleName','seenFactsMask']);
 if(!JOURNEY_SITES.has(d.site)||!JOURNEY_PHASES.has(d.phase)||!LIFECYCLE_NAMES.has(d.lifecycleName)||
  d.blankLoaderMatch!==null&&typeof d.blankLoaderMatch!=='boolean'||!Number.isSafeInteger(d.seenFactsMask)||Object.is(d.seenFactsMask,-0)||d.seenFactsMask<0||d.seenFactsMask>127)bad('diagnostic-contract');
 return {site:d.site,phase:d.phase,blankLoaderMatch:d.blankLoaderMatch,lifecycleName:d.lifecycleName,seenFactsMask:d.seenFactsMask};
}
/** Synchronous diagnostic-only scope. Never retain caller input across await. */
export function createJourneyFailureWitness(blankLoaderId){
 let current=null,latched=false,candidateError,candidate=null;
 return Object.freeze({
  call(site,input,action,suppressWitness=false){const previous=current;current={site,input,suppressWitness};try{return action();}finally{current=previous;}},
  capture(error,report){
   if(latched)return;latched=true;candidateError=error;
   try{
    if(!current||current.suppressWitness||!JOURNEY_SITES.has(current.site)||typeof blankLoaderId!=='string'||!/^[A-Za-z0-9._:-]{1,160}$/u.test(blankLoaderId))return;
    const r=fields(report),seen=rec(r.seen,FACTS);if(!JOURNEY_PHASES.has(r.phase)||FACTS.some(k=>typeof seen[k]!=='boolean'))return;
    let input=fields(current.input);if(current.site==='commit')input=fields(input.frame);
    const loader=Object.hasOwn(input,'loaderId')?input.loaderId:null;
    let blankLoaderMatch=null;if(loader!==null){if(typeof loader!=='string'||!/^[A-Za-z0-9._:-]{1,160}$/u.test(loader))return;blankLoaderMatch=loader===blankLoaderId;}
    let lifecycleName='non-lifecycle';if(current.site==='lifecycle'){
     const name=input.name;lifecycleName=typeof name==='string'&&/^[A-Za-z0-9._:-]{1,64}$/u.test(name)?(LIFECYCLE_NAMES.has(name)&&name!=='non-lifecycle'&&name!=='unavailable'?name:'other-bounded'):'unavailable';
    }
    candidate=frozen(projectJourneyWitness({site:current.site,phase:r.phase,blankLoaderMatch,lifecycleName,seenFactsMask:FACTS.reduce((mask,k,i)=>mask+(seen[k]?2**i:0),0)}));
   }catch{candidate=null;}
  },candidateFor(error){return latched&&error===candidateError?candidate:null;}
 });
}
function errorProjection(error){
 const unknown=()=>({family:'unclassified',code:'unclassified'});
 try{
  if(types.isProxy(error)||!types.isNativeError(error))return unknown();
  const proto=Object.getPrototypeOf(error),family=proto===NativeCaptureError.prototype?'capture':proto===ArticleOwnerError.prototype?'article-owner':proto===PublicJourneyError.prototype?'public-journey':proto===NativeNetworkError.prototype?'network':proto===ControlFatal.prototype?'control-fatal':proto===ControlUnavailable.prototype?'control-unavailable':proto===StartupFatal.prototype?'startup':null;
  if(family===null)return unknown();const d=Object.getOwnPropertyDescriptor(error,'code');
  if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!FAILURE_CODES[family].has(d.value))return unknown();
  return {family,code:d.value};
 }catch{return unknown();}
}
function projectOperationWitness(value){
 const d=rec(value,['lane','rpc','kind','cause']),c=rec(d.cause,['family','code']);
 if(!['ordinary','denial','cleanup'].includes(d.lane)||typeof d.rpc!=='string'||!FAILURE_RPCS.has(d.rpc)||!['sync-throw','promise-rejection'].includes(d.kind)||
  typeof c.family!=='string'||!Object.hasOwn(FAILURE_CODES,c.family)||typeof c.code!=='string'||!FAILURE_CODES[c.family].has(c.code))bad('diagnostic-contract');
 return {lane:d.lane,rpc:d.rpc,kind:d.kind,cause:{family:c.family,code:c.code}};
}
function projectOwnerNavigationWitness(value){
 const w=rec(value,['schema','predicate','state','urlRelation']);
 if(w.schema!=='native-article-navigation-witness/v1')bad('diagnostic-contract');
 const relation=['blank','other','unavailable'].includes(w.urlRelation),active=['navigating','reading'].includes(w.state);
 if(!((['pending','frame'].includes(w.predicate)&&w.state==='unexamined'&&w.urlRelation==='unexamined')||
  (w.predicate==='target'&&w.state==='absent'&&relation)||
  (w.predicate==='state'&&['provisional','authenticated','retiring','terminal'].includes(w.state)&&w.urlRelation==='unexamined')||
  (w.predicate==='repeat'&&active&&w.urlRelation==='unexamined')||(w.predicate==='url'&&active&&relation)))bad('diagnostic-contract');
 return {schema:w.schema,predicate:w.predicate,state:w.state,urlRelation:w.urlRelation};
}
/** Pure validation only; hashes/classes do not confer source/native authority. */
function projectNavigationAccountingWitness(value){
 if(value!==null&&typeof value==='object'&&!types.isProxy(value)){
  const descriptor=Object.getOwnPropertyDescriptor(value,'schema');
  if(descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.value==='native-terminal-navigation-observation/v1'){
   const d=rec(value,['schema','site','predicate','frameRelation','mainDetached']);
   if(!((d.site==='cdp-frame'&&d.predicate==='main'&&d.frameRelation==='main'&&d.mainDetached===null)||
    (d.site==='cdp-frame'&&d.predicate==='parent-absent'&&d.frameRelation==='nonmain'&&d.mainDetached===null)||
    (d.site==='cdp-frame'&&d.predicate==='parent-mismatch'&&d.frameRelation==='child'&&d.mainDetached===null)||
    (d.site==='cdp-within'&&d.predicate==='main'&&d.frameRelation==='main'&&d.mainDetached===null)||
    (d.site==='playwright'&&d.predicate==='main-detached'&&d.frameRelation==='unexamined'&&d.mainDetached===true)||
    (d.site==='playwright'&&d.predicate==='main'&&d.frameRelation==='main'&&d.mainDetached===false)))bad('diagnostic-contract');
   return {schema:d.schema,site:d.site,predicate:d.predicate,frameRelation:d.frameRelation,mainDetached:d.mainDetached};
  }
 }
 const d=rec(value,['schema','site','state','balance','urlRelation']);
 if(d.schema!=='native-main-navigation-observation/v1'||!['fresh','within','public','read','seal','retire'].includes(d.site)||
  !['active','sealed','retiring','released','unavailable'].includes(d.state)||!['matched','unmatched','unavailable'].includes(d.balance))bad('diagnostic-contract');
 const urlSite=d.site==='public'||d.site==='within';
 if(urlSite?!['exact','different','blank','unavailable'].includes(d.urlRelation):d.urlRelation!=='not-examined')bad('diagnostic-contract');
 if((d.state==='unavailable')!==(d.balance==='unavailable')||d.state==='released'&&d.balance!=='unmatched')bad('diagnostic-contract');
 return {schema:d.schema,site:d.site,state:d.state,balance:d.balance,urlRelation:d.urlRelation};
}
export function projectSpecificityCaptureDiagnostic(value){
 try{
  const d=rec(value,['schema','stage','rpc','primary','cleanup','journeyWitness','timerWitness','infrastructureWitness','networkWitness','operationWitness','ownerNavigationWitness','navigationAccountingWitness']);
  if(d.schema!=='native-specificity-capture-failure/v1'||typeof d.stage!=='string'||!FAILURE_STAGES.has(d.stage)||d.rpc!==null&&(typeof d.rpc!=='string'||!FAILURE_RPCS.has(d.rpc)))bad('diagnostic-contract');
  const projection=v=>{const p=rec(v,['family','code']);if(typeof p.family!=='string'||!Object.hasOwn(FAILURE_CODES,p.family)||typeof p.code!=='string'||!FAILURE_CODES[p.family].has(p.code))bad('diagnostic-contract');return {family:p.family,code:p.code};};
  let timerWitness=null;if(d.timerWitness!==null){const t=rec(d.timerWitness,['lane','rpc']);if(!['ordinary','denial','cleanup'].includes(t.lane)||typeof t.rpc!=='string'||!FAILURE_RPCS.has(t.rpc))bad('diagnostic-contract');timerWitness={lane:t.lane,rpc:t.rpc};}
  const copy={schema:d.schema,stage:d.stage,rpc:d.rpc,primary:projection(d.primary),cleanup:d.cleanup===null?null:projection(d.cleanup),journeyWitness:d.journeyWitness===null?null:projectJourneyWitness(d.journeyWitness),timerWitness,infrastructureWitness:d.infrastructureWitness===null?null:projectInfrastructureWitness(d.infrastructureWitness),networkWitness:d.networkWitness===null?null:projectNetworkWitness(d.networkWitness),operationWitness:d.operationWitness===null?null:projectOperationWitness(d.operationWitness),ownerNavigationWitness:d.ownerNavigationWitness===null?null:projectOwnerNavigationWitness(d.ownerNavigationWitness)};
  if(copy.journeyWitness!==null&&copy.primary.family!=='public-journey')bad('diagnostic-contract');
  if(copy.timerWitness!==null&&(copy.primary.family!=='capture'||!['article-deadline','rpc-deadline'].includes(copy.primary.code)))bad('diagnostic-contract');
  if(copy.infrastructureWitness!==null&&(copy.primary.family!=='startup'||copy.primary.code!=='infrastructure-identity'))bad('diagnostic-contract');
  if(copy.networkWitness!==null&&(copy.primary.family!=='capture'||UNKNOWN_NETWORK_EVENTS[copy.primary.code]!==copy.networkWitness.event))bad('diagnostic-contract');
  if(copy.operationWitness!==null&&(copy.primary.family!=='capture'||copy.primary.code!=='client-operation'))bad('diagnostic-contract');
  if(copy.ownerNavigationWitness!==null&&(copy.primary.family!=='article-owner'||copy.primary.code!=='article-navigation'))bad('diagnostic-contract');
  copy.navigationAccountingWitness=d.navigationAccountingWitness===null?null:projectNavigationAccountingWitness(d.navigationAccountingWitness);
  if(copy.navigationAccountingWitness!==null&&((copy.navigationAccountingWitness.schema==='native-terminal-navigation-observation/v1'?
   copy.primary.family!=='capture'||copy.primary.code!=='terminal-frame-navigation':copy.primary.family!=='unclassified'||copy.primary.code!=='unclassified')||
   ['journeyWitness','timerWitness','infrastructureWitness','networkWitness','operationWitness','ownerNavigationWitness'].some(k=>copy[k]!==null)))bad('diagnostic-contract');
  if(Buffer.byteLength(JSON.stringify(copy))>700)bad('diagnostic-contract');return frozen(copy);
 }catch{bad('diagnostic-contract');}
}
export function captureFailureDiagnostic(){return diagnosticLatched?diagnosticValue:null;}
export function emitCaptureFailureDiagnostic(phase,stage,emitter){return contextBridge===null?false:contextBridge('emit',phase,stage,emitter);}
function recordFailure(error,stage,rpc,cleanup=false,journeyWitness=null,timerWitness=null,infrastructureWitness=null,networkWitness=null,operationWitness=null,ownerNavigationWitness=null,navigationAccountingWitness=null){
 // Private authored path: no allocation before the sticky funding decision.
 try{
  if(!diagnosticLatched){
   diagnosticLatched=true;
   if(contextBridge===null||!contextBridge('fund'))return;
   const projected=Object.freeze(errorProjection(error));
   diagnosticValue={schema:'native-specificity-capture-failure/v1',stage:FAILURE_STAGES.has(stage)?stage:'unclassified',rpc:FAILURE_RPCS.has(rpc)?rpc:null,primary:projected,cleanup:null,journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:null};
   if(!cleanup&&journeyWitness!==null)try{diagnosticValue=projectSpecificityCaptureDiagnostic({...diagnosticValue,journeyWitness});}catch{}
   if(timerWitness!==null)try{diagnosticValue=projectSpecificityCaptureDiagnostic({...diagnosticValue,timerWitness});}catch{}
   if(!cleanup&&infrastructureWitness!==null)try{diagnosticValue=projectSpecificityCaptureDiagnostic({...diagnosticValue,infrastructureWitness});}catch{}
   if(!cleanup&&networkWitness!==null)try{diagnosticValue=projectSpecificityCaptureDiagnostic({...diagnosticValue,networkWitness});}catch{}
   if(operationWitness!==null)try{diagnosticValue=projectSpecificityCaptureDiagnostic({...diagnosticValue,operationWitness});}catch{}
   if(!cleanup&&ownerNavigationWitness!==null)try{diagnosticValue=projectSpecificityCaptureDiagnostic({...diagnosticValue,ownerNavigationWitness});}catch{}
   // This exact frozen view was authored and selected by the private slot. Do
   // not copy it through the public adversarial projector.
   if(!cleanup&&navigationAccountingWitness!==null&&diagnosticValue.journeyWitness===null&&diagnosticValue.timerWitness===null&&
    diagnosticValue.infrastructureWitness===null&&diagnosticValue.networkWitness===null&&diagnosticValue.operationWitness===null&&diagnosticValue.ownerNavigationWitness===null&&
    (navigationAccountingWitness.schema==='native-terminal-navigation-observation/v1'?projected.family==='capture'&&projected.code==='terminal-frame-navigation':
     navigationAccountingWitness.schema==='native-main-navigation-observation/v1'&&projected.family==='unclassified'&&projected.code==='unclassified')){
    diagnosticValue.navigationAccountingWitness=navigationAccountingWitness;
   }
   Object.freeze(diagnosticValue);
  }else if(cleanup&&diagnosticValue!==null&&diagnosticValue.cleanup===null){
   diagnosticValue=Object.freeze({...diagnosticValue,cleanup:Object.freeze(errorProjection(error))});
  }
 }catch{/* Same original; sticky null/owned graph, no fallback or retry. */}
}
const SUMMARY_KEYS=Object.freeze(['caseId','ordinal','events','encodedBytes','teardownLifecycle','teardownAborts','journey']);
const REPORT_KEYS=Object.freeze(['schema','phase','code','events','seen','arrivals','ignored','initialReplay','blankLoaderMatch','frameAgreement','loaderAgreement','freshLoaders','quarantinedLifecyclePresent','quarantinedLifecycleAgreement']);
const REPORT_PHASES=Object.freeze(['prepared','dispatched','resolved','retired']);
const REPORT_TRI_KEYS=Object.freeze(['blankLoaderMatch','frameAgreement','loaderAgreement','freshLoaders','quarantinedLifecyclePresent','quarantinedLifecycleAgreement']);
const PACKED_SUMMARY_BYTES=308;
// Actual private summary grammar only: ASCII identity/closed enum strings,
// booleans/null and finite unsigned integer counters. No generic caller JSON.
function summaryScalarBytes(value){
 if(value===null)return 4;if(value===true)return 4;if(value===false)return 5;
 if(typeof value==='string')return value.length+2;
 let n=1;while(value>=10){value=Math.floor(value/10);n++;}return n;
}
function summaryJsonBytes(row){
 let bytes=2;
 for(let i=0;i<SUMMARY_KEYS.length;i++){
  const key=SUMMARY_KEYS[i];bytes+=key.length+3+(i?1:0);
  if(key!=='journey'||row.journey===null){bytes+=summaryScalarBytes(row[key]);continue;}
  bytes+=2;
  for(let j=0;j<REPORT_KEYS.length;j++){
   const name=REPORT_KEYS[j];bytes+=name.length+3+(j?1:0);
   if(name==='seen'||name==='arrivals'||name==='ignored'||name==='initialReplay'){
    const keys=name==='seen'||name==='arrivals'?FACTS:name==='ignored'?IGNORED_LIFECYCLE:REPLAY_CATEGORIES;
    bytes+=2;for(let k=0;k<keys.length;k++)bytes+=keys[k].length+3+(k?1:0)+summaryScalarBytes(row.journey[name][keys[k]]);
   }else bytes+=summaryScalarBytes(row.journey[name]);
  }
 }return bytes;
}
function orderedRecord(value,keys){const r=rec(value,keys);if(Reflect.ownKeys(r).some((k,i)=>k!==keys[i]))bad();return r;}
function summaryCase(caseId,ordinal){id(caseId);number(ordinal,4);if(ordinal<1)bad();}
function tri(value){if(value===null)return 0;if(value===false)return 1;if(value===true)return 2;bad();}
function untri(value){if(value===0)return null;if(value===1)return false;if(value===2)return true;bad();}
/** Pure metadata codec. Caller-created valid data is not capture authority. */
export function packNativeArticleSummary(value,caseId,ordinal){
 summaryCase(caseId,ordinal);const r=orderedRecord(value,SUMMARY_KEYS);if(r.caseId!==caseId||r.ordinal!==ordinal)bad();
 const cells=new Uint32Array(45);cells[0]=ordinal;
 for(const [i,k]of ['events','encodedBytes','teardownLifecycle','teardownAborts'].entries())cells[i+1]=number(r[k],k==='encodedBytes'?33554432:1024);
 if(r.journey===null)return cells;
 const j=orderedRecord(r.journey,REPORT_KEYS);if(j.schema!=='public-article-journey-report/v1'||!REPORT_PHASES.includes(j.phase)||j.code!==null&&!JOURNEY_CODES.includes(j.code))bad();
 const seen=orderedRecord(j.seen,FACTS),arrivals=orderedRecord(j.arrivals,FACTS),ignored=orderedRecord(j.ignored,IGNORED_LIFECYCLE),replay=orderedRecord(j.initialReplay,REPLAY_CATEGORIES);
 // Validate EVERY source scalar before writing any of its potentially coercing
 // typed cells. The private allocation cannot escape if validation fails.
 number(j.events,4096);for(const k of FACTS){if(typeof seen[k]!=='boolean')bad();number(arrivals[k],4096);}for(const k of IGNORED_LIFECYCLE)number(ignored[k],4096);for(const k of REPLAY_CATEGORIES)number(replay[k],4096);
 for(const k of REPORT_TRI_KEYS)tri(j[k]);if(typeof j.quarantinedLifecyclePresent!=='boolean')bad();
 cells[5]=1+REPORT_PHASES.indexOf(j.phase);cells[6]=j.code===null?0:1+JOURNEY_CODES.indexOf(j.code);cells[7]=j.events;
 for(let i=0;i<FACTS.length;i++){if(seen[FACTS[i]])cells[8]|=1<<i;cells[9+i]=arrivals[FACTS[i]];}
 for(let i=0;i<IGNORED_LIFECYCLE.length;i++)cells[16+i]=ignored[IGNORED_LIFECYCLE[i]];
 for(let i=0;i<REPLAY_CATEGORIES.length;i++)cells[26+i]=replay[REPLAY_CATEGORIES[i]];
 for(let i=0;i<REPORT_TRI_KEYS.length;i++)cells[39+i]=tri(j[REPORT_TRI_KEYS[i]]);return cells;
}
function summaryPacket(value){
 if(types.isProxy(value)||!types.isUint32Array(value)||Object.getPrototypeOf(value)!==Uint32Array.prototype)bad();
 const keys=Reflect.ownKeys(value);if(keys.length!==45||keys.some((k,i)=>k!==String(i)))bad();
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();}
 const buffer=value.buffer;if(Object.getPrototypeOf(buffer)!==ArrayBuffer.prototype||Reflect.ownKeys(buffer).length!==0||buffer.resizable!==false||buffer.byteLength!==180||value.byteOffset!==0||value.byteLength!==180||value.length!==45)bad();
 return value;
}
export function unpackNativeArticleSummary(value,caseId,ordinal){
 summaryCase(caseId,ordinal);const p=summaryPacket(value);if(p[0]!==ordinal)bad();
 number(p[1],1024);number(p[2],33554432);number(p[3],1024);number(p[4],1024);number(p[5],4);
 let journey=null;
 if(p[5]===0){for(let i=6;i<45;i++)if(p[i]!==0)bad();}
 else{
  number(p[6],JOURNEY_CODES.length);number(p[7],4096);number(p[8],127);for(let i=9;i<39;i++)number(p[i],4096);for(let i=39;i<45;i++)untri(p[i]);if(p[43]!==1&&p[43]!==2)bad();
  journey={schema:'public-article-journey-report/v1',phase:REPORT_PHASES[p[5]-1],code:p[6]===0?null:JOURNEY_CODES[p[6]-1],events:p[7],
   seen:Object.fromEntries(FACTS.map((k,i)=>[k,Boolean(p[8]&(1<<i))])),arrivals:Object.fromEntries(FACTS.map((k,i)=>[k,p[9+i]])),
   ignored:Object.fromEntries(IGNORED_LIFECYCLE.map((k,i)=>[k,p[16+i]])),initialReplay:Object.fromEntries(REPLAY_CATEGORIES.map((k,i)=>[k,p[26+i]])),
   blankLoaderMatch:untri(p[39]),frameAgreement:untri(p[40]),loaderAgreement:untri(p[41]),freshLoaders:untri(p[42]),quarantinedLifecyclePresent:untri(p[43]),quarantinedLifecycleAgreement:untri(p[44])};
 }
 return {caseId,ordinal,events:p[1],encodedBytes:p[2],teardownLifecycle:p[3],teardownAborts:p[4],journey};
}
// Bounded fixed-schema derivation runs once, retaining ONLY its integer result.
// Live preflight then adds the sealed ASCII ID length, without first allocating
// an uncharged maximum report in the active article's budget.
const SUMMARY_STATIC_BOUND=(()=>{
 const longest=values=>values.reduce((a,b)=>a.length>=b.length?a:b),dictionary=keys=>Object.fromEntries(keys.map(k=>[k,4096]));
 const row={caseId:'',ordinal:4,events:1024,encodedBytes:33554432,teardownLifecycle:1024,teardownAborts:1024,journey:{schema:'public-article-journey-report/v1',phase:longest(REPORT_PHASES),code:longest(JOURNEY_CODES),events:4096,
  seen:Object.fromEntries(FACTS.map(k=>[k,false])),arrivals:dictionary(FACTS),ignored:dictionary(IGNORED_LIFECYCLE),initialReplay:dictionary(REPLAY_CATEGORIES),blankLoaderMatch:false,frameAgreement:false,loaderAgreement:false,freshLoaders:false,quarantinedLifecyclePresent:false,quarantinedLifecycleAgreement:false}};
 return 128+Buffer.byteLength(JSON.stringify(row));
})();
/** Mathematical maximum of the unchanged fixed JSON shape for this sealed ID. */
export function nativeArticleSummaryBound(caseId,ordinal){summaryCase(caseId,ordinal);return SUMMARY_STATIC_BOUND+caseId.length;}
const DOM_KEYS=['tabId','frameId','documentId','sourceUrlHash','documentUrlHash','domPolicyHash','canonicalUrlHash','canonicalEqualsExpected','headComplete'];
const JOURNEY_KEYS=['schema','finalUrlHash','status','frameId','loaderId','fetchRequestId','fetchResponseId','networkRequestId','requestUrlExact',
 'ordinaryTlsSecure','selectedPublicPinMatched','pinHash','headerPolicyHash','navigationLoaderVerified','domPolicyRequiredSeparately','nativeDocumentIdDirectlyCorrelated'];
const RIGHTS_KEYS=['schema','caseId','ordinal','studyId','studyRevision','observationNonce','eventEpoch','documentId','tabId','windowId','sourceUrlHash','documentUrlHash',
 'originPolicyHash','mainResponseJourney','documentBefore','documentAfter','sameNativeDocument','httpNativeIdDirectlyCorrelated'];
/** Metadata cross-binding only. Actual same-document policy/native admission
 * must precede construction; this function does not recreate browser authority. */
export function validateNativeRightsEvidence(batch,input){
 input=dataCopy(input,{values:4096,units:32768,depth:12,array:64,properties:32,string:4096});
 const a=rec(input,['caseId','ordinal','nativeWitness','rightsEvidence']),w=a.nativeWitness,r=rec(a.rightsEvidence,RIGHTS_KEYS);
 const expected=batch.cases[a.ordinal-1];if(!expected||a.caseId!==expected.id||r.caseId!==a.caseId||r.ordinal!==a.ordinal)bad();
 if(field(w,'schema')!=='chrome-scripting-native-reader/v1'||field(w,'caseId')!==a.caseId||field(w,'ordinal')!==a.ordinal||
  r.schema!=='native-reader-bracketed-rights/v1'||r.sameNativeDocument!==true||r.httpNativeIdDirectlyCorrelated!==false)bad();
 for(const k of ['studyId','studyRevision','observationNonce','documentId']){id(r[k],k==='documentId'?128:160);if(field(w,k)!==r[k])bad();}
 for(const k of ['eventEpoch','tabId','windowId']){number(r[k],Number.MAX_SAFE_INTEGER);if(field(w,k)!==r[k])bad();}
 if(field(w,'frameId')!==0||field(w,'sourceUrl')!==expected.url||field(w,'documentUrl')!==expected.url)bad();
 if(r.sourceUrlHash!==sha(expected.url)||r.documentUrlHash!==sha(expected.url))bad();hash(r.originPolicyHash);
 const journey=rec(r.mainResponseJourney,JOURNEY_KEYS);
 if(journey.schema!=='native-main-response-journey/v1'||journey.finalUrlHash!==r.documentUrlHash||!Number.isInteger(journey.status)||journey.status<200||journey.status>=300)bad();
 for(const k of ['frameId','loaderId','fetchRequestId','fetchResponseId','networkRequestId'])id(journey[k]);
 for(const k of ['pinHash','headerPolicyHash'])hash(journey[k]);
 for(const k of ['requestUrlExact','ordinaryTlsSecure','selectedPublicPinMatched','navigationLoaderVerified','domPolicyRequiredSeparately'])if(journey[k]!==true)bad();
 if(journey.nativeDocumentIdDirectlyCorrelated!==false)bad();
 for(const key of ['documentBefore','documentAfter']){
  const d=rec(r[key],DOM_KEYS);if(d.tabId!==r.tabId||d.frameId!==0||Object.is(d.frameId,-0)||d.documentId!==r.documentId||
   d.sourceUrlHash!==r.sourceUrlHash||d.documentUrlHash!==r.documentUrlHash||d.headComplete!==true)bad();
  hash(d.domPolicyHash);if(d.canonicalUrlHash!==null)hash(d.canonicalUrlHash);
  if(typeof d.canonicalEqualsExpected!=='boolean'||d.canonicalEqualsExpected!==(d.canonicalUrlHash===r.documentUrlHash))bad();r[key]=d;
 }
 r.mainResponseJourney=journey;return frozen(r);
}

/** Raw native declarations exist only while this pure projection runs. */
export function projectNativeDomPolicy(input){
 const a=rec(input,['snapshot','tabId','documentId','sourceUrl','documentUrl']),s=rec(a.snapshot,['schema','tabId','frameId','documentId','sourceUrl','documentUrl','document']);
 if(s.schema!=='native-document-policy-snapshot/v1'||s.tabId!==a.tabId||s.frameId!==0||Object.is(s.frameId,-0)||s.documentId!==a.documentId||s.sourceUrl!==a.sourceUrl||s.documentUrl!==a.documentUrl)bad('native-policy-identity');
 const d=rec(s.document,['url','canonicalUrl','robots','tdm','complete']);if(d.url!==a.documentUrl||d.complete!==true)throw new ArticleUnavailable('document-policy-unavailable');
 if(typeof d.canonicalUrl!=='string'||d.canonicalUrl.length>2048)bad();
 const robots=list(d.robots,32),tdm=list(d.tdm,32);let policy;
 try{policy=headerPolicy({xRobotsTag:robots,tdmReservation:null});}
 catch(e){if(!types.isProxy(e)&&types.isNativeError(e)&&Object.getPrototypeOf(e)===ControlUnavailable.prototype)throw new ArticleUnavailable('document-policy-refused');throw e;}
 for(const value of tdm){if(typeof value!=='string')bad('dom-policy-contract');if(value!=='0')throw new ArticleUnavailable('document-policy-refused');}
 let canonical=null;if(d.canonicalUrl){try{canonical=new URL(d.canonicalUrl,a.documentUrl).href;}catch{throw new ArticleUnavailable('document-policy-unavailable');}}
 return frozen({tabId:a.tabId,frameId:0,documentId:a.documentId,sourceUrlHash:sha(a.sourceUrl),documentUrlHash:sha(a.documentUrl),
  domPolicyHash:digest({headerPolicy:policy,tdmReservations:tdm}),canonicalUrlHash:canonical===null?null:sha(canonical),
  canonicalEqualsExpected:canonical===a.documentUrl,headComplete:true});
}

// Per-article/setup private action registry. Wrapper deadlines reject callers,
// never release actual physical capacity. Queued Fetch resolutions are serial.
export function createNativeCaptureCoordinator({guard,clock,schedule=setTimeout,cancel=clearTimeout,until=()=>Infinity,onFailure}){
 let normalOrdinal=0,cleanupOrdinal=0,failure=null,timerError,timerWitness=null,operationError,operationWitness=null;const entries=new Map(),physical=new Set();
 function fail(code,timer=null,operation=null){const first=failure===null;failure??=new NativeCaptureError(code);
  if(first&&timer!==null){timerError=failure;timerWitness=frozen(timer);}if(first&&operation!==null){operationError=failure;operationWitness=operation;}core.fail('external-fatal');onFailure(failure);}
 const core=createRouteCoordinator((task,lane)=>{
  const key=lane+':'+task.ordinal,entry=entries.get(key);if(!entry){fail('operation-registry');throw failure;}entries.delete(key);entry.arm();
  let value;try{value=entry.action();}catch(cause){entry.arm('sync-throw',cause);throw failure;}
  const native=Promise.resolve(value).then(result=>{entry.value=result;entry.settled=true;},cause=>{entry.arm('promise-rejection',cause);throw failure;});
  physical.add(native);native.then(()=>physical.delete(native),()=>physical.delete(native));return native;
 });
 function submit(lane,action,maximum,label){
  if(lane!=='cleanup'){guard();if(failure)throw failure;}
  const ordinal=lane==='cleanup'?cleanupOrdinal++:normalOrdinal++;if(ordinal>=(lane==='cleanup'?2:4096)){fail('coordinator-capacity');throw failure;}
  let timer,rejectTimeout;const timeout=new Promise((_,no)=>{rejectTimeout=no;});
  const rpc=typeof label==='string'&&FAILURE_RPCS.has(label)?label:'unclassified';
  const entry={action,value:undefined,settled:false,arm(kind,cause){
   if(kind!==undefined){let observed=null;if(failure===null)try{observed=frozen({lane,rpc,kind,cause:errorProjection(cause)});}catch{/* Same generated failure, null best-effort witness. */}fail('client-operation',null,observed);return;}
   const remaining=lane==='cleanup'?maximum:Math.min(maximum,until()-clock());
   timer=schedule(()=>{fail(remaining<maximum?'article-deadline':'rpc-deadline',{lane,rpc});rejectTimeout(failure);},Math.max(1,remaining));}};
  const key=lane+':'+ordinal;entries.set(key,entry);const task={ordinal,method:lane==='cleanup'?'cleanup-rpc':lane==='denial'?'route-abort':'coordinator-rpc'};
  const caller=lane==='cleanup'?core.cleanup(task):lane==='denial'?core.deny(task):core.rpc(task);
  const completion=caller.then(()=>{if(!entry.settled)bad('operation-registry');return entry.value;},()=>{if(!failure)fail('coordinator-failed');throw failure;});
  return Promise.race([completion,timeout]).finally(()=>{if(timer!==undefined)cancel(timer);entries.delete(key);});
 }
 return Object.freeze({rpc:(action,label)=>submit('ordinary',action,10000,label),resolveFetch:(action,label)=>submit('denial',action,10000,label),cleanup:(action,label)=>submit('cleanup',action,2000,label),
  timerWitnessFor:error=>error===timerError?timerWitness:null,
  operationWitnessFor:error=>error===operationError?operationWitness:null,
  fail:code=>fail(code),snapshot:()=>frozen({...core.snapshot(),physical:physical.size,registered:entries.size}),assertDrained(){const s=core.snapshot();if(physical.size||entries.size||s.normalActive||s.cleanupActive||s.denialActive||s.backlog)bad('unsettled-operations');},
  dispose(){core.dispose();entries.clear();}});
}

const RETIREMENT_RESOURCE_TYPES=Object.freeze(['Stylesheet','Image','Media','Font','Script','TextTrack','XHR','Fetch','Prefetch','EventSource','WebSocket','Manifest','SignedExchange','Ping','CSPViolationReport','Preflight','FedCM','Other']);
function requestHeaders(value){
 if(!value||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)bad('request-headers');
 const keys=Reflect.ownKeys(value);if(keys.length>64)bad('request-headers');let bytes=0,authorizationPresent=false;
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);if(typeof k!=='string'||k.length>256||!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||d.value.length>8192||/[\r\n]/u.test(k+d.value)||(bytes+=Buffer.byteLength(k+d.value))>16384)bad('request-headers');
  if(/^(authorization|proxy-authorization)$/iu.test(k))authorizationPresent=true;}return authorizationPresent;
}
function retirementHeaders(value){
 if(!value||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)bad('retirement-denial-metadata');
 const keys=Reflect.ownKeys(value);if(keys.length>64)bad('retirement-denial-metadata');let bytes=0;
 for(const name of keys){const d=Object.getOwnPropertyDescriptor(value,name);
  if(typeof name!=='string'||!name.length||name.length>256||!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name)||!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='string'||
     d.value.length>8192||!d.value.isWellFormed()||/[\u0000-\u0008\u000a-\u001f\u007f]/u.test(d.value)||(bytes+=Buffer.byteLength(name+d.value))>16384)bad('retirement-denial-metadata');
 }
}
// Syntax only, before transport dispatch. This grants no response/rights admission.
function responseHeaders(value){let bytes=0;return frozen(list(value,64).map(h=>{
 const r=rec(h,['name','value']);if(typeof r.name!=='string'||!r.name.length||r.name.length>256||!r.name.isWellFormed()||
  !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(r.name)||typeof r.value!=='string'||r.value.length>8192||!r.value.isWellFormed()||
  /[\u0000-\u0008\u000a-\u001f\u007f]/u.test(r.value)||(bytes+=Buffer.byteLength(r.name+r.value))>16384)bad('response-contract');
 return {name:r.name,value:r.value};
}));}
/** Real original promises are retained by coordinator AND callback jobs. A
 * swallowed drain wrapper is never supplied to the journey observer. */
export function createPublicArticleCallbacks({state:s,coordinator,owner,guard,clock,countEvent,onFatal,initialBlankLoaderId=null,initialMainFrame=null,noteRpc=()=>{},journeyCall=(_site,_input,action)=>action(),mainNavigation,navigationCall=(_site,helper,method,args)=>Reflect.apply(helper[method],helper,args)}){
 if(mainNavigation!==undefined){if(mainNavigation===null||typeof mainNavigation!=='object'||types.isProxy(mainNavigation)||(s.mainNavigation!==undefined&&s.mainNavigation!==mainNavigation))bad('late-article-callback');s.mainNavigation=mainNavigation;}
 else if(s.mainNavigation!==undefined&&(s.mainNavigation===null||typeof s.mainNavigation!=='object'||types.isProxy(s.mainNavigation)))bad('late-article-callback');
 mainNavigation=undefined;
 const jobs=new Set(),fetchIds=new Set(),responseFetchIds=new Set(),networkIds=new Set(),blockedIds=new Set();let finished=false;
 // Response-only local observations, never Fetch/main admission capabilities.
 const localImages=new Map();let privateProvisional=null,networkError,networkObservation=null,networkLatched=false,localReleased=false;
 s.childFrames??=new Map();
 s.retirementDenials??=new Map();
 const uncertainOriginals=new Map(),terminalChildren=new Set();
 let initialBlankLoader=initialBlankLoaderId===null?null:id(initialBlankLoaderId),readsRevoked=false,terminalSession=s.session,terminalToken=s.token,terminalPage=s.page,terminalMain=initialMainFrame;
 initialBlankLoaderId=null;initialMainFrame=null;
 function denialBytes(){let bytes=128;for(const [networkId,row]of s.retirementDenials)bytes+=192+networkId.length+row.fetchId.length+row.frameId.length+8;return bytes;}
 let callbackFailure=null,callbackFailureLatched=false;
 const fatal=e=>{if(!callbackFailureLatched){callbackFailureLatched=true;callbackFailure=e;}try{onFatal(callbackFailure);}catch{}s.journey?.abort();};
 function check(){guard();if(callbackFailureLatched)throw callbackFailure;if(s.retired)bad('late-article-callback');}
 function localRetainedBytes(){let bytes=0;for(const [key,row]of localImages)bytes+=256+2*(key.length+row.frameId.length+row.loaderId.length);return bytes;}
 function chargeResource(amount){number(amount,33554432);number(s.encodedBytes,33554432);if(amount>33554432-s.encodedBytes)bad('encoded-resource-capacity');s.encodedBytes+=amount;}
 function privateLoaderAgrees(){return privateProvisional!==null&&(s.verifiedLoader===undefined||s.verifiedLoader===null||s.verifiedLoader===privateProvisional.loaderId);}
 function unknownNetwork(code,d){
  const error=new NativeCaptureError(code);
  if(!networkLatched){networkLatched=true;networkError=error;
   try{
    let r=null;if(Object.hasOwn(d,'response'))r=fields(d.response);
    let scheme='unavailable';const url=r?.url;
    if(typeof url==='string'){
     scheme='other';for(const [prefix,kind]of [['http:','http'],['https:','https'],['data:','data'],['blob:','blob'],['file:','file'],['about:','about'],['chrome-extension:','extension']])if(url.startsWith(prefix)){scheme=kind;break;}
    }
    const type=Object.hasOwn(d,'type')?d.type:null,resourceType=typeof type==='string'?(NETWORK_TYPES.has(type)&&!['other','unavailable'].includes(type)?type:'other'):'unavailable';
    let frameRelation='absent';if(Object.hasOwn(d,'frameId')){id(d.frameId);frameRelation=d.frameId===s.frameId?'main':'other';
     if(frameRelation==='other'){let at=d.frameId,seen=new Set();for(let depth=0;depth<16;depth++){if(seen.has(at))break;seen.add(at);const child=s.childFrames.get(at);if(!child||child.status!=='live')break;if(child.parentId===s.frameId&&!s.mainDetached){frameRelation='child';break;}at=child.parentId;}}
    }
    let loaderRelation='absent';if(Object.hasOwn(d,'loaderId')){id(d.loaderId);loaderRelation=privateProvisional!==null&&d.loaderId===privateProvisional.loaderId?'main':d.loaderId===initialBlankLoader?'blank':'other';}
    networkObservation=frozen(projectNetworkWitness({schema:'native-network-observation-witness/v1',event:UNKNOWN_NETWORK_EVENTS[code],scheme,resourceType,frameRelation,loaderRelation}));
   }catch{networkObservation=null;}
  }
  // The fixed private reservation is already in retainedTerminalBytes. A failed
  // aggregate guard cannot replace the exact freshly generated primary error.
  try{guard();}catch{networkObservation=null;}
  throw error;
 }
 function localResponse(d){
  if(localImages.has(d.requestId))bad('local-image-sequence');
  let r,initialEncoded=0;
  try{
   r=fields(d.response);
   if(s.retiring||s.closeIssued||s.retired||s.mainDetached||readsRevoked||s.session!==terminalSession||s.token!==terminalToken||s.page!==terminalPage||
    !terminalSession||!terminalToken||!terminalPage||!privateLoaderAgrees()||d.type!=='Image'||d.frameId!==s.frameId||d.frameId!==privateProvisional.frameId||d.loaderId!==privateProvisional.loaderId||
    typeof r.url!=='string'||r.url.length<5||r.url.length>33554432||!r.url.startsWith('data:')||r.status!==200||typeof r.mimeType!=='string'||r.mimeType.length>96||!/^image\/[A-Za-z0-9.+-]{1,90}$/u.test(r.mimeType)||
    d.hasExtraInfo!==false||typeof d.timestamp!=='number'||!Number.isFinite(d.timestamp)||d.timestamp<0||Object.is(d.timestamp,-0)||
    ['redirectResponse','redirectedRequestId'].some(k=>Object.hasOwn(d,k)||Object.hasOwn(r,k))||
    ['fromDiskCache','fromServiceWorker','fromPrefetchCache','fromEarlyHints'].some(k=>Object.hasOwn(r,k)&&r[k]!==false)||
    ['serviceWorkerResponseSource','serviceWorkerRouterInfo','securityDetails'].some(k=>Object.hasOwn(r,k))||
    Object.hasOwn(r,'cacheStorageCacheName')&&r.cacheStorageCacheName!==''||
    Object.hasOwn(r,'remoteIPAddress')&&r.remoteIPAddress!==''||Object.hasOwn(r,'remotePort')&&(r.remotePort!==0||Object.is(r.remotePort,-0)))return false;
   id(d.frameId);id(d.loaderId);
   if(Object.hasOwn(r,'encodedDataLength'))initialEncoded=number(r.encodedDataLength,33554432);
  }catch{return false;}
  if(localImages.size>=32)bad('local-image-capacity');
  if(d.requestId===s.mainNetworkId||fetchIds.has(d.requestId)||responseFetchIds.has(d.requestId)||networkIds.has(d.requestId)||blockedIds.has(d.requestId)||s.retirementDenials.has(d.requestId)||[...s.retirementDenials.values()].some(row=>row.fetchId===d.requestId))bad('local-image-sequence');
  // No payload/header/body copy: the primitive URL length is charged once.
  chargeResource(r.url.length+initialEncoded);
  localImages.set(d.requestId,{frameId:d.frameId,loaderId:d.loaderId,phase:'response',encoded:initialEncoded});
  guard();return true;
 }
 function localEvent(d,kind){
  const row=localImages.get(d.requestId);if(!row)return false;
  if(s.session!==terminalSession||s.token!==terminalToken||s.page!==terminalPage||s.frameId!==row.frameId)bad('local-image-contract');
  if(s.retiring||s.closeIssued||readsRevoked)terminal(()=>{},'local-image-contract');else if(s.mainDetached)bad('local-image-contract');
  if(row.phase!=='response'||!privateLoaderAgrees())bad('local-image-sequence');
  if(typeof d.timestamp!=='number'||!Number.isFinite(d.timestamp)||d.timestamp<0||Object.is(d.timestamp,-0))bad('local-image-contract');
  if(kind==='data'){
   if(Object.hasOwn(d,'data'))bad('local-image-contract');
   number(d.dataLength,33554432);number(d.encodedDataLength,33554432);
   const sum=d.dataLength+d.encodedDataLength;if(!Number.isSafeInteger(sum))bad('encoded-resource-capacity');chargeResource(sum);
   row.encoded+=d.encodedDataLength;if(!Number.isSafeInteger(row.encoded))bad('encoded-resource-capacity');
  }else if(kind==='finished'){
   number(d.encodedDataLength,33554432);if(d.encodedDataLength<row.encoded)bad('local-image-contract');chargeResource(d.encodedDataLength-row.encoded);row.phase='finished';
  }else{
   if(d.type!=='Image')bad('local-image-contract');if(!s.retiring||!s.closeIssued||d.canceled!==true||d.errorText!=='net::ERR_ABORTED')bad('resource-transport-loss');row.phase='aborted';
  }
  guard();return true;
 }
 function track(p){const handled=Promise.resolve(p).then(()=>undefined,e=>{fatal(e);}).finally(()=>jobs.delete(handled));jobs.add(handled);return handled;}
 function callback(action){return value=>{try{check();countEvent();action(value);}catch(e){fatal(e);}};}
 function terminal(action,code='terminal-frame-state'){
  if(!readsRevoked||!s.retiring||!s.closeIssued||s.retired||s.session!==terminalSession||s.token!==terminalToken||s.page!==terminalPage)bad(code);
  return action();
 }
 function rootedChild(frameId){
  if(s.mainDetached||frameId===s.frameId)bad('terminal-frame-parent');let at=frameId;
  for(let depth=0;depth<16;depth++){
   const row=s.childFrames.get(at);if(!row||row.status!=='live'||s.refusal!=='restricted-rendering'&&!terminalChildren.has(row))bad('terminal-frame-parent');
   if(row.parentId===s.frameId)return row;at=row.parentId;
  }bad('terminal-frame-parent');
 }
 function terminalAttach(value){
  let d;try{d=rec(dataCopy(value,{values:4096,units:32768,depth:12,array:64,properties:24,string:32768}),Object.hasOwn(value,'stack')?['frameId','parentFrameId','stack']:['frameId','parentFrameId']);}catch{bad('terminal-frame-contract');}
  id(d.frameId);id(d.parentFrameId);if(s.mainDetached||d.frameId===s.frameId||d.frameId===d.parentFrameId)bad('terminal-frame-parent');
  if(s.childFrames.has(d.frameId))bad('child-frame-duplicate');if(s.childFrames.size>=16)bad('child-frame-capacity');
  if(d.parentFrameId!==s.frameId)rootedChild(d.parentFrameId);
  const row={parentId:d.parentFrameId,status:'live'};s.childFrames.set(d.frameId,row);terminalChildren.add(row);guard();
 }
 function send(method,params){let original;return coordinator.resolveFetch(()=>{noteRpc(method);original=s.session.send(method,params);return original;},method);}
 function rejectRequest(p){
  // No admitted main response can be hidden as an intentional aborted resource.
  if(p.networkId===s.mainNetworkId)bad('admitted-main-id-reuse');if(localImages.has(p.networkId))bad('local-image-sequence');
  if(p.networkId)blockedIds.add(p.networkId);track(send('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'}));
 }
 function dispatchRetirement(row){
  track(coordinator.resolveFetch(()=>{noteRpc('Fetch.failRequest');const original=s.session.send('Fetch.failRequest',{requestId:row.fetchId,errorReason:'BlockedByClient'});
   function uncertain(){uncertainOriginals.set(row,original);fatal(new NativeCaptureError('retirement-denial-original'));
    // Unverifiable native work stays owned. A private never-settling native
    // sentinel holds its physical slot; it is NOT original settlement evidence.
    // Only outer failed owned-Job cleanup can escape this uncertainty.
    return new nativePromiseConstructor(()=>{});}
   if(types.isProxy(original)||!types.isPromise(original)||Object.getPrototypeOf(original)!==nativePromisePrototype)return uncertain();
   const descriptors=Object.getOwnPropertyDescriptors(original);
   if(Object.hasOwn(descriptors,'constructor')||Object.hasOwn(descriptors,'then')||Reflect.ownKeys(descriptors).some(k=>!Object.hasOwn(descriptors[k],'value')))return uncertain();
   // Observe the ORIGINAL with the captured intrinsic before the coordinator sees
   // it. Neither an event nor the coordinator's own completion marks this bit.
   try{nativePromiseThen.call(original,()=>{row.fulfilled=true;},()=>{});}catch{return uncertain();}return original;
  },'Fetch.failRequest'));
 }
 function denyRetirement(p,r,raw){
  if(!s.retiring||!s.closeIssued||s.retired)bad('retirement-denial-state');
  if(Object.hasOwn(p,'responseStatusCode')||Object.hasOwn(p,'responseErrorReason')||Object.hasOwn(p,'redirectedRequestId'))bad('retirement-denial-stage');
  if(p.resourceType==='Document'){if(p.frameId===s.frameId)bad('retirement-denial-type');}
  else if(!RETIREMENT_RESOURCE_TYPES.includes(p.resourceType))bad('retirement-denial-type');
  if(s.mainDetached)bad('retirement-denial-frame');
  if(p.frameId!==s.frameId)terminal(()=>rootedChild(p.frameId),'retirement-denial-state');
  if(p.networkId===s.mainNetworkId||networkIds.has(p.networkId)||blockedIds.has(p.networkId)||localImages.has(p.networkId)||s.retirementDenials.has(p.networkId))bad('retirement-denial-identity');
  for(const object of [raw,p.request])for(const key of Reflect.ownKeys(object)){
   if(key.length>128||!Object.getOwnPropertyDescriptor(object,key).enumerable)bad('retirement-denial-metadata');
  }
  if(typeof r.url!=='string'||r.url.length>2048||!r.url.isWellFormed()||/[\u0000-\u0020\u007f-\u009f]/u.test(r.url)||
     typeof r.method!=='string'||!r.method.length||r.method.length>256||!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(r.method))bad('retirement-denial-metadata');
  let u;try{u=new URL(r.url);}catch{bad('retirement-denial-metadata');}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password)bad('retirement-denial-metadata');retirementHeaders(r.headers);
  const row={fetchId:p.requestId,frameId:p.frameId,fulfilled:false},bytes=192+p.networkId.length+row.fetchId.length+row.frameId.length+8;
  if(s.retirementDenials.size>=32||denialBytes()+bytes>32768)bad('retirement-denial-capacity');
  s.retirementDenials.set(p.networkId,row);guard(); // Charge before any native dispatch, including reentrancy.
  dispatchRetirement(row); // The queued action retains IDs/state, never request metadata.
 }
 function continueOriginal(kind,p){
  const method=kind==='requestContinuation'?'Fetch.continueRequest':'Fetch.continueResponse';
  const completion=coordinator.resolveFetch(()=>{
   // invokeContinuation validates token/IDs BEFORE native operation; its
   // returned observer discards ACK values, original is still owner-tracked.
   return s.journey.invokeContinuation(s.token,{kind,fetchId:p.requestId,networkId:p.networkId},()=>{noteRpc(method);return s.session.send(method,{requestId:p.requestId});});
  },method);track(completion);return completion;
 }
 function finishResponse(){if(!s.paused||!s.network||s.responseStarted)return;s.responseStarted=true;
  try{privateProvisional=admitNativeMainResponse(s.gate,{paused:s.paused,network:s.network});s.provisional=privateProvisional;}
  catch(e){if(!types.isProxy(e)&&types.isNativeError(e)&&(Object.getPrototypeOf(e)===ControlUnavailable.prototype||Object.getPrototypeOf(e)===NativeNetworkError.prototype&&e.code==='main-response-unavailable')){
   s.refusal=s.paused.status<200||s.paused.status>=300?'article-unavailable':'document-policy-unavailable';return;}throw e;}
  journeyCall('response',s.provisional,()=>s.journey.response(s.token,s.provisional));
 }
 return Object.freeze({
  paused:callback(value=>{
   const p=fields(value),r=fields(p.request);id(p.requestId);id(p.frameId);id(p.networkId);
   if(localImages.has(p.networkId)||localImages.has(p.requestId))bad('local-image-sequence');
   const seen=Object.hasOwn(p,'responseStatusCode')?responseFetchIds:fetchIds;if(seen.has(p.requestId))bad('duplicate-fetch');seen.add(p.requestId);
   if(Object.hasOwn(p,'responseErrorReason'))bad('response-error-unknown');
   if(s.retiring){if(p.networkId===s.mainNetworkId)bad('admitted-main-id-reuse');if(networkIds.has(p.networkId)||blockedIds.has(p.networkId))return;denyRetirement(p,r,value);return;}
   if(Object.hasOwn(p,'responseStatusCode')){
    if(p.resourceType!=='Document'||p.networkId!==s.mainNetworkId||p.frameId!==s.frameId||r.url!==s.url||s.paused||s.responseStarted||s.responseContinuationSubmitted)bad('main-response-identity');
    if(!Number.isInteger(p.responseStatusCode)||p.responseStatusCode<100||p.responseStatusCode>599)bad('response-contract');
    const headers=responseHeaders(p.responseHeaders);
    s.paused=frozen({requestId:p.requestId,networkId:p.networkId,frameId:p.frameId,url:r.url,status:p.responseStatusCode,headers});
    // An observed independent contradiction wins BEFORE transport dispatch.
    // Otherwise reserve once BEFORE enqueue/action (including reentrant sends).
    finishResponse();s.responseContinuationSubmitted=true;
    s.responseContinuation=continueOriginal('responseContinuation',s.paused);return;
   }
   const decision=admitNativePageRequest(s.gate,{requestId:p.requestId,networkId:p.networkId,frameId:p.frameId,url:r.url,method:r.method,resourceType:p.resourceType,authorizationPresent:requestHeaders(r.headers)});
   if(decision.action==='abort'){rejectRequest(p);return;}networkIds.add(p.networkId);
   if(decision.mainDocument){s.mainNetworkId=p.networkId;continueOriginal('requestContinuation',p);}
   else track(send('Fetch.continueRequest',{requestId:p.requestId}));
  }),
  response:callback(value=>{const d=fields(value);id(d.requestId);if(s.retirementDenials.has(d.requestId))bad('retirement-denial-contradiction');if(d.requestId!==s.mainNetworkId){if(localImages.has(d.requestId))bad('local-image-sequence');if(!networkIds.has(d.requestId)&&!blockedIds.has(d.requestId)&&!localResponse(d))unknownNetwork('unknown-network-response',d);return;}
   if(d.type!=='Document')bad('main-response-type');
   if(s.retiring)bad('late-main-response');if(s.network)bad('duplicate-main-response');const r=fields(d.response);
   s.network={url:r.url,status:r.status,requestId:d.requestId,frameId:d.frameId,loaderId:d.loaderId,remoteAddress:r.remoteIPAddress,securityState:r.securityState,mimeType:r.mimeType};finishResponse();}),
  frameAttached:callback(value=>{if(s.retiring){terminal(()=>terminalAttach(value));return;}const d=fields(value);id(d.frameId);id(d.parentFrameId);if(d.frameId===s.frameId||d.frameId===d.parentFrameId)bad('child-frame-contract');
   if(s.childFrames.has(d.frameId))bad('child-frame-duplicate');if(s.childFrames.size>=16)bad('child-frame-capacity');
   if(d.parentFrameId!==s.frameId&&s.childFrames.get(d.parentFrameId)?.status!=='live')bad('child-frame-parent');
   s.childFrames.set(d.frameId,{parentId:d.parentFrameId,status:'live'});s.refusal='restricted-rendering';}),
  frameNavigated:callback(value=>{
   let projection;try{const raw=rec(value,['frame','type']);if(raw.type!=='Navigation'||['frame','type'].some(k=>!Object.getOwnPropertyDescriptor(value,k).enumerable))bad('descriptor');
    projection=frozen({frame:dataCopy(raw.frame,{values:4096,units:32768,depth:12,array:64,properties:24,string:32768})});}catch{bad('descriptor');}
   const f=fields(projection.frame);id(f.id);if(s.retiring){terminal(()=>{if(f.id===s.frameId)terminalNavigationRefusal(navigationCall,s,'cdp-frame','main','main',null);if(!Object.hasOwn(f,'parentId'))terminalNavigationRefusal(navigationCall,s,'cdp-frame','parent-absent','nonmain',null);id(f.parentId);id(f.loaderId);rootedChild(f.id);if(s.childFrames.get(f.id).parentId!==f.parentId)terminalNavigationRefusal(navigationCall,s,'cdp-frame','parent-mismatch','child',null);});return;}if(Object.hasOwn(f,'parentId')){id(f.parentId);const child=s.childFrames.get(f.id);if(!child||child.status!=='live'||child.parentId!==f.parentId)bad('child-frame-navigation');s.refusal='restricted-rendering';return;}
   if(s.mainNavigation===0||s.mainNavigation.status().state==='released')bad('late-article-callback');navigationCall('fresh',s.mainNavigation,'freshCommit',[terminalSession,terminalPage,terminalToken,projection]);}),
  withinDocument:callback(value=>{
   const d=rec(value,['frameId','url','navigationType']);
   if(['frameId','url','navigationType'].some(k=>!Object.getOwnPropertyDescriptor(value,k).enumerable))bad('descriptor');
   id(d.frameId);if(d.frameId===s.frameId&&s.mainNavigation===0)bad('late-article-callback');if(typeof d.url!=='string'||!d.url.isWellFormed()||d.url.length>2048||!['fragment','historyApi','other'].includes(d.navigationType))bad('descriptor');
   if(s.retiring){terminal(()=>{if(d.frameId===s.frameId)terminalNavigationRefusal(navigationCall,s,'cdp-within','main','main',null);rootedChild(d.frameId);});return;}
   if(d.frameId!==s.frameId){rootedChild(d.frameId);s.refusal='restricted-rendering';return;}
   if(s.mainNavigation===0||s.mainNavigation.status().state==='released')bad('late-article-callback');navigationCall('within',s.mainNavigation,'sameDocument',[terminalSession,terminalPage,terminalToken,{frameId:d.frameId,url:d.url,navigationType:d.navigationType}],d.url);
  }),
  lifecycle:callback(value=>{if(s.retiring){terminal(()=>{
    const keys=['frameId','loaderId','name','timestamp'];let d;
    try{d=rec(value,keys);if(keys.some(k=>!Object.getOwnPropertyDescriptor(value,k).enumerable))bad();}catch{bad('terminal-lifecycle-descriptor');}
    try{id(d.frameId);}catch{bad('terminal-lifecycle-frame');}try{id(d.loaderId);}catch{bad('terminal-lifecycle-loader');}
    if(typeof d.timestamp!=='number'||!Number.isFinite(d.timestamp)||d.timestamp<0||Object.is(d.timestamp,-0))bad('terminal-lifecycle-timestamp');
    if(d.name!=='DOMContentLoaded'&&!IGNORED_LIFECYCLE.includes(d.name))bad('terminal-lifecycle-name');
    if(d.frameId===s.frameId){if(s.mainDetached)bad('terminal-lifecycle-frame');if(d.loaderId!==initialBlankLoader&&d.loaderId!==s.verifiedLoader)bad('terminal-lifecycle-loader');}
    else try{rootedChild(d.frameId);}catch{bad('terminal-lifecycle-frame');}
    s.teardownLifecycle=(s.teardownLifecycle??0)+1;},'terminal-lifecycle-state');return;}
   const d=fields(value);if(d.frameId!==s.frameId){
    const keys=['frameId','loaderId','name','timestamp'];rec(value,keys);
    if(keys.some(k=>!Object.getOwnPropertyDescriptor(value,k).enumerable))bad('descriptor');
    id(d.frameId);id(d.loaderId);
    if(typeof d.timestamp!=='number'||!Number.isFinite(d.timestamp)||d.timestamp<0||Object.is(d.timestamp,-0)||
       d.name!=='DOMContentLoaded'&&!IGNORED_LIFECYCLE.includes(d.name))bad('descriptor');
    if(s.childFrames.get(d.frameId)?.status!=='live'||s.refusal!=='restricted-rendering')bad('child-frame-contract');
    // Init may precede a child commit. A bounded child loader is not a main
    // loader fact or committed-loader agreement; collection remains refused.
    return;
   }
   journeyCall('lifecycle',value,()=>s.journey.lifecycle(s.token,value));}),
  loadingFinished:callback(value=>{const d=fields(value);id(d.requestId);if(s.retirementDenials.has(d.requestId))bad('retirement-denial-contradiction');if(localEvent(d,'finished'))return;if(!networkIds.has(d.requestId)&&!blockedIds.has(d.requestId))unknownNetwork('unknown-loading-finished',d);
   if(d.requestId===s.mainNetworkId){if(s.retiring||finished)bad('duplicate-or-late-finished');finished=true;s.journey.finished(s.token,{requestId:d.requestId,timestamp:d.timestamp,encodedDataLength:d.encodedDataLength});}}),
  loadingFailed:callback(value=>{const d=fields(value);id(d.requestId);
   if(localEvent(d,'failed'))return;
   if(s.retirementDenials.has(d.requestId)){
    if(!s.retiring||!s.closeIssued||s.retired)bad('retirement-denial-state');
    if(d.errorText!=='net::ERR_BLOCKED_BY_CLIENT'&&d.errorText!=='net::ERR_BLOCKED_BY_CLIENT.Inspector'&&!(d.canceled===true&&d.errorText==='net::ERR_ABORTED'))bad('retirement-denial-contradiction');return;
   }
   if(s.retiring&&s.closeIssued&&(networkIds.has(d.requestId)||blockedIds.has(d.requestId))&&d.canceled===true&&d.errorText==='net::ERR_ABORTED'){s.teardownAborts=(s.teardownAborts??0)+1;return;}
   if(blockedIds.has(d.requestId)){if(d.errorText!=='net::ERR_BLOCKED_BY_CLIENT'&&d.errorText!=='net::ERR_BLOCKED_BY_CLIENT.Inspector')bad('blocked-failure-contradiction');return;}
   if(!networkIds.has(d.requestId))unknownNetwork('unknown-network-failure',d);
   // No message regex or TLS/unknown rescue. Known transport loss is fatal in
   // this study even though journey gives its finite terminal network class.
   if(d.requestId===s.mainNetworkId)s.journey.loadingFailed(s.token,{requestId:d.requestId});else bad('resource-transport-loss');}),
  dataReceived:callback(value=>{const d=fields(value);id(d.requestId);if(s.retirementDenials.has(d.requestId))bad('retirement-denial-contradiction');if(localEvent(d,'data'))return;if(!networkIds.has(d.requestId)&&!blockedIds.has(d.requestId))unknownNetwork('unknown-network-data',d);
   number(d.encodedDataLength,Number.MAX_SAFE_INTEGER);s.encodedBytes+=d.encodedDataLength;if(!Number.isSafeInteger(s.encodedBytes)||s.encodedBytes>33554432)bad('encoded-resource-capacity');}),
  frameDetached:callback(value=>{const d=rec(value,['frameId','reason']);id(d.frameId);if(!s.retiring||!s.closeIssued||d.reason!=='remove')bad('child-frame-detach');terminal(()=>{
   if(d.frameId===s.frameId){if(s.mainDetached)bad('main-frame-detached');s.mainDetached=true;return;}const child=s.childFrames.get(d.frameId);
   if(!child||child.status!=='live'||s.refusal!=='restricted-rendering'&&!terminalChildren.has(child))bad('child-frame-detach');child.status='removed';});}),
  terminalPlaywrightNavigation(frame){check();if(++s.articleEvents>1024)bad('event-capacity');terminal(()=>{if(s.mainDetached)terminalNavigationRefusal(navigationCall,s,'playwright','main-detached','unexamined',true);if(frame===terminalMain)terminalNavigationRefusal(navigationCall,s,'playwright','main','main',false);s.pwChildGraph.observeTerminal(frame);guard();});},
  pending:()=>jobs.size,async drain(){await Promise.all([...jobs]);check();},
  revokeForRetirement(){check();if(readsRevoked||s.retiring||s.retired||s.closeIssued||!s.journey||!s.gate||s.session!==terminalSession||s.token!==terminalToken)bad('terminal-lifecycle-state');
   s.journey.retire(terminalToken);closeNativeArticleNetworkGate(s.gate);readsRevoked=true;},
  // 512 reserves the private provisional/error/witness references and Map base;
  // rows additionally charge bounded UTF8 identity/state storage, not URL payload.
  retainedTerminalBytes:()=>{const local=navigationCall===contextBridge?navigationCall('local-accounting',localImages):undefined;return 384+(localReleased?0:512)+(initialBlankLoader?.length??0)+8+terminalChildren.size*64+(local===undefined?localRetainedBytes():local);},
  networkWitnessFor:error=>networkLatched&&error===networkError?networkObservation:null,
  retireChildPayload(){if(localReleased||!s.retired||!s.retiring||!s.closeIssued||!readsRevoked)bad('child-retirement');
   for(const child of s.childFrames.values())if(child.status==='live'){if(s.refusal!=='restricted-rendering'&&!terminalChildren.has(child))bad('child-retirement');child.status='parent-destroyed';}s.pwChildGraph?.retire();},
  assertRetirementDenials(){check();if(!s.retiring||!s.closeIssued||[...s.retirementDenials.values()].some(row=>row.fulfilled!==true))bad('retirement-denial-unsettled');if(localImages.size){terminal(()=>{},'local-image-contract');if(!privateLoaderAgrees()||[...localImages.values()].some(row=>row.phase==='response'))bad('local-image-unsettled');}},
  close(){closeNativeArticleNetworkGate(s.gate);},
  releaseRetired(){if(localReleased||!s.retired||jobs.size)bad('retired-payload-live');fetchIds.clear();responseFetchIds.clear();networkIds.clear();blockedIds.clear();s.retirementDenials.clear();uncertainOriginals.clear();terminalChildren.clear();localImages.clear();privateProvisional=null;networkError=undefined;networkObservation=null;networkLatched=false;localReleased=true;readsRevoked=false;initialBlankLoader=null;terminalSession=null;terminalToken=null;terminalPage=null;terminalMain=null;}
 });
}

export const NATIVE_LAUNCH_ARGUMENTS=Object.freeze(['--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update',
 '--disable-domain-reliability','--disable-sync','--disable-quic','--disable-client-side-phishing-detection','--safebrowsing-disable-auto-update',
 '--disable-default-apps','--autoplay-policy=user-gesture-required','--no-proxy-server','--enable-unsafe-extension-debugging']);

/** Trusted owner authenticates sources/stage/paths, creates one fresh profile
 * and tracks cumulative disk/CPU before this call. No guardian proof is minted.
 * onRow is synchronous transient-RAM admission, NEVER partial quality output. */
const closedBatches=new WeakMap();let activeBatch=null,phaseFailure=null,phaseFailureLatched=false;
/** Root's phase guard MUST call this throughout capture/model/publication. A
 * late callback from an earlier released batch cannot erase a phase fault.
 * Optional summary validates private identity/local normal closure, NOT ACK. */
export function assertCaptureHealthy(summary){
 if(phaseFailureLatched)throw phaseFailure;if(arguments.length>1)bad('batch-health');
 if(arguments.length===1){const state=closedBatches.get(summary);if(!state?.closed)bad('batch-health');state.guard();if(phaseFailureLatched)throw phaseFailure;
  if(!state.released)state.coordinator.assertDrained();}
 return true;
}
/** Trusted root calls ONLY after independently validating the real guardian
 * normal-drain ACK bound to this exact summary. This command is NOT ACK proof. */
export function releaseCapturedBatch(summary){const state=closedBatches.get(summary);if(!state||state.released||activeBatch!==state)bad('batch-release');assertCaptureHealthy(summary);
 contextBridge=null;state.owner.release();state.coordinator.dispose();state.owner=null;state.coordinator=null;state.released=true;activeBatch=null;}
export async function captureNativeSpecificityBatch(input){
 try{return await captureBatch(input);}catch(error){recordFailure(error,'admission',null);throw error;}
}
async function captureBatch({manifest,batch,expectedPanelIdentity,expectedManifestHash,dnsPins,chromium,
 stagedExtensionPath,executablePath,profilePath,studyId,onRow,guard,signal,collectPolicies=collectOriginPolicies,
 clock=()=>performance.now(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 batch=validateSpecificityBatch({manifest,batch,expectedPanelIdentity,expectedManifestHash});
 assertCaptureHealthy();
 const scope=deriveBatchNetworkScope(manifest,batch),dns=describeNativeDnsPins(dnsPins);
 if(dns.batchId!==batch.batchId||dns.scopeHash!==scope.scopeHash)bad('dns-batch-identity');
 id(studyId);if(typeof onRow!=='function'||types.isProxy(onRow)||typeof guard!=='function'||typeof chromium?.launchPersistentContext!=='function'||
  ![profilePath,stagedExtensionPath].every(p=>typeof p==='string'&&/^D:[\\/]/u.test(p))||
  !['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].includes(executablePath.replaceAll('\\','/')))bad();
 if(activeBatch)bad('previous-batch-not-released');const lifecycle={};activeBatch=lifecycle;
 let fatal=null,fatalLatched=false,rememberedError,rememberedLatched=false,infrastructureCandidate=null,networkCandidate=null,operationCandidate=null,ownerNavigationCandidate=null,networkWitnessReader=null,diagnosticStage='admission',diagnosticRpc=null,journeyCandidate=null,context,browser,anchor,rootSession,worker,identity,extensionId=null,loading=false,closing=false,current=null;
 let until=clock()+45000,contextClosed=false,browserClosed=false,contextAttempts=0,browserAttempts=0,events=0,retainedStatePeak=0;
 const started=clock(),wholeUntil=started+360000,metadata=[],articleSummaries=[],journeyStates=[],childRegistries=[],pwChildGraphs=[],deferredWorkers=[],deferredTargets=[],socketJobs=new Set();
 let articlePackets=[],summaryScratch=0;
 const retirementRegistries=[],terminalRegistries=[],terminalPwObservers=new WeakMap();
 const rows=batch.cases.map(c=>({...c,ordinal:c.nativeOrdinal}));
 const navigationSlots=rows.map(c=>1024+2*(c.url.length+160+160)+320),navigationLedgers=[null,null,null,null];
 let phase=0,first,bound,packed=0,view=null,currentContextSymbol,currentContextOrdinal=-1;
 function mark(stage){diagnosticStage=stage;diagnosticRpc=null;}
 function noteRpc(label){diagnosticRpc=FAILURE_RPCS.has(label)?label:'unclassified';}
 function remember(e,cleanup=false){if(!rememberedLatched){rememberedLatched=true;rememberedError=e;
  if(cleanup)navigationCall('selectCleanup',e);else navigationCall('selectPrimary',e,currentContextSymbol);
  if(navigationCall('fund')){
   if(!cleanup)try{const observed=infrastructure.readFailureWitness(e);if(observed!==null)infrastructureCandidate=frozen(projectInfrastructureWitness(observed));}catch{}
   if(!cleanup)try{const observed=networkWitnessReader?.(e);if(observed!==null&&observed!==undefined)networkCandidate=frozen(projectNetworkWitness(observed));}catch{}
   if(!cleanup)try{ownerNavigationCandidate=owner.navigationWitnessFor(e);}catch{}
   try{operationCandidate=coordinator.operationWitnessFor(e);}catch{}
  }}
  recordFailure(e,diagnosticStage,diagnosticRpc,cleanup,journeyCandidate!==null&&journeyCandidate.error===e?journeyCandidate.witness:null,coordinator.timerWitnessFor(e),
   e===rememberedError?infrastructureCandidate:null,e===rememberedError?networkCandidate:null,e===rememberedError?operationCandidate:null,e===rememberedError?ownerNavigationCandidate:null,
   !cleanup&&Object.is(e,rememberedError)?view:null);
 }
 function navigationCall(command,original,binding,a,b,c,d){
  // Captured native forEach calls have EXACT private collection identity before
  // any key/row read. packed is a temporary negative sum only after selection.
  if(arguments.length===3&&binding===bound&&bound!==undefined&&(phase&3)===2&&packed<0){
   if(typeof original!=='string'||command===null||typeof command!=='object'||types.isProxy(command)){packed=NaN;return;}
   if(phase&64)packed-=64+original.length+command.parentId.length+command.status.length;
   else if(phase&128)packed-=192+original.length+command.fetchId.length+command.frameId.length+8;
   else if(phase&256)packed-=256+2*(original.length+command.frameId.length+command.loaderId.length);
   else packed=NaN;
   return;
  }
  if(command==='local-accounting'){
   if((phase&3)!==2||!(phase&16)||(phase&8)||!(packed<0)||bound!==undefined)return undefined;
   // Called ONLY by the actual privately branded callback creation reference.
   bound=original;phase|=256;
   try{ownedCaptureMapForEach.call(bound,navigationCall);return 0;}
   finally{bound=undefined;phase&=~256;}
  }
  if(command==='fund'){
   if(phase&8)return true;if(phase&16)return false;
   phase|=16;
   if((phase&3)!==2)return false;
   try{
    packed=-(diagnosticReservation+owner.retainedBytes());
    for(let i=0;i<4;i++){
     if(navigationLedgers[i]===0){packed-=8;continue;}
     const bytes=navigationLedgers[i]===null?navigationSlots[i]:navigationLedgers[i].retainedBytes();
     if(!Number.isSafeInteger(bytes)||bytes<1024||bytes>navigationSlots[i])return false;
     packed-=bytes;
    }
    for(let i=0;i<journeyStates.length;i++)packed-=journeyStates[i].retainedBytes();
    packed-=summaryScratch;
    if(articlePackets!==null)for(let i=0;i<articlePackets.length;i++)if(articlePackets[i]!==null)packed-=PACKED_SUMMARY_BYTES;
    for(let i=0;i<articleSummaries.length;i++)packed-=128+summaryJsonBytes(articleSummaries[i]);
    for(let i=0;i<childRegistries.length;i++){
     if(childRegistries[i]===null){packed-=8;continue;}packed-=64;bound=childRegistries[i];phase|=64;
     try{ownedCaptureMapForEach.call(bound,navigationCall);}finally{bound=undefined;phase&=~64;}
    }
    for(let i=0;i<retirementRegistries.length;i++){
     if(retirementRegistries[i]===null){packed-=8;continue;}packed-=128;bound=retirementRegistries[i];phase|=128;
     try{ownedCaptureMapForEach.call(bound,navigationCall);}finally{bound=undefined;phase&=~128;}
    }
    for(let i=0;i<terminalRegistries.length;i++)packed-=terminalRegistries[i]();
    for(let i=0;i<pwChildGraphs.length;i++)packed-=pwChildGraphs[i].retainedBytes();
    if((phase&3)!==2||!(packed<0))return false;
    if(!Number.isSafeInteger(packed)||-packed+8192>32768)return false;
    phase=(phase&~16)|8;return true;
   }catch{return false;}finally{bound=undefined;packed=0;phase&=~(64|128|256);}
  }
  if(command==='emit'){
   if(phase&32)return false;phase|=32;
   if(!(phase&8)||diagnosticValue===null||!['prepare','train-cal','test'].includes(original)||
    typeof binding!=='string'||!SPECIFICITY_DRIVER_FAILURE_STAGES.includes(binding)||typeof a!=='function'||types.isProxy(a))return false;
   try{
    const text=JSON.stringify({schema:'native-specificity-execution-failure/v1',phase:original,stage:binding,capture:diagnosticValue});
    const size=Buffer.byteLength(text);if(size+1>900)return false;
    const bytes=Buffer.alloc(size+1);bytes.write(text,'utf8');bytes[size]=10;
    try{observeSafeRejectedRowPromise(a(bytes));}catch{}
    return true;
   }catch{return false;}
  }
  if(command==='terminal-observation'){
   if((phase&3)!==0||diagnosticLatched||rememberedLatched||fatalLatched||phaseFailureLatched||current!==original||!current||
    currentContextOrdinal<0||currentContextOrdinal>3||typeof currentContextSymbol!=='symbol'||current.retired||!current.retiring||!current.closeIssued||
    navigationLedgers[currentContextOrdinal]!==current.mainNavigation)return null;
   if(current.mainNavigation!==0&&(typeof current.mainNavigation!=='object'||current.mainNavigation===null||types.isProxy(current.mainNavigation)||
    navigationLedgers.indexOf(current.mainNavigation)!==currentContextOrdinal||navigationLedgers.lastIndexOf(current.mainNavigation)!==currentContextOrdinal))return null;
   return navigationCall('terminal',binding,currentContextSymbol,a,b,c,d);
  }
  if(command==='retainedBytes'||command==='release'||command==='selectCleanup'||command==='selectPrimary'||command==='navigation'||command==='terminal'){
  if(command==='retainedBytes')return arguments.length===1?RETAINED_BYTES:null;
  if(command==='release'){if(arguments.length!==1)return null;phase=(phase&~3)|3;first=undefined;bound=undefined;packed=0;view=null;return null;}
  if((phase&3)>=2)return null;
  if(command==='selectCleanup'){phase=(phase&~3)|2;first=undefined;bound=undefined;packed=0;view=null;return null;}
  if(command==='selectPrimary'){
   phase=(phase&~3)|2;
   // Unclaimed state cannot match: a real claim always has a Symbol binding.
   if(arguments.length!==3||typeof bound!=='symbol'||typeof binding!=='symbol'||binding!==bound||!Object.is(original,first)||packed===0){first=undefined;bound=undefined;packed=0;view=null;return null;}
   first=undefined;bound=undefined;
   // Only this later selection frame allocates a view. Its incoming original
   // and Symbol are already-owned identity references, not claim context.
   // A nested selection is inert; release revokes the outer result as well.
   try{original=makeView(packed);if((phase&3)===2)view=original;original=undefined;}catch{view=null;}
   packed=0;
   return view;
  }
  if(command!=='navigation'&&command!=='terminal')return null;
  if((phase&3)!==0)return null;
  phase=(phase&~3)|1;first=original;
  if(arguments.length!==7||typeof binding!=='symbol')return null;
  bound=binding;
  if(command==='navigation'){
   a=a==='fresh'?0:a==='within'?1:a==='public'?2:a==='read'?3:a==='seal'?4:a==='retire'?5:-1;
   b=b==='active'?0:b==='sealed'?1:b==='retiring'?2:b==='released'?3:b==='unavailable'?4:-1;
   c=c==='matched'?0:c==='unmatched'?1:c==='unavailable'?2:-1;
   d=d==='not-examined'?0:d==='exact'?1:d==='different'?2:d==='blank'?3:d==='unavailable'?4:-1;
   if(a<0||b<0||c<0||d<0||((a===1||a===2)?d===0:d!==0)||(b===4)!==(c===2)||b===3&&c!==1)return null;
   packed=1+a+6*b+30*c+90*d;
  }else{
   if(a==='cdp-frame'&&b==='main'&&c==='main'&&d===null)packed=1000;
   else if(a==='cdp-frame'&&b==='parent-absent'&&c==='nonmain'&&d===null)packed=1001;
   else if(a==='cdp-frame'&&b==='parent-mismatch'&&c==='child'&&d===null)packed=1002;
   else if(a==='cdp-within'&&b==='main'&&c==='main'&&d===null)packed=1003;
   else if(a==='playwright'&&b==='main-detached'&&c==='unexamined'&&d===true)packed=1004;
   else if(a==='playwright'&&b==='main'&&c==='main'&&d===false)packed=1005;
   else return null;
  }
  // No view construction in the claim invocation. Returning removes its
  // context-frame overlap without assuming named-parameter writes clear the
  // strict-mode unmapped arguments indices or prove garbage collection.
  return null;
  }
  // Original navigation operation dispatch remains this same single callable.
  if(original===null||typeof original!=='object'||types.isProxy(original)||!navigationLedgers.includes(original))bad('late-article-callback');
  try{return Reflect.apply(original[binding],original,a);}catch(error){
   if((phase&3)===0&&!diagnosticLatched&&!rememberedLatched&&!fatalLatched&&!phaseFailureLatched&&current&&
    current.mainNavigation===original&&navigationLedgers[currentContextOrdinal]===original&&
    navigationLedgers.indexOf(original)===currentContextOrdinal&&navigationLedgers.lastIndexOf(original)===currentContextOrdinal){
    try{
     const status=rec(original.status(),['state','failed','publicCount','freshCount','sameDocumentCount','matched']);
     if(!['active','sealed','retiring','released'].includes(status.state)||typeof status.matched!=='boolean'||typeof status.failed!=='boolean')bad('diagnostic-contract');
     let relation='not-examined';if(command==='public'||command==='within')relation=typeof b!=='string'||b.length>2048||!b.isWellFormed()?'unavailable':b==='about:blank'?'blank':b===rows[currentContextOrdinal].url?'exact':'different';
     navigationCall('navigation',error,currentContextSymbol,command,status.state,status.matched?'matched':'unmatched',relation);
    }catch{navigationCall('navigation',error,currentContextSymbol,command,'invalid','invalid','not-examined');}
   }throw error;
  }
 }
 contextBridge=navigationCall;
 const fail=(e,cleanup=false)=>{if(lifecycle.closed)mark('late-callback');remember(e,cleanup);if(!fatalLatched){fatalLatched=true;fatal=rememberedError;}if(!phaseFailureLatched){phaseFailureLatched=true;phaseFailure=fatal;}owner.abortPending(fatal);current?.journey?.abort();};
 function verifyNavigationBinding(){let live=0;for(let i=0;i<4;i++)if(navigationLedgers[i]!==null&&navigationLedgers[i]!==0){live++;if(current===null||current.mainNavigation!==navigationLedgers[i])bad('late-article-callback');}if(live>1)bad('late-article-callback');if(current&&current.mainNavigation!==undefined&&current.mainNavigation!==0&&!navigationLedgers.includes(current.mainNavigation))bad('late-article-callback');}
 function check(){guard();assertCaptureHealthy();if(signal?.aborted)bad('aborted');if(fatalLatched)throw fatal;
  // Already-closed healthy batches retain late-fault guards, not an obsolete
  // article/batch timer during the later540s model phase. Outer phase stays live.
  if(lifecycle.closed)return;
  verifyNavigationBinding();
  checkRetained();if(clock()>=wholeUntil)bad('batch-deadline');if(clock()>=until)bad('article-deadline');}
 function checkRetained(){
  const summaries=summaryScratch+(articlePackets===null?0:articlePackets.reduce((n,p)=>n+(p===null?0:PACKED_SUMMARY_BYTES),0))+articleSummaries.reduce((n,r)=>n+128+Buffer.byteLength(JSON.stringify(r)),0);
  let children=0;for(const map of childRegistries){if(map===null){children+=8;continue;}children+=64;for(const [key,row]of map)children+=64+key.length+row.parentId.length+row.status.length;}
  let denials=0;for(const map of retirementRegistries){if(map===null){denials+=8;continue;}denials+=128;for(const [networkId,row]of map)denials+=192+networkId.length+row.fetchId.length+row.frameId.length+8;}
  const terminal=terminalRegistries.reduce((n,account)=>n+account(),0);
  let navigationPool=0;for(let i=0;i<4;i++){if(navigationLedgers[i]===0){navigationPool+=8;continue;}const bytes=navigationLedgers[i]===null?navigationSlots[i]:navigationLedgers[i].retainedBytes();if(!Number.isSafeInteger(bytes)||bytes<1024||bytes>navigationSlots[i])bad('registry-capacity');navigationPool+=bytes;}
  const retained=navigationPool+diagnosticReservation+(phase&8?8192:0)+owner.snapshot().retainedBytes+journeyStates.reduce((n,j)=>n+j.retainedBytes(),0)+summaries+children+denials+terminal+pwChildGraphs.reduce((n,g)=>n+g.retainedBytes(),0);retainedStatePeak=Math.max(retainedStatePeak,retained);
  if(retained>32768)bad('registry-capacity');}
 const infrastructure=createInfrastructurePolicy(),infrastructureReservation=infrastructure.diagnosticRetainedBytes(),diagnosticReservation=infrastructureReservation+192+256;
 if(infrastructureReservation!==320)bad('registry-capacity');
 const owner=createArticleOwner({infrastructure,cases:batch.cases,clock});
 const observer=createCallbackObservation({onFault:()=>{}});
 const coordinator=createNativeCaptureCoordinator({guard:check,clock,until:()=>until,onFailure:fail});
 const callbacks=(kind,action)=>value=>observer.callback(kind,value,()=>{check();if(++events>4096)bad('event-capacity');action(value);},fail);
 async function rpc(action,cleanup=false,label='unclassified'){noteRpc(label);if(!cleanup)check();try{const v=await(cleanup?coordinator.cleanup(action,label):coordinator.rpc(action,label));if(!cleanup)check();return v;}catch(e){remember(e,cleanup);throw e;}}
 async function workerCall(method,input){return rpc(()=>worker.evaluate(async({method,input})=>{
  if(method==='window'){const w=await chrome.windows.getLastFocused({populate:false});return {windowId:w.id,type:w.type,incognito:w.incognito,focused:w.focused};}
  if(method==='begin')return globalThis.nativeReaderTransfer.beginStudy(input);
  if(method==='end')return globalThis.nativeReaderTransfer.endStudy(input);
  if(method==='observe')return globalThis.nativeReaderTransfer.observe(input);
  if(method==='skip')return globalThis.nativeReaderTransfer.skipUnavailable(input);
  if(!['locate','snapshot'].includes(method))throw Error('Fixed method');
  try{return await globalThis.nativeDocumentRights[method](input);}catch(error){if(globalThis.isSpecificityRightsRefusal(error))return {rightsUnavailable:true};throw error;}
 },{method,input}),false,'worker.'+method);}
 let publicationBegun=false;
 function releaseNavigation(s,ordinal){
  check();const slot=ordinal-1;
  if(current!==s||!Number.isSafeInteger(slot)||slot<0||slot>3||s.mainNavigation===null||typeof s.mainNavigation!=='object'||types.isProxy(s.mainNavigation)||navigationLedgers[slot]!==s.mainNavigation||navigationLedgers.indexOf(s.mainNavigation)!==slot||navigationLedgers.lastIndexOf(s.mainNavigation)!==slot||(phase&3)!==0)bad('late-article-callback');
  s.mainNavigation.release();if(s.mainNavigation.status().state!=='released'||s.mainNavigation.retainedBytes()!==1024)bad('registry-capacity');
  s.mainNavigation=0;navigationLedgers[slot]=0;check();
 }
 function fence(s){check();if(current!==s||s.retiring||s.retired)bad('late-article');if(s.mainNavigation===0||s.mainNavigation.status().state==='released')bad('late-article-callback');navigationCall('read',s.mainNavigation,'assertBalanced',[]);if(s.refusal){if(publicationBegun)bad('late-article-callback');throw new ArticleUnavailable(s.refusal);}}
 async function readAwait(s,action){fence(s);const v=await action();fence(s);return v;}
 function publish(row){check();if(metadata.length>=4||row.caseId!==rows[metadata.length].id||row.ordinal!==metadata.length+1)bad('row-order');
  const result=onRow(frozen(row));if(types.isProxy(result)||types.isPromise(result)){observeSafeRejectedRowPromise(result);bad('async-row');}
  check();metadata.push(row.status==='collected'?{caseId:row.caseId,ordinal:row.ordinal,status:row.status,nativeWitnessHash:digest(row.nativeWitness),rightsEvidenceHash:digest(row.rightsEvidence)}:{caseId:row.caseId,ordinal:row.ordinal,status:row.status,reason:row.reason});}
 async function skip(c,nonce,reason){const r=await workerCall('skip',{studyId,studyRevision:identity.studyRevision,caseId:c.id,ordinal:c.ordinal,observationNonce:nonce,reason});
  if(r?.status!=='unavailable'||r.caseId!==c.id||r.ordinal!==c.ordinal||r.reason!==reason)bad('skip-contract');}
 function studyBegin(value){const v=rec(value,['schema','studyId','studyRevision','eventEpoch','caseCount']);if(v.schema!=='native-specificity-batch-study/v1'||v.studyId!==studyId||v.caseCount!==4)bad('begin-contract');id(v.studyRevision);number(v.eventEpoch,Number.MAX_SAFE_INTEGER);return v;}
 async function closePair(){closing=true;try{owner.setClosing();}catch(e){fail(e,true);}let error,errorLatched=false;
  if(context){mark('cleanup-context');contextAttempts++;try{await rpc(()=>context.close(),true,'context.close');contextClosed=true;}catch(e){remember(e,true);if(!errorLatched){error=e;errorLatched=true;}}}
  if(browser){mark('cleanup-browser');browserAttempts++;try{await rpc(()=>browser.close(),true,'browser.close');browserClosed=true;}catch(e){remember(e,true);if(!errorLatched){error=e;errorLatched=true;}}}
  if(errorLatched)throw error;
 }
 try{
  // Policy work is fresh per batch, no page inputs/headers/text retained.
  mark('origin-policy');until=clock()+60000;check();const policy=await collectPolicies({cases:rows.map(({id,groupId,url,language})=>({id,groupId,url,language})),browser:true,batch:batch.batchIndex,guard:check,signal});check();
  if(policy.requests.length>8||policy.elapsedMs>60000)bad('origin-policy-capacity');until=clock()+45000;
  mark('launch');context=await rpc(()=>chromium.launchPersistentContext(profilePath,{executablePath,headless:true,chromiumSandbox:true,serviceWorkers:'block',ignoreHTTPSErrors:false,acceptDownloads:false,permissions:[],ignoreDefaultArgs:['--disable-extensions'],args:[...NATIVE_LAUNCH_ARGUMENTS,nativeHostResolverArgument(dnsPins)],timeout:10000}),false,'context.launch');
  browser=context.browser();if(!browser)bad('browser-handle');browser.on('disconnected',callbacks('disconnected',()=>{if(!closing)bad('unexpected-disconnect');}));
  mark('anchor-setup');const pages=context.pages();if(pages.length!==1||pages[0].url()!=='about:blank')bad('anchor');anchor=pages[0];
  context.on('page',callbacks('page',page=>{owner.page(page);const s=current;if(!s||s.page)bad('unexpected-page');s.page=page;const main=page.mainFrame();s.pwChildGraph=createPlaywrightChildFrameGraph(page,main);pwChildGraphs.push(s.pwChildGraph);
   for(const event of ['dialog','download','crash','worker'])page.on(event,callbacks('article-'+event,()=>bad('unexpected-page-event')));
   s.mainFrame=main;
   page.on('framenavigated',callbacks('article-navigation',frame=>{if(current!==s||s.retired||s.page!==page)bad('late-article-callback');if(s.retiring){const observe=terminalPwObservers.get(s);if(!observe)bad('late-article-callback');observe(frame);return;}if(frame!==main){if(++s.articleEvents>1024)bad('event-capacity');s.pwChildGraph.observe(frame);s.refusal='restricted-rendering';check();return;}if(++s.articleEvents>1024)bad('event-capacity');if(s.mainNavigation===0||s.mainNavigation?.status().state==='released')bad('late-article-callback');const url=frame.url();if(s.mainNavigation)navigationCall('public',s.mainNavigation,'pageNavigation',[page,s.token,frame,url],url);else owner.pageNavigation(frame,main,url);}));
  }));
  context.on('serviceworker',callbacks('worker',w=>{if(loading&&!extensionId){if(deferredWorkers.length)bad('unexpected-worker');deferredWorkers.push(w);return;}if(!extensionId||w.url()!=='chrome-extension://'+extensionId+'/worker.js'||worker&&w!==worker)bad('unexpected-worker');}));
  anchor.on('framenavigated',callbacks('anchor-navigation',f=>{if(f!==anchor.mainFrame()||f.url()!=='about:blank')bad('anchor-mutation');}));
  for(const event of ['dialog','download','crash','worker'])anchor.on(event,callbacks('anchor-'+event,()=>bad('anchor-event')));
  rootSession=await rpc(()=>browser.newBrowserCDPSession(),false,'browser.root-session');await rpc(()=>rootSession.send('Browser.setDownloadBehavior',{behavior:'deny'}),false,'Browser.setDownloadBehavior');
  const anchorSession=await rpc(()=>context.newCDPSession(anchor),false,'context.anchor-session');owner.seal(await rpc(()=>anchorSession.send('Target.getTargetInfo'),false,'Target.getTargetInfo'));
  for(const [protocol,event]of [['Target.targetInfoChanged','target-info-changed'],['Target.targetDestroyed','target-destroyed'],['Target.targetCrashed','target-crashed']])rootSession.on(protocol,callbacks(event,p=>owner.lifecycle(event,p)));
  rootSession.on('Target.targetCreated',callbacks('target-created',p=>{const t=fields(fields(p).targetInfo);if(t.type==='service_worker'){
   if(loading&&!extensionId){if(deferredTargets.length)bad('unexpected-worker');owner.worker(p);deferredTargets.push(t);return;}
   if(!extensionId||t.url!=='chrome-extension://'+extensionId+'/worker.js')bad('unexpected-worker');owner.worker(p);return;}owner.created(p);}));
  mark('target-discovery');await rpc(()=>rootSession.send('Target.setDiscoverTargets',{discover:true}),false,'Target.setDiscoverTargets');owner.census(await rpc(()=>rootSession.send('Target.getTargets'),false,'Target.getTargets'),'pre-load');
  mark('extension-load');loading=true;const loaded=await rpc(()=>rootSession.send('Extensions.loadUnpacked',{path:stagedExtensionPath}),false,'Extensions.loadUnpacked');if(!/^[a-p]{32}$/u.test(loaded?.id))bad('extension-id');extensionId=loaded.id;loading=false;
  const workerUrl='chrome-extension://'+extensionId+'/worker.js';if(!deferredTargets.every(t=>t.url===workerUrl)||!deferredWorkers.every(w=>w.url()===workerUrl))bad('extension-worker');
  mark('worker-lookup');const workers=context.serviceWorkers();if(workers.length>1||workers.some(w=>w.url()!==workerUrl))bad('extension-worker');worker=workers[0]??await rpc(()=>context.waitForEvent('serviceworker',{predicate:w=>w.url()===workerUrl,timeout:8000}),false,'context.worker-wait');
  if(worker.url()!==workerUrl)bad('extension-worker');owner.census(await rpc(()=>rootSession.send('Target.getTargets'),false,'Target.getTargets'),'post-load',workerUrl);
  mark('native-window');const window=await workerCall('window');if(window.type!=='normal'||window.incognito!==false||window.focused!==true)bad('native-window');number(window.windowId,Number.MAX_SAFE_INTEGER);
  mark('native-begin');identity=studyBegin(await workerCall('begin',{studyId,windowId:window.windowId,cases:rows.map(c=>({id:c.id,ordinal:c.ordinal,url:c.url}))}));
  for(const c of rows){
   publicationBegun=false;
   mark('article-policy');check();coordinator.assertDrained();const nonce='specificity-'+randomUUID(),origin=policy.entries.get(c.url);
   if(origin?.status!=='eligible'||!nativeHostPinned(dnsPins,new URL(c.url).hostname)){
    const reason=['origin-robots-denied','origin-tdm-reserved'].includes(origin?.reason)?'origin-policy-refused':'origin-policy-unavailable';await skip(c,nonce,reason);publish({status:'unavailable',caseId:c.id,ordinal:c.ordinal,reason});continue;
   }
   until=clock()+60000;try{await policy.beforePage(c.url);}catch(e){if(Object.getPrototypeOf(e)!==ControlUnavailable.prototype)throw e;await skip(c,nonce,'origin-policy-unavailable');publish({status:'unavailable',caseId:c.id,ordinal:c.ordinal,reason:'origin-policy-unavailable'});continue;}
   until=clock()+20000;owner.reserve(c,until);const s={token:{},page:null,retiring:false,retired:false,journey:null,refusal:null,encodedBytes:0,articleEvents:0,paused:null,network:null,responseStarted:false,responseContinuationSubmitted:false,mainNetworkId:null,allowFailureCleanup:false,childFrames:new Map(),retirementDenials:new Map()};childRegistries.push(s.childFrames);retirementRegistries.push(s.retirementDenials);current=s;if((phase&3)!==0)bad('late-article-callback');currentContextSymbol=Symbol();currentContextOrdinal=c.ordinal-1;let consumed=false,collectedFenced=false,deferredUnavailable=null,articleCallbacks,cdp;
   try{
    mark('article-create');const page=await rpc(()=>context.newPage(),false,'context.new-page');owner.returned(page);if(s.page!==page)bad('article-page');
    await rpc(()=>page.routeWebSocket('**/*',route=>{try{check();if(current!==s||s.retiring||s.retired||s.page!==page)bad('late-websocket');if(++events>4096||++s.articleEvents>1024)bad('event-capacity');
     s.refusal='restricted-rendering';const job=coordinator.rpc(()=>route.close(),'websocket.close').catch(fail).finally(()=>socketJobs.delete(job));socketJobs.add(job);return job;}catch(e){fail(e);}}),false,'page.websocket-route');
    mark('article-setup');cdp=await rpc(()=>context.newCDPSession(page),false,'context.article-session');s.session=cdp;
    const target=await rpc(()=>cdp.send('Target.getTargetInfo'),false,'Target.getTargetInfo');await rpc(()=>owner.awaitAuthentication(target),false,'owner.await-authentication');await rpc(()=>page.bringToFront(),false,'page.bring-front');
    await rpc(()=>cdp.send('Page.enable'),false,'Page.enable');const tree=fields(await rpc(()=>cdp.send('Page.getFrameTree'),false,'Page.getFrameTree')),blank=fields(fields(tree.frameTree).frame);
    if(blank.url!=='about:blank'||Object.hasOwn(blank,'parentId'))bad('initial-frame');id(blank.id);id(blank.loaderId);s.frameId=blank.id;owner.navigate(blank.id,blank.loaderId);
    s.gate=createNativeArticleNetworkGate({dnsPins,caseUrl:c.url,frameId:blank.id});s.url=c.url;
    const journeyWitness=createJourneyFailureWitness(blank.loaderId);
    s.journey=createPublicJourney({incarnation:s.token,frameId:blank.id,blankLoaderId:blank.loaderId,url:c.url,until,guard:check,clock,reportPreflight:()=>checkRetained(),
     onFailure:error=>{if(!s.allowFailureCleanup){try{journeyWitness.capture(error,s.journey.failureReport());if(journeyCandidate===null)journeyCandidate={error,witness:journeyWitness.candidateFor(error)};}catch{/* Diagnostic-only; preserve the original fail call. */}fail(error);}}});
    journeyStates.push(s.journey);
    const navigationSession=cdp,navigationPage=page,navigationToken=s.token,navigationFrame=s.mainFrame;
    if(navigationLedgers[c.ordinal-1]!==null||s.mainNavigation!==undefined)bad('late-article-callback');
    s.mainNavigation=createMainNavigationAccounting({page,mainFrame:navigationFrame,session:cdp,token:s.token,frameId:blank.id,blankLoaderId:blank.loaderId,caseUrl:c.url,until,clock,
     guard:()=>{check();if(current!==s||s.retiring||s.retired||s.page!==navigationPage||s.mainFrame!==navigationFrame||s.session!==navigationSession||s.token!==navigationToken)bad('late-article-callback');},
     owner,journey:s.journey,journeyCall:journeyWitness.call});navigationLedgers[c.ordinal-1]=s.mainNavigation;
    const countEvent=()=>{if(++s.articleEvents>1024||++events>4096)bad('event-capacity');};
    articleCallbacks=createPublicArticleCallbacks({state:s,coordinator,owner,guard:()=>{check();if(current!==s)bad('late-article-callback');},clock,countEvent,onFatal:fail,initialBlankLoaderId:blank.loaderId,initialMainFrame:navigationFrame,noteRpc,journeyCall:journeyWitness.call,mainNavigation:s.mainNavigation,navigationCall});terminalRegistries.push(articleCallbacks.retainedTerminalBytes);terminalPwObservers.set(s,articleCallbacks.terminalPlaywrightNavigation);networkWitnessReader=articleCallbacks.networkWitnessFor;
    for(const [event,fn]of [['Fetch.requestPaused','paused'],['Network.responseReceived','response'],['Network.loadingFinished','loadingFinished'],['Network.loadingFailed','loadingFailed'],
     ['Network.dataReceived','dataReceived'],['Page.frameNavigated','frameNavigated'],['Page.navigatedWithinDocument','withinDocument'],['Page.lifecycleEvent','lifecycle'],['Page.frameDetached','frameDetached']])cdp.on(event,articleCallbacks[fn]);
    cdp.on('Page.frameAttached',value=>{try{check();if(current!==s||s.retired)bad('late-frame-attach');articleCallbacks.frameAttached(value);}catch(e){fail(e);}});
    for(const [method,params]of [['Page.setLifecycleEventsEnabled',{enabled:true}],['Network.enable',{}],['Network.setBypassServiceWorker',{bypass:true}],['Network.setCacheDisabled',{cacheDisabled:true}],
     ['Fetch.enable',{patterns:[{urlPattern:'http://*',requestStage:'Request'},{urlPattern:'https://*',requestStage:'Request'},{urlPattern:'https://*',resourceType:'Document',requestStage:'Response'}]}]])await rpc(()=>cdp.send(method,params),false,method);
    mark('article-navigation');s.journey.begin(s.token);const navigation=await rpc(()=>cdp.send('Page.navigate',{url:c.url}),false,'Page.navigate');journeyWitness.call('reply',navigation,()=>s.journey.reply(s.token,navigation));s.verifiedLoader=navigation.loaderId;
    while(s.journey.snapshot().phase!=='resolved'||s.mainNavigation===0||!s.mainNavigation.status().matched){check();if(s.mainNavigation===0)bad('late-article-callback');if(s.refusal)throw new ArticleUnavailable(s.refusal);await pause(5);check();}
    s.journey.assertComplete(s.token);owner.verifyNavigation(navigation);s.verifiedLoader=navigation.loaderId;s.response=verifyNativeNavigationLoader(s.gate,{url:c.url,frameId:blank.id,loaderId:navigation.loaderId});fence(s);
    mark('article-read');await readAwait(s,()=>articleCallbacks.drain());
    async function currentFrame(){const t=fields(await readAwait(s,()=>rpc(()=>cdp.send('Page.getFrameTree'),false,'Page.getFrameTree'))),f=fields(fields(t.frameTree).frame);
     if(f.id!==blank.id||f.url!==c.url||f.loaderId!==navigation.loaderId||Object.hasOwn(f,'parentId'))bad('current-frame-mismatch');}
    await currentFrame();await readAwait(s,()=>rpc(()=>rootSession.send('Target.getTargets'),false,'Target.getTargets').then(v=>owner.census(v,'post-load',workerUrl)));
    const tab=await readAwait(s,()=>rpc(()=>worker.evaluate(expected=>chrome.tabs.query({active:true,windowId:expected.windowId}).then(tabs=>{
     if(tabs.length!==1||tabs[0].url!==expected.url||tabs[0].status!=='complete'||tabs[0].pendingUrl||!tabs[0].active||tabs[0].incognito)return null;return {tabId:tabs[0].id};
    }),{windowId:window.windowId,url:c.url}),false,'worker.tab-query'));
    if(tab===null)throw new ArticleUnavailable('foreground-changed');number(tab.tabId,Number.MAX_SAFE_INTEGER);
    const command={tabId:tab.tabId,sourceUrl:c.url,documentUrl:c.url};
    const located=await readAwait(s,()=>workerCall('locate',command));if(located?.rightsUnavailable===true)throw new ArticleUnavailable('document-policy-unavailable');
    const l=rec(located,['schema','tabId','frameId','documentId','sourceUrl','documentUrl','attestation']);
    if(l.schema!=='native-document-locator/v1'||l.tabId!==tab.tabId||l.frameId!==0||l.sourceUrl!==c.url||l.documentUrl!==c.url)bad('native-locator-identity');id(l.documentId);if(l.documentId.length>128)bad('native-document-id');
    const pinned={...command,documentId:l.documentId};
    async function snapshot(){const v=await readAwait(s,()=>workerCall('snapshot',pinned));if(v?.rightsUnavailable===true)throw new ArticleUnavailable('document-policy-unavailable');return projectNativeDomPolicy({...pinned,snapshot:v});}
    const before=await snapshot();consumed=true;const observed=await readAwait(s,()=>workerCall('observe',{studyId,studyRevision:identity.studyRevision,caseId:c.id,ordinal:c.ordinal,observationNonce:nonce}));
    if(observed?.status==='unavailable'){
     const r=rec(observed,['status','caseId','ordinal','reason']);if(r.caseId!==c.id||r.ordinal!==c.ordinal||typeof r.reason!=='string')bad('native-unavailable-contract');
     const foreground=new Set(['context-changed','foreground-unavailable','permission-unavailable','url-unavailable']);
     const readers=new Set(['reader-document-mismatch','reader-missing-region','reader-capture-budget','reader-rights-restricted','reader-invalid-content','reader-capture-time-budget','reader-capture-node-budget','reader-capture-head-budget','reader-capture-attribute-budget','reader-capture-failed','native-document-changed']);
     if(!foreground.has(r.reason)&&!readers.has(r.reason))bad('unknown-native-refusal');throw new ArticleUnavailable(foreground.has(r.reason)?'foreground-changed':'reader-unavailable');
    }
    const result=rec(dataCopy(observed,{values:4096,units:32768,depth:12,array:64,properties:32,string:4096}),['status','nativeWitness','rawTitle','effectiveTitle','body','extractorVersion']),w=fields(result.nativeWitness);
    if(result.status!=='collected'||w.documentId!==l.documentId||w.tabId!==tab.tabId||w.windowId!==window.windowId||w.studyId!==studyId||w.studyRevision!==identity.studyRevision||w.observationNonce!==nonce||w.caseId!==c.id||w.ordinal!==c.ordinal)bad('native-document-mismatch');
    if(typeof result.rawTitle!=='string'||result.rawTitle.length>200||typeof result.effectiveTitle!=='string'||!result.effectiveTitle.length||result.effectiveTitle.length>200||
     typeof result.body!=='string'||!result.body.trim()||result.body.length>4096||![result.rawTitle,result.effectiveTitle,result.body].every(t=>t.isWellFormed()&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(t))||
     result.effectiveTitle!==(result.rawTitle.trim()||new URL(c.url).hostname)||!['main-text-prefix/v1','article-container-prefix/v1'].includes(result.extractorVersion))bad('native-fields-contract');
    const after=await snapshot(),finalLocated=await readAwait(s,()=>workerCall('locate',command));
    if(finalLocated?.rightsUnavailable===true)throw new ArticleUnavailable('document-policy-unavailable');if(finalLocated.documentId!==l.documentId)bad('final-native-document-changed');
    const finalWindow=await readAwait(s,()=>workerCall('window'));if(finalWindow.windowId!==window.windowId||finalWindow.type!=='normal'||finalWindow.incognito!==false||finalWindow.focused!==true)throw new ArticleUnavailable('foreground-changed');
    await currentFrame();const rights=validateNativeRightsEvidence(batch,{caseId:c.id,ordinal:c.ordinal,nativeWitness:result.nativeWitness,rightsEvidence:{schema:'native-reader-bracketed-rights/v1',
     caseId:c.id,ordinal:c.ordinal,studyId:w.studyId,studyRevision:w.studyRevision,observationNonce:w.observationNonce,eventEpoch:w.eventEpoch,documentId:w.documentId,tabId:w.tabId,windowId:w.windowId,
     sourceUrlHash:sha(c.url),documentUrlHash:sha(c.url),originPolicyHash:hash(origin.receiptSha256),mainResponseJourney:s.response,documentBefore:before,documentAfter:after,sameNativeDocument:true,httpNativeIdDirectlyCorrelated:false}});
    if(Buffer.byteLength(JSON.stringify({nativeWitness:result.nativeWitness,rightsEvidence:rights}))>16384)bad('row-evidence-capacity');
    fence(s);navigationCall('seal',s.mainNavigation,'seal',[]);publicationBegun=true;publish({status:'collected',caseId:c.id,ordinal:c.ordinal,rawTitle:result.rawTitle,effectiveTitle:result.effectiveTitle,body:result.body,extractorVersion:result.extractorVersion,nativeWitness:result.nativeWitness,rightsEvidence:rights});fence(s);collectedFenced=true;
   }catch(error){if(publicationBegun){fail(error);throw fatal;}let unavailableReason=null;
    if(!types.isProxy(error)&&types.isNativeError(error)&&Object.getPrototypeOf(error)===ArticleUnavailable.prototype){const d=Object.getOwnPropertyDescriptor(error,'reason');if(d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&UNAVAILABLE.has(d.value))unavailableReason=d.value;}
    if(unavailableReason===null){fail(error);throw fatal;}
    try{check();
    // Settle original continuations under the unchanged live article lease
    // BEFORE aborting an intentionally refused incomplete journey. Neither the
    // swallowed callback wrapper nor a timeout is physical settlement proof.
    if(articleCallbacks)await articleCallbacks.drain();if(socketJobs.size)await Promise.all([...socketJobs]);check();if(articleCallbacks?.pending()||socketJobs.size)bad('unsettled-retirement');coordinator.assertDrained();
    if(!consumed)await skip(c,nonce,unavailableReason);
    // The skip await may itself admit physical work. Recheck the actual
    // originals before revoking ONLY this definitive unavailable helper.
    if(articleCallbacks)await articleCallbacks.drain();if(socketJobs.size)await Promise.all([...socketJobs]);check();if(articleCallbacks?.pending()||socketJobs.size)bad('unsettled-retirement');coordinator.assertDrained();
    if(s.mainNavigation){navigationCall('retire',s.mainNavigation,'retire',[]);releaseNavigation(s,c.ordinal);}check();
    deferredUnavailable={status:'unavailable',caseId:c.id,ordinal:c.ordinal,reason:unavailableReason};s.allowFailureCleanup=true;
    // Native/DOM unavailability does not falsify an already complete transport
    // journey. Only a still-incomplete refused transport needs terminal cleanup.
    if(s.journey&&s.journey.snapshot().phase!=='resolved'&&!s.journey.failureReport())s.journey.abort();
    }catch(error){fail(error);throw fatal;}
   }finally{
    // Failed finite page refusal is cleanup-only, never a fabricated resolved
    // journey. Any contradictory/fatal callback already latched by check wins.
    mark('article-retirement');check();
    // Remain under this original20s lease. A snapshot is not quiescence; no
    // original pending work or new active contradiction may cross into close.
    if(articleCallbacks)await articleCallbacks.drain();if(socketJobs.size)await Promise.all([...socketJobs]);check();
    if(articleCallbacks?.pending()||socketJobs.size)bad('unsettled-retirement');coordinator.assertDrained();if(collectedFenced)fence(s);
    // No await before revocation/owner retirement and original close dispatch.
    if(s.mainNavigation!==0&&s.mainNavigation!==undefined)navigationCall('retire',s.mainNavigation,'retire',[]);else if(s.mainNavigation===0&&deferredUnavailable===null)bad('late-article-callback');if(articleCallbacks)articleCallbacks.revokeForRetirement();const retired=owner.retire();s.retiring=true;until=clock()+25000;
    if(s.page)await rpc(()=>{s.closeIssued=true;return s.page.close({runBeforeUnload:false});},false,'page.close');
    if(articleCallbacks)await articleCallbacks.drain();if(socketJobs.size)await Promise.all([...socketJobs]);await rpc(()=>retired,false,'owner.await-retired');
    owner.census(await rpc(()=>rootSession.send('Target.getTargets'),false,'Target.getTargets'),'post-load',workerUrl);check();coordinator.assertDrained();
    if(articleCallbacks?.pending()||socketJobs.size)bad('unsettled-retirement');articleCallbacks?.assertRetirementDenials();owner.retired();s.retired=true;
    // This is the existing, actual parent receipt callsite: awaited page.close,
    // owner targetDestroyed promise, complete absence census, callbacks/socket
    // drain and coordinator physical drain ALL preceded owner.retired(). No
    // caller boolean or missing child event manufactures that proof.
    if(s.mainNavigation!==0&&s.mainNavigation!==undefined)releaseNavigation(s,c.ordinal);articleCallbacks?.retireChildPayload();articleCallbacks?.releaseRetired();
    // All old physical proofs precede this ownership-only transition. The
    // final health callout precedes verification; no Map alias/callout survives
    // verification through the actual null writes and their next check.
    check();
    if(types.isProxy(s.childFrames)||types.isProxy(s.retirementDenials)||!types.isMap(s.childFrames)||!types.isMap(s.retirementDenials)||
     Object.getPrototypeOf(s.childFrames)!==Map.prototype||Object.getPrototypeOf(s.retirementDenials)!==Map.prototype||s.childFrames===s.retirementDenials)bad('registry-capacity');
    const childSlot=childRegistries.indexOf(s.childFrames),denialSlot=retirementRegistries.indexOf(s.retirementDenials);
    if(childSlot<0||childSlot!==denialSlot||childSlot!==childRegistries.length-1||childRegistries.length!==retirementRegistries.length||
     childRegistries.lastIndexOf(s.childFrames)!==childSlot||retirementRegistries.lastIndexOf(s.retirementDenials)!==denialSlot)bad('registry-capacity');
    s.childFrames=null;s.retirementDenials=null;childRegistries[childSlot]=null;retirementRegistries[denialSlot]=null;check();
    if(deferredUnavailable!==null){check();publish(deferredUnavailable);check();}
    check();const fullBound=nativeArticleSummaryBound(c.id,c.ordinal);summaryScratch=fullBound+PACKED_SUMMARY_BYTES;check();
    let report=s.journey?.snapshot()??null,fullRow={caseId:c.id,ordinal:c.ordinal,events:s.articleEvents,encodedBytes:s.encodedBytes,teardownLifecycle:s.teardownLifecycle??0,teardownAborts:s.teardownAborts??0,journey:report};
    if(128+Buffer.byteLength(JSON.stringify(fullRow))>fullBound)bad('registry-capacity');
    let packet=packNativeArticleSummary(fullRow,c.id,c.ordinal);articlePackets.push(packet);packet=null;summaryScratch=fullBound;check();
    fullRow=null;report=null;summaryScratch=0;check();
    if(s.journey){const index=journeyStates.indexOf(s.journey);if(index<0)bad('journey-registry');journeyStates.splice(index,1);}
    // All late callbacks retain the old opaque state/tombstone and reject BEFORE
    // accessing these compacted payloads. No private journey cap is exempted.
    s.journey=null;s.gate=null;s.network=null;s.paused=null;s.response=null;s.responseContinuation=null;s.session=null;s.mainFrame=null;current=null;check();
   }
  }
  // Every current journey is physically retired/released. Preserve ALL packet
  // charges while expanded ownership and bounded decode scratch coexist.
  for(let i=0;i<articlePackets.length;i++){
   let packet=articlePackets[i];const c=rows[packet[0]-1];if(!c)bad();check();summaryScratch=nativeArticleSummaryBound(c.id,c.ordinal);check();
   let row=unpackNativeArticleSummary(packet,c.id,c.ordinal);if(128+Buffer.byteLength(JSON.stringify(row))>summaryScratch)bad('registry-capacity');
   articleSummaries.push(row);row=null;check();articlePackets[i]=null;packet=null;summaryScratch=0;check();
  }
  articlePackets=null;check();
  mark('native-end');until=clock()+10000;const end=rec(await workerCall('end',{studyId,studyRevision:identity.studyRevision}),['schema','studyId','studyRevision','eventEpoch']);
  if(end.schema!=='native-specificity-batch-study-ended/v1'||end.studyId!==studyId||end.studyRevision!==identity.studyRevision||!Number.isSafeInteger(end.eventEpoch)||end.eventEpoch<=identity.eventEpoch)bad('end-contract');
  mark('final-census');const census=owner.census(await rpc(()=>rootSession.send('Target.getTargets'),false,'Target.getTargets'),'final',workerUrl);check();if(metadata.length!==4)bad('incomplete-batch');
  lifecycle.policyRequests=policy.requests.length;lifecycle.finalCensus=census;
 }catch(error){fail(error);throw fatal;}finally{until=Infinity;try{await closePair();}catch(e){if(!fatalLatched)fail(e,true);}}
 try{
 mark('final-checks');if(fatalLatched)throw fatal;check();coordinator.assertDrained();if(!contextClosed||!browserClosed||contextAttempts!==1||browserAttempts!==1||metadata.length!==4||socketJobs.size)bad('normal-close-proof');
 const summary=frozen({schema:'native-specificity-batch-capture/v1',panelIdentity:expectedPanelIdentity,manifestHash:expectedManifestHash,batchId:batch.batchId,phase:batch.phase,batchIndex:batch.batchIndex,
  accounted:4,available:metadata.filter(r=>r.status==='collected').length,unavailable:metadata.filter(r=>r.status==='unavailable').length,rows:metadata,cases:articleSummaries,
  policyRequests:lifecycle.policyRequests,resourceEvents:events,peakRetainedRegistryBytes:retainedStatePeak,callbackSummary:observer.snapshot(),finalCensus:lifecycle.finalCensus,
  contextCloseAttempts:contextAttempts,browserCloseAttempts:browserAttempts,contextClosed,browserClosed,physicalOperationsDrained:true,callbacksDrained:true,
  elapsedMs:clock()-started,rawInputPersisted:false,restrictedNetworkRendering:true,ordinaryDynamicBrowserProducerValidated:false,completeOsEgressIsolation:false,productionValidated:false,assignmentAuthority:false});
 if(Buffer.byteLength(JSON.stringify(summary))>524288)bad('summary-capacity');Object.assign(lifecycle,{owner,coordinator,guard,closed:true,released:false});closedBatches.set(summary,lifecycle);return summary;
 }catch(error){fail(error);throw fatal;}
}




