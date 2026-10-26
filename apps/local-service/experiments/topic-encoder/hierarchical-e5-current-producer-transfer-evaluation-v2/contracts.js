// Pure ADR145 fixed-artifact reobservation contracts. Hashes are not runtime/native authority.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {inputText} from '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
import {BATCHES,validateProducerProfile,validateInputPacket,record,dense,hash,freeze,digest,sha} from '../../../../../spikes/topic-resolution/harness/current-producer-final-v2/manifest.js';
import {assessCurrentProducerTransfer} from '../hierarchical-e5-current-producer-transfer-v1/methods.js';
export {digest,sha};
export const LIMITS=freeze({batches:8,articlesPerBatch:4,maxProducerRows:64,maxEncoderCalls:128,dimensions:384,
 inputPacketBytes:131072,metadataBytes:65536,vectorPacketBytes:262144,assessmentBytes:262144,
 headCoordinateProducts:393216,rankComparisons:4096,fusionCoordinateVisits:196608});
export const PRODUCERS=Object.freeze(['current-static','browser-current']);
const phases=['static','browser'];
const CAPTURE_UNAVAILABLE=new Set(['origin-policy-timeout','origin-policy-http-refused','origin-policy-malformed','origin-policy-budget',
 'origin-robots-denied','origin-tdm-reserved','article-timeout','article-http-refused','article-redirect-refused','article-transport-capacity',
 'page-header-restricted','page-header-malformed','static-policy-parse-unavailable','static-insufficient-text','static-rights-ineligible',
 'fresh-origin-ineligible','document-response-refused','document-dom-restricted','document-dom-capacity','document-identity-unavailable','reader-unsupported',
 'origin-transport-unavailable','article-transport-unavailable','origin-representation-unavailable','article-representation-unavailable','browser-transport-unavailable']);
const equal=(a,b)=>assert.deepEqual(a,b);
function json(bytes,max){
 assert.ok(!types.isProxy(bytes)&&Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=max);
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export function parseBoundedJson(bytes,max=65536){return json(bytes,max);}
function dataField(v,key){
 assert.ok(v&&typeof v==='object'&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Object.prototype);
 const d=Object.getOwnPropertyDescriptor(v,key);assert.ok(d?.enumerable&&Object.hasOwn(d,'value'));return d.value;
}
function field(v,key,expected){assert.equal(dataField(v,key),expected);}
export function validateFreeze(value,schema,expectedSources){
 const material={};assert.ok(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype);
 for(const k of Reflect.ownKeys(value)){assert.equal(typeof k,'string');if(k!=='freezeHash')material[k]=dataField(value,k);}
 hash(dataField(value,'freezeHash'));field(value,'schema',schema);equal(dataField(value,'sourceHashes'),expectedSources);
 assert.equal(digest(material),value.freezeHash);return value;
}
export function validateRootFitEvidence(input){
 const a=record(input,['freezeBytes','sourceHashes','selectionReceiptBytes','supervisorBytes','selectionBytes','modelBytes','policyBytes','inputDefinitionBytes']);
 const frozen=validateFreeze(json(a.freezeBytes,65536),'current-producer-root-fit-freeze/v1',a.sourceHashes);
 const selection=json(a.selectionReceiptBytes,65536),supervisor=json(a.supervisorBytes,65536),report=json(a.selectionBytes,262144);
 field(selection,'schema','current-producer-root-selection/v1');field(selection,'phase','selected-before-final-transfer');
 assert.ok(Number.isInteger(selection.selectedIndex)&&selection.selectedIndex>=0&&selection.selectedIndex<3);
 assert.equal(selection.bodyWeight,[.5,.75,.25][selection.selectedIndex]);assert.equal(selection.titleWeight,1-selection.bodyWeight);
 field(selection,'lambda',.1);field(selection,'inputView','current-static');
 for(const k of ['trainingInputConstructionHash','eligibleCohortHash','eligibilityReceiptSha256','calibrationGoldSha256','modelJsonHash','policyHash',
  'transferHash','sourceBindingsHash','candidateSha256','labelSealSha256','encoderHash','representationHash'])hash(dataField(selection,k));
 const targetProfiles=dense(selection.targetProfiles,2).map(validateProducerProfile);equal(targetProfiles.map(p=>p.producerId),PRODUCERS);
 for(const [k,v]of [['finalTestEvaluated',false],['productionValidated',false],['assignmentAuthority',false],['freezeHash',frozen.freezeHash],
  ['freezeFileSha256',sha(a.freezeBytes)],['protocolSha256',frozen.protocolSha256],['selectionSha256',sha(a.selectionBytes)],
  ['selectedModelSha256',sha(a.modelBytes)],['selectedPolicySha256',sha(a.policyBytes)],['selectedInputDefinitionSha256',sha(a.inputDefinitionBytes)]])field(selection,k,v);
 field(supervisor,'schema','current-producer-root-fit-supervisor/v1');field(supervisor,'phase','fit-current');
 for(const [k,v]of [['reason',null],['exitCode',0],['cleanupReason',null],['ownTreeCleanupConfirmed',true],['sourceHashesRechecked',true],
  ['freezeSha256',sha(a.freezeBytes)],['resultSha256',sha(a.selectionReceiptBytes)]])field(supervisor,k,v);
 equal(supervisor.sourceHashes,a.sourceHashes);assert.ok(supervisor.elapsedSeconds<=180);
 field(report,'schema','current-producer-root-fit-report/v1');field(report,'freezeHash',frozen.freezeHash);field(report,'selectedIndex',selection.selectedIndex);
 const model=json(a.modelBytes,262144),policy=json(a.policyBytes,65536),definition=json(a.inputDefinitionBytes,16384);
 assert.equal(digest(model),selection.modelJsonHash);assert.equal(policy.policyHash,selection.policyHash);assert.equal(policy.modelHash,selection.modelJsonHash);
 assert.equal(definition.bodyWeight,selection.bodyWeight);assert.equal(definition.titleWeight,selection.titleWeight);assert.equal(definition.encoderHash,selection.encoderHash);
 assert.equal(model.representationHash,selection.representationHash);assert.equal(policy.representationHash,selection.representationHash);
 assert.equal(model.trainingVersion,frozen.freezeHash+'|'+selection.bodyWeight);
 assert.equal(model.lambda,.1);assert.equal(policy.inputConstructionHash,selection.trainingInputConstructionHash);assert.equal(policy.enabled,true);
 return freeze({selection,model,policy,inputDefinition:definition,selectionReceiptSha256:sha(a.selectionReceiptBytes),fitFreezeSha256:sha(a.freezeBytes),fitSupervisorSha256:sha(a.supervisorBytes)});
}
/** Metadata only: callers must complete this gate before ANY input.packet.json read. */
export function validateCaptureCompletion(input){
 const a=record(input,['captureFreeze','captureFreezeSha256','sourceHashes','artifactReuseReceiptSha256','artifactReuseReceiptHash','transferHash','profileRecipeHash','oldSelectionReceiptSha256','cases','batches']);
 const f=validateFreeze(a.captureFreeze,'current-producer-final-freeze/v2',a.sourceHashes);hash(a.captureFreezeSha256);
 for(const k of ['artifactReuseReceiptSha256','artifactReuseReceiptHash','transferHash','profileRecipeHash','oldSelectionReceiptSha256'])hash(a[k]);
 field(f,'artifactReuseReceiptSha256',a.artifactReuseReceiptSha256);
 const cases=dense(a.cases,32);equal(cases.map(c=>dataField(c,'id')),BATCHES.flat());
 const profiles=dense(f.targetProfiles,2).map(validateProducerProfile);equal(profiles.map(p=>p.producerId),PRODUCERS);
 const batches=dense(a.batches,16);assert.equal(batches.length,16);
 const out=batches.map((raw,index)=>{
  const item=record(raw,['phase','batch','resultBytes','supervisorBytes']),phase=phases[Math.floor(index/8)],batch=index%8+1;
  assert.equal(item.phase,phase);assert.equal(item.batch,batch);
  const result=json(item.resultBytes,65536),s=json(item.supervisorBytes,65536),scope=cases.slice((batch-1)*4,batch*4),profile=profiles[phase==='static'?0:1];
  for(const [k,v]of [['schema','current-producer-final-result/v2'],['phase',phase],['batch',batch],['status','complete'],['freezeHash',f.freezeHash],
   ['freezeSha256',a.captureFreezeSha256],['protocolSha256',f.protocolSha256],['candidateSha256',f.candidateSha256],['labelSealSha256',f.labelSealSha256],
   ['artifactReuseReceiptSha256',a.artifactReuseReceiptSha256],['artifactReuseReceiptHash',a.artifactReuseReceiptHash],['transferHash',a.transferHash],
   ['profileRecipeHash',a.profileRecipeHash],['oldSelectionReceiptSha256',a.oldSelectionReceiptSha256],
   ['reobservation',true],['independentCohort',false],['noOldInputSplice',true],['sourceHashesRechecked',true],['denominator',4],['fullProducerDenominator',32]])field(result,k,v);
  equal(result.sourceHashes,a.sourceHashes);equal(result.producerProfile,profile);hash(result.packetSha256);
  if(phase==='browser')field(result,'protocolCallbacksDrained',true);
  for(const [k,v]of [['schema','current-producer-final-supervisor/v2'],['phase',phase],['batch',batch],['reason',null],['exitCode',0],
   ['cleanupReason',null],['ownTreeCleanupConfirmed',true],['sourceHashesRechecked',true],['freezeSha256',a.captureFreezeSha256],
   ['resultSha256',sha(item.resultBytes)],['packetSha256',result.packetSha256],['denominator',4],['fullProducerDenominator',32]])field(s,k,v);
  equal(s.sourceHashes,a.sourceHashes);equal(s.batchCaseIds,scope.map(c=>c.id));assert.ok(s.elapsedSeconds>=0&&s.elapsedSeconds<=(phase==='static'?360:180));
  const rows=dense(result.cases,4);assert.equal(rows.length,4);
  rows.forEach((r,i)=>{
   for(const k of ['id','groupId','url','language'])field(r,k,scope[i][k]);
   assert.ok(['collected','unavailable'].includes(dataField(r,'status')));
   if(r.status==='unavailable'){assert.ok(CAPTURE_UNAVAILABLE.has(r.reason));assert.equal(r.capture,undefined);}
   else {
    field(r,'reason',null);hash(r.originPolicyHash);
    const capture=dataField(r,'capture');hash(dataField(capture,'bodySha256'));hash(dataField(capture,'titleSha256'));
    assert.ok(Number.isInteger(capture.titleCharacters)&&capture.titleCharacters>=0&&capture.titleCharacters<=200);
    assert.ok(Number.isInteger(capture.bodyCharacters)&&capture.bodyCharacters>=1&&capture.bodyCharacters<=4096);
    if(phase==='static')field(r,'rightsTransportEligible',true);
   }
   if(phase==='static')assert.equal(typeof r.rightsTransportEligible,'boolean');
   else {
    const staticRows=json(batches[batch-1].resultBytes,65536).cases;
    if(staticRows[i].rightsTransportEligible!==true)assert.equal(r.status,'unavailable');
   }
  });
  // static N binds static1..N-1; browser N binds all static + browser1..N-1.
  const previous=batches.slice(0,index).map(p=>({resultSha256:sha(p.resultBytes),supervisorSha256:sha(p.supervisorBytes),packetSha256:json(p.resultBytes,65536).packetSha256}));
  equal(result.priorEvidence,previous);
  return freeze({phase,batch,resultSha256:sha(item.resultBytes),supervisorSha256:sha(item.supervisorBytes),packetSha256:result.packetSha256,
   producerProfile:profile,cases:scope,results:rows,collectedIds:rows.filter(r=>r.status==='collected').map(r=>r.id)});
 });
 return freeze({schema:'current-producer-transfer-capture-completion/v2',captureFreezeHash:f.freezeHash,captureFreezeSha256:a.captureFreezeSha256,
  artifactReuseReceiptSha256:a.artifactReuseReceiptSha256,artifactReuseReceiptHash:a.artifactReuseReceiptHash,transferHash:a.transferHash,
  profileRecipeHash:a.profileRecipeHash,oldSelectionReceiptSha256:a.oldSelectionReceiptSha256,
  candidateSha256:f.candidateSha256,labelSealSha256:f.labelSealSha256,batches:out,all16Complete:true,
  reobservation:true,untouchedIndependentCohort:false,noOldInputSplice:true,
  productionValidated:false,assignmentAuthority:false});
}
export function validateCapturedPacket(bytes,completion,phase,batch){
 assert.equal(completion.all16Complete,true);assert.ok(phases.includes(phase));assert.ok(Number.isInteger(batch)&&batch>=1&&batch<=8);
 const evidence=completion.batches[(phase==='static'?0:8)+batch-1];assert.equal(sha(bytes),evidence.packetSha256);
 const packet=validateInputPacket(json(bytes,131072),{phase,batch,freezeHash:completion.captureFreezeHash,candidateSha256:completion.candidateSha256,
  labelSealSha256:completion.labelSealSha256,artifactReuseReceiptSha256:completion.artifactReuseReceiptSha256,producerProfile:evidence.producerProfile,
  cases:evidence.cases,collectedIds:evidence.collectedIds});
 for(const r of packet.rows){
  const saved=evidence.results.find(v=>v.id===r.id);assert.ok(saved&&saved.status==='collected');
  assert.equal(r.sourceVersion,completion.captureFreezeHash+'|'+phase+'|'+batch);assert.equal(r.originPolicyHash,saved.originPolicyHash);
  for(const k of ['bodySha256','titleSha256','extractorVersion'])assert.equal(r[k],saved.capture[k]);
  assert.equal(r.body.length,saved.capture.bodyCharacters);assert.equal(r.title.length,saved.capture.titleCharacters);
  if(phase==='static')assert.equal(r.documentWitness.responseWitnessHash,saved.responseWitnessHash);
  else for(const k of ['frameId','loaderId','navigationId','documentId'])assert.equal(r.documentWitness[k],saved.documentWitness[k]);
 }
 return packet;
}
export function encodingAvailability(row){
 // Both immutable fields are validated before any call; no trim/normalization/substitution.
 const title=dataField(row,'title'),body=dataField(row,'body');
 assert.equal(typeof title,'string');assert.equal(typeof body,'string');
 if(!title.trim())return freeze({available:false,reason:'encoding-title-empty',encoderCalls:0});
 try{inputText(title);inputText(body);}catch(error){
  if(!(error instanceof TypeError))throw error;
  return freeze({available:false,reason:'embedding-text-contract-unsupported',encoderCalls:0});
 }
 return freeze({available:true,reason:null,encoderCalls:2});
}
export function experimentalIncarnation(captureFreezeHash,phase,batch,row){
 hash(captureFreezeHash);assert.ok(phases.includes(phase));assert.ok(Number.isInteger(batch)&&batch>=1&&batch<=8);
 return digest({schema:'current-producer-transfer-experimental-incarnation/v2',captureFreezeHash,phase,batch,
  sourceVersion:dataField(row,'sourceVersion'),documentWitness:dataField(row,'documentWitness')});
}
export function unavailableEvaluationMarker(captureFreezeHash,phase,batch,id,reason,resultSha256){
 hash(captureFreezeHash);hash(resultSha256);assert.ok(phases.includes(phase));assert.ok(Number.isInteger(batch)&&batch>=1&&batch<=8);
 assert.ok(BATCHES[batch-1].includes(id));assert.ok(typeof reason==='string'&&reason.length>0&&reason.length<=160);
 return digest({schema:'current-producer-transfer-unavailable-evaluation-only/v2',captureFreezeHash,phase,batch,id,reason,resultSha256});
}
export function vectorBitHash(vector){
 assert.ok(!types.isProxy(vector)&&Array.isArray(vector)&&vector.length===384);const bytes=Buffer.alloc(3072);
 for(let i=0;i<384;i++){const d=Object.getOwnPropertyDescriptor(vector,String(i));assert.ok(d&&Object.hasOwn(d,'value')&&typeof d.value==='number'&&Number.isFinite(d.value));bytes.writeDoubleLE(d.value,i*8);}
 return createHash('sha256').update('builder-root-input-vector/binary64-le/384/v1\0').update(bytes).digest('hex');
}
export function assessStoredPredictions(input){return assessCurrentProducerTransfer(input);}
const RAW_DECISION_FIELDS=['schema','status','reason','supportedPath','witness','vectorBindings','semanticWitnessHash','identity','work',
 'experimental','developmentOnly','transferValidationStatus','productionValidated','assignmentAuthority'];
function boundedDataCopy(value,budget={items:32768},depth=0){
 assert.ok(--budget.items>=0&&depth<=10);
 if(value===null||typeof value!=='object'){assert.ok(value===null||['string','number','boolean'].includes(typeof value));return value;}
 assert.ok(!types.isProxy(value));
 if(Array.isArray(value))return dense(value,128).map(v=>boundedDataCopy(v,budget,depth+1));
 assert.equal(Object.getPrototypeOf(value),Object.prototype);const out={};
 for(const key of Reflect.ownKeys(value)){assert.equal(typeof key,'string');out[key]=boundedDataCopy(dataField(value,key),budget,depth+1);}
 return out;
}
/** Store one shared transfer identity per report; do not repeat it64 times.
 * Original semanticWitnessHash remains unchanged and still binds actual vectors.
 */
export function compactRootDecision(input){
 const d=record(boundedDataCopy(input),RAW_DECISION_FIELDS);
 assert.equal(d.schema,'builder-scoped-root-rank-transfer-decision/v1');
 const {transferHash,...identity}=d.identity;hash(transferHash);assert.equal(digest(identity),transferHash);
 assert.equal(d.productionValidated,false);assert.equal(d.assignmentAuthority,false);
 const {schema,identity:_,...rest}=d;
 return freeze({schema:'current-producer-transfer-compact-root-decision/v2',originalSchema:schema,transferHash,...rest});
}
export function makeEncodingPlan(input){
 const a=record(input,['completion','batch','staticPacketBytes','browserPacketBytes']),batch=a.batch;
 const packets=phases.map(phase=>validateCapturedPacket(a[phase+'PacketBytes'],a.completion,phase,batch));
 const scope=a.completion.batches[batch-1].cases;
 const rows=scope.flatMap(c=>phases.map((phase,i)=>{
  const evidence=a.completion.batches[i*8+batch-1],saved=evidence.results.find(r=>r.id===c.id),captured=packets[i].rows.find(r=>r.id===c.id);
  const available=captured?encodingAvailability(captured):{available:false,reason:saved.reason,encoderCalls:0};
  return {id:c.id,producerId:PRODUCERS[i],captureStatus:saved.status,encodingAvailable:available.available,reason:available.reason,
   sourceInputHash:captured?.sourceInputHash??null,
   inputIdentity:captured?.sourceInputHash??unavailableEvaluationMarker(a.completion.captureFreezeHash,phase,batch,c.id,saved.reason,evidence.resultSha256),
   bodySha256:captured?.bodySha256??null,titleSha256:captured?.titleSha256??null,
   sourceVersion:captured?.sourceVersion??null,
   sourceIncarnation:captured?experimentalIncarnation(a.completion.captureFreezeHash,phase,batch,captured):null,
   documentWitness:captured?.documentWitness??null};
 }));
 return freeze({schema:'current-producer-transfer-encoding-plan/v2',batch,captureCompletionHash:digest(a.completion),
  artifactReuseReceiptSha256:a.completion.artifactReuseReceiptSha256,transferHash:a.completion.transferHash,oldSelectionReceiptSha256:a.completion.oldSelectionReceiptSha256,
  inputPacketHashes:{static:sha(a.staticPacketBytes),browser:sha(a.browserPacketBytes)},rows,
  expectedEncoderCalls:rows.filter(r=>r.encodingAvailable).length*2,
  ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false});
}
export function validateEncodingReceipt(receipt,plan,freezeHash,encoderHash){
 const r=record(receipt,['schema','freezeHash','encoderHash','batch','captureCompletionHash','inputPacketHashes','rows','encoderCalls','vectorPacketSha256',
  'artifactReuseReceiptSha256','transferHash','oldSelectionReceiptSha256','reobservation','untouchedIndependentCohort','noOldInputSplice',
  'sourceHashesRechecked','timings','ordinaryDynamicBrowserProducerValidated','productionValidated','assignmentAuthority']);
 for(const [k,v]of [['schema','current-producer-transfer-encoding-receipt/v2'],['freezeHash',freezeHash],['encoderHash',encoderHash],
  ['batch',plan.batch],['captureCompletionHash',plan.captureCompletionHash],['encoderCalls',plan.expectedEncoderCalls],['sourceHashesRechecked',true],
  ['artifactReuseReceiptSha256',plan.artifactReuseReceiptSha256],['transferHash',plan.transferHash],['oldSelectionReceiptSha256',plan.oldSelectionReceiptSha256],
  ['reobservation',true],['untouchedIndependentCohort',false],['noOldInputSplice',true],
  ['ordinaryDynamicBrowserProducerValidated',false],['productionValidated',false],['assignmentAuthority',false]])field(r,k,v);
 equal(r.inputPacketHashes,plan.inputPacketHashes);equal(r.rows,plan.rows);hash(r.vectorPacketSha256);
 const timings=record(r.timings,['initializationMs','encodingMs','totalChildMs']);
 for(const n of Object.values(timings))assert.ok(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=180000);
 return freeze({...r,timings});
}
export function captureAdmissionReceipt(input){
 const a=record(input,['freezeHash','freezeFileSha256','sourceHashes','completion']);
 hash(a.freezeHash);hash(a.freezeFileSha256);assert.equal(a.completion.all16Complete,true);
 return freeze({schema:'current-producer-transfer-capture-admission/v2',freezeHash:a.freezeHash,freezeFileSha256:a.freezeFileSha256,
  captureCompletionHash:digest(a.completion),oldSelectionReceiptSha256:a.completion.oldSelectionReceiptSha256,
  artifactReuseReceiptSha256:a.completion.artifactReuseReceiptSha256,artifactReuseReceiptHash:a.completion.artifactReuseReceiptHash,transferHash:a.completion.transferHash,
  reobservation:true,untouchedIndependentCohort:false,noOldInputSplice:true,
  sourceHashes:a.sourceHashes,all16Complete:true,ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false});
}
export function validateCaptureAdmissionProof(input){
 const a=record(input,['expectedReceipt','receiptBytes','supervisorBytes']);
 const r=json(a.receiptBytes,65536),s=json(a.supervisorBytes,65536);equal(r,a.expectedReceipt);
 for(const [k,v]of [['schema','current-producer-transfer-evaluation-supervisor/v2'],['phase','admit-captures'],['batch',null],
  ['reason',null],['exitCode',0],['cleanupReason',null],['ownTreeCleanupConfirmed',true],['sourceHashesRechecked',true],
  ['freezeSha256',r.freezeFileSha256],['resultSha256',sha(a.receiptBytes)],['jobMemoryLimitBytes',1536*1048576],
  ['ordinaryDynamicBrowserProducerValidated',false],['productionValidated',false],['assignmentAuthority',false]])field(s,k,v);
 equal(s.sourceHashes,r.sourceHashes);
 for(const k of ['sampledPeakTreeRssBytes','sampledPeakTreePrivateBytes'])assert.ok(Number.isSafeInteger(s[k])&&s[k]>=0&&s[k]<=1536*1048576);
 assert.ok(typeof s.elapsedSeconds==='number'&&Number.isFinite(s.elapsedSeconds)&&s.elapsedSeconds>=0&&s.elapsedSeconds<=180);
 return freeze({receiptSha256:sha(a.receiptBytes),supervisorSha256:sha(a.supervisorBytes)});
}
export function validateAllEncodingMetadata(input){
 const a=record(input,['freezeHash','freezeFileSha256','sourceHashes','encoderHash','plans','batches']);hash(a.freezeHash);hash(a.freezeFileSha256);hash(a.encoderHash);
 const plans=dense(a.plans,8),batches=dense(a.batches,8);assert.equal(plans.length,8);assert.equal(batches.length,8);
 let calls=0;const receipts=batches.map((raw,i)=>{
  const b=record(raw,['batch','receiptBytes','supervisorBytes']);assert.equal(b.batch,i+1);assert.equal(plans[i].batch,i+1);
  const receipt=validateEncodingReceipt(json(b.receiptBytes,65536),plans[i],a.freezeHash,a.encoderHash),s=json(b.supervisorBytes,65536);
  for(const [k,v]of [['schema','current-producer-transfer-evaluation-supervisor/v2'],['phase','encode-batch'],['batch',i+1],['reason',null],['exitCode',0],
   ['cleanupReason',null],['ownTreeCleanupConfirmed',true],['sourceHashesRechecked',true],['freezeSha256',a.freezeFileSha256],
   ['receiptSha256',sha(b.receiptBytes)],['resultSha256',sha(b.receiptBytes)],['vectorPacketSha256',receipt.vectorPacketSha256],['jobMemoryLimitBytes',1536*1048576]])field(s,k,v);
  equal(s.sourceHashes,a.sourceHashes);
  for(const k of ['sampledPeakTreeRssBytes','sampledPeakTreePrivateBytes'])assert.ok(Number.isSafeInteger(s[k])&&s[k]>=0&&s[k]<=1536*1048576);
  assert.ok(s.elapsedSeconds>=0&&s.elapsedSeconds<=180);calls+=receipt.encoderCalls;
  return {...receipt,receiptSha256:sha(b.receiptBytes),supervisorSha256:sha(b.supervisorBytes)};
 });
 assert.ok(calls<=128);
 return freeze({schema:'current-producer-transfer-eight-encoding-completion/v2',freezeHash:a.freezeHash,encoderHash:a.encoderHash,receipts,encoderCalls:calls,
  all8Complete:true,ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false});
}
export function assessEvidenceLinkedOutcomes(input){
 const a=record(input,['cases','plans','outcomes']),cases=dense(a.cases,32),plans=dense(a.plans,8),outcomes=dense(a.outcomes,64);
 assert.equal(cases.length,32);assert.equal(plans.length,8);assert.equal(outcomes.length,64);
 const expected=plans.flatMap(p=>p.rows);assert.equal(expected.length,64);const rows=outcomes.map((raw,i)=>{
  const r=record(raw,['id','producerId','captureStatus','inputAvailable','reason','sourceInputHash','inputIdentity','bodySha256','titleSha256',
   'selectedRootId','decision','classificationMs']),p=expected[i];
  for(const k of ['id','producerId','captureStatus','reason','sourceInputHash','inputIdentity','bodySha256','titleSha256'])assert.equal(r[k],p[k]);
  assert.equal(r.inputAvailable,p.encodingAvailable);
  if(!r.inputAvailable){assert.equal(r.selectedRootId,null);assert.equal(r.decision,null);assert.equal(r.classificationMs,null);}
  else {
   assert.ok(typeof r.classificationMs==='number'&&Number.isFinite(r.classificationMs)&&r.classificationMs>=0);
   const decision=dataField(r,'decision');field(decision,'schema','current-producer-transfer-compact-root-decision/v2');
   field(decision,'originalSchema','builder-scoped-root-rank-transfer-decision/v1');hash(dataField(decision,'transferHash'));
   field(decision,'productionValidated',false);field(decision,'assignmentAuthority',false);
   const witness=dataField(decision,'witness');
   for(const [k,v]of [['sourceId',p.id],['sourceVersion',p.sourceVersion],['sourceIncarnation',p.sourceIncarnation],['producerId',p.producerId],['inputHash',p.sourceInputHash]])field(witness,k,v);
   equal(witness.documentWitness,p.documentWitness);
   const path=dense(decision.supportedPath,1);assert.equal(r.selectedRootId,path[0]??null);
   assert.equal(decision.status,path.length?'candidate':'unresolved');
  }
  return r;
 });
 const predictions=producerId=>rows.filter(r=>r.producerId===producerId).map(r=>({id:r.id,inputAvailable:r.inputAvailable,inputIdentity:r.inputIdentity,selectedRootId:r.selectedRootId}));
 const assessment=assessCurrentProducerTransfer({cases,staticPredictions:predictions('current-static'),browserPredictions:predictions('browser-current')});
 return freeze({schema:'current-producer-transfer-evidence-linked-assessment/v2',assessment,
  producerScopes:{'current-static':'actual-current-static-extractor/v1','browser-current':'restricted-single-document-dom-reader/v1'},
  ordinaryDynamicBrowserProducerValidated:false,classificationReexecuted:false,reobservation:true,untouchedIndependentCohort:false,noOldInputSplice:true,
  statisticalIndependenceClaim:false,productionValidated:false,assignmentAuthority:false});
}
export function summarizeDecisionWork(outcomes){
 const sum={headDotProducts:0,headScalarProducts:0,rankComparisonWork:0,fusionCoordinateVisitUpperBound:0};
 for(const row of dense(outcomes,64))if(row.inputAvailable){
  const w=record(row.decision.work,Object.keys(sum));
  for(const key of Object.keys(sum)){assert.ok(Number.isSafeInteger(w[key])&&w[key]>=0);sum[key]+=w[key];}
 }
 assert.ok(sum.headDotProducts<=1024&&sum.headScalarProducts<=393216&&sum.rankComparisonWork<=4096&&sum.fusionCoordinateVisitUpperBound<=196608);
 return freeze(sum);
}
