// ADR172: bounded private facts, never model/rights/native-write authority.
import {types} from 'node:util';
export class JourneyError extends Error{constructor(code){super('Invented article journey refused');this.code=code;}}
export const fail=code=>{throw new JourneyError(code);};
export function fields(value){
 if(!value||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('descriptor');
 const keys=Reflect.ownKeys(value);if(keys.length>32)fail('descriptor');const copy=Object.create(null);
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||key.length>128||!d||!Object.hasOwn(d,'value')||types.isProxy(d.value))fail('descriptor');copy[key]=d.value;}return copy;
}
export function dense(value,max=128){if(types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max||Reflect.ownKeys(value).length!==value.length+1)fail('descriptor');return Array.from({length:value.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!Object.hasOwn(d,'value'))fail('descriptor');return d.value;});}
const identity=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9._:-]{1,160}$/u.test(v))fail('identity');return v;};
export const FACTS=Object.freeze(['reply','commit','response','dcl','fulfillment']);
// Literal diagnostic-only ignore set, not permissions or a source of authority.
export const IGNORED_LIFECYCLE=Object.freeze(['init','load','networkAlmostIdle','networkIdle','firstPaint','firstContentfulPaint','firstMeaningfulPaintCandidate','firstMeaningfulPaint','firstImagePaint','firstTextPaint']);
export const INITIAL_REPLAY_CATEGORIES=Object.freeze(['commit','DOMContentLoaded',...IGNORED_LIFECYCLE,'other-bounded']);
export const MAX_JOURNEY_BYTES=8192;
export const PREDICATES=Object.freeze(['descriptor','identity','wrong-incarnation','retired','deadline','event-capacity','before-dispatch','duplicate','reply-frame','reply-loader','error-text','download','commit-frame','commit-url','commit-parent','response-frame','response-url','response-status','response-type','lifecycle-name','lifecycle-frame','blank-loader','loader-contradiction','fulfillment-rejected','external-failure','missing-facts','storage-capacity']);
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&!Object.is(v,-0);
/** One five-fact promise. Candidate callbacks never choose the loader: all must
 * agree and the successful command reply is mandatory. No timers/native calls.
 * The caller's existing physical coordinator owns the SAME absolute lease. */
export function createJourney({incarnation,frameId,blankLoaderId,url,until,guard=()=>{},clock=()=>performance.now(),onFailure=()=>{},onReport=()=>{}}){
 if(!incarnation||typeof incarnation!=='object'||types.isProxy(incarnation)||!Number.isFinite(until))fail('descriptor');
 identity(frameId);identity(blankLoaderId);if(typeof url!=='string'||!/^http:\/\/127\.0\.0\.1:4173\/background-fixture\/adr168-article-[1-4]$/u.test(url))fail('descriptor');
 const facts=Object.fromEntries(FACTS.map(k=>[k,null])),arrivals=Object.fromEntries(FACTS.map(k=>[k,0])),ignored=Object.fromEntries(IGNORED_LIFECYCLE.map(k=>[k,0])),initialReplay=Object.fromEntries(INITIAL_REPLAY_CATEGORIES.map(k=>[k,0]));
 let phase='prepared',events=0,ignoredBlank=0,blankLoaderMatch=null,ignoredLoader=null,ordinal=0,failure=null,report=null,errorText='absent',download='absent',resolveReady,rejectReady,suppressNotification=false;
 const promise=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});promise.catch(()=>{});
 function seen(){return Object.fromEntries(FACTS.map(k=>[k,facts[k]!==null]));}
 function agreement(){const rows=FACTS.filter(k=>k!=='fulfillment'&&facts[k]!==null).map(k=>facts[k]);return {frameAgreement:rows.length>0?rows.every(r=>r.frame===frameId):null,loaderAgreement:rows.length>1?rows.every(r=>r.loader===rows[0].loader):null,freshLoaders:rows.length>0?rows.every(r=>r.loader!==blankLoaderId):null,quarantinedLifecyclePresent:ignoredLoader!==null,quarantinedLifecycleAgreement:ignoredLoader&&rows.length?rows.every(r=>r.loader===ignoredLoader):null};}
 function snapshot(predicate=null){return Object.freeze({schema:'native-article-retirement-predicates/v1',predicate,phase,seen:Object.freeze(seen()),arrivals:Object.freeze({...arrivals}),events,ignoredBlank,initialReplay:Object.freeze({...initialReplay}),blankLoaderMatch,ignored:Object.freeze({...ignored}),...agreement(),errorText,download});}
 function stop(code){
  if(failure)throw failure;const actual=PREDICATES.includes(code)?code:'external-failure';failure=new JourneyError(actual);
  report=snapshot(actual);rejectReady(failure);try{onReport(report);}catch{}if(!suppressNotification)try{onFailure(failure);}catch{}throw failure;
 }
 function check(token){if(failure)throw failure;if(token!==incarnation)stop('wrong-incarnation');if(phase==='retired')stop('retired');if(clock()>=until)stop('deadline');try{guard();}catch{stop('external-failure');}if(clock()>=until)stop('deadline');}
 function event(token){check(token);if(++events>4096)stop('event-capacity');}
 function bytes(){
  // Explicit logical accounting, NOT V8 heap: header/promise/closures1024,
  // ASCII field/key/value lengths,8-byte scalars and64-byte identity slot.
  let n=1024+64+frameId.length+blankLoaderId.length+url.length+(ignoredLoader?.length??0);
  for(const [key,row]of Object.entries(facts)){n+=32+key.length;if(row)for(const [k,v]of Object.entries(row))n+=k.length+(typeof v==='string'?v.length:8);}
  n+=Object.entries(ignored).reduce((sum,[k])=>sum+k.length+8,0)+Object.entries(arrivals).reduce((sum,[k])=>sum+k.length+8,0);
  n+=8+Object.entries(initialReplay).reduce((sum,[k])=>sum+k.length+8,0);
  if(report)n+=2048;return n;
 }
 function parseId(v){try{return identity(v);}catch{stop('identity');}}
 function loaded(loader){const id=parseId(loader);if(id===blankLoaderId)stop('blank-loader');return id;}
 function requireDispatched(){if(phase==='prepared')stop('before-dispatch');}
 function add(kind,row){requireDispatched();if(facts[kind]!==null)stop('duplicate');facts[kind]=Object.freeze(row);arrivals[kind]=++ordinal;
  const candidates=FACTS.filter(k=>k!=='fulfillment'&&facts[k]);if(candidates.length>1){const first=facts[candidates[0]].loader;if(candidates.some(k=>facts[k].loader!==first))stop('loader-contradiction');}
  if(ignoredLoader&&kind!=='fulfillment'&&row.loader!==ignoredLoader)stop('loader-contradiction');
  if(bytes()>MAX_JOURNEY_BYTES)stop('storage-capacity');
  if(FACTS.every(k=>facts[k]!==null)){phase='resolved';resolveReady(Object.freeze({schema:'native-article-retirement-ready/v1',frameVerified:true,freshLoaderVerified:true,allFiveFacts:true}));}
 }
 function input(value){try{return fields(value);}catch{stop('descriptor');}}
 return Object.freeze({
  begin(token){check(token);if(phase!=='prepared')stop('duplicate');phase='dispatched';},
  reply(token,value){event(token);const d=input(value);requireDispatched();
   errorText=Object.hasOwn(d,'errorText')?(d.errorText===undefined?'undefined':typeof d.errorText==='string'?(d.errorText.length?'nonempty':'empty'):'malformed'):'absent';
   download=Object.hasOwn(d,'isDownload')?(d.isDownload===false?'false':d.isDownload===true?'true':'malformed'):'absent';
   if(errorText!=='absent')stop('error-text');if(!['absent','false'].includes(download))stop('download');
   if(d.frameId!==frameId)stop('reply-frame');if(!Object.hasOwn(d,'loaderId'))stop('reply-loader');
   add('reply',{frame:frameId,loader:loaded(d.loaderId)});
  },
  commit(token,value,originalFailed=false){const previous=suppressNotification;suppressNotification=originalFailed===true;try{event(token);const f=input(input(value).frame);requireDispatched();if(Object.hasOwn(f,'parentId'))stop('commit-parent');if(f.id!==frameId)stop('commit-frame');if(f.url!==url)stop('commit-url');add('commit',{frame:frameId,loader:loaded(f.loaderId)});}finally{suppressNotification=previous;}},
  response(token,value){event(token);const d=input(value),r=input(d.response);requireDispatched();if(d.type!=='Document')stop('response-type');if(d.frameId!==frameId)stop('response-frame');if(r.url!==url)stop('response-url');if(r.status!==200||r.mimeType!=='text/html')stop('response-status');parseId(d.requestId);add('response',{frame:frameId,loader:loaded(d.loaderId)});},
  lifecycle(token,value){blankLoaderMatch=null;event(token);const d=input(value);const f=parseId(d.frameId),loader=parseId(d.loaderId);blankLoaderMatch=loader===blankLoaderId;
   if(f!==frameId)stop('lifecycle-frame');if(!finite(d.timestamp)||typeof d.name!=='string'||!/^[A-Za-z0-9._:-]{1,64}$/u.test(d.name))stop('descriptor');
   // Exact initial-document replay only; NEVER a navigation fact or candidate.
   if(phase==='prepared'){if(!blankLoaderMatch)stop('before-dispatch');ignoredBlank++;const category=INITIAL_REPLAY_CATEGORIES.includes(d.name)?d.name:'other-bounded';initialReplay[category]++;return;}
   if(blankLoaderMatch)stop('blank-loader');
   if(d.name!=='DOMContentLoaded'&&!IGNORED_LIFECYCLE.includes(d.name))stop('lifecycle-name');
   if(d.name==='DOMContentLoaded')add('dcl',{frame:frameId,loader});
   else{if(++ignored[d.name]>4096)stop('event-capacity');if(ignoredLoader&&ignoredLoader!==loader)stop('loader-contradiction');ignoredLoader=loader;const existing=FACTS.filter(k=>k!=='fulfillment'&&facts[k]);if(existing.some(k=>facts[k].loader!==loader))stop('loader-contradiction');}
  },
  fulfilled(token){event(token);add('fulfillment',{settled:true});},
  fulfillmentRejected(token){check(token);stop('fulfillment-rejected');},
  abort(code='external-failure'){if(failure)return;try{stop(PREDICATES.includes(code)?code:'external-failure');}catch{}},
  wait(token){check(token);requireDispatched();return promise;},
  assertReady(token){check(token);if(phase!=='resolved')stop('missing-facts');},
  retire(token){check(token);if(phase!=='resolved')stop('missing-facts');phase='retired';},
  snapshot:()=>snapshot(),failureReport:()=>report,retainedBytes:bytes
 });
}
/** Observe the REAL route.fulfill promise, never the transport's rejection-
 * swallowing drain wrapper. Abort never marks fulfillment. Original native
 * error wins any projection error; one native call per submitted action. */
export function observeFulfillment(route,journey,incarnation){
 return Object.freeze({request:()=>route.request(),abort:reason=>route.abort(reason),fulfill:args=>{
  let native;try{native=route.fulfill(args);}catch(error){try{journey.fulfillmentRejected(incarnation);}catch{}throw error;}
  return Promise.resolve(native).then(value=>{journey.fulfilled(incarnation);return value;},error=>{try{journey.fulfillmentRejected(incarnation);}catch{}throw error;});
 }});
}
export function recordCommit(owner,journey,incarnation,value){
 let originalFailed=false,additionalFailed=false,original,additional;
 try{owner.commit(value);}catch(error){originalFailed=true;original=error;}
 try{journey.commit(incarnation,value,originalFailed);}catch(error){additionalFailed=true;additional=error;}
 if(originalFailed)throw original;if(additionalFailed)throw additional;
}




