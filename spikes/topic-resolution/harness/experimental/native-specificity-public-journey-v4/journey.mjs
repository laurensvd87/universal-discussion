// ADR212: unchanged rendezvous; preflighted lossless lazy first-report storage.
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


const REPORT_KEYS=Object.freeze(['schema','phase','code','events','seen','arrivals','ignored','initialReplay','blankLoaderMatch','frameAgreement','loaderAgreement','freshLoaders','quarantinedLifecyclePresent','quarantinedLifecycleAgreement']);
const REPORT_PHASES=Object.freeze(['prepared','dispatched','resolved','retired']);
const REPORT_TRIS=Object.freeze(['blankLoaderMatch','frameAgreement','loaderAgreement','freshLoaders','quarantinedLifecyclePresent','quarantinedLifecycleAgreement']);
function reportRecord(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))bad('descriptor');
 const names=Reflect.ownKeys(value);if(names.length!==keys.length)bad('descriptor');
 for(let i=0;i<keys.length;i++){const d=Object.getOwnPropertyDescriptor(value,keys[i]);if(names[i]!==keys[i]||!d||!d.enumerable||!Object.hasOwn(d,'value')||types.isProxy(d.value))bad('descriptor');}
 return value;
}
function reportInteger(value,max){if(!Number.isSafeInteger(value)||value<0||Object.is(value,-0)||value>max)bad('descriptor');return value;}
function reportTri(value){if(value!==null&&value!==false&&value!==true)bad('descriptor');return value===null?0:value?2:1;}
/** Pure metadata codec; valid caller data is not evidence of native capture. */
export function packJourneyFailureReport(value){
 reportRecord(value,REPORT_KEYS);
 if(value.schema!=='public-article-journey-report/v1'||!REPORT_PHASES.includes(value.phase)||!CODES.includes(value.code))bad('descriptor');
 reportInteger(value.events,4097);reportRecord(value.seen,FACTS);reportRecord(value.arrivals,FACTS);reportRecord(value.ignored,IGNORED_LIFECYCLE);reportRecord(value.initialReplay,REPLAY_CATEGORIES);
 for(const k of FACTS){if(typeof value.seen[k]!=='boolean')bad('descriptor');reportInteger(value.arrivals[k],4096);}
 for(const k of IGNORED_LIFECYCLE)reportInteger(value.ignored[k],4096);
 for(const k of REPLAY_CATEGORIES)reportInteger(value.initialReplay[k],4096);
 for(const k of REPORT_TRIS)reportTri(value[k]);if(typeof value.quarantinedLifecyclePresent!=='boolean')bad('descriptor');
 const packet=new Uint16Array(40);packet[0]=1+REPORT_PHASES.indexOf(value.phase);packet[1]=1+CODES.indexOf(value.code);packet[2]=value.events;
 for(let i=0;i<7;i++){if(value.seen[FACTS[i]])packet[3]|=1<<i;packet[4+i]=value.arrivals[FACTS[i]];}
 for(let i=0;i<10;i++)packet[11+i]=value.ignored[IGNORED_LIFECYCLE[i]];
 for(let i=0;i<13;i++)packet[21+i]=value.initialReplay[REPLAY_CATEGORIES[i]];
 for(let i=0;i<6;i++)packet[34+i]=reportTri(value[REPORT_TRIS[i]]);
 return packet;
}
function validateJourneyPacket(packet){
 if(types.isProxy(packet)||!types.isUint16Array(packet)||Object.getPrototypeOf(packet)!==Uint16Array.prototype)bad('descriptor');
 {const names=Reflect.ownKeys(packet);if(names.length!==40)bad('descriptor');for(let i=0;i<40;i++){const d=Object.getOwnPropertyDescriptor(packet,String(i));if(names[i]!==String(i)||!d||!d.enumerable||!Object.hasOwn(d,'value'))bad('descriptor');}}
 if(Object.getPrototypeOf(packet.buffer)!==ArrayBuffer.prototype||Reflect.ownKeys(packet.buffer).length!==0||packet.buffer.resizable||packet.buffer.byteLength!==80||packet.byteOffset!==0||packet.byteLength!==80||packet.length!==40)bad('descriptor');
 if(packet[0]<1||packet[0]>4||packet[1]<1||packet[1]>CODES.length||packet[2]>4097||packet[3]>127)bad('descriptor');
 for(let i=4;i<34;i++)if(packet[i]>4096)bad('descriptor');
 for(let i=34;i<40;i++)if(packet[i]>2||i===38&&packet[i]===0)bad('descriptor');
}
/** Validation key arrays end before sequential report construction begins. */
export function unpackJourneyFailureReport(packet){
 validateJourneyPacket(packet);
 const tri=i=>packet[i]===0?null:packet[i]===2;
 return Object.freeze({schema:'public-article-journey-report/v1',phase:REPORT_PHASES[packet[0]-1],code:CODES[packet[1]-1],events:packet[2],
  seen:Object.freeze(Object.fromEntries(FACTS.map((k,i)=>[k,Boolean(packet[3]&(1<<i))]))),
  arrivals:Object.freeze(Object.fromEntries(FACTS.map((k,i)=>[k,packet[4+i]]))),
  ignored:Object.freeze(Object.fromEntries(IGNORED_LIFECYCLE.map((k,i)=>[k,packet[11+i]]))),
  initialReplay:Object.freeze(Object.fromEntries(REPLAY_CATEGORIES.map((k,i)=>[k,packet[21+i]]))),
  blankLoaderMatch:tri(34),frameAgreement:tri(35),loaderAgreement:tri(36),freshLoaders:tri(37),quarantinedLifecyclePresent:tri(38),quarantinedLifecycleAgreement:tri(39)});
}

/** Caller creates the absolute lease BEFORE setup. No callback resets it.
 * response() accepts the reviewed public gate DTO, not arbitrary raw headers.
 * This checks links, not the truth/authority of its caller's TLS/peer claims. */
export function createPublicJourney(options){
 const a=fields(options);const optionKeys=['incarnation','frameId','blankLoaderId','url','until','guard','clock','onFailure'];
 if(optionKeys.some(k=>!Object.hasOwn(a,k))||Object.keys(a).some(k=>!optionKeys.includes(k)&&k!=='reportPreflight'))bad('descriptor');
 const {incarnation,frameId,blankLoaderId,url,until,guard,clock,onFailure}=a;
 if(!incarnation||typeof incarnation!=='object'||types.isProxy(incarnation)||typeof guard!=='function'||typeof clock!=='function'||typeof onFailure!=='function')bad('descriptor');
 identity(frameId);identity(blankLoaderId);
 if(typeof url!=='string'||url.length>2048)bad('url');const policy=inspectPageUrl(url);
 if(!policy.supported||policy.url!==url||!url.startsWith('https://')||new URL(url).hash)bad('url');
 const reportPreflight=Object.hasOwn(a,'reportPreflight')?a.reportPreflight:null;
 if(reportPreflight!==null&&(typeof reportPreflight!=='function'||types.isProxy(reportPreflight)))bad('descriptor');
 const now=clock();if(!finite(now)||!finite(until)||until<=now||until-now>20000)bad('deadline');
 const facts=Object.fromEntries(FACTS.map(k=>[k,null])),arrivals=Object.fromEntries(FACTS.map(k=>[k,0]));
 const observed=Object.fromEntries(['requestContinuation','responseContinuation'].map(k=>[k,null]));
 const ignored=Object.fromEntries(IGNORED_LIFECYCLE.map(k=>[k,0])),replay=Object.fromEntries(REPLAY_CATEGORIES.map(k=>[k,0]));
 let phase='prepared',events=0,order=0,failure=null,firstReport=null,firstPacket=null,reportState='absent',reportNotifying=false,lifecycleCandidate=null,blankLoaderMatch=null,resolve,reject;
 const ready=new Promise((yes,no)=>{resolve=yes;reject=no;});then.call(ready,undefined,()=>{});
 const seen=()=>Object.fromEntries(FACTS.map(k=>[k,facts[k]!==null]));
 function agreement(){const rows=['reply','commit','response','dcl'].map(k=>facts[k]).filter(Boolean);
  return {frameAgreement:rows.length?rows.every(r=>r.frame===frameId):null,loaderAgreement:rows.length>1?rows.every(r=>r.loader===rows[0].loader):null,
   freshLoaders:rows.length?rows.every(r=>r.loader!==blankLoaderId):null,quarantinedLifecyclePresent:lifecycleCandidate!==null,
   quarantinedLifecycleAgreement:lifecycleCandidate&&rows.length?rows.every(r=>r.loader===lifecycleCandidate):null};}
 function snapshot(){return Object.freeze({schema:'public-article-journey-report/v1',phase,code:failure?.code??null,events,seen:Object.freeze(seen()),
  arrivals:Object.freeze({...arrivals}),ignored:Object.freeze({...ignored}),initialReplay:Object.freeze({...replay}),blankLoaderMatch,...agreement()});}
 function unavailableReport(){firstReport=null;firstPacket=null;reportState='unavailable';}
 function failureReport(){
  if(reportState==='absent')return null;
  if(reportState==='unavailable')throw failure;
  if(reportState==='building'||reportState==='materializing'){unavailableReport();throw failure;}
  if(reportState==='materialized')return firstReport;
  reportState='materializing';
  try{
   if(retainedBytes()>32768)throw failure;
   let view=unpackJourneyFailureReport(firstPacket);
   if(reportState!=='materializing'){view=null;throw failure;}
   firstReport=view;view=null;firstPacket=null;reportState='materialized';return firstReport;
  }catch{unavailableReport();throw failure;}
 }
 function stop(code){
  if(failure)throw failure;
  let chosenCode=CODES.includes(code)?code:'external-failure',firstPhase=phase,firstBlank=blankLoaderMatch;
  failure=new PublicJourneyError(chosenCode);reportState='building';reportNotifying=true;
  try{
   if(retainedBytes()>32768)throw failure;
   if(reportPreflight!==null&&reportPreflight()!==undefined)throw failure;
   if(reportState!=='building')throw failure;
   let captured=Object.freeze({schema:'public-article-journey-report/v1',phase:firstPhase,code:chosenCode,events,seen:Object.freeze(seen()),
    arrivals:Object.freeze({...arrivals}),ignored:Object.freeze({...ignored}),initialReplay:Object.freeze({...replay}),blankLoaderMatch:firstBlank,...agreement()});
   if(reportState!=='building'){captured=null;throw failure;}
   firstPacket=packJourneyFailureReport(captured);captured=null;
   if(reportState!=='building')throw failure;
   reportState='compact';
  }catch{unavailableReport();}
  chosenCode=undefined;firstPhase=undefined;firstBlank=undefined;
  reportNotifying=true;reject(failure);
  try{const emitted=onFailure(failure);if(types.isPromise(emitted)&&!types.isProxy(emitted)){const handled=then.call(emitted,undefined,()=>{});then.call(handled,undefined,()=>{});}}catch{}
  reportNotifying=false;throw failure;
 }
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
  let n=2048+128+(reportPreflight===null?0:128)+frameId.length+blankLoaderId.length+2*url.length+(lifecycleCandidate?.length??0);
  // The closed private row constructors use exactly these seven literal fields.
  // No temporary key/entry list, iterator, callback or roster is retained here.
  for(let b=0;b<2;b++){
   const bucket=b===0?facts:observed;
   for(let i=0;i<(b===0?7:2);i++){
    const key=FACTS[b===0?i:i+4],row=bucket[key];n+=64+key.length;
    if(row)for(let k=0;k<7;k++){
     const field=k===0?'frame':k===1?'loader':k===2?'requestId':k===3?'responseId':k===4?'networkId':k===5?'settled':'fetchId';
     if(Object.hasOwn(row,field)){const value=row[field];n+=32+field.length+(typeof value==='string'?value.length:8);}
    }
   }
  }
  for(let b=0;b<3;b++){
   const keys=b===0?FACTS:b===1?IGNORED_LIFECYCLE:REPLAY_CATEGORIES;
   for(let i=0;i<keys.length;i++)n+=32+keys[i].length+8;
  }
  if(reportState==='unavailable')n+=8192;
  else if(reportNotifying||reportState==='building'||reportState==='materializing')n+=7168;
  else if(reportState==='materialized')n+=4096;
  else if(reportState==='compact')n+=208;
  return n;
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
  abort(){if(arguments.length===1&&arguments[0]==='phase-failed'){if(!failure){failure=new PublicJourneyError('external-failure');reject(failure);}return;}if(!failure)try{stop('external-failure');}catch{}},
  snapshot,failureReport,retainedBytes
 });
}

