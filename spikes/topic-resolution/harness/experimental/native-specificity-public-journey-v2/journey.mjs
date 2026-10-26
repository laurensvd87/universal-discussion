// ADR186 public rendezvous: bounded pre-fresh initial lifecycle quarantine only.
import {types} from 'node:util';
import {createHash} from 'node:crypto';
import {inspectPageUrl} from '../../../browser/core/page-content-policy.js';

export const FACTS=Object.freeze(['reply','commit','response','dcl','requestContinuation','responseContinuation','finished']);
export const IGNORED_LIFECYCLE=Object.freeze(['init','load','networkAlmostIdle','networkIdle','firstPaint','firstContentfulPaint','firstMeaningfulPaintCandidate','firstMeaningfulPaint','firstImagePaint','firstTextPaint']);
export const REPLAY_CATEGORIES=Object.freeze(['commit','DOMContentLoaded',...IGNORED_LIFECYCLE,'other-bounded']);
export const LIMITS=Object.freeze({events:4096,identityUnits:160,urlUnits:2048,retainedBytes:32768,reportBytes:8192,leaseMs:20000});
export const CODES=Object.freeze(['descriptor','identity','url','wrong-incarnation','retired','deadline','external-failure','event-capacity','before-dispatch','duplicate','reply-frame','reply-loader','error-text','download','commit-frame','commit-parent','commit-url','response-evidence','loader-contradiction','request-contradiction','lifecycle-frame','lifecycle-name','blank-loader','continuation-rejected','network-failed','missing-facts','storage-capacity']);
export class PublicJourneyError extends Error{constructor(code){super('Public article journey refused');this.code=code;}}
const bad=code=>{throw new PublicJourneyError(code);};
const identity=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9._:-]{1,160}$/u.test(v))bad('identity');return v;};
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&!Object.is(v,-0);
function fields(v,keys=null){
 if(!v||typeof v!=='object'||types.isProxy(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))bad('descriptor');
 const names=Reflect.ownKeys(v);if(names.length>24||keys&&(names.length!==keys.length||names.some(k=>!keys.includes(k))))bad('descriptor');
 const out=Object.create(null);for(const k of names){const d=Object.getOwnPropertyDescriptor(v,k);
  if(typeof k!=='string'||k.length>128||!d.enumerable||!Object.hasOwn(d,'value')||types.isProxy(d.value))bad('descriptor');out[k]=d.value;}return out;
}
const RESPONSE_KEYS=Object.freeze(['schema','finalUrlHash','status','frameId','loaderId','fetchRequestId','fetchResponseId','networkRequestId','requestUrlExact','ordinaryTlsSecure','selectedPublicPinMatched','pinHash','headerPolicyHash','navigationLoaderVerified','domPolicyRequiredSeparately','nativeDocumentIdDirectlyCorrelated']);
const sha=v=>createHash('sha256').update(v).digest('hex');
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const then=Promise.prototype.then;
function safeOriginalPromise(native){
 if(types.isProxy(native)||!types.isPromise(native)||Object.getPrototypeOf(native)!==Promise.prototype)return false;
 // Intrinsic then still consults constructor/species. Native prototype and
 // species are trusted realm intrinsics; no caller-owned hooks may participate.
 for(const key of Reflect.ownKeys(native)){const desc=Object.getOwnPropertyDescriptor(native,key);
  if(key==='constructor'||key==='then'||!desc||!Object.hasOwn(desc,'value'))return false;}
 return true;
}
function cleanupRejectedRegistration(native){
 // A supplied original may already be running/rejected when metadata fails.
 // This is NOT fact registration: discard both value/error, never execute any
 // journey action, and never claim physical work settled or slot reuse safe.
 try{if(safeOriginalPromise(native))then.call(native,()=>undefined,()=>undefined);}catch{}
}

/** Caller creates the absolute lease BEFORE setup. No callback resets it.
 * response() accepts the reviewed public gate DTO, not arbitrary raw headers.
 * This checks links, not the truth/authority of its caller's TLS/peer claims. */
export function createPublicJourney(options){
 const a=fields(options,['incarnation','frameId','blankLoaderId','url','until','guard','clock','onFailure']);
 const {incarnation,frameId,blankLoaderId,url,until,guard,clock,onFailure}=a;
 if(!incarnation||typeof incarnation!=='object'||types.isProxy(incarnation)||typeof guard!=='function'||typeof clock!=='function'||typeof onFailure!=='function')bad('descriptor');
 identity(frameId);identity(blankLoaderId);
 if(typeof url!=='string'||url.length>2048)bad('url');const policy=inspectPageUrl(url);
 if(!policy.supported||policy.url!==url||!url.startsWith('https://')||new URL(url).hash)bad('url');
 const now=clock();if(!finite(now)||!finite(until)||until<=now||until-now>20000)bad('deadline');
 const facts=Object.fromEntries(FACTS.map(k=>[k,null])),arrivals=Object.fromEntries(FACTS.map(k=>[k,0]));
 const observed=Object.fromEntries(['requestContinuation','responseContinuation'].map(k=>[k,null]));
 const ignored=Object.fromEntries(IGNORED_LIFECYCLE.map(k=>[k,0])),replay=Object.fromEntries(REPLAY_CATEGORIES.map(k=>[k,0]));
 let phase='prepared',events=0,order=0,failure=null,firstReport=null,lifecycleCandidate=null,blankLoaderMatch=null,resolve,reject;
 const ready=new Promise((yes,no)=>{resolve=yes;reject=no;});then.call(ready,undefined,()=>{});
 const seen=()=>Object.fromEntries(FACTS.map(k=>[k,facts[k]!==null]));
 function agreement(){const rows=['reply','commit','response','dcl'].map(k=>facts[k]).filter(Boolean);
  return {frameAgreement:rows.length?rows.every(r=>r.frame===frameId):null,loaderAgreement:rows.length>1?rows.every(r=>r.loader===rows[0].loader):null,
   freshLoaders:rows.length?rows.every(r=>r.loader!==blankLoaderId):null,quarantinedLifecyclePresent:lifecycleCandidate!==null,
   quarantinedLifecycleAgreement:lifecycleCandidate&&rows.length?rows.every(r=>r.loader===lifecycleCandidate):null};}
 function snapshot(){return Object.freeze({schema:'public-article-journey-report/v1',phase,code:failure?.code??null,events,seen:Object.freeze(seen()),
  arrivals:Object.freeze({...arrivals}),ignored:Object.freeze({...ignored}),initialReplay:Object.freeze({...replay}),blankLoaderMatch,...agreement()});}
 function stop(code){if(failure)throw failure;failure=new PublicJourneyError(CODES.includes(code)?code:'external-failure');firstReport=snapshot();reject(failure);
  try{const emitted=onFailure(failure);if(types.isPromise(emitted)&&!types.isProxy(emitted)){const handled=then.call(emitted,undefined,()=>{});then.call(handled,undefined,()=>{});}}catch{}throw failure;}
 function check(token){if(failure)throw failure;if(token!==incarnation)stop('wrong-incarnation');if(phase==='retired')stop('retired');
  let n;try{n=clock();}catch{stop('external-failure');}if(!finite(n)||n>=until)stop('deadline');try{guard();}catch{stop('external-failure');}
  if(failure)throw failure;try{n=clock();}catch{stop('external-failure');}if(!finite(n)||n>=until)stop('deadline');}
 function event(token){check(token);if(++events>4096)stop('event-capacity');}
 function parse(value,keys){try{return fields(value,keys);}catch{stop('descriptor');}}
 function id(v){try{return identity(v);}catch{stop('identity');}}
 function loader(v){id(v);if(v===blankLoaderId)stop('blank-loader');return v;}
 function dispatched(){if(phase==='prepared')stop('before-dispatch');}
 function retainedBytes(){
  // Logical retained record payload, not V8/native/Promise allocation. ASCII
  // identity slots/scalars charged conservatively; no nested caller DTO kept.
  let n=2048+frameId.length+blankLoaderId.length+2*url.length+(lifecycleCandidate?.length??0);
  for(const bucket of [facts,observed])for(const [key,row]of Object.entries(bucket)){n+=64+key.length;if(row)for(const [k,v]of Object.entries(row))n+=32+k.length+(typeof v==='string'?v.length:8);}
  for(const bucket of [arrivals,ignored,replay])for(const k of Object.keys(bucket))n+=32+k.length+8;
  if(firstReport)n+=8192;return n;
 }
 function compatible(){
  const rows=['reply','commit','response','dcl'].map(k=>facts[k]).filter(Boolean);
  if(rows.some(r=>r.loader!==rows[0].loader)||lifecycleCandidate&&rows.some(r=>r.loader!==lifecycleCandidate))stop('loader-contradiction');
  const r=facts.response;if(r){for(const k of ['requestContinuation','responseContinuation']){
   const v=observed[k];if(v&&(v.fetchId!==r[k==='requestContinuation'?'requestId':'responseId']||v.networkId!==r.networkId))stop('request-contradiction');}
   if(facts.finished&&facts.finished.networkId!==r.networkId)stop('request-contradiction');}
 }
 function add(kind,row){dispatched();if(facts[kind])stop('duplicate');facts[kind]=Object.freeze(row);arrivals[kind]=++order;compatible();
  if(retainedBytes()>32768)stop('storage-capacity');if(FACTS.every(k=>facts[k])){phase='resolved';resolve(Object.freeze({schema:'public-article-journey-ready/v1',allSevenFacts:true,rightsEstablished:false,nativeDocumentCorrelated:false}));}}
 function continuationMetadata(token,value){event(token);dispatched();const d=parse(value,['kind','fetchId','networkId']);
  if(typeof d.kind!=='string'||!['requestContinuation','responseContinuation'].includes(d.kind))stop('descriptor');id(d.fetchId);id(d.networkId);if(observed[d.kind])stop('duplicate');
  observed[d.kind]=Object.freeze({fetchId:d.fetchId,networkId:d.networkId});compatible();return d;}
 function rejected(){try{stop('continuation-rejected');}catch{}}
 function observe(token,d,native){
  if(!safeOriginalPromise(native))stop('descriptor');
  // CDP ACK payload is unused. Never forward an object into another Promise:
  // later hostile then getters on an already-fulfilled value must not execute.
  const result=then.call(native,()=>{event(token);add(d.kind,{settled:true});return undefined;},error=>{try{check(token);}catch{}rejected();throw error;});
  then.call(result,undefined,()=>{});return result;
 }
 return Object.freeze({
  begin(token){check(token);if(phase!=='prepared')stop('duplicate');phase='dispatched';},
  reply(token,value){event(token);dispatched();const d=parse(value);if(Object.hasOwn(d,'errorText'))stop('error-text');
   if(Object.hasOwn(d,'isDownload')&&d.isDownload!==false)stop('download');if(d.frameId!==frameId)stop('reply-frame');
   if(!Object.hasOwn(d,'loaderId'))stop('reply-loader');add('reply',{frame:frameId,loader:loader(d.loaderId)});},
  commit(token,value){event(token);dispatched();const d=parse(parse(value,['frame']).frame);
   if(Object.hasOwn(d,'parentId'))stop('commit-parent');if(d.id!==frameId)stop('commit-frame');if(d.url!==url)stop('commit-url');add('commit',{frame:frameId,loader:loader(d.loaderId)});},
  response(token,value){event(token);dispatched();const d=parse(value,RESPONSE_KEYS);
   if(d.schema!=='native-main-response-journey/v1'||d.finalUrlHash!==sha(url)||d.frameId!==frameId||!Number.isInteger(d.status)||d.status<200||d.status>=300||
    !hash(d.pinHash)||!hash(d.headerPolicyHash)||d.requestUrlExact!==true||d.ordinaryTlsSecure!==true||d.selectedPublicPinMatched!==true||
    ![false,true].includes(d.navigationLoaderVerified)||d.domPolicyRequiredSeparately!==true||d.nativeDocumentIdDirectlyCorrelated!==false)stop('response-evidence');
   id(d.fetchRequestId);id(d.fetchResponseId);id(d.networkRequestId);
   add('response',{frame:frameId,loader:loader(d.loaderId),requestId:d.fetchRequestId,responseId:d.fetchResponseId,networkId:d.networkRequestId});},
  lifecycle(token,value){blankLoaderMatch=null;event(token);const d=parse(value,['frameId','loaderId','name','timestamp']);id(d.frameId);id(d.loaderId);blankLoaderMatch=d.loaderId===blankLoaderId;
   if(d.frameId!==frameId)stop('lifecycle-frame');if(!finite(d.timestamp)||typeof d.name!=='string'||!/^[A-Za-z0-9._:-]{1,64}$/u.test(d.name))stop('descriptor');
   if(phase==='prepared'){if(!blankLoaderMatch)stop('before-dispatch');replay[REPLAY_CATEGORIES.includes(d.name)?d.name:'other-bounded']++;return;}
   if(phase==='dispatched'&&blankLoaderMatch&&IGNORED_LIFECYCLE.includes(d.name)&&
      facts.reply===null&&facts.commit===null&&facts.response===null&&facts.dcl===null&&lifecycleCandidate===null){replay[d.name]++;return;}
   if(blankLoaderMatch)stop('blank-loader');if(d.name==='DOMContentLoaded')add('dcl',{frame:frameId,loader:d.loaderId});
   else{if(!IGNORED_LIFECYCLE.includes(d.name))stop('lifecycle-name');ignored[d.name]++;if(lifecycleCandidate&&lifecycleCandidate!==d.loaderId)stop('loader-contradiction');lifecycleCandidate=d.loaderId;compatible();}},
  observeContinuation(token,value,native){try{const d=continuationMetadata(token,value);return observe(token,d,native);}
   catch(error){cleanupRejectedRegistration(native);throw error;}},
  invokeContinuation(token,value,action){const d=continuationMetadata(token,value);if(typeof action!=='function')stop('descriptor');let native;
   try{native=action();}catch(error){rejected();throw error;}
   try{return observe(token,d,native);}catch(error){cleanupRejectedRegistration(native);throw error;}},
  finished(token,value){event(token);const d=parse(value,['requestId','timestamp','encodedDataLength']);id(d.requestId);if(!finite(d.timestamp)||!finite(d.encodedDataLength)||!Number.isSafeInteger(d.encodedDataLength))stop('descriptor');add('finished',{networkId:d.requestId});},
  loadingFailed(token,value){event(token);dispatched();const d=parse(value,['requestId']);id(d.requestId);
   const expected=facts.response?.networkId??observed.requestContinuation?.networkId??observed.responseContinuation?.networkId??facts.finished?.networkId;
   if(!expected||d.requestId!==expected)stop('request-contradiction');stop('network-failed');},
  wait(token){check(token);dispatched();return ready;},
  assertComplete(token){check(token);if(phase!=='resolved')stop('missing-facts');return true;},
  retire(token){if(token!==incarnation)stop('wrong-incarnation');if(phase==='retired')stop('retired');
   if(failure){phase='retired';return Object.freeze({cleanupOnly:true,mayPublish:false});}check(token);if(phase!=='resolved')stop('missing-facts');phase='retired';return Object.freeze({cleanupOnly:false,mayPublish:false});},
  abort(){if(!failure)try{stop('external-failure');}catch{}},
  snapshot,failureReport:()=>firstReport,retainedBytes
 });
}
