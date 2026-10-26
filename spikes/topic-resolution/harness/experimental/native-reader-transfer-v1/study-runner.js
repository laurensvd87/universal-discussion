// Pure injected ADR150 coordinator. Importing this module starts nothing.
// Capture/Job/source/asset implementations are trusted caller infrastructure;
// these datatype/hash links never recreate native or canonical authority.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {performance} from 'node:perf_hooks';
import {FIXED_CASES} from './native-adapter.js';
import {createTransientNativeCohort} from './phase-ledger.js';
import {validateNativeRightsEvidence} from './browser-capture.mjs';
import {validateNativeProducerProfile} from './producer-profile.js';
import {MODEL_ID,inputText} from '../../../browser/embedding/embedding-contract.js';
import {describeNativeRootRankCandidate,prepareNativeRootInput,classifyNativeRootRankCandidate}
 from '../../../../../apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js';

export const NATIVE_STUDY_LIMITS=Object.freeze({cases:32,roots:16,encoderCalls:64,modelPhaseMs:180000,
 resultBytes:524288,captureSummaryBytes:65536,dnsSummaryBytes:32768});
export class NativeRootStudyError extends Error{
 constructor(){super('Native root study failed');this.name='NativeRootStudyError';this.code='study-failed';}
}
const bad=()=>{throw new NativeRootStudyError();},sha=v=>createHash('sha256').update(v).digest('hex'),digest=v=>sha(JSON.stringify(v));
function record(v,keys){
 if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)bad();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out[k]=d.value;}return out;
}
function array(v,max){
 if(!v||typeof v!=='object'||types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype)bad();
 const n=Object.getOwnPropertyDescriptor(v,'length').value;if(n>max||Reflect.ownKeys(v).length!==n+1)bad();
 return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();return d.value;});
}
function id(v,max=253){if(typeof v!=='string'||!v.length||v.length>max||!v.isWellFormed()||v.trim()!==v||/[\u0000-\u001f\u007f]/u.test(v))bad();return v;}
function hash(v){if(typeof v!=='string'||!/^[a-f0-9]{64}$/u.test(v))bad();return v;}
function num(v,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(v)||v<0||v>max||Object.is(v,-0))bad();return v;}
function elapsed(v,max){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max)bad();return v;}
function fn(v){if(typeof v!=='function'||types.isProxy(v))bad();return v;}
function synchronous(v){if(types.isPromise(v)){Reflect.apply(Promise.prototype.then,v,[undefined,()=>{}]);bad();}return v;}
function frozen(v){if(v&&typeof v==='object'){for(const x of Object.values(v))frozen(x);Object.freeze(v);}return v;}
function safeMetadata(v,budget={left:8192,units:65536},depth=0){
 if(--budget.left<0||depth>12)bad();
 if(v===null||typeof v!=='object'){
  if(v!==null&&!['string','boolean','number'].includes(typeof v))bad();
  if(typeof v==='number'&&!Number.isFinite(v))bad();
  if(typeof v==='string'){if(v.length>2048||!v.isWellFormed()||/[\u0000-\u001f\u007f]/u.test(v)||v.includes('://'))bad();budget.units-=v.length;if(budget.units<0)bad();}
  return v;
 }
 if(types.isProxy(v))bad();if(Array.isArray(v))return array(v,128).map(x=>safeMetadata(x,budget,depth+1));
 if(Object.getPrototypeOf(v)!==Object.prototype)bad();const keys=Reflect.ownKeys(v);if(keys.length>128)bad();const out={};
 for(const k of keys){if(typeof k!=='string'||k.length>160||['body','title','rawTitle','effectiveTitle','bodyVector','titleVector','weights','sourceUrl','documentUrl'].includes(k))bad();
  const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();
  Object.defineProperty(out,k,{value:safeMetadata(d.value,budget,depth+1),enumerable:true,writable:true,configurable:true});}return out;
}
function boundedMetadata(v,bytes){const out=frozen(safeMetadata(v,{left:65536,units:bytes}));if(Buffer.byteLength(JSON.stringify(out))>bytes)bad();return out;}
function copiedCases(cases,goldCases,nodeIds){
 const c=array(cases,32).map((v,i)=>{const x=record(v,['id','ordinal','url']),fixed=FIXED_CASES[i];
  if(!fixed||x.id!==fixed.id||x.ordinal!==fixed.ordinal||x.url!==fixed.url)bad();return frozen(x);});
 if(c.length!==32)bad();
 const roots=new Map(),groups=new Set();
 const g=array(goldCases,32).map((v,i)=>{const x=record(v,['id','groupId','rootId','language','host']);Object.values(x).forEach(v=>id(v));
  if(x.id!==c[i]?.id||x.host!==new URL(c[i].url).hostname||!nodeIds.includes(x.rootId)||groups.has(x.groupId))bad();
  groups.add(x.groupId);roots.set(x.rootId,(roots.get(x.rootId)??0)+1);return frozen(x);});
 if(g.length!==32||roots.size!==16||[...roots.values()].some(n=>n!==2))bad();return {cases:frozen(c),gold:frozen(g)};
}
function captureSummary(value,admitted){
 const s=record(boundedMetadata(value,65536),['schema','accounted','available','unavailable','rows','cases','policyRequests','resourceEvents','elapsedMs','cleanupSubmissions',
  'browserCloseCompleted','physicalOperationsDrained','ownedAnchorTabs','maximumOwnedTabs','rawInputPersisted','restrictedNetworkRendering',
  'ordinaryDynamicBrowserProducerValidated','completeOsEgressIsolation','nativeWriteAuthority','productionValidated','assignmentAuthority']);
 if(s.schema!=='native-browser-capture-summary/v1'||s.accounted!==32||s.cleanupSubmissions!==2||s.ownedAnchorTabs!==1||s.maximumOwnedTabs!==2||
  s.browserCloseCompleted!==true||s.physicalOperationsDrained!==true||s.rawInputPersisted!==false||s.restrictedNetworkRendering!==true||
  s.ordinaryDynamicBrowserProducerValidated!==false||s.completeOsEgressIsolation!==false||s.nativeWriteAuthority!==false||s.productionValidated!==false||s.assignmentAuthority!==false)bad();
 num(s.available,32);num(s.unavailable,32);if(s.available+s.unavailable!==32||s.available!==admitted.filter(r=>r.status==='collected').length)bad();
 const rows=array(s.rows,32).map(r=>record(r,r.status==='collected'?
  ['caseId','ordinal','status','nativeWitnessHash','rightsEvidenceHash']:['caseId','ordinal','status','reason']));
 if(rows.length!==32||digest(rows)!==digest(admitted))bad();s.rows=rows;
 num(s.policyRequests,64);num(s.resourceEvents,32768);elapsed(s.elapsedMs,1650000);
 let previous=0;for(const item of array(s.cases,32)){
  const c=record(item,['caseId','ordinal','events','observedEncodedBytes','socketBlocks','network']);num(c.ordinal,32);
  if(c.ordinal<=previous||c.caseId!==FIXED_CASES[c.ordinal-1]?.id)bad();previous=c.ordinal;
  num(c.events,1024);num(c.observedEncodedBytes);num(c.socketBlocks,1024);
  // One incoming event can honestly overshoot the observational byte budget.
  // Preserve its safe-integer count; only its restricted unavailable row may
  // continue. This is not a hard wire cap or a clamped measurement.
  if(c.observedEncodedBytes>33554432){const r=admitted[c.ordinal-1];
   if(r?.status!=='unavailable'||r.reason!=='restricted-rendering')bad();}
  const n=record(c.network,['schema','events','blocked','mainAdmitted','responseAdmitted','navigationLoaderVerified','closed','restrictedNetworkRendering','unrestrictedBrowserParity','completeOsEgressIsolation']);
  if(n.schema!=='native-article-network-gate/v1'||n.closed!==true||n.restrictedNetworkRendering!==true||n.unrestrictedBrowserParity!==false||n.completeOsEgressIsolation!==false)bad();
  num(n.events,1024);for(const k of ['mainAdmitted','responseAdmitted','navigationLoaderVerified'])if(typeof n[k]!=='boolean')bad();
  if(!n.blocked||typeof n.blocked!=='object'||Array.isArray(n.blocked)||Object.keys(n.blocked).length>32)bad();for(const v of Object.values(n.blocked))num(v,1024);
 }return frozen(s);
}
function assess(gold,outcomes){
 const indices=gold.map((_,i)=>i),counts=subset=>{
  const accepted=subset.filter(i=>outcomes[i].decision?.supportedPath.length===1),correct=accepted.filter(i=>outcomes[i].decision.supportedPath[0]===gold[i].rootId).length;
  return {total:subset.length,available:subset.filter(i=>outcomes[i].status==='classified').length,assigned:accepted.length,correct,wrong:accepted.length-correct,unresolved:subset.length-accepted.length};
 },by=key=>Object.fromEntries([...new Set(gold.map(g=>g[key]))].sort().map(v=>[v,counts(indices.filter(i=>gold[i][key]===v))]));
 const total=counts(indices),byRoot=by('rootId'),passed=total.assigned>=24&&total.wrong===0&&Object.values(byRoot).every(r=>r.assigned>=1);
 const unavailableReasons=Object.fromEntries([...new Set(outcomes.filter(o=>o.status==='unavailable').map(o=>o.reason))].sort().map(reason=>[reason,outcomes.filter(o=>o.reason===reason).length]));
 return frozen({schema:'native-root-transfer-assessment/v1',distinctArticleGroups:32,statisticalIndependenceClaim:false,reobservation:true,
  evaluatedProducers:['native-browser-current'],...total,byRoot,byLanguage:by('language'),byHost:by('host'),unavailableReasons,
  conditionalOnAvailable:{denominator:total.available,assigned:total.assigned,correct:total.correct,wrong:total.wrong,unresolved:total.available-total.assigned,
   scope:'descriptive-condition-on-available-not-population-quality'},
  feasibilityGate:{minimumAccepted:24,maximumWrong:0,minimumAcceptedPerRoot:1,passed},
  unavailableIncludedInDenominator:true,conditionalAvailabilityIsPopulationQuality:false,childPredictionsEvaluated:false,unknownRootsTested:false,
  ordinaryDynamicBrowserProducerValidated:false,staticAssessed:false,crawlerTransferAssessed:false,productionValidated:false,assignmentAuthority:false});
}
/** Default-inert trusted composition only. Callbacks own bounded actual IO/Job
 * cancellation. Guards fence completion but do not forcibly interrupt hung work.
 * Successful packaged close() returns undefined; explicit false is failure. */
export async function runNativeRootStudy(input){
 let cohort=null,embedder=null,closeAttempted=false,captureOpen=false,closeForFailure=null;
 try{
  const a=record(input,['cases','goldCases','producerProfile','candidateHandle','studyId','resolveDns','capture','assertBrowserDrained','createEmbedder','recheckAssetsAndSources','guard','signal','onProgress']);
  for(const k of ['resolveDns','capture','assertBrowserDrained','createEmbedder','recheckAssetsAndSources','guard','onProgress'])fn(a[k]);id(a.studyId,160);
  const abortGetter=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get;
  if(!a.signal||types.isProxy(a.signal)||Object.getPrototypeOf(a.signal)!==AbortSignal.prototype)bad();
  const profile=validateNativeProducerProfile(a.producerProfile),identity=describeNativeRootRankCandidate(a.candidateHandle);
  if(identity.nodeIds.length!==16||digest(identity.targetProfiles)!==digest([profile])||identity.bodyWeight!==.75||identity.titleWeight!==.25)bad();
  const {cases,gold}=copiedCases(a.cases,a.goldCases,identity.nodeIds),timings={resolveDnsMs:0,captureMs:0,browserDrainAckMs:0,encoderCreateMs:0,embeddingMs:0,encoderCloseMs:0,endcheckMs:0,modelPhaseMs:0,classificationMs:0,classificationPerCallMs:[]};
  let modelUntil=null;const check=()=>{if(Reflect.apply(abortGetter,a.signal,[])||(modelUntil!==null&&performance.now()>modelUntil))bad();synchronous(a.guard());};
  const progress=(stage,accounted)=>{check();synchronous(a.onProgress(frozen({stage,accounted})));check();};
  const invoke=async(action)=>{check();const value=await action();check();return value;};
  const admitted=[];
  cohort=createTransientNativeCohort({cases,producerProfileHash:profile.producerProfileHash,admitAvailable:row=>{
   check();const rights=validateNativeRightsEvidence({caseId:row.case.id,ordinal:row.case.ordinal,nativeWitness:row.nativeWitness,rightsEvidence:row.rightsEvidence});
   if(row.nativeWitness.studyId!==a.studyId)bad();
   const prepared=prepareNativeRootInput(a.candidateHandle,{sourceId:row.case.id,sourceVersion:row.nativeWitness.observationNonce,
    producerId:profile.producerId,producerProfileHash:profile.producerProfileHash,inputConstructionHash:profile.inputConstructionHash,
    extractorVersion:row.extractorVersion,fieldBindings:row.fieldBindings,nativeWitness:row.nativeWitness,rightsEvidenceHash:digest(rights)});
   check();return {inputIdentity:prepared.sourceInputHash,evidence:prepared};
  }});
  progress('dns',0);let started=performance.now();const dns=record(await invoke(()=>a.resolveDns()),['dnsPins','summary']);
  timings.resolveDnsMs=performance.now()-started;const dnsSummary=boundedMetadata(dns.summary,32768);
  progress('capture',0);started=performance.now();captureOpen=true;let summary;
  const captureCases=frozen(cases.map((c,i)=>({...c,groupId:gold[i].groupId,language:gold[i].language})));
  try{summary=await invoke(()=>a.capture({dnsPins:dns.dnsPins,cases:captureCases,studyId:a.studyId,guard:check,signal:a.signal,onRow:row=>{
   check();if(!captureOpen)bad();
   if(!row||typeof row!=='object'||types.isProxy(row)||Object.getPrototypeOf(row)!==Object.prototype)bad();
   const descriptor=Object.getOwnPropertyDescriptor(row??{},'status');if(!descriptor||!Object.hasOwn(descriptor,'value'))bad();
   if(descriptor.value==='collected'){
    const r=record(row,['status','caseId','ordinal','rawTitle','effectiveTitle','body','extractorVersion','nativeWitness','rightsEvidence']);
    inputText(r.body);inputText(r.effectiveTitle);
    cohort.available({caseId:r.caseId,ordinal:r.ordinal,rawTitle:r.rawTitle,effectiveTitle:r.effectiveTitle,body:r.body,extractorVersion:r.extractorVersion,nativeWitness:r.nativeWitness,rightsEvidence:r.rightsEvidence});
    admitted.push({caseId:r.caseId,ordinal:r.ordinal,status:r.status,nativeWitnessHash:digest(r.nativeWitness),rightsEvidenceHash:digest(r.rightsEvidence)});
   }else{
    const r=record(row,['status','caseId','ordinal','reason']);if(r.status!=='unavailable')bad();
    cohort.unavailable({caseId:r.caseId,ordinal:r.ordinal,reason:r.reason,inputIdentity:digest({schema:'native-unavailable-evaluation-only/v1',
     studyId:a.studyId,producerProfileHash:profile.producerProfileHash,caseId:r.caseId,ordinal:r.ordinal,reason:r.reason})});
    admitted.push({caseId:r.caseId,ordinal:r.ordinal,status:r.status,reason:r.reason});
   }
   progress('capture',admitted.length);
  }}));}finally{captureOpen=false;}
  timings.captureMs=performance.now()-started;const captured=captureSummary(summary,admitted),finished=cohort.finishCapture();
  progress('captured',32);const modelStarted=performance.now();modelUntil=modelStarted+180000;
  const closeOnce=async()=>{
   if(closeAttempted)return true;closeAttempted=true;if(!embedder)return true;
   const t=performance.now();try{const result=await embedder.close();if(result!==undefined&&result!==true)bad();return true;}
   finally{timings.encoderCloseMs+=performance.now()-t;}
  };
  // Store trusted cleanup before the first creation attempt; outer catch also
  // uses it after a successful creation if any later callback fails.
  closeForFailure=closeOnce;
  const encoded=await cohort.encodeAfterBrowserDrain({
   assertBrowserDrained:async()=>{const t=performance.now();const proof=frozen({captureHash:finished.captureHash,accounted:32,
    available:finished.available,producerProfileHash:profile.producerProfileHash});
    const result=await invoke(()=>a.assertBrowserDrained(proof));timings.browserDrainAckMs=performance.now()-t;if(result!==true)bad();return true;},
   embed:async text=>{
    check();if(!embedder){const t=performance.now(),created=record(await a.createEmbedder(),['modelId','embed','close']);
     embedder=created;fn(created.embed);fn(created.close);check();if(created.modelId!==MODEL_ID)bad();timings.encoderCreateMs=performance.now()-t;}
    const t=performance.now();const result=record(await invoke(()=>embedder.embed(inputText(text))),['modelId','values']);timings.embeddingMs+=performance.now()-t;
    if(result.modelId!==MODEL_ID)bad();return result.values;
   },
   closeEncoder:async()=>{const result=await closeOnce();check();return result;},
   recheckAssetsAndSources:async()=>{const t=performance.now();const result=await invoke(()=>a.recheckAssetsAndSources());timings.endcheckMs=performance.now()-t;if(result!==true)bad();return true;}
  });
  timings.modelPhaseMs=performance.now()-modelStarted;check();progress('classification',32);
  const classified=cohort.assess(row=>{
   check();const t=performance.now(),decision=classifyNativeRootRankCandidate(a.candidateHandle,{...row.evidence,bodyVector:row.bodyVector,titleVector:row.titleVector});
   timings.classificationPerCallMs.push(performance.now()-t);check();return decision;
  });
  timings.classificationMs=timings.classificationPerCallMs.reduce((n,x)=>n+x,0);check();
  const outcomes=classified.results.map(row=>row.status==='unavailable'?{caseId:row.id,ordinal:row.ordinal,status:'unavailable',reason:row.reason,
   inputIdentity:row.inputIdentity,inputIdentityScope:'evaluation-only-not-captured-Source-proof',decision:null}:
   {caseId:row.id,ordinal:row.ordinal,status:'classified',reason:null,inputIdentity:row.inputIdentity,decision:row.decision});
  const assessment=assess(gold,outcomes);progress('complete',32);
  return boundedMetadata({schema:'native-root-study-result/v1',status:'complete',studyId:a.studyId,producerId:profile.producerId,producerProfileHash:profile.producerProfileHash,
   transferHash:identity.transferHash,dns:dnsSummary,capture:captured,captureHash:finished.captureHash,encoderCalls:encoded.encoderCalls,modelId:MODEL_ID,
   outcomes,assessment,timings,rawInputPersisted:false,rawInputRetained:false,vectorInputsPersisted:false,semanticTextIndependentlyReconstructable:false,
   reobservation:true,statisticalIndependenceClaim:false,ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false},524288);
 }catch{
  if(cohort)try{cohort.abandon();}catch{}
  if(closeForFailure)try{await closeForFailure();}catch{}
  throw new NativeRootStudyError();
 }
}
