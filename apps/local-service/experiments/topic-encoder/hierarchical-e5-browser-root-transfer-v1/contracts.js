// ADR148 browser-only pure evidence contracts. Hashes are links, not native authority.
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {BATCHES,record,dense,hash,freeze,digest,sha,validateProducerProfile,validateInputPacket,validatePriorBatch,
 validateFullDocumentWitness,projectScorerInputWitness,deriveDocumentIdentity} from '../../../../../spikes/topic-resolution/harness/browser-root-transfer-v1/manifest.js';
import {encodingAvailability,compactRootDecision,vectorBitHash,validateRootFitEvidence as trustedValidateRootFitEvidence} from '../hierarchical-e5-current-producer-transfer-evaluation-v2/contracts.js';
import {parseVectorPacket} from './vector-packet.js';
import {assessBrowserRootTransfer} from './methods.js';
export {encodingAvailability,compactRootDecision,vectorBitHash,digest,sha};
export const LIMITS=freeze({batches:8,articlesPerBatch:4,maxProducerRows:32,maxEncoderCalls:64,dimensions:384,inputPacketBytes:131072,
 metadataBytes:65536,vectorPacketBytes:262144,assessmentBytes:262144,headCoordinateProducts:196608,rankComparisons:2048,fusionCoordinateVisits:98304});
const MIB=1048576,byteLengthGetter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'length').get;
function bytes(value,max){
 assert.ok(value&&typeof value==='object'&&!types.isProxy(value)&&Buffer.isBuffer(value)&&Object.getPrototypeOf(value)===Buffer.prototype);
 const n=Reflect.apply(byteLengthGetter,value,[]);assert.ok(n>0&&n<=max&&Reflect.ownKeys(value).length===n);return Buffer.from(value);
}
export function parseBoundedJson(value,max=65536){assert.ok(Number.isSafeInteger(max)&&max>0&&max<=262144);return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes(value,max)));}
function copy(value,b={items:131072,chars:1048576},depth=0){
 assert.ok(--b.items>=0&&depth<=20);
 if(value===null||typeof value!=='object'){
  assert.ok(value===null||['number','string','boolean'].includes(typeof value));
  if(typeof value==='number')assert.ok(Number.isFinite(value));
  if(typeof value==='string'){assert.ok(value.isWellFormed()&&value.length<=8192);b.chars-=value.length;assert.ok(b.chars>=0);}return value;
 }
 assert.ok(!types.isProxy(value));if(Array.isArray(value))return dense(value,128).map(v=>copy(v,b,depth+1));
 assert.equal(Object.getPrototypeOf(value),Object.prototype);const out={};
 for(const key of Reflect.ownKeys(value)){assert.equal(typeof key,'string');const d=Object.getOwnPropertyDescriptor(value,key);assert.ok(d?.enumerable&&Object.hasOwn(d,'value'));
  b.chars-=key.length;assert.ok(b.chars>=0);Object.defineProperty(out,key,{value:copy(d.value,b,depth+1),enumerable:true,writable:true,configurable:true});}return out;
}
const equal=(a,b)=>assert.deepEqual(a,b),field=(a,k,v)=>assert.equal(a[k],v);
function sourceMap(value){const out=copy(value);assert.ok(Object.keys(out).length>0&&Object.keys(out).length<=256);for(const [k,v]of Object.entries(out)){assert.ok(k.length<=512);hash(v);}return out;}
function boundedNumber(n,max){assert.ok(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max);}
export function validateRootFitEvidence(input){
 const a=record(input,['freezeBytes','sourceHashes','selectionReceiptBytes','supervisorBytes','selectionBytes','modelBytes','policyBytes','inputDefinitionBytes']),out={};
 for(const k of Object.keys(a))out[k]=k==='sourceHashes'?sourceMap(a[k]):bytes(a[k],k==='modelBytes'||k==='selectionBytes'?262144:k==='inputDefinitionBytes'?16384:65536);
 return trustedValidateRootFitEvidence(out);
}
export function validateFreeze(value,schema,expectedSources){
 const f=copy(value),{freezeHash,...body}=f;hash(freezeHash);field(f,'schema',schema);equal(sourceMap(f.sourceHashes),sourceMap(expectedSources));assert.equal(digest(body),freezeHash);return freeze(f);
}
function successfulSupervisor(s,{schema,phase,batch,freezeSha256,sourceHashes,resultSha256}){
 for(const [k,v]of Object.entries({schema,phase,batch,reason:null,exitCode:0,cleanupReason:null,emergencyOwnJobTermination:false,ownTreeCleanupConfirmed:true,
  sourceHashesRechecked:true,freezeSha256,resultSha256,jobMemoryLimitBytes:1536*MIB}))field(s,k,v);
 equal(s.sourceHashes,sourceHashes);boundedNumber(s.elapsedSeconds,180);
 for(const k of ['sampledPeakTreeRssBytes','sampledPeakTreePrivateBytes']){assert.ok(Number.isSafeInteger(s[k]));boundedNumber(s[k],1536*MIB);}
}
const UNAVAILABLE=new Set(['origin-policy-timeout','origin-policy-http-refused','origin-policy-malformed','origin-policy-budget','origin-policy-unavailable','origin-robots-denied','origin-tdm-reserved',
 'origin-transport-unavailable','origin-representation-unavailable','article-timeout','article-http-refused','article-redirect-refused','article-transport-capacity',
 'page-header-restricted','page-header-malformed','document-response-refused','document-dom-restricted','document-dom-capacity','document-identity-unavailable','reader-unsupported',
 'browser-transport-unavailable']);
/** All eight complete metadata pairs are mandatory before a caller grants body access. */
export function validateCaptureCompletion(input){
 const a=record(input,['captureFreeze','captureFreezeSha256','sourceHashes','artifactReuseReceiptSha256','artifactReuseReceiptHash','transferHash','profileRecipeHash','oldSelectionReceiptSha256','cases','batches']);
 const sources=sourceMap(a.sourceHashes),f=validateFreeze(a.captureFreeze,'browser-root-transfer-freeze/v1',sources);hash(a.captureFreezeSha256);
 for(const k of ['artifactReuseReceiptSha256','artifactReuseReceiptHash','transferHash','profileRecipeHash','oldSelectionReceiptSha256'])hash(a[k]);field(f,'artifactReuseReceiptSha256',a.artifactReuseReceiptSha256);
 const profiles=dense(f.targetProfiles,2).map(validateProducerProfile);equal(profiles.map(p=>p.producerId),['current-static','browser-current']);const profile=profiles[1];
 const cases=dense(copy(a.cases),32).map(c=>record(c,['id','groupId','url','language']));assert.equal(cases.length,32);equal(cases.map(c=>c.id),BATCHES.flat());
 for(const c of cases)for(const k of Object.keys(c))assert.ok(typeof c[k]==='string'&&c[k].length>0&&c[k].length<=2048);
 assert.equal(new Set(cases.map(c=>c.groupId)).size,32);assert.equal(new Set(cases.map(c=>c.url)).size,32);
 const batches=dense(a.batches,8);assert.equal(batches.length,8);const out=[];
 batches.forEach((raw,i)=>{
  const b=record(raw,['batch','resultBytes','supervisorBytes']);field(b,'batch',i+1);
  const resultBytes=bytes(b.resultBytes,65536),supervisorBytes=bytes(b.supervisorBytes,65536),r=parseBoundedJson(resultBytes),s=parseBoundedJson(supervisorBytes),scope=cases.slice(i*4,i*4+4);
  hash(r.packetSha256);validatePriorBatch({batch:i+1,freezeHash:f.freezeHash,freezeSha256:a.captureFreezeSha256,sourceHashes:sources,result:r,supervisor:s,packetSha256:r.packetSha256,resultSha256:sha(resultBytes)});
  successfulSupervisor(s,{schema:'browser-root-transfer-supervisor/v1',phase:'browser-only',batch:i+1,freezeSha256:a.captureFreezeSha256,sourceHashes:sources,resultSha256:sha(resultBytes)});
  for(const [k,v]of Object.entries({artifactReuseReceiptSha256:a.artifactReuseReceiptSha256,artifactReuseReceiptHash:a.artifactReuseReceiptHash,transferHash:a.transferHash,
   profileRecipeHash:a.profileRecipeHash,reobservation:true,independentCohort:false,noOldInputSplice:true,originalStaticProfileUnchanged:true,networkRequestIdCorrelated:false,
   browserProducerScope:'restricted-single-document-dom-reader/v1',ordinaryDynamicBrowserProducerValidated:false,noNativeAttestation:true,noModelCalls:true,noCanonicalWrites:true,
   productionValidated:false,assignmentAuthority:false}))field(r,k,v);
  equal(r.evaluatedProducers,['browser-current']);equal(r.unexercisedProducers,['current-static']);equal(r.producerProfile,profile);field(s,'packetSha256',r.packetSha256);
  boundedNumber(r.policyElapsedMs,60000);boundedNumber(r.navigationMs,80000);boundedNumber(r.elapsedMs,180000);
  for(const [k,max]of [['peakCoordinatorPending',128],['resourceEvents',4096],['policyRequests',8]]){assert.ok(Number.isSafeInteger(r[k]));boundedNumber(r[k],max);}
  field(s,'ownedOutputByteLimit',512*MIB);field(s,'ownedOutputEntryLimit',8192);
  for(const [k,max]of [['sampledPeakOwnedOutputBytes',512*MIB],['sampledPeakOwnedOutputEntries',8192]]){assert.ok(Number.isSafeInteger(s[k]));boundedNumber(s[k],max);}
  const results=dense(r.cases,4).map(v=>record(v,v.status==='collected'?['id','status','reason','capture','documentWitness','responseWitness','pagePolicyHash','sourceInputHash']:
   Object.hasOwn(v,'readerReason')?['id','status','reason','readerReason']:['id','status','reason']));assert.equal(results.length,4);results.forEach((v,j)=>{
   field(v,'id',scope[j].id);assert.ok(['collected','unavailable'].includes(v.status));
   if(v.status==='unavailable'){assert.ok(UNAVAILABLE.has(v.reason));assert.ok(!Object.hasOwn(v,'capture'));
    if(Object.hasOwn(v,'readerReason')){field(v,'reason','reader-unsupported');assert.ok(['document-mismatch','missing-region','capture-budget','rights-restricted','invalid-content','capture-time-budget','capture-node-budget','capture-head-budget','capture-attribute-budget','capture-failed'].includes(v.readerReason));}}
   else {field(v,'reason',null);hash(v.sourceInputHash);const c=record(v.capture,['titleCharacters','titleSha256','bodyCharacters','bodySha256','extractorVersion']);
    for(const k of ['titleSha256','bodySha256'])hash(c[k]);assert.ok(Number.isSafeInteger(c.titleCharacters));boundedNumber(c.titleCharacters,200);
    assert.ok(Number.isSafeInteger(c.bodyCharacters)&&c.bodyCharacters>=1);boundedNumber(c.bodyCharacters,4096);assert.ok(profile.extractorVersions.includes(c.extractorVersion));
    const d=validateFullDocumentWitness(v.documentWitness);field(d,'finalUrlHash',sha(scope[j].url));equal(v.responseWitness,d.response);
    const incarnation=deriveDocumentIdentity({id:v.id,batch:i+1,freezeHash:f.freezeHash,frameId:d.frameId,loaderId:d.loaderId});field(d,'documentId',incarnation.sourceIncarnation);field(d,'navigationId',incarnation.navigationId);
    field(v,'pagePolicyHash',digest({schema:'browser-root-page-policy/v1',responseWitnessHash:d.responseWitnessHash,domWitnessHash:d.domWitnessHash}));}
  });
  field(r,'collected',results.filter(v=>v.status==='collected').length);
  equal(r.priorEvidence,out.map(p=>({batch:p.batch,resultSha256:p.resultSha256,supervisorSha256:p.supervisorSha256,packetSha256:p.packetSha256})));
  out.push({batch:i+1,resultSha256:sha(resultBytes),supervisorSha256:sha(supervisorBytes),packetSha256:r.packetSha256,producerProfile:profile,cases:scope,
   results,collectedIds:results.filter(v=>v.status==='collected').map(v=>v.id)});
 });
 return freeze({schema:'browser-root-transfer-evaluation-capture-completion/v1',captureFreezeHash:f.freezeHash,captureFreezeSha256:a.captureFreezeSha256,
  candidateSha256:f.candidateSha256,labelSealSha256:f.labelSealSha256,artifactReuseReceiptSha256:a.artifactReuseReceiptSha256,artifactReuseReceiptHash:a.artifactReuseReceiptHash,
  transferHash:a.transferHash,profileRecipeHash:a.profileRecipeHash,oldSelectionReceiptSha256:a.oldSelectionReceiptSha256,batches:out,all8Complete:true,
  reobservation:true,untouchedIndependentCohort:false,noOldInputSplice:true,ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false});
}
export function validateCapturedPacket(value,completion,batch){
 const c=copy(completion);field(c,'all8Complete',true);assert.ok(Number.isInteger(batch)&&batch>=1&&batch<=8);const e=c.batches[batch-1],buffer=bytes(value,131072);field(e,'batch',batch);assert.equal(sha(buffer),e.packetSha256);
 return validateInputPacket(parseBoundedJson(buffer,131072),{phase:'browser-only',batch,freezeHash:c.captureFreezeHash,freezeSha256:c.captureFreezeSha256,
  candidateSha256:c.candidateSha256,labelSealSha256:c.labelSealSha256,artifactReuseReceiptSha256:c.artifactReuseReceiptSha256,producerProfile:e.producerProfile,cases:e.cases,collectedIds:e.collectedIds,outcomes:e.results});
}
export function unavailableEvaluationMarker(captureFreezeHash,batch,id,reason,resultSha256){
 hash(captureFreezeHash);hash(resultSha256);assert.ok(Number.isInteger(batch)&&batch>=1&&batch<=8&&BATCHES[batch-1].includes(id));assert.ok(UNAVAILABLE.has(reason));
 return digest({schema:'browser-root-transfer-unavailable-evaluation-only/v1',captureFreezeHash,batch,id,reason,resultSha256});
}
export function makeEncodingPlan(input){
 const a=record(input,['completion','batch','inputPacketBytes']),completion=copy(a.completion),packet=validateCapturedPacket(a.inputPacketBytes,completion,a.batch),e=completion.batches[a.batch-1];
 const rows=e.cases.map(c=>{
  const saved=e.results.find(v=>v.id===c.id),captured=packet.rows.find(v=>v.id===c.id),available=captured?encodingAvailability(captured):{available:false,reason:saved.reason};
  return {id:c.id,producerId:'browser-current',captureStatus:saved.status,encodingAvailable:available.available,reason:available.reason,
   sourceInputHash:captured?.sourceInputHash??null,inputIdentity:captured?.sourceInputHash??unavailableEvaluationMarker(completion.captureFreezeHash,a.batch,c.id,saved.reason,e.resultSha256),
   bodySha256:captured?.bodySha256??null,titleSha256:captured?.titleSha256??null,envelopeHash:captured?.envelopeHash??null,
   scorerWitness:captured?projectScorerInputWitness(captured,e.producerProfile):null};
 });
 return freeze({schema:'browser-root-transfer-evaluation-encoding-plan/v1',batch:a.batch,captureCompletionHash:digest(completion),artifactReuseReceiptSha256:completion.artifactReuseReceiptSha256,
  transferHash:completion.transferHash,oldSelectionReceiptSha256:completion.oldSelectionReceiptSha256,inputPacketSha256:sha(bytes(a.inputPacketBytes,131072)),rows,
  expectedEncoderCalls:rows.filter(v=>v.encodingAvailable).length*2,ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false});
}
export function validateEncodingReceipt(receipt,plan,freezeHash,encoderHash){
 const p=copy(plan),r=record(copy(receipt),['schema','freezeHash','encoderHash','batch','captureCompletionHash','inputPacketSha256','rows','encoderCalls','vectorPacketSha256','artifactReuseReceiptSha256',
  'transferHash','oldSelectionReceiptSha256','reobservation','untouchedIndependentCohort','noOldInputSplice','sourceHashesRechecked','timings','ordinaryDynamicBrowserProducerValidated','productionValidated','assignmentAuthority']);
 hash(freezeHash);hash(encoderHash);field(p,'schema','browser-root-transfer-evaluation-encoding-plan/v1');assert.ok(Number.isInteger(p.batch)&&p.batch>=1&&p.batch<=8);
 const rows=dense(p.rows,4);assert.equal(rows.length,4);equal(rows.map(r=>r.id),BATCHES[p.batch-1]);
 rows.forEach(r=>{field(r,'producerId','browser-current');assert.equal(typeof r.encodingAvailable,'boolean');assert.ok(['collected','unavailable'].includes(r.captureStatus));if(r.captureStatus==='unavailable')field(r,'encodingAvailable',false);});
 field(p,'expectedEncoderCalls',rows.filter(r=>r.encodingAvailable).length*2);
 for(const [k,v]of Object.entries({schema:'browser-root-transfer-evaluation-encoding-receipt/v1',freezeHash,encoderHash,batch:p.batch,
  captureCompletionHash:p.captureCompletionHash,inputPacketSha256:p.inputPacketSha256,encoderCalls:p.expectedEncoderCalls,artifactReuseReceiptSha256:p.artifactReuseReceiptSha256,
  transferHash:p.transferHash,oldSelectionReceiptSha256:p.oldSelectionReceiptSha256,reobservation:true,untouchedIndependentCohort:false,noOldInputSplice:true,
  sourceHashesRechecked:true,ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false}))field(r,k,v);
 equal(r.rows,p.rows);hash(r.vectorPacketSha256);const timings=record(r.timings,['initializationMs','encodingMs','totalChildMs']);for(const n of Object.values(timings))boundedNumber(n,180000);
 assert.ok(Number.isSafeInteger(r.encoderCalls)&&r.encoderCalls>=0&&r.encoderCalls<=8);return freeze(r);
}
export function captureAdmissionReceipt(input){
 const a=record(input,['freezeHash','freezeFileSha256','sourceHashes','completion']),c=copy(a.completion);hash(a.freezeHash);hash(a.freezeFileSha256);field(c,'all8Complete',true);
 return freeze({schema:'browser-root-transfer-evaluation-capture-admission/v1',freezeHash:a.freezeHash,freezeFileSha256:a.freezeFileSha256,sourceHashes:sourceMap(a.sourceHashes),captureCompletionHash:digest(c),
  artifactReuseReceiptSha256:c.artifactReuseReceiptSha256,artifactReuseReceiptHash:c.artifactReuseReceiptHash,transferHash:c.transferHash,oldSelectionReceiptSha256:c.oldSelectionReceiptSha256,
  all8Complete:true,reobservation:true,untouchedIndependentCohort:false,noOldInputSplice:true,ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false});
}
export function validateCaptureAdmissionProof(input){
 const a=record(input,['expectedReceipt','receiptBytes','supervisorBytes']),r=parseBoundedJson(a.receiptBytes),s=parseBoundedJson(a.supervisorBytes);equal(r,copy(a.expectedReceipt));
 successfulSupervisor(s,{schema:'browser-root-transfer-evaluation-supervisor/v1',phase:'admit-captures',batch:null,freezeSha256:r.freezeFileSha256,sourceHashes:r.sourceHashes,resultSha256:sha(bytes(a.receiptBytes,65536))});
 return freeze({receiptSha256:sha(bytes(a.receiptBytes,65536)),supervisorSha256:sha(bytes(a.supervisorBytes,65536))});
}
export function validateEncodingBatchProof(input){
 const a=record(input,['freezeHash','freezeFileSha256','sourceHashes','encoderHash','plan','metadata']);hash(a.freezeHash);hash(a.freezeFileSha256);hash(a.encoderHash);
 const sources=sourceMap(a.sourceHashes),plan=copy(a.plan),b=record(a.metadata,['batch','receiptBytes','supervisorBytes']);field(b,'batch',plan.batch);
 const receiptBytes=bytes(b.receiptBytes,65536),receipt=validateEncodingReceipt(parseBoundedJson(receiptBytes),plan,a.freezeHash,a.encoderHash),s=parseBoundedJson(b.supervisorBytes);
 successfulSupervisor(s,{schema:'browser-root-transfer-evaluation-supervisor/v1',phase:'encode-batch',batch:plan.batch,freezeSha256:a.freezeFileSha256,sourceHashes:sources,resultSha256:sha(receiptBytes)});
  field(s,'receiptSha256',sha(receiptBytes));field(s,'vectorPacketSha256',receipt.vectorPacketSha256);
 return freeze({...receipt,receiptSha256:sha(receiptBytes),supervisorSha256:sha(bytes(b.supervisorBytes,65536))});
}
export function validateAllEncodingMetadata(input){
 const a=record(input,['freezeHash','freezeFileSha256','sourceHashes','encoderHash','plans','batches']),plans=dense(copy(a.plans),8),batches=dense(a.batches,8);
 assert.equal(plans.length,8);assert.equal(batches.length,8);let calls=0;
 const receipts=batches.map((metadata,i)=>{field(plans[i],'batch',i+1);const receipt=validateEncodingBatchProof({freezeHash:a.freezeHash,freezeFileSha256:a.freezeFileSha256,sourceHashes:a.sourceHashes,encoderHash:a.encoderHash,plan:plans[i],metadata});calls+=receipt.encoderCalls;return receipt;});assert.ok(calls<=64);
 return freeze({schema:'browser-root-transfer-evaluation-eight-encoding-completion/v1',freezeHash:a.freezeHash,encoderHash:a.encoderHash,receipts,encoderCalls:calls,all8Complete:true,
  ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false});
}
export function summarizeDecisionWork(outcomes){
 const sum={headDotProducts:0,headScalarProducts:0,rankComparisonWork:0,fusionCoordinateVisitUpperBound:0};
 for(const row of dense(copy(outcomes),32))if(row.inputAvailable){const w=record(row.decision.work,Object.keys(sum));
  assert.ok(w.headDotProducts<=16&&w.headScalarProducts===w.headDotProducts*384&&w.rankComparisonWork<=64&&w.fusionCoordinateVisitUpperBound===3072);
  for(const key of Object.keys(sum)){assert.ok(Number.isSafeInteger(w[key])&&w[key]>=0);sum[key]+=w[key];}}
 assert.ok(sum.headDotProducts<=512&&sum.headScalarProducts<=196608&&sum.rankComparisonWork<=2048&&sum.fusionCoordinateVisitUpperBound<=98304);return freeze(sum);
}
/** Saved evidence audit, not numerical model re-execution or capture attestation. */
export function assessEvidenceLinkedOutcomes(input){
 const a=record(input,['cases','plans','outcomes','transferIdentity','encodingCompletion','vectorPacketBytes']),cases=dense(copy(a.cases),32),plans=dense(copy(a.plans),8),outcomes=dense(copy(a.outcomes),32),identity=copy(a.transferIdentity),encoded=copy(a.encodingCompletion);
 assert.equal(cases.length,32);assert.equal(plans.length,8);assert.equal(outcomes.length,32);equal(cases.map(c=>c.id),BATCHES.flat());
 field(identity,'schema','builder-scoped-root-rank-candidate/v1');field(identity,'productionValidated',false);field(identity,'assignmentAuthority',false);
 const {transferHash,...body}=identity;hash(transferHash);assert.equal(digest(body),transferHash);const nodeIds=dense(identity.nodeIds,16);assert.equal(new Set(nodeIds).size,16);
 field(encoded,'schema','browser-root-transfer-evaluation-eight-encoding-completion/v1');field(encoded,'all8Complete',true);assert.equal(dense(encoded.receipts,8).length,8);hash(encoded.freezeHash);field(encoded,'encoderHash',identity.encoderHash);
 let totalCalls=0;encoded.receipts.forEach((r,i)=>{const {receiptSha256,supervisorSha256,...receipt}=r;hash(receiptSha256);hash(supervisorSha256);
  validateEncodingReceipt(receipt,plans[i],encoded.freezeHash,encoded.encoderHash);totalCalls+=receipt.encoderCalls;});assert.ok(totalCalls<=64);field(encoded,'encoderCalls',totalCalls);
 const vectors=dense(a.vectorPacketBytes,8).map((value,i)=>{const b=bytes(value,262144);assert.equal(sha(b),encoded.receipts[i].vectorPacketSha256);const v=parseVectorPacket(b);
  field(v,'freezeHash',encoded.freezeHash);field(v,'encoderHash',encoded.encoderHash);return v;});assert.equal(vectors.length,8);
 plans.forEach((p,i)=>{field(p,'batch',i+1);field(p,'transferHash',transferHash);field(vectors[i],'batch',i+1);field(vectors[i],'inputPacketSha256',p.inputPacketSha256);
  equal(p.rows.map(r=>r.id),BATCHES[i]);equal(vectors[i].rows.map(r=>r.id),p.rows.filter(r=>r.encodingAvailable).map(r=>r.id));});
 const expected=plans.flatMap(p=>p.rows);const checked=outcomes.map((raw,i)=>{
  const r=record(raw,['id','producerId','captureStatus','inputAvailable','reason','sourceInputHash','inputIdentity','bodySha256','titleSha256','envelopeHash','selectedRootId','decision','classificationMs']),p=expected[i];
  for(const k of ['id','producerId','captureStatus','reason','sourceInputHash','inputIdentity','bodySha256','titleSha256','envelopeHash'])field(r,k,p[k]);field(r,'inputAvailable',p.encodingAvailable);
  if(!r.inputAvailable){field(r,'selectedRootId',null);field(r,'decision',null);field(r,'classificationMs',null);}
  else {boundedNumber(r.classificationMs,180000);const d=r.decision;field(d,'schema','current-producer-transfer-compact-root-decision/v2');field(d,'originalSchema','builder-scoped-root-rank-transfer-decision/v1');
   field(d,'transferHash',transferHash);field(d,'productionValidated',false);field(d,'assignmentAuthority',false);field(d,'experimental',true);field(d,'developmentOnly',true);field(d,'transferValidationStatus','unvalidated');equal(d.witness,p.scorerWitness);
   const v=vectors[Math.floor(i/4)].rows.find(v=>v.id===p.id);for(const k of ['sourceInputHash','bodySha256','titleSha256'])field(v,k,p[k]);
   const vectorBindings={encoding:'ieee754-binary64-little-endian/384/v1',bodyVectorHash:v.bodyVectorHash,titleVectorHash:v.titleVectorHash};equal(d.vectorBindings,vectorBindings);
   field(d,'semanticWitnessHash',digest({schema:'builder-scoped-root-rank-semantic-witness/v1',transferHash,witness:p.scorerWitness,vectorBindings}));
   const path=dense(d.supportedPath,1);assert.ok(!path.length||nodeIds.includes(path[0]));field(r,'selectedRootId',path[0]??null);field(d,'status',path.length?'candidate':'unresolved');
  }return r;
 });
 const assessment=assessBrowserRootTransfer({cases,predictions:checked.map(r=>({id:r.id,inputAvailable:r.inputAvailable,inputIdentity:r.inputIdentity,selectedRootId:r.selectedRootId,unavailableReason:r.inputAvailable?null:r.reason}))});
 return freeze({schema:'browser-root-transfer-evaluation-evidence-linked-assessment/v1',assessment,work:summarizeDecisionWork(checked),classificationReexecuted:false,
  reobservation:true,untouchedIndependentCohort:false,noOldInputSplice:true,statisticalIndependenceClaim:false,ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false});
}
