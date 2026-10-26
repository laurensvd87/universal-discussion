// Injected source-only capture coordinator. No client import, launch, IO or
// collection occurs on module import. Root owns staging, source pins and Job.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {createRouteCoordinator} from '../playwright-route-coordinator-v1/coordinator.mjs';
import {FIXED_CASES} from './native-adapter.js';
import {collectOriginPolicies,headerPolicy,ControlUnavailable} from '../../current-producer-final-v2/policy.js';
import {createNativeArticleNetworkGate,admitNativePageRequest,admitNativeMainResponse,verifyNativeNavigationLoader,
 describeNativeArticleNetworkGate,closeNativeArticleNetworkGate,nativeHostResolverArgument,nativeHostPinned,describeNativeDnsPins,NativeNetworkError} from './network-policy.js';
const sha=value=>createHash('sha256').update(value).digest('hex'),digest=value=>sha(JSON.stringify(value));
const HASH=/^[a-f0-9]{64}$/u;
export class NativeCaptureError extends Error{constructor(code){super('Native browser capture failed');this.name='NativeCaptureError';this.code=code;}}
class ArticleUnavailable extends Error{constructor(reason){super('Native article unavailable');this.reason=reason;}}
function bad(code='contract'){throw new NativeCaptureError(code);}
function rec(v,keys){
 if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)bad();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out[k]=d.value;}return out;
}
function field(v,key){if(!v||typeof v!=='object'||types.isProxy(v))bad();const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!Object.hasOwn(d,'value'))bad();return d.value;}
function list(v,max){if(types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>max||Reflect.ownKeys(v).length!==v.length+1)bad();
 return Array.from({length:v.length},(_,i)=>field(v,String(i)));}
function id(v,max=160){if(typeof v!=='string'||!v.length||v.length>max||!v.isWellFormed()||/[\p{Cc}\p{Cf}\p{White_Space}]/u.test(v))bad();return v;}
function hash(v){if(typeof v!=='string'||!HASH.test(v))bad();return v;}
function number(v,max){if(!Number.isSafeInteger(v)||v<0||v>max||Object.is(v,-0))bad();return v;}
function frozen(v){if(v&&typeof v==='object'){for(const x of Object.values(v))frozen(x);Object.freeze(v);}return v;}

const DOM_KEYS=['tabId','frameId','documentId','sourceUrlHash','documentUrlHash','domPolicyHash','canonicalUrlHash','canonicalEqualsExpected','headComplete'];
const JOURNEY_KEYS=['schema','finalUrlHash','status','frameId','loaderId','fetchRequestId','fetchResponseId','networkRequestId','requestUrlExact',
 'ordinaryTlsSecure','selectedPublicPinMatched','pinHash','headerPolicyHash','navigationLoaderVerified','domPolicyRequiredSeparately','nativeDocumentIdDirectlyCorrelated'];
const RIGHTS_KEYS=['schema','caseId','ordinal','studyId','studyRevision','observationNonce','eventEpoch','documentId','tabId','windowId','sourceUrlHash','documentUrlHash',
 'originPolicyHash','mainResponseJourney','documentBefore','documentAfter','sameNativeDocument','httpNativeIdDirectlyCorrelated'];
/** Metadata cross-binding only. Actual same-document policy/native admission
 * must precede construction; this function does not recreate browser authority. */
export function validateNativeRightsEvidence(input){
 const a=rec(input,['caseId','ordinal','nativeWitness','rightsEvidence']),w=a.nativeWitness,r=rec(a.rightsEvidence,RIGHTS_KEYS);
 const expected=FIXED_CASES[a.ordinal-1];if(!expected||a.caseId!==expected.id||r.caseId!==a.caseId||r.ordinal!==a.ordinal)bad();
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
 try{policy=headerPolicy({xRobotsTag:robots,tdmReservation:null});for(const value of tdm)if(value!=='0')throw new Error();}
 catch(e){if(e instanceof NativeCaptureError)throw e;throw new ArticleUnavailable('document-policy-unavailable');}
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

const ORDINARY_FAILURES=new Set(['net::ERR_NAME_NOT_RESOLVED','net::ERR_CONNECTION_RESET','net::ERR_CONNECTION_REFUSED','net::ERR_CONNECTION_CLOSED',
 'net::ERR_CONNECTION_TIMED_OUT','net::ERR_TIMED_OUT','net::ERR_ADDRESS_UNREACHABLE']);
function boundedRequestHeaders(input){
 if(!input||typeof input!=='object'||types.isProxy(input)||Object.getPrototypeOf(input)!==Object.prototype)bad('callback-contract');
 const keys=Reflect.ownKeys(input);if(keys.length>64)bad('callback-contract');let bytes=0,authorizationPresent=false;
 for(const key of keys){if(typeof key!=='string'||key.length>256)bad('callback-contract');const value=field(input,key);
  if(typeof value!=='string'||value.length>8192||/[\r\n]/u.test(key+value)||(bytes+=Buffer.byteLength(key+value))>16384)bad('callback-contract');
  if(/^(?:authorization|proxy-authorization)$/iu.test(key))authorizationPresent=true;
 }return authorizationPresent;
}
/** Shared actual CDP callbacks. Response validation and continuation never wait
 * for Page.navigate's result; its independent loader is verified afterwards. */
export function createNativeArticleCallbacks({state,coordinator,guard,clock,countEvent,onFatal}){
 const jobs=new Set(),seenFetch=new Set(),networkRequests=new Set(),blockedNetwork=new Set();
 function fatal(code){onFatal(new NativeCaptureError(code));}
 function check(){guard();if(state.fatal)throw state.fatal;}
 function track(promise){const observed=Promise.resolve(promise).catch(e=>{onFatal(e instanceof NativeCaptureError?e:new NativeCaptureError('callback-operation'));}).finally(()=>jobs.delete(observed));jobs.add(observed);}
 function listener(action){return value=>{try{check();countEvent();action(value);}catch(e){onFatal(e instanceof NativeCaptureError?e:new NativeCaptureError('callback-contract'));}};}
 function refuse(reason){state.refusal??=reason;}
 function abort(p){
  if(p.networkId&&p.networkId===state.mainNetworkId&&!state.refusal&&!state.stopping)bad('main-response-integrity');
  if(p.networkId)blockedNetwork.add(p.networkId);
  track(coordinator.resolveFetch(()=>state.session.send('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'})));
 }
 function finishResponse(){
  if(!state.pausedMain||!state.networkMain||state.responseStarted||state.stopping)return;
  const p=state.pausedMain,n=state.networkMain;state.responseStarted=true;
  try{state.provisional=admitNativeMainResponse(state.gate,{paused:p,network:n});state.pausedMain=null;}
  catch(e){if(e instanceof ControlUnavailable||e instanceof NativeNetworkError&&e.code==='main-response-unavailable'){
   refuse('document-policy-unavailable');state.pausedMain=null;abort(p);return;
  }throw e;}
  track(coordinator.resolveFetch(async()=>{await state.session.send('Fetch.continueResponse',{requestId:p.requestId});state.responseContinued=true;}));
 }
 const callbacks={
  paused:listener(p=>{
   id(field(p,'requestId'));id(field(p,'frameId'));const request=field(p,'request');
   const url=field(request,'url'),method=field(request,'method'),resourceType=field(p,'resourceType');
   if(typeof url!=='string'||url.length>2048||typeof method!=='string'||typeof resourceType!=='string')bad('callback-contract');
   const networkDescriptor=Object.getOwnPropertyDescriptor(p,'networkId'),networkId=networkDescriptor&&Object.hasOwn(networkDescriptor,'value')?networkDescriptor.value:null;
   if(networkId!==null)id(networkId);
   const errorDescriptor=Object.getOwnPropertyDescriptor(p,'responseErrorReason');if(errorDescriptor)bad('response-error-unknown');
   const statusDescriptor=Object.getOwnPropertyDescriptor(p,'responseStatusCode'),response=Boolean(statusDescriptor);
   const paused={requestId:p.requestId,networkId,frameId:p.frameId,url};
   if(state.stopping){if(!seenFetch.has(p.requestId)&&networkId!==state.mainNetworkId)bad('late-unknown-fetch');return;}
   if(response){
    if(!Object.hasOwn(statusDescriptor,'value')||resourceType!=='Document'||networkId!==state.mainNetworkId||p.frameId!==state.frameId||url!==state.url||state.pausedMain||state.responseStarted)bad('main-response-integrity');
    const status=statusDescriptor.value;if(!Number.isInteger(status)||status<100||status>599)bad('callback-contract');
    const headers=list(field(p,'responseHeaders'),64).map(value=>rec(value,['name','value']));
    if(status<200||status>=300){refuse('article-unavailable');abort(paused);return;}
    state.pausedMain={...paused,status,headers};finishResponse();return;
   }
   if(seenFetch.has(p.requestId))bad('duplicate-fetch');seenFetch.add(p.requestId);
   const decision=admitNativePageRequest(state.gate,{...paused,method,resourceType,authorizationPresent:boundedRequestHeaders(field(request,'headers'))});
   if(decision.action==='abort'){abort(paused);return;}
   if(networkId)networkRequests.add(networkId);
   if(decision.mainDocument){state.mainNetworkId=networkId;state.mainFetchId=p.requestId;}
   track(coordinator.resolveFetch(()=>state.session.send('Fetch.continueRequest',{requestId:p.requestId})));
  }),
  response:listener(p=>{
   const requestId=id(field(p,'requestId'));if(state.stopping){if(!networkRequests.has(requestId)&&!blockedNetwork.has(requestId))bad('late-unknown-network');return;}
   if(requestId!==state.mainNetworkId){if(!networkRequests.has(requestId)&&!blockedNetwork.has(requestId))bad('unknown-network-response');return;}
   if(state.networkMain)bad('duplicate-main-response');
   const response=field(p,'response');state.networkMain={url:field(response,'url'),status:field(response,'status'),requestId,frameId:field(p,'frameId'),
    loaderId:field(p,'loaderId'),remoteAddress:field(response,'remoteIPAddress'),securityState:field(response,'securityState'),mimeType:field(response,'mimeType')};finishResponse();
  }),
  frameNavigated:listener(p=>{
   const frame=field(p,'frame');id(field(frame,'id'));const parent=Object.getOwnPropertyDescriptor(frame,'parentId');
   if(parent){if(!state.stopping)refuse('restricted-rendering');return;}
   if(frame.id!==state.frameId||field(frame,'url')!==state.url)bad('navigation-changed');
   id(field(frame,'loaderId'));if(state.stopping)return;if(state.committed)bad('navigation-repeated');
   state.committed={url:frame.url,frameId:frame.id,loaderId:frame.loaderId};
  }),
  lifecycle:listener(p=>{
   const frameId=id(field(p,'frameId')),loaderId=id(field(p,'loaderId')),name=field(p,'name');if(typeof name!=='string'||name.length>128)bad('callback-contract');
   // Page.enable may deliver a delayed lifecycle for the independently observed
   // initial about:blank. Only that exact retired loader may be ignored.
   if(frameId===state.frameId&&loaderId===state.blankLoaderId)return;
   if(state.stopping)return;if(name!=='DOMContentLoaded'||frameId!==state.frameId)return;if(state.dcl)bad('duplicate-dcl');
   state.dcl={frameId,loaderId,at:clock()};
  }),
  loadingFailed:listener(p=>{
   const requestId=id(field(p,'requestId')),errorText=field(p,'errorText');if(typeof errorText!=='string'||errorText.length>256)bad('callback-contract');
   if(blockedNetwork.has(requestId))return;
   if(state.stopping&&networkRequests.has(requestId))return;
   if(!networkRequests.has(requestId))bad('unknown-network-failure');
   if(!ORDINARY_FAILURES.has(errorText))bad('unknown-network-failure');
   if(requestId===state.mainNetworkId)refuse('article-unavailable');else state.resourceFailures++;
  }),
  dataReceived:listener(p=>{
   const requestId=id(field(p,'requestId'));const value=field(p,'encodedDataLength');number(value,Number.MAX_SAFE_INTEGER);
   if(!networkRequests.has(requestId)&&!blockedNetwork.has(requestId))bad('unknown-network-data');
   if(state.stopping)return;state.encodedBytes+=value;if(state.encodedBytes>33554432)refuse('restricted-rendering');
  }),
  frameDetached:listener(p=>{id(field(p,'frameId'));if(!state.stopping&&p.frameId===state.frameId)bad('main-frame-detached');})
 };
 return Object.freeze({...callbacks,pending:()=>jobs.size,async drain(){await Promise.all([...jobs]);},
  verifyNavigation(result){
   check();if(state.refusal)throw new ArticleUnavailable(state.refusal);
   if(!state.provisional||!state.committed||!state.dcl||!state.responseContinued)bad('incomplete-navigation');
   if(field(result,'frameId')!==state.frameId||field(result,'loaderId')!==state.committed.loaderId||state.committed.loaderId===state.blankLoaderId||state.dcl.loaderId!==state.committed.loaderId||state.dcl.frameId!==state.frameId)bad('navigation-loader-mismatch');
   state.journey=verifyNativeNavigationLoader(state.gate,state.committed);return state.journey;
  }});
}

export const NATIVE_LAUNCH_ARGUMENTS=Object.freeze(['--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update',
 '--disable-domain-reliability','--disable-sync','--disable-quic','--disable-client-side-phishing-detection','--safebrowsing-disable-auto-update',
 '--disable-default-apps','--autoplay-policy=user-gesture-required','--no-proxy-server','--enable-unsafe-extension-debugging']);
const SKIPPABLE=new Set(['origin-policy-unavailable','origin-policy-refused','article-unavailable','document-policy-unavailable','restricted-rendering']);
function synchronous(result){if(types.isPromise(result)){Reflect.apply(Promise.prototype.then,result,[undefined,()=>{}]);bad('async-row-callback');}return result;}
function checkedCases(input){const rows=list(input,32);if(rows.length!==32)bad();return rows.map((raw,i)=>{
 const c=rec(raw,['id','ordinal','url','groupId','language']),fixed=FIXED_CASES[i];if(c.id!==fixed.id||c.ordinal!==fixed.ordinal||c.url!==fixed.url||!['en','de','fr','es','nl'].includes(c.language))bad();id(c.groupId);return frozen(c);
});}

/** Trusted root driver must validate the fixed staged path, all sources and
 * model/reuse evidence BEFORE invoking this injected function. No file reads,
 * client import, model work or input persistence occur in this module. */
export async function captureNativeBrowserStudy({chromium,dnsPins,stagedExtensionPath,executablePath,cases,studyId,onRow,guard,signal,
 collectPolicies=collectOriginPolicies,clock=()=>performance.now(),pause=ms=>new Promise(yes=>setTimeout(yes,ms))}){
 const rows=checkedCases(cases);id(studyId);describeNativeDnsPins(dnsPins);
 if(typeof chromium?.launchPersistentContext!=='function'||typeof onRow!=='function'||types.isProxy(onRow)||typeof guard!=='function'||
  typeof stagedExtensionPath!=='string'||!/^D:[\\/]/u.test(stagedExtensionPath)||typeof executablePath!=='string'||
  !['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].includes(executablePath.replaceAll('\\','/')))bad();
 let failure=null,context,browser,anchor,worker,rootSession,sessionIdentity,current=null,expectingPage=false,expectedPage=null,closingBrowser=false;
 let cleanupIssued=0,totalEvents=0,batchEvents=0,totalPolicyRequests=0,available=0,finished=false;
 const metadata=[],batches=[],socketJobs=new Set();const started=clock();
 const fail=e=>{failure??=e instanceof NativeCaptureError?e:new NativeCaptureError('client-or-callback');};
 function globalGuard(){guard();if(signal?.aborted)bad('aborted');if(failure)throw failure;}
 let coordinator=createNativeCaptureCoordinator({guard:globalGuard,clock,onFailure:fail});
 function fence(article){globalGuard();if(current!==article||article.stopping)bad('retired-article');if(article.fatal)throw article.fatal;
  if(article.refusal)throw new ArticleUnavailable(article.refusal);if(clock()>=article.until)throw new ArticleUnavailable('article-unavailable');}
 async function waitFor(predicate,article){while(!predicate()){fence(article);await pause(5);fence(article);}}
 const workerCall=async(handle,method,input)=>{
  const value=await coordinator.rpc(()=>worker.evaluate(async({handle,method,input})=>{
   try{return await globalThis[handle][method](input);}catch(e){
    // Only the owned rights module's explicit finite refusal surface may become
    // article unavailability. Arbitrary worker/client errors still reject.
    if(handle==='nativeDocumentRights'&&e?.name==='NativeDocumentRightsError'&&
     ['native-execution','document-mismatch','missing-head','head-budget','attribute-budget','directive-budget','capture-failed'].includes(e.code))return {nativeRightsUnavailable:e.code};
    throw e;
   }
  },{handle,method,input}));
  if(value&&typeof value==='object'&&Object.hasOwn(value,'nativeRightsUnavailable'))throw new ArticleUnavailable('document-policy-unavailable');return value;
 };
 async function skip(c,nonce,reason){
  if(!SKIPPABLE.has(reason))reason='article-unavailable';
  const result=await workerCall('nativeReaderTransfer','skipUnavailable',{studyId,studyRevision:sessionIdentity.studyRevision,caseId:c.id,ordinal:c.ordinal,observationNonce:nonce,reason});
  globalGuard();if(result?.status!=='unavailable'||result.caseId!==c.id||result.ordinal!==c.ordinal||result.reason!==reason)bad('native-skip-contract');
 }
 function publish(row){globalGuard();synchronous(onRow(frozen(row)));globalGuard();
  metadata.push(row.status==='collected'?{caseId:row.caseId,ordinal:row.ordinal,status:row.status,nativeWitnessHash:digest(row.nativeWitness),rightsEvidenceHash:digest(row.rightsEvidence)}:
   {caseId:row.caseId,ordinal:row.ordinal,status:row.status,reason:row.reason});}
 const closePair=async()=>{
  if(cleanupIssued!==0)bad('cleanup-replay');
  let closeFailed=false;
  closingBrowser=true; // Closing the persistent context ALSO closes its browser.
  if(context){cleanupIssued++;try{await coordinator.cleanup(()=>context.close());}catch{closeFailed=true;}}
  if(browser){cleanupIssued++;closingBrowser=true;try{await coordinator.cleanup(()=>browser.close());}catch{closeFailed=true;}}
  if(closeFailed)bad('owned-close-failed');
 };
 try{
  context=await coordinator.rpc(()=>chromium.launchPersistentContext('',{executablePath,headless:true,chromiumSandbox:true,serviceWorkers:'block',ignoreHTTPSErrors:false,
   acceptDownloads:false,permissions:[],ignoreDefaultArgs:['--disable-extensions'],args:[...NATIVE_LAUNCH_ARGUMENTS,nativeHostResolverArgument(dnsPins)],timeout:10000}));
  browser=context.browser();if(!browser)bad('browser-handle');browser.on('disconnected',()=>{if(!closingBrowser)fail(new NativeCaptureError('browser-disconnected'));});
  const initialPages=context.pages();if(initialPages.length!==1||initialPages[0].url()!=='about:blank')bad('initial-anchor');anchor=initialPages[0];
  context.on('page',page=>{if(expectingPage&&expectedPage===null){expectedPage=page;return;}fail(new NativeCaptureError('unexpected-page'));});
  context.on('serviceworker',observed=>{if(worker&&observed!==worker)fail(new NativeCaptureError('unexpected-service-worker'));});
  await coordinator.rpc(()=>context.routeWebSocket('**/*',route=>{
   const article=current;let close;
   try{
    if(article){if(++article.events>1024||++batchEvents>4096||++totalEvents>32768)bad('resource-event-capacity');article.socketBlocks++;article.refusal??='restricted-rendering';}
    close=coordinator.rpc(()=>route.close());
    if(!article)fail(new NativeCaptureError('idle-socket'));
   }catch(e){fail(e);return;}
   const observed=close.catch(e=>fail(e)).finally(()=>socketJobs.delete(observed));socketJobs.add(observed);return observed;
  }));
  rootSession=await coordinator.rpc(()=>browser.newBrowserCDPSession());await coordinator.rpc(()=>rootSession.send('Browser.setDownloadBehavior',{behavior:'deny'}));
  const loaded=await coordinator.rpc(()=>rootSession.send('Extensions.loadUnpacked',{path:stagedExtensionPath}));
  if(typeof loaded?.id!=='string'||!/^[a-p]{32}$/u.test(loaded.id))bad('extension-identity');const workerUrl='chrome-extension://'+loaded.id+'/worker.js';
  worker=context.serviceWorkers().find(value=>value.url()===workerUrl);
  if(!worker)worker=await coordinator.rpc(()=>context.waitForEvent('serviceworker',{predicate:value=>value.url()===workerUrl,timeout:10000}));
  if(worker.url()!==workerUrl||context.serviceWorkers().some(value=>value!==worker))bad('extension-worker');
  const targets=await coordinator.rpc(()=>rootSession.send('Target.getTargets'));
  for(const t of list(field(targets,'targetInfos'),128))if(['service_worker','shared_worker','worker'].includes(field(t,'type'))&&field(t,'url')!==workerUrl)bad('unexpected-worker');
  rootSession.on('Target.targetCreated',p=>{try{
   const info=field(p,'targetInfo'),type=field(info,'type');if(type==='shared_worker')bad('shared-worker');
   if(type==='service_worker'&&field(info,'url')!==workerUrl)bad('unexpected-service-worker');
   if(type==='worker'){
    const opener=Object.getOwnPropertyDescriptor(info,'openerId');
    if(!current||current.stopping||!opener||!Object.hasOwn(opener,'value')||opener.value!==current.targetId)bad('unowned-worker');
    current.workerTargets.add(id(field(info,'targetId')));
    current.refusal??='restricted-rendering';
   }
  }catch(e){fail(e);}});
  await coordinator.rpc(()=>rootSession.send('Target.setDiscoverTargets',{discover:true}));
  const ownedWindow=await coordinator.rpc(()=>worker.evaluate(async()=>{const w=await chrome.windows.getLastFocused({populate:false});return {id:w.id,type:w.type,incognito:w.incognito};}));
  if(ownedWindow.type!=='normal'||ownedWindow.incognito!==false)bad('owned-window');number(ownedWindow.id,Number.MAX_SAFE_INTEGER);
  sessionIdentity=await workerCall('nativeReaderTransfer','beginStudy',{studyId,windowId:ownedWindow.id,cases:FIXED_CASES});
  if(sessionIdentity.schema!=='native-reader-study/v1'||sessionIdentity.studyId!==studyId||sessionIdentity.caseCount!==32)bad('native-study-contract');id(sessionIdentity.studyRevision);
  coordinator.assertDrained();
  for(let batch=1;batch<=8;batch++){
   globalGuard();batchEvents=0;
   const batchCases=rows.slice((batch-1)*4,batch*4),policy=await collectPolicies({cases:batchCases.map(({id,groupId,url,language})=>({id,groupId,url,language})),browser:true,batch,guard:globalGuard,signal});
   globalGuard();totalPolicyRequests+=policy.requests.length;if(policy.requests.length>8||totalPolicyRequests>64||policy.elapsedMs>60000)bad('policy-budget');
   for(const c of batchCases){
    globalGuard();coordinator.assertDrained();let local;
    coordinator=createNativeCaptureCoordinator({guard:globalGuard,clock,until:()=>local&&!local.stopping?local.until:Infinity,onFailure:fail});
    const nonce='native-observation-'+c.ordinal+'-'+crypto.randomUUID();let consumed=false,page,session,callbacks,result,reason=null;
    const origin=policy.entries.get(c.url);
    if(origin?.status!=='eligible'||!nativeHostPinned(dnsPins,new URL(c.url).hostname)){
     reason=origin?.reason==='origin-robots-denied'||origin?.reason==='origin-tdm-reserved'?'origin-policy-refused':'origin-policy-unavailable';
     await skip(c,nonce,reason);publish({status:'unavailable',caseId:c.id,ordinal:c.ordinal,reason});continue;
    }
    try{
     try{await policy.beforePage(c.url);}catch(e){globalGuard();if(e instanceof ControlUnavailable)throw new ArticleUnavailable('origin-policy-unavailable');throw e;}
     globalGuard();expectingPage=true;expectedPage=null;page=await coordinator.rpc(()=>context.newPage());expectingPage=false;
     if(page!==expectedPage||page.url()!=='about:blank')bad('article-page-identity');
     await coordinator.rpc(()=>page.bringToFront());session=await coordinator.rpc(()=>context.newCDPSession(page));
     for(const [method,params]of [['Page.enable',{}],['Page.setLifecycleEventsEnabled',{enabled:true}],['Network.enable',{}],
      ['Network.setBypassServiceWorker',{bypass:true}],['Network.setCacheDisabled',{cacheDisabled:true}]])await coordinator.rpc(()=>session.send(method,params));
     const blank=(await coordinator.rpc(()=>session.send('Page.getFrameTree'))).frameTree?.frame;
     if(!blank||blank.parentId||blank.url!=='about:blank')bad('article-main-frame');id(blank.id);id(blank.loaderId);
     const actualTarget=await coordinator.rpc(()=>session.send('Target.getTargetInfo'));id(actualTarget?.targetInfo?.targetId);
     local={url:c.url,frameId:blank.id,blankLoaderId:blank.loaderId,session,gate:createNativeArticleNetworkGate({dnsPins,caseUrl:c.url,frameId:blank.id}),until:clock()+20000,
      stopping:false,fatal:null,refusal:null,mainNetworkId:null,pausedMain:null,networkMain:null,responseStarted:false,responseContinued:false,
      provisional:null,journey:null,committed:null,dcl:null,resourceFailures:0,encodedBytes:0,events:0,socketBlocks:0,targetId:actualTarget.targetInfo.targetId,workers:new Set(),workerTargets:new Set()};current=local;
     const countEvent=()=>{if(++local.events>1024||++batchEvents>4096||++totalEvents>32768)bad('resource-event-capacity');};
     callbacks=createNativeArticleCallbacks({state:local,coordinator,guard:globalGuard,clock,countEvent,onFatal:e=>{local.fatal??=e;fail(e);}});
     for(const [event,callback]of [['Fetch.requestPaused',callbacks.paused],['Network.responseReceived',callbacks.response],['Network.loadingFailed',callbacks.loadingFailed],
      ['Network.dataReceived',callbacks.dataReceived],['Page.frameNavigated',callbacks.frameNavigated],['Page.lifecycleEvent',callbacks.lifecycle],['Page.frameDetached',callbacks.frameDetached]])session.on(event,callback);
     page.on('dialog',()=>fail(new NativeCaptureError('unexpected-dialog')));page.on('crash',()=>fail(new NativeCaptureError('page-crashed')));
     page.on('download',()=>fail(new NativeCaptureError('unexpected-download')));
     page.on('worker',observed=>{try{globalGuard();countEvent();if(local.stopping)bad('late-unknown-worker');local.workers.add(observed);
      observed.on('close',()=>local.workers.delete(observed));local.refusal??='restricted-rendering';}catch(e){fail(e);}});
     await coordinator.rpc(()=>session.send('Fetch.enable',{patterns:[{urlPattern:'http://*',requestStage:'Request'},{urlPattern:'https://*',requestStage:'Request'},
      {urlPattern:'https://*',resourceType:'Document',requestStage:'Response'}]}));fence(local);
     // This command may return after the response callback; callbacks must be
     // able to validate/continue independently, without awaiting this result.
     const navigation=await coordinator.rpc(()=>session.send('Page.navigate',{url:c.url}));fence(local);
     await waitFor(()=>Boolean(local.dcl&&local.committed&&local.responseContinued),local);callbacks.verifyNavigation(navigation);fence(local);
     if(local.dcl.at>local.until-2000)throw new ArticleUnavailable('article-unavailable');
     await pause(Math.max(0,local.dcl.at+2000-clock()));fence(local);
     const frame=async()=>{const tree=await coordinator.rpc(()=>session.send('Page.getFrameTree'));fence(local);const f=tree.frameTree?.frame;
      if(!f||f.id!==local.frameId||f.url!==c.url||f.loaderId!==navigation.loaderId)bad('current-frame-changed');};
     await frame();fence(local);
     const foreground=await coordinator.rpc(()=>worker.evaluate(async expected=>{
      const w=await chrome.windows.getLastFocused({populate:false}),tabs=await chrome.tabs.query({active:true,windowId:w.id});
      if(w.id!==expected.windowId||w.type!=='normal'||w.incognito||!w.focused||tabs.length!==1)return null;
      const t=tabs[0];if(!t.active||t.incognito||t.status!=='complete'||t.pendingUrl||t.url!==expected.url)return null;
      return {tabId:t.id,windowId:w.id};
     },{windowId:ownedWindow.id,url:c.url}));fence(local);if(!foreground)throw new ArticleUnavailable('foreground-changed');
     const nativeCommand={tabId:foreground.tabId,sourceUrl:c.url,documentUrl:c.url};
     const located=await workerCall('nativeDocumentRights','locate',nativeCommand);fence(local);
     if(located.schema!=='native-document-locator/v1'||located.tabId!==foreground.tabId||located.frameId!==0||located.sourceUrl!==c.url||located.documentUrl!==c.url)bad('native-locator-identity');id(located.documentId,128);
     const snapshotCommand={tabId:foreground.tabId,documentId:located.documentId,sourceUrl:c.url,documentUrl:c.url};
     let before;try{before=projectNativeDomPolicy({snapshot:await workerCall('nativeDocumentRights','snapshot',snapshotCommand),...snapshotCommand});}catch(e){if(e instanceof ArticleUnavailable)throw e;throw e;}fence(local);
     consumed=true;result=await workerCall('nativeReaderTransfer','observe',{studyId,studyRevision:sessionIdentity.studyRevision,caseId:c.id,ordinal:c.ordinal,observationNonce:nonce});fence(local);
     if(result.status==='unavailable')throw new ArticleUnavailable(result.reason==='context-changed'||result.reason==='foreground-unavailable'?'foreground-changed':'reader-unavailable');
     if(result.status!=='collected'||result.nativeWitness?.documentId!==located.documentId||result.nativeWitness.tabId!==foreground.tabId||result.nativeWitness.windowId!==ownedWindow.id||
      result.nativeWitness.studyId!==studyId||result.nativeWitness.studyRevision!==sessionIdentity.studyRevision||result.nativeWitness.observationNonce!==nonce)bad('native-document-mismatch');
     const after=projectNativeDomPolicy({snapshot:await workerCall('nativeDocumentRights','snapshot',snapshotCommand),...snapshotCommand});fence(local);
     // Actual APIs again after the final rights snapshot. No invented foreground
     // or document-ID success can fill this final publication boundary.
     const finalProof=await coordinator.rpc(()=>worker.evaluate(async expected=>{
      const w=await chrome.windows.getLastFocused({populate:false}),tabs=await chrome.tabs.query({active:true,windowId:w.id});
      if(w.id!==expected.windowId||w.type!=='normal'||w.incognito||!w.focused||tabs.length!==1)return null;
      const t=tabs[0];if(t.id!==expected.tabId||!t.active||t.incognito||t.status!=='complete'||t.pendingUrl||t.url!==expected.documentUrl)return null;
      if(!await chrome.permissions.contains({origins:[new URL(expected.sourceUrl).origin+'/*']}))return null;
      const located=await globalThis.nativeDocumentRights.locate({tabId:t.id,sourceUrl:expected.sourceUrl,documentUrl:expected.documentUrl});
      const finalWindow=await chrome.windows.getLastFocused({populate:false}),finalTabs=await chrome.tabs.query({active:true,windowId:finalWindow.id});
      if(finalWindow.id!==expected.windowId||finalWindow.type!=='normal'||finalWindow.incognito||!finalWindow.focused||finalTabs.length!==1||
       finalTabs[0].id!==expected.tabId||finalTabs[0].url!==expected.documentUrl||!finalTabs[0].active||finalTabs[0].incognito||finalTabs[0].status!=='complete'||finalTabs[0].pendingUrl)return null;
      return {tabId:t.id,windowId:w.id,documentId:located.documentId};
     },{...snapshotCommand,windowId:ownedWindow.id}));fence(local);
     if(!finalProof)throw new ArticleUnavailable('foreground-changed');
     if(finalProof.documentId!==located.documentId||finalProof.tabId!==foreground.tabId||finalProof.windowId!==ownedWindow.id)bad('final-native-document-changed');
     await frame();fence(local);
     const w=result.nativeWitness,rights=validateNativeRightsEvidence({caseId:c.id,ordinal:c.ordinal,nativeWitness:w,rightsEvidence:{schema:'native-reader-bracketed-rights/v1',
      caseId:c.id,ordinal:c.ordinal,studyId:w.studyId,studyRevision:w.studyRevision,observationNonce:w.observationNonce,eventEpoch:w.eventEpoch,documentId:w.documentId,tabId:w.tabId,windowId:w.windowId,
      sourceUrlHash:sha(w.sourceUrl),documentUrlHash:sha(w.documentUrl),originPolicyHash:hash(origin.receiptSha256),mainResponseJourney:local.journey,documentBefore:before,documentAfter:after,
      sameNativeDocument:true,httpNativeIdDirectlyCorrelated:false}});
     fence(local);publish({status:'collected',caseId:c.id,ordinal:c.ordinal,rawTitle:result.rawTitle,effectiveTitle:result.effectiveTitle,body:result.body,
      extractorVersion:result.extractorVersion,nativeWitness:w,rightsEvidence:rights});available++;
    }catch(e){globalGuard();if(e instanceof ArticleUnavailable){reason=e.reason;if(!consumed)await skip(c,nonce,reason);
      publish({status:'unavailable',caseId:c.id,ordinal:c.ordinal,reason});}else throw e;
    }finally{
     expectingPage=false;if(local){local.stopping=true;closeNativeArticleNetworkGate(local.gate);}
     if(page)await coordinator.rpc(()=>page.close({runBeforeUnload:false}));
     if(callbacks)await callbacks.drain();
     if(socketJobs.size)await Promise.all([...socketJobs]);
     if(local?.workerTargets.size){
      const remaining=await coordinator.rpc(()=>rootSession.send('Target.getTargets'));
      for(const target of list(field(remaining,'targetInfos'),128))if(['worker','shared_worker','service_worker'].includes(field(target,'type'))&&field(target,'url')!==workerUrl)bad('owned-worker-target-not-drained');
     }
     if(local?.workers.size)bad('owned-workers-not-drained');
     if(session)await coordinator.rpc(()=>session.detach());
     coordinator.assertDrained();if(local)batches.push({caseId:c.id,ordinal:c.ordinal,events:local.events,observedEncodedBytes:local.encodedBytes,socketBlocks:local.socketBlocks,network:describeNativeArticleNetworkGate(local.gate)});
     current=null;
    }
   }
  }
  globalGuard();await workerCall('nativeReaderTransfer','endStudy',{studyId,studyRevision:sessionIdentity.studyRevision});globalGuard();
  if(metadata.length!==32)bad('incomplete-cohort');finished=true;
 }catch(e){fail(e);throw failure;}finally{
  if(current){current.stopping=true;closeNativeArticleNetworkGate(current.gate);}
  try{await closePair();}catch(e){fail(e);}
 }
 globalGuard();coordinator.assertDrained();if(!finished)bad('incomplete-cohort');
 return frozen({schema:'native-browser-capture-summary/v1',accounted:32,available,unavailable:32-available,rows:metadata,cases:batches,
  policyRequests:totalPolicyRequests,resourceEvents:totalEvents,elapsedMs:clock()-started,cleanupSubmissions:cleanupIssued,
  browserCloseCompleted:true,physicalOperationsDrained:true,ownedAnchorTabs:1,maximumOwnedTabs:2,rawInputPersisted:false,
  restrictedNetworkRendering:true,ordinaryDynamicBrowserProducerValidated:false,completeOsEgressIsolation:false,nativeWriteAuthority:false,productionValidated:false,assignmentAuthority:false});
}
