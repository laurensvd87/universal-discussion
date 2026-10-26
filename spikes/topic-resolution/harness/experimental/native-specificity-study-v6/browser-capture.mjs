// ADR180 successor: unchanged capture authority, finite first-fault observation.
// No IO/client load on import. Labels are observation points, not causal proof.
import {createHash,randomUUID} from 'node:crypto';
import {types} from 'node:util';
import {createRouteCoordinator} from '../playwright-route-coordinator-v1/coordinator.mjs';
import {createInfrastructurePolicy,StartupFatal} from '../exact-browser-infrastructure-v1/compatibility-variant.mjs';
import {createPublicJourney,FACTS,REPLAY_CATEGORIES,IGNORED_LIFECYCLE,PublicJourneyError,CODES as JOURNEY_CODES} from '../native-specificity-public-journey-v2/journey.mjs';
import {createArticleOwner,createCallbackObservation,ArticleOwnerError,fields,dense,identity} from './article-owner.mjs';
import {validateSpecificityBatch,deriveBatchNetworkScope,dataCopy} from './manifest.js';
import {collectOriginPolicies} from './origin-policy.js';
import {headerPolicy,ControlUnavailable,ControlFatal} from '../../current-producer-final-v2/policy.js';
import {compileSpecificityNetworkScope,describeSpecificityNetworkScope,describeNativeDnsPins,nativeHostResolverArgument,nativeHostPinned,createNativeArticleNetworkGate,admitNativePageRequest,admitNativeMainResponse,verifyNativeNavigationLoader,closeNativeArticleNetworkGate,describeNativeArticleNetworkGate,NativeNetworkError} from './network-policy.js';
const sha=v=>createHash('sha256').update(v).digest('hex'),digest=v=>sha(JSON.stringify(v));
const nativePromisePrototype=Promise.prototype,nativePromiseThen=Promise.prototype.then;
// Cleanup only: no authority/facts, and no caller constructor/species/then hooks.
function observeSafeRejectedRowPromise(value){
 if(types.isProxy(value)||!types.isPromise(value)||Object.getPrototypeOf(value)!==nativePromisePrototype)return;
 const descriptors=Object.getOwnPropertyDescriptors(value);
 if(Object.hasOwn(descriptors,'constructor')||Object.hasOwn(descriptors,'then')||
  Reflect.ownKeys(descriptors).some(k=>!Object.hasOwn(descriptors[k],'value')))return;
 nativePromiseThen.call(value,()=>undefined,()=>undefined);
}
export class NativeCaptureError extends Error{constructor(code='contract'){super('Specificity capture refused');this.code=code;}}
export class ArticleUnavailable extends Error{constructor(reason){super('Specificity article unavailable');this.reason=reason;}}
const UNAVAILABLE=new Set(['origin-policy-unavailable','origin-policy-refused','article-unavailable','document-policy-unavailable','document-policy-refused','reader-unavailable','foreground-changed','restricted-rendering']);
function bad(code='contract'){throw new NativeCaptureError(code);}
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
 },retire(){if(retired)bad('pw-child-lifecycle');retired=true;for(const row of members.values())row.status='parent-destroyed';},
 retainedBytes(){return 64+members.size*160;}});
}
function hash(v){if(typeof v!=='string'||!/^[a-f0-9]{64}$/u.test(v))bad();return v;}
function frozen(v){if(v&&typeof v==='object'){for(const x of Object.values(v))frozen(x);Object.freeze(v);}return v;}
const FAILURE_STAGES=new Set(['admission','origin-policy','launch','anchor-setup','target-discovery','extension-load','worker-lookup','native-window','native-begin','article-policy','article-create','article-setup','article-navigation','article-read','article-retirement','native-end','final-census','final-checks','cleanup-context','cleanup-browser','late-callback','unclassified']);
const FAILURE_RPCS=new Set(['context.launch','browser.root-session','Browser.setDownloadBehavior','context.anchor-session','Target.getTargetInfo','Target.setDiscoverTargets','Target.getTargets','Extensions.loadUnpacked','context.worker-wait','worker.window','worker.begin','worker.end','worker.skip','worker.locate','worker.snapshot','worker.observe','context.new-page','page.websocket-route','context.article-session','owner.await-authentication','page.bring-front','Page.enable','Page.getFrameTree','Page.setLifecycleEventsEnabled','Network.enable','Network.setBypassServiceWorker','Network.setCacheDisabled','Fetch.enable','Page.navigate','worker.tab-query','page.close','owner.await-retired','context.close','browser.close','Fetch.continueRequest','Fetch.continueResponse','Fetch.failRequest','unclassified']);
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
for(const code of ['pw-child-contract','pw-child-lifecycle','pw-child-capacity','pw-child-page','pw-child-parent'])FAILURE_CODES.capture.add(code);
let diagnosticLatched=false,diagnosticValue=null;
const JOURNEY_SITES=new Set(['reply','commit','response','lifecycle']),JOURNEY_PHASES=new Set(['prepared','dispatched','resolved','retired']);
const LIFECYCLE_NAMES=new Set([...REPLAY_CATEGORIES,'non-lifecycle','unavailable']);
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
/** Pure validation only; hashes/classes do not confer source/native authority. */
export function projectSpecificityCaptureDiagnostic(value){
 try{
  const d=rec(value,['schema','stage','rpc','primary','cleanup','journeyWitness']);
  if(d.schema!=='native-specificity-capture-failure/v1'||typeof d.stage!=='string'||!FAILURE_STAGES.has(d.stage)||d.rpc!==null&&(typeof d.rpc!=='string'||!FAILURE_RPCS.has(d.rpc)))bad('diagnostic-contract');
  const projection=v=>{const p=rec(v,['family','code']);if(typeof p.family!=='string'||!Object.hasOwn(FAILURE_CODES,p.family)||typeof p.code!=='string'||!FAILURE_CODES[p.family].has(p.code))bad('diagnostic-contract');return {family:p.family,code:p.code};};
  const copy={schema:d.schema,stage:d.stage,rpc:d.rpc,primary:projection(d.primary),cleanup:d.cleanup===null?null:projection(d.cleanup),journeyWitness:d.journeyWitness===null?null:projectJourneyWitness(d.journeyWitness)};
  if(copy.journeyWitness!==null&&copy.primary.family!=='public-journey')bad('diagnostic-contract');
  if(Buffer.byteLength(JSON.stringify(copy))>700)bad('diagnostic-contract');return frozen(copy);
 }catch{bad('diagnostic-contract');}
}
export function captureFailureDiagnostic(){return diagnosticLatched?projectSpecificityCaptureDiagnostic(diagnosticValue):null;}
function recordFailure(error,stage,rpc,cleanup=false,journeyWitness=null){
 // This observation cannot suppress an action, replace an error or throw.
 try{
  const projected=errorProjection(error);
  if(!diagnosticLatched){diagnosticLatched=true;diagnosticValue={schema:'native-specificity-capture-failure/v1',stage:FAILURE_STAGES.has(stage)?stage:'unclassified',rpc:FAILURE_RPCS.has(rpc)?rpc:null,primary:projected,cleanup:null,journeyWitness:null};
   if(!cleanup&&journeyWitness!==null)try{diagnosticValue=projectSpecificityCaptureDiagnostic({...diagnosticValue,journeyWitness});}catch{/* Null witness, same primary. */}}
  else if(cleanup&&diagnosticValue.cleanup===null)diagnosticValue={...diagnosticValue,cleanup:projected};
 }catch{/* Observation failure never changes the original capture outcome. */}
}
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
 let normalOrdinal=0,cleanupOrdinal=0,failure=null;const entries=new Map(),physical=new Set();
 function fail(code){failure??=new NativeCaptureError(code);core.fail('external-fatal');onFailure(failure);}
 const core=createRouteCoordinator((task,lane)=>{
  const key=lane+':'+task.ordinal,entry=entries.get(key);if(!entry){fail('operation-registry');throw failure;}entries.delete(key);entry.arm();
  let value;try{value=entry.action();}catch{fail('client-operation');throw failure;}
  const native=Promise.resolve(value).then(result=>{entry.value=result;entry.settled=true;},()=>{fail('client-operation');throw failure;});
  physical.add(native);native.then(()=>physical.delete(native),()=>physical.delete(native));return native;
 });
 function submit(lane,action,maximum){
  if(lane!=='cleanup'){guard();if(failure)throw failure;}
  const ordinal=lane==='cleanup'?cleanupOrdinal++:normalOrdinal++;if(ordinal>=(lane==='cleanup'?2:4096)){fail('coordinator-capacity');throw failure;}
  let timer,rejectTimeout;const timeout=new Promise((_,no)=>{rejectTimeout=no;});
  const entry={action,value:undefined,settled:false,arm(){const remaining=lane==='cleanup'?maximum:Math.min(maximum,until()-clock());
   timer=schedule(()=>{fail(remaining<maximum?'article-deadline':'rpc-deadline');rejectTimeout(failure);},Math.max(1,remaining));}};
  const key=lane+':'+ordinal;entries.set(key,entry);const task={ordinal,method:lane==='cleanup'?'cleanup-rpc':lane==='denial'?'route-abort':'coordinator-rpc'};
  const caller=lane==='cleanup'?core.cleanup(task):lane==='denial'?core.deny(task):core.rpc(task);
  const completion=caller.then(()=>{if(!entry.settled)bad('operation-registry');return entry.value;},()=>{if(!failure)fail('coordinator-failed');throw failure;});
  return Promise.race([completion,timeout]).finally(()=>{if(timer!==undefined)cancel(timer);entries.delete(key);});
 }
 return Object.freeze({rpc:action=>submit('ordinary',action,10000),resolveFetch:action=>submit('denial',action,10000),cleanup:action=>submit('cleanup',action,2000),
  fail,snapshot:()=>frozen({...core.snapshot(),physical:physical.size,registered:entries.size}),assertDrained(){const s=core.snapshot();if(physical.size||entries.size||s.normalActive||s.cleanupActive||s.backlog)bad('unsettled-operations');},
  dispose(){core.dispose();entries.clear();}});
}

function requestHeaders(value){
 if(!value||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)bad('request-headers');
 const keys=Reflect.ownKeys(value);if(keys.length>64)bad('request-headers');let bytes=0,authorizationPresent=false;
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);if(typeof k!=='string'||k.length>256||!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||d.value.length>8192||/[\r\n]/u.test(k+d.value)||(bytes+=Buffer.byteLength(k+d.value))>16384)bad('request-headers');
  if(/^(authorization|proxy-authorization)$/iu.test(k))authorizationPresent=true;}return authorizationPresent;
}
/** Real original promises are retained by coordinator AND callback jobs. A
 * swallowed drain wrapper is never supplied to the journey observer. */
export function createPublicArticleCallbacks({state:s,coordinator,owner,guard,clock,countEvent,onFatal,noteRpc=()=>{},journeyCall=(_site,_input,action)=>action()}){
 const jobs=new Set(),fetchIds=new Set(),responseFetchIds=new Set(),networkIds=new Set(),blockedIds=new Set();let finished=false;
 s.childFrames??=new Map();
 let callbackFailure=null,callbackFailureLatched=false;
 const fatal=e=>{if(!callbackFailureLatched){callbackFailureLatched=true;callbackFailure=e;}try{onFatal(callbackFailure);}catch{}s.journey?.abort();};
 function check(){guard();if(callbackFailureLatched)throw callbackFailure;if(s.retired)bad('late-article-callback');}
 function track(p){const handled=Promise.resolve(p).then(()=>undefined,e=>{fatal(e);}).finally(()=>jobs.delete(handled));jobs.add(handled);return handled;}
 function callback(action){return value=>{try{check();countEvent();action(value);}catch(e){fatal(e);}};}
 function send(method,params){let original;return coordinator.resolveFetch(()=>{noteRpc(method);original=s.session.send(method,params);return original;});}
 function rejectRequest(p,admittedRefusal=false){
  // Only the exact response whose joined identity/TLS/peer checks already
  // passed may intentionally abort the admitted main request. A second Fetch
  // request reusing its Network ID is malformed, never an ignorable denial.
  if(p.networkId===s.mainNetworkId&&!(admittedRefusal&&p===s.paused&&s.responseStarted&&s.refusal&&!s.retiring))bad('admitted-main-id-reuse');
  if(p.networkId)blockedIds.add(p.networkId);track(send('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'}));
 }
 function continueOriginal(kind,p){
  track(coordinator.resolveFetch(()=>{
   // invokeContinuation validates token/IDs BEFORE native operation; its
   // returned observer discards ACK values, original is still owner-tracked.
   return s.journey.invokeContinuation(s.token,{kind,fetchId:p.requestId,networkId:p.networkId},()=>{const method=kind==='requestContinuation'?'Fetch.continueRequest':'Fetch.continueResponse';noteRpc(method);return s.session.send(method,{requestId:p.requestId});});
  }));
 }
 function finishResponse(){if(!s.paused||!s.network||s.responseStarted)return;s.responseStarted=true;
  try{s.provisional=admitNativeMainResponse(s.gate,{paused:s.paused,network:s.network});}
  catch(e){if(!types.isProxy(e)&&types.isNativeError(e)&&(Object.getPrototypeOf(e)===ControlUnavailable.prototype||Object.getPrototypeOf(e)===NativeNetworkError.prototype&&e.code==='main-response-unavailable')){
   s.refusal=s.paused.status<200||s.paused.status>=300?'article-unavailable':'document-policy-unavailable';rejectRequest(s.paused,true);return;}throw e;}
  journeyCall('response',s.provisional,()=>s.journey.response(s.token,s.provisional));continueOriginal('responseContinuation',s.paused);
 }
 return Object.freeze({
  paused:callback(value=>{
   const p=fields(value),r=fields(p.request);id(p.requestId);id(p.frameId);id(p.networkId);
   const seen=Object.hasOwn(p,'responseStatusCode')?responseFetchIds:fetchIds;if(seen.has(p.requestId))bad('duplicate-fetch');seen.add(p.requestId);
   if(Object.hasOwn(p,'responseErrorReason'))bad('response-error-unknown');
   if(s.retiring){if(!networkIds.has(p.networkId)&&!blockedIds.has(p.networkId))bad('late-unknown-fetch');return;}
   if(Object.hasOwn(p,'responseStatusCode')){
    if(p.resourceType!=='Document'||p.networkId!==s.mainNetworkId||p.frameId!==s.frameId||r.url!==s.url||s.paused||s.responseStarted)bad('main-response-identity');
    if(!Number.isInteger(p.responseStatusCode)||p.responseStatusCode<100||p.responseStatusCode>599)bad('response-contract');
    const headers=list(p.responseHeaders,64).map(h=>{const r=rec(h,['name','value']);return {name:r.name,value:r.value};});
    s.paused={requestId:p.requestId,networkId:p.networkId,frameId:p.frameId,url:r.url,status:p.responseStatusCode,headers};
    // Wait for the independent Network response even for non2xx: no status
    // refusal may bypass an already observed TLS/peer/identity contradiction.
    finishResponse();return;
   }
   const decision=admitNativePageRequest(s.gate,{requestId:p.requestId,networkId:p.networkId,frameId:p.frameId,url:r.url,method:r.method,resourceType:p.resourceType,authorizationPresent:requestHeaders(r.headers)});
   if(decision.action==='abort'){rejectRequest(p);return;}networkIds.add(p.networkId);
   if(decision.mainDocument){s.mainNetworkId=p.networkId;continueOriginal('requestContinuation',p);}
   else track(send('Fetch.continueRequest',{requestId:p.requestId}));
  }),
  response:callback(value=>{const d=fields(value);id(d.requestId);if(d.requestId!==s.mainNetworkId){if(!networkIds.has(d.requestId)&&!blockedIds.has(d.requestId))bad('unknown-network-response');return;}
   if(d.type!=='Document')bad('main-response-type');
   if(s.retiring)bad('late-main-response');if(s.network)bad('duplicate-main-response');const r=fields(d.response);
   s.network={url:r.url,status:r.status,requestId:d.requestId,frameId:d.frameId,loaderId:d.loaderId,remoteAddress:r.remoteIPAddress,securityState:r.securityState,mimeType:r.mimeType};finishResponse();}),
  frameAttached:callback(value=>{const d=fields(value);id(d.frameId);id(d.parentFrameId);if(s.retiring||d.frameId===s.frameId||d.frameId===d.parentFrameId)bad('child-frame-contract');
   if(s.childFrames.has(d.frameId))bad('child-frame-duplicate');if(s.childFrames.size>=16)bad('child-frame-capacity');
   if(d.parentFrameId!==s.frameId&&s.childFrames.get(d.parentFrameId)?.status!=='live')bad('child-frame-parent');
   s.childFrames.set(d.frameId,{parentId:d.parentFrameId,status:'live'});s.refusal='restricted-rendering';}),
  frameNavigated:callback(value=>{const f=fields(fields(value).frame);id(f.id);if(s.retiring)bad('late-navigation');if(Object.hasOwn(f,'parentId')){id(f.parentId);const child=s.childFrames.get(f.id);if(!child||child.status!=='live'||child.parentId!==f.parentId)bad('child-frame-navigation');s.refusal='restricted-rendering';return;}
   let first=null,ownerCaught=false;try{owner.commit(value);}catch(e){first=e;ownerCaught=true;}try{journeyCall('commit',value,()=>s.journey.commit(s.token,value),ownerCaught);}catch(e){first??=e;}if(first)throw first;}),
  lifecycle:callback(value=>{if(s.retiring){const d=fields(value);id(d.frameId);id(d.loaderId);
    if(!s.closeIssued||d.frameId!==s.frameId||d.loaderId!==s.verifiedLoader||!IGNORED_LIFECYCLE.includes(d.name)||typeof d.timestamp!=='number'||!Number.isFinite(d.timestamp)||d.timestamp<0||Object.is(d.timestamp,-0))bad('late-lifecycle');
    s.teardownLifecycle=(s.teardownLifecycle??0)+1;return;}
   journeyCall('lifecycle',value,()=>s.journey.lifecycle(s.token,value));}),
  loadingFinished:callback(value=>{const d=fields(value);id(d.requestId);if(!networkIds.has(d.requestId)&&!blockedIds.has(d.requestId))bad('unknown-loading-finished');
   if(d.requestId===s.mainNetworkId){if(s.retiring||finished)bad('duplicate-or-late-finished');finished=true;s.journey.finished(s.token,{requestId:d.requestId,timestamp:d.timestamp,encodedDataLength:d.encodedDataLength});}}),
  loadingFailed:callback(value=>{const d=fields(value);id(d.requestId);
   if(s.retiring&&s.closeIssued&&(networkIds.has(d.requestId)||blockedIds.has(d.requestId))&&d.canceled===true&&d.errorText==='net::ERR_ABORTED'){s.teardownAborts=(s.teardownAborts??0)+1;return;}
   if(blockedIds.has(d.requestId)){if(d.errorText!=='net::ERR_BLOCKED_BY_CLIENT')bad('blocked-failure-contradiction');return;}
   if(!networkIds.has(d.requestId))bad('unknown-network-failure');
   // No message regex or TLS/unknown rescue. Known transport loss is fatal in
   // this study even though journey gives its finite terminal network class.
   if(d.requestId===s.mainNetworkId)s.journey.loadingFailed(s.token,{requestId:d.requestId});else bad('resource-transport-loss');}),
  dataReceived:callback(value=>{const d=fields(value);id(d.requestId);if(!networkIds.has(d.requestId)&&!blockedIds.has(d.requestId))bad('unknown-network-data');
   number(d.encodedDataLength,Number.MAX_SAFE_INTEGER);s.encodedBytes+=d.encodedDataLength;if(!Number.isSafeInteger(s.encodedBytes)||s.encodedBytes>33554432)bad('encoded-resource-capacity');}),
  frameDetached:callback(value=>{const d=fields(value);id(d.frameId);if(!s.retiring||!s.closeIssued||d.reason!=='remove')bad('child-frame-detach');
   if(d.frameId===s.frameId){if(s.mainDetached)bad('main-frame-detached');s.mainDetached=true;return;}const child=s.childFrames.get(d.frameId);
   if(!child||child.status!=='live'||s.refusal!=='restricted-rendering')bad('child-frame-detach');child.status='removed';}),
  pending:()=>jobs.size,async drain(){await Promise.all([...jobs]);check();},
  close(){closeNativeArticleNetworkGate(s.gate);},
  releaseRetired(){if(!s.retired||jobs.size)bad('retired-payload-live');fetchIds.clear();responseFetchIds.clear();networkIds.clear();blockedIds.clear();}
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
 state.owner.release();state.coordinator.dispose();state.owner=null;state.coordinator=null;state.released=true;activeBatch=null;}
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
 let fatal=null,fatalLatched=false,rememberedError,rememberedLatched=false,diagnosticStage='admission',diagnosticRpc=null,journeyCandidate=null,context,browser,anchor,rootSession,worker,identity,extensionId=null,loading=false,closing=false,current=null;
 let until=clock()+45000,contextClosed=false,browserClosed=false,contextAttempts=0,browserAttempts=0,events=0,retainedStatePeak=0;
 const started=clock(),wholeUntil=started+360000,metadata=[],articleSummaries=[],journeyStates=[],childRegistries=[],pwChildGraphs=[],deferredWorkers=[],deferredTargets=[],socketJobs=new Set();
 const rows=batch.cases.map(c=>({...c,ordinal:c.nativeOrdinal}));
 function mark(stage){diagnosticStage=stage;diagnosticRpc=null;}
 function noteRpc(label){diagnosticRpc=FAILURE_RPCS.has(label)?label:'unclassified';}
 function remember(e,cleanup=false){if(!rememberedLatched){rememberedLatched=true;rememberedError=e;}recordFailure(e,diagnosticStage,diagnosticRpc,cleanup,journeyCandidate!==null&&journeyCandidate.error===e?journeyCandidate.witness:null);}
 const fail=(e,cleanup=false)=>{if(lifecycle.closed)mark('late-callback');remember(e,cleanup);if(!fatalLatched){fatalLatched=true;fatal=rememberedError;}if(!phaseFailureLatched){phaseFailureLatched=true;phaseFailure=fatal;}owner.abortPending(fatal);current?.journey?.abort();};
 function check(){guard();assertCaptureHealthy();if(signal?.aborted)bad('aborted');if(fatalLatched)throw fatal;
  // Already-closed healthy batches retain late-fault guards, not an obsolete
  // article/batch timer during the later540s model phase. Outer phase stays live.
  if(lifecycle.closed)return;
  const summaries=articleSummaries.reduce((n,r)=>n+128+Buffer.byteLength(JSON.stringify(r)),0);
  let children=0;for(const map of childRegistries){children+=64;for(const [key,row]of map)children+=64+key.length+row.parentId.length+row.status.length;}
  const retained=owner.snapshot().retainedBytes+journeyStates.reduce((n,j)=>n+j.retainedBytes(),0)+summaries+children+pwChildGraphs.reduce((n,g)=>n+g.retainedBytes(),0);retainedStatePeak=Math.max(retainedStatePeak,retained);
  if(retained>32768)bad('registry-capacity');if(clock()>=wholeUntil)bad('batch-deadline');if(clock()>=until)bad('article-deadline');}
 const owner=createArticleOwner({infrastructure:createInfrastructurePolicy(),cases:batch.cases,clock});
 const observer=createCallbackObservation({onFault:()=>{}});
 const coordinator=createNativeCaptureCoordinator({guard:check,clock,until:()=>until,onFailure:fail});
 const callbacks=(kind,action)=>value=>observer.callback(kind,value,()=>{check();if(++events>4096)bad('event-capacity');action(value);},fail);
 async function rpc(action,cleanup=false,label='unclassified'){noteRpc(label);if(!cleanup)check();try{const v=await(cleanup?coordinator.cleanup(action):coordinator.rpc(action));if(!cleanup)check();return v;}catch(e){remember(e,cleanup);throw e;}}
 async function workerCall(method,input){return rpc(()=>worker.evaluate(async({method,input})=>{
  if(method==='window'){const w=await chrome.windows.getLastFocused({populate:false});return {windowId:w.id,type:w.type,incognito:w.incognito,focused:w.focused};}
  if(method==='begin')return globalThis.nativeReaderTransfer.beginStudy(input);
  if(method==='end')return globalThis.nativeReaderTransfer.endStudy(input);
  if(method==='observe')return globalThis.nativeReaderTransfer.observe(input);
  if(method==='skip')return globalThis.nativeReaderTransfer.skipUnavailable(input);
  if(!['locate','snapshot'].includes(method))throw Error('Fixed method');
  try{return await globalThis.nativeDocumentRights[method](input);}catch(error){if(globalThis.isSpecificityRightsRefusal(error))return {rightsUnavailable:true};throw error;}
 },{method,input}),false,'worker.'+method);}
 function fence(s){check();if(current!==s||s.retiring||s.retired)bad('late-article');s.journey.assertComplete(s.token);owner.assertReading();if(s.refusal)throw new ArticleUnavailable(s.refusal);}
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
  mark('origin-policy');until=clock()+60000;const policy=await collectPolicies({cases:rows.map(({id,groupId,url,language})=>({id,groupId,url,language})),browser:true,batch:batch.batchIndex,guard:check,signal});check();
  if(policy.requests.length>8||policy.elapsedMs>60000)bad('origin-policy-capacity');until=clock()+45000;
  mark('launch');context=await rpc(()=>chromium.launchPersistentContext(profilePath,{executablePath,headless:true,chromiumSandbox:true,serviceWorkers:'block',ignoreHTTPSErrors:false,acceptDownloads:false,permissions:[],ignoreDefaultArgs:['--disable-extensions'],args:[...NATIVE_LAUNCH_ARGUMENTS,nativeHostResolverArgument(dnsPins)],timeout:10000}),false,'context.launch');
  browser=context.browser();if(!browser)bad('browser-handle');browser.on('disconnected',callbacks('disconnected',()=>{if(!closing)bad('unexpected-disconnect');}));
  mark('anchor-setup');const pages=context.pages();if(pages.length!==1||pages[0].url()!=='about:blank')bad('anchor');anchor=pages[0];
  context.on('page',callbacks('page',page=>{owner.page(page);const s=current;if(!s||s.page)bad('unexpected-page');s.page=page;const main=page.mainFrame();s.pwChildGraph=createPlaywrightChildFrameGraph(page,main);pwChildGraphs.push(s.pwChildGraph);
   for(const event of ['dialog','download','crash','worker'])page.on(event,callbacks('article-'+event,()=>bad('unexpected-page-event')));
   page.on('framenavigated',callbacks('article-navigation',frame=>{if(current!==s||s.retired||s.retiring||s.page!==page)bad('late-article-callback');if(frame!==main){if(++s.articleEvents>1024)bad('event-capacity');s.pwChildGraph.observe(frame);s.refusal='restricted-rendering';check();return;}owner.pageNavigation(frame,main,frame.url());}));
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
   mark('article-policy');check();coordinator.assertDrained();const nonce='specificity-'+randomUUID(),origin=policy.entries.get(c.url);
   if(origin?.status!=='eligible'||!nativeHostPinned(dnsPins,new URL(c.url).hostname)){
    const reason=['origin-robots-denied','origin-tdm-reserved'].includes(origin?.reason)?'origin-policy-refused':'origin-policy-unavailable';await skip(c,nonce,reason);publish({status:'unavailable',caseId:c.id,ordinal:c.ordinal,reason});continue;
   }
   until=clock()+60000;try{await policy.beforePage(c.url);}catch(e){if(Object.getPrototypeOf(e)!==ControlUnavailable.prototype)throw e;await skip(c,nonce,'origin-policy-unavailable');publish({status:'unavailable',caseId:c.id,ordinal:c.ordinal,reason:'origin-policy-unavailable'});continue;}
   until=clock()+20000;owner.reserve(c,until);const s={token:{},page:null,retiring:false,retired:false,journey:null,refusal:null,encodedBytes:0,articleEvents:0,paused:null,network:null,responseStarted:false,mainNetworkId:null,allowFailureCleanup:false,childFrames:new Map()};childRegistries.push(s.childFrames);current=s;let consumed=false,articleCallbacks,cdp;
   try{
    mark('article-create');const page=await rpc(()=>context.newPage(),false,'context.new-page');owner.returned(page);if(s.page!==page)bad('article-page');
    await rpc(()=>page.routeWebSocket('**/*',route=>{try{check();if(current!==s||s.retiring||s.retired||s.page!==page)bad('late-websocket');if(++events>4096||++s.articleEvents>1024)bad('event-capacity');
     s.refusal='restricted-rendering';const job=coordinator.rpc(()=>route.close()).catch(fail).finally(()=>socketJobs.delete(job));socketJobs.add(job);return job;}catch(e){fail(e);}}),false,'page.websocket-route');
    mark('article-setup');cdp=await rpc(()=>context.newCDPSession(page),false,'context.article-session');s.session=cdp;
    const target=await rpc(()=>cdp.send('Target.getTargetInfo'),false,'Target.getTargetInfo');await rpc(()=>owner.awaitAuthentication(target),false,'owner.await-authentication');await rpc(()=>page.bringToFront(),false,'page.bring-front');
    await rpc(()=>cdp.send('Page.enable'),false,'Page.enable');const tree=fields(await rpc(()=>cdp.send('Page.getFrameTree'),false,'Page.getFrameTree')),blank=fields(fields(tree.frameTree).frame);
    if(blank.url!=='about:blank'||Object.hasOwn(blank,'parentId'))bad('initial-frame');id(blank.id);id(blank.loaderId);s.frameId=blank.id;owner.navigate(blank.id,blank.loaderId);
    s.gate=createNativeArticleNetworkGate({dnsPins,caseUrl:c.url,frameId:blank.id});s.url=c.url;
    const journeyWitness=createJourneyFailureWitness(blank.loaderId);
    s.journey=createPublicJourney({incarnation:s.token,frameId:blank.id,blankLoaderId:blank.loaderId,url:c.url,until,guard:check,clock,
     onFailure:error=>{if(!s.allowFailureCleanup){try{journeyWitness.capture(error,s.journey.failureReport());if(journeyCandidate===null)journeyCandidate={error,witness:journeyWitness.candidateFor(error)};}catch{/* Diagnostic-only; preserve the original fail call. */}fail(error);}}});
    journeyStates.push(s.journey);
    const countEvent=()=>{if(++s.articleEvents>1024||++events>4096)bad('event-capacity');};
    articleCallbacks=createPublicArticleCallbacks({state:s,coordinator,owner,guard:()=>{check();if(current!==s)bad('late-article-callback');},clock,countEvent,onFatal:fail,noteRpc,journeyCall:journeyWitness.call});
    for(const [event,fn]of [['Fetch.requestPaused','paused'],['Network.responseReceived','response'],['Network.loadingFinished','loadingFinished'],['Network.loadingFailed','loadingFailed'],
     ['Network.dataReceived','dataReceived'],['Page.frameNavigated','frameNavigated'],['Page.lifecycleEvent','lifecycle'],['Page.frameDetached','frameDetached']])cdp.on(event,articleCallbacks[fn]);
    cdp.on('Page.frameAttached',value=>{try{check();if(current!==s||s.retiring||s.retired)bad('late-frame-attach');articleCallbacks.frameAttached(value);}catch(e){fail(e);}});
    for(const [method,params]of [['Page.setLifecycleEventsEnabled',{enabled:true}],['Network.enable',{}],['Network.setBypassServiceWorker',{bypass:true}],['Network.setCacheDisabled',{cacheDisabled:true}],
     ['Fetch.enable',{patterns:[{urlPattern:'http://*',requestStage:'Request'},{urlPattern:'https://*',requestStage:'Request'},{urlPattern:'https://*',resourceType:'Document',requestStage:'Response'}]}]])await rpc(()=>cdp.send(method,params),false,method);
    mark('article-navigation');s.journey.begin(s.token);const navigation=await rpc(()=>cdp.send('Page.navigate',{url:c.url}),false,'Page.navigate');journeyWitness.call('reply',navigation,()=>s.journey.reply(s.token,navigation));s.verifiedLoader=navigation.loaderId;
    while(s.journey.snapshot().phase!=='resolved'){check();if(s.refusal)throw new ArticleUnavailable(s.refusal);await pause(5);check();}
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
    fence(s);publish({status:'collected',caseId:c.id,ordinal:c.ordinal,rawTitle:result.rawTitle,effectiveTitle:result.effectiveTitle,body:result.body,extractorVersion:result.extractorVersion,nativeWitness:result.nativeWitness,rightsEvidence:rights});fence(s);
   }catch(error){let unavailableReason=null;
    if(!types.isProxy(error)&&types.isNativeError(error)&&Object.getPrototypeOf(error)===ArticleUnavailable.prototype){const d=Object.getOwnPropertyDescriptor(error,'reason');if(d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&UNAVAILABLE.has(d.value))unavailableReason=d.value;}
    if(unavailableReason===null){fail(error);throw fatal;}check();
    if(!consumed)await skip(c,nonce,unavailableReason);publish({status:'unavailable',caseId:c.id,ordinal:c.ordinal,reason:unavailableReason});s.allowFailureCleanup=true;
    // Native/DOM unavailability does not falsify an already complete transport
    // journey. Only a still-incomplete refused transport needs terminal cleanup.
    if(s.journey&&s.journey.snapshot().phase!=='resolved'&&!s.journey.failureReport())s.journey.abort();
   }finally{
    // Failed finite page refusal is cleanup-only, never a fabricated resolved
    // journey. Any contradictory/fatal callback already latched by check wins.
    mark('article-retirement');check();if(s.journey)s.journey.retire(s.token);const retired=owner.retire();s.retiring=true;until=clock()+25000;if(s.gate)closeNativeArticleNetworkGate(s.gate);
    if(s.page)await rpc(()=>{s.closeIssued=true;return s.page.close({runBeforeUnload:false});},false,'page.close');
    if(articleCallbacks)await articleCallbacks.drain();if(socketJobs.size)await Promise.all([...socketJobs]);await rpc(()=>retired,false,'owner.await-retired');
    owner.census(await rpc(()=>rootSession.send('Target.getTargets'),false,'Target.getTargets'),'post-load',workerUrl);check();coordinator.assertDrained();
    if(articleCallbacks?.pending()||socketJobs.size)bad('unsettled-retirement');owner.retired();s.retired=true;
    // This is the existing, actual parent receipt callsite: awaited page.close,
    // owner targetDestroyed promise, complete absence census, callbacks/socket
    // drain and coordinator physical drain ALL preceded owner.retired(). No
    // caller boolean or missing child event manufactures that proof.
    for(const child of s.childFrames.values())if(child.status==='live'){
     if(s.refusal!=='restricted-rendering'||!s.closeIssued||!s.retiring)bad('child-retirement');child.status='parent-destroyed';
    }
    s.pwChildGraph?.retire();
    const report=s.journey?.snapshot()??null;articleSummaries.push({caseId:c.id,ordinal:c.ordinal,events:s.articleEvents,encodedBytes:s.encodedBytes,teardownLifecycle:s.teardownLifecycle??0,teardownAborts:s.teardownAborts??0,journey:report});
    articleCallbacks?.releaseRetired();if(s.journey){const index=journeyStates.indexOf(s.journey);if(index<0)bad('journey-registry');journeyStates.splice(index,1);}
    // All late callbacks retain the old opaque state/tombstone and reject BEFORE
    // accessing these compacted payloads. No private journey cap is exempted.
    s.journey=null;s.gate=null;s.network=null;s.paused=null;s.response=null;s.session=null;current=null;check();
   }
  }
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


