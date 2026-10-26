// ADR179 default-inert phase composition. No CLI, IO, client or model on import.
import {types} from 'node:util';
import {record,dense,dataCopy,freeze,digest,hash,requireTrue,refuse,validateSpecificityBatch} from './manifest.js';
import {validateSpecificityProducerProfile,ROOT_IDS} from './producer-profile.js';
import {createSpecificityCohort} from './cohort.js';
import {validateNativeRightsEvidence} from './browser-capture.mjs';
import {buildSpecificityTrainReferences} from './reference-builder.js';
import {createTrainReferenceCodec} from './reference-codec.js';
import {compileNativeRootRankCandidate,describeNativeRootRankCandidate,prepareNativeRootInput,classifyNativeRootRankCandidate} from '../../../../../apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js';
import {fitNativeLocalDetailCalibration} from '../../../../../apps/local-service/experiments/topic-encoder/native-local-detail-calibration-v1/fit.js';
import {compileNativeRootLocalDetailTransfer,classifyNativeRootLocalDetailTransfer} from '../../../../../apps/local-service/src/domain/experimental/native-root-local-detail-transfer-v1/adapter.js';
import {assessCompleteHierarchyPredictions} from '../../../../../apps/local-service/experiments/topic-encoder/hierarchical-e5-complete-path-assessment-v1/assessment.js';

const CAPABILITIES=['guard','now','captureBatch','releaseBatch','assertCaptureHealthy','requestBatchDrain','verifyBatchDrain',
 'requestFinalDrain','createEncoder','recheckAssetsAndSources','authorizeTest','enterModelStage'];
const LEAVES=['gta','minecraft','koalas','dolphins','kapsalon','pasta'];
const NativePromise=Promise,then=Promise.prototype.then;
function safePromise(v){
 if(types.isProxy(v)||!types.isPromise(v)||Object.getPrototypeOf(v)!==NativePromise.prototype)return false;
 return Reflect.ownKeys(v).every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return k!=='constructor'&&k!=='then'&&d&&Object.hasOwn(d,'value');});
}
const copy=(v,maximum=1048576)=>{const out=dataCopy(v,{values:200000,units:2097152,depth:24,array:1024,properties:128,string:1048576});requireTrue(Buffer.byteLength(JSON.stringify(out))<=maximum,'capacity');return freeze(out);};
const mappedPrediction=(id,d)=>({id,status:d.status==='candidate'?'assigned':'unresolved',selectedPath:[...d.supportedPath]});

/** Supported-label assessment is a subreport, never an all72 accuracy claim.
 * Gold comes only from the separately authenticated complete manifest. */
export function assessSpecificityTest(input){
 const a=copy(record(input,['manifest','expectedPanelIdentity','expectedManifestHash','nodes','availability','baselinePredictions','compositionPredictions']));
 validateSpecificityBatch({manifest:a.manifest,batch:a.manifest.batches[0],expectedPanelIdentity:a.expectedPanelIdentity,expectedManifestHash:a.expectedManifestHash});
 const cases=a.manifest.cases.filter(c=>c.split==='test'),available=dense(a.availability,72),base=dense(a.baselinePredictions,72),detail=dense(a.compositionPredictions,72);
 requireTrue(cases.length===72&&available.length===72&&base.length===72&&detail.length===72);
 const nodes=new Map(dense(a.nodes,25).map(n=>{record(n,['id','parentId']);requireTrue(typeof n.id==='string'&&(n.parentId===null||typeof n.parentId==='string'));return [n.id,n];}));
 requireTrue(nodes.size===a.nodes.length);
 const unknown=[];
 for(let i=0;i<72;i++){
  const row=record(available[i],['id','status']);requireTrue(row.id===cases[i].id&&['available','unavailable'].includes(row.status));
  for(const p of [base[i],detail[i]]){record(p,['id','status','selectedPath']);requireTrue(p.id===row.id&&['assigned','unresolved','unavailable'].includes(p.status));
   requireTrue((p.status==='unavailable')===(row.status==='unavailable'));dense(p.selectedPath,8);requireTrue((p.status==='assigned')===(p.selectedPath.length>0));
   for(let j=0;j<p.selectedPath.length;j++){const id=p.selectedPath[j];requireTrue(typeof id==='string'&&nodes.has(id)&&nodes.get(id).parentId===(j===0?null:p.selectedPath[j-1]));}}
  if(cases[i].assessmentGold===null)unknown.push(i);
 }
 requireTrue(unknown.length===2&&digest(unknown.map(i=>cases[i].id).sort())===digest(['adr159-test-054','adr159-test-083']));
 const known=cases.map((c,i)=>c.assessmentGold===null?null:i).filter(i=>i!==null);
 const common={nodes:a.nodes,cases:known.map(i=>({id:cases[i].id,groupId:cases[i].groupId,language:cases[i].language,gold:cases[i].assessmentGold})),
  trainingGroupIds:a.manifest.cases.filter(c=>c.split==='training').map(c=>c.groupId),calibrationGroupIds:a.manifest.cases.filter(c=>c.split==='calibration').map(c=>c.groupId)};
 const baseline=assessCompleteHierarchyPredictions({...common,predictions:known.map(i=>base[i])});
 const composition=assessCompleteHierarchyPredictions({...common,predictions:known.map(i=>detail[i])});
 const outcomes=new Map(composition.outcomes.map(o=>[o.id,o]));
 const leaves=cases.filter(c=>c.role==='leaf'),parents=cases.filter(c=>c.role==='parent-stop');
 requireTrue(leaves.length===36&&parents.length===18);
 const perLeaf=LEAVES.map(nodeId=>({nodeId,denominator:leaves.filter(c=>c.nodeId===nodeId).length,
  exact:leaves.filter(c=>c.nodeId===nodeId&&outcomes.get(c.id)?.outcome==='exactDeepest').length}));
 requireTrue(perLeaf.every(x=>x.denominator===6));
 const exactLeaves=perLeaf.reduce((n,r)=>n+r.exact,0),exactParents=parents.filter(c=>outcomes.get(c.id)?.outcome==='exactDeepest').length;
 const overspecificParents=parents.filter(c=>outcomes.get(c.id)?.outcome==='overSpecific').length;
 const unknownRows=unknown.map(i=>({id:cases[i].id,availability:available[i].status,baselineStatus:base[i].status,
  baselinePath:[...base[i].selectedPath],compositionStatus:detail[i].status,compositionPath:[...detail[i].selectedPath],correctnessAssessed:false,semanticRejectionCredit:false}));
 const assignedUnassessed=unknownRows.filter(r=>r.compositionStatus==='assigned').length,inputAvailable=available.filter(r=>r.status==='available').length;
 const gate={minimumAvailable:inputAvailable>=60,minimumExactLeaves:exactLeaves>=24,minimumEachLeaf:perLeaf.every(r=>r.exact>=3),
  minimumExactParents:exactParents>=12,noOverspecificParents:overspecificParents===0,noKnownWrongAccepted:composition.cases.wrongAccepted===0,noAssignedUnassessed:assignedUnassessed===0};
 return copy({schema:'native-specificity-test-assessment/v1',allCases:72,supportedGoldCases:70,unverifiedGoldCases:2,
  inputAvailable,inputUnavailable:72-inputAvailable,allCompositionAssigned:detail.filter(p=>p.status==='assigned').length,
  allBaselineAssigned:base.filter(p=>p.status==='assigned').length,assignedUnassessed,unknownRows,
  exactLeaves,exactParents,overspecificParents,perLeaf,gate,qualityGatePassed:Object.values(gate).every(Boolean),
  supportedLabelSubreport:{baseline,composition},rootBaselineDescriptiveOnly:true,all72AccuracyClaim:false,
  uncheckedPrefixNotCorrectnessCredit:true,productionValidated:false,assignmentAuthority:false},524288);
}

/** Trusted capabilities must be authenticated/wired by the future actual owner.
 * Injecting matching metadata/callbacks is NOT physical/native/audit authority. */
export function createSpecificityPhaseRunner(input){
 const raw=record(input,['manifest','expectedPanelIdentity','expectedManifestHash','profileSet','expectedRecipeHash','rootCandidate',
  'rootReuseReceiptHash','phase','selection','nodeIdentityHash','phaseDeadline','capabilities']);
 const caps=record(raw.capabilities,CAPABILITIES);for(const f of Object.values(caps))requireTrue(typeof f==='function'&&!types.isProxy(f));
 const a=copy(Object.fromEntries(Object.entries(raw).filter(([k])=>k!=='capabilities')),2097152);
 requireTrue(['train-cal','test'].includes(a.phase));hash(a.rootReuseReceiptHash);hash(a.nodeIdentityHash);
 requireTrue(typeof a.phaseDeadline==='number'&&Number.isFinite(a.phaseDeadline));
 const manifest=a.manifest;validateSpecificityBatch({manifest,batch:manifest.batches[0],expectedPanelIdentity:a.expectedPanelIdentity,expectedManifestHash:a.expectedManifestHash});
 const profile=validateSpecificityProducerProfile({profileSet:a.profileSet,expectedRecipeHash:a.expectedRecipeHash,expectedPanelIdentity:a.expectedPanelIdentity,expectedManifestHash:a.expectedManifestHash});
 const root=compileNativeRootRankCandidate(a.rootCandidate),rootIdentity=describeNativeRootRankCandidate(root);
 requireTrue(digest(rootIdentity.nodeIds)===digest([...ROOT_IDS].sort())&&digest(rootIdentity.targetProfiles[0])===digest(profile.producerProfile));
 requireTrue(a.phase==='test'?a.selection!==null:a.selection===null);
 const batches=manifest.batches.filter(b=>b.phase===a.phase),batchByCase=new Map(batches.flatMap(b=>b.cases.map(c=>[c.id,b])));
 let state='ready',fault=null,hasFault=false,lastNow=-Infinity,until=a.phaseDeadline,selected=null,fitCalls=0,result=null,unsafeOperationRefused=false,cohort,inputLedger=null;
 const pending=new Set();
 const scoringCalls={baseline:0,composition:0};
 function poison(error){if(!hasFault){hasFault=true;fault=error===null||error===undefined?new Error('Specificity phase failed'):error;}state='failed';selected=null;result=null;inputLedger=null;if(cohort&&cohort.snapshot().phase!=='complete')try{cohort.abandon();}catch{}return fault;}
 function syncValue(value){
  if(types.isProxy(value)){unsafeOperationRefused=true;refuse('unsafe-promise');}
  if(types.isPromise(value)){const wait=track(value);then.call(wait,()=>undefined,()=>undefined);refuse('async-callback');}return value;
 }
 function now(){const n=syncValue(caps.now());requireTrue(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n>=lastNow,'clock');lastNow=n;return n;}
 function check(){try{if(hasFault)throw fault;const first=now();requireTrue(first<a.phaseDeadline&&first<until,'deadline');
  const g=syncValue(caps.guard());requireTrue(g===undefined||g===true,'guard');const health=syncValue(caps.assertCaptureHealthy());requireTrue(health===undefined||health===true,'guard');
  requireTrue(now()<a.phaseDeadline&&lastNow<until,'deadline');if(hasFault)throw fault;return lastNow;}catch(e){throw poison(e);}}
 function track(original){
  if(!safePromise(original)){unsafeOperationRefused=true;refuse('unsafe-promise');}pending.add(original);
  return new NativePromise((resolve,reject)=>{then.call(original,v=>{pending.delete(original);resolve({value:v});},e=>{pending.delete(original);reject(e);});});
 }
 async function operation(action){check();const original=action();let wrapped;
  if(types.isProxy(original)){unsafeOperationRefused=true;refuse('unsafe-promise');}
  if(types.isPromise(original))wrapped=await track(original);else wrapped={value:original};check();return wrapped;
 }
 function sync(action){check();const value=syncValue(action());check();return value;}
 function admit(admission){
  const c=admission.case,batch=batchByCase.get(c.id);requireTrue(batch!==undefined&&digest(batch.cases[c.nativeOrdinal-1])===digest(c));
  const rights=validateNativeRightsEvidence(batch,{caseId:c.id,ordinal:c.nativeOrdinal,nativeWitness:admission.nativeWitness,rightsEvidence:admission.rightsEvidence});
  const prepared=prepareNativeRootInput(root,{sourceId:c.id,sourceVersion:admission.nativeWitness.observationNonce,producerId:profile.producerProfile.producerId,
   producerProfileHash:profile.producerProfile.producerProfileHash,inputConstructionHash:profile.recipeHash,extractorVersion:admission.extractorVersion,
   fieldBindings:admission.fieldBindings,nativeWitness:admission.nativeWitness,rightsEvidenceHash:digest(rights)});
  return {inputIdentity:prepared.sourceInputHash,evidence:{preparedMetadata:prepared,rightsEvidence:rights}};
 }
 function revalidate(row){
  const evidence=record(row.evidence,['preparedMetadata','rightsEvidence']),p=evidence.preparedMetadata;
  const proof=admit({case:row.case,fieldBindings:row.fieldBindings,extractorVersion:row.extractorVersion,nativeWitness:p.nativeWitness,rightsEvidence:evidence.rightsEvidence});
  requireTrue(proof.inputIdentity===row.inputIdentity&&digest(proof.evidence)===digest(row.evidence),'revalidation');return proof;
 }
 cohort=createSpecificityCohort({manifest,expectedPanelIdentity:a.expectedPanelIdentity,expectedManifestHash:a.expectedManifestHash,phase:a.phase,
  producerProfileHash:profile.producerProfile.producerProfileHash,nodeIdentityHash:a.nodeIdentityHash,phaseDeadline:a.phaseDeadline,guard:()=>{check();return true;},now,
  admitAvailable:admit,admitUnavailable:r=>({inputIdentity:digest({schema:'native-specificity-unavailable-input/v1',...r,batchId:batchByCase.get(r.case.id).batchId}),evidence:{reason:r.reason}}),
  verifyBatchDrain:r=>sync(()=>caps.verifyBatchDrain(r)),authorizeTest:r=>{
   const s=a.selection;requireTrue(s&&s.panelIdentity===a.expectedPanelIdentity&&s.manifestHash===a.expectedManifestHash&&s.producerRecipeHash===profile.recipeHash&&s.rootReuseReceiptHash===a.rootReuseReceiptHash&&s.rootTransferHash===rootIdentity.transferHash,'selection');
   const {selectionIdentity,...body}=s;hash(selectionIdentity);requireTrue(digest(body)===selectionIdentity,'selection');
   const proof=record(sync(()=>caps.authorizeTest({...r,selectionIdentity})),['manifestHash','selectionIdentity','auditIdentity']);
   requireTrue(proof.manifestHash===a.expectedManifestHash&&proof.selectionIdentity===selectionIdentity,'test-admission');hash(proof.auditIdentity);return proof;
  }});
 function semantic(query){
  const rows=query.rows,nativeInput=r=>({...r.evidence.preparedMetadata,bodyVector:r.bodyVector,titleVector:r.titleVector});
  const ledgerRows=rows.map(r=>{
   const common={id:r.id,groupId:r.groupId,split:r.split,globalOrdinal:r.globalOrdinal,nativeOrdinal:r.nativeOrdinal,batchId:r.batchId,status:r.status,inputIdentity:r.inputIdentity,
    assessmentGoldHash:r.panelCase.assessmentGold===null?null:digest(r.panelCase.assessmentGold),referenceAnnotationHash:r.panelCase.referenceAnnotation===null?null:digest(r.panelCase.referenceAnnotation)};
   if(r.status==='unavailable')return {...common,reason:r.reason};const p=r.evidence.preparedMetadata;
   return {...common,sourceVersion:p.sourceVersion,producerProfileHash:p.producerProfileHash,inputConstructionHash:p.inputConstructionHash,extractorVersion:p.extractorVersion,
    fieldBindings:p.fieldBindings,nativeWitnessHash:digest(p.nativeWitness),rightsEvidenceHash:p.rightsEvidenceHash,bodyVectorHash:r.bodyVectorHash,titleVectorHash:r.titleVectorHash};
  });
  const ledgerBody={schema:'native-specificity-ordered-input-metadata/v1',phase:a.phase,manifestHash:a.expectedManifestHash,captureHash:query.captureHash,rows:ledgerRows};
  inputLedger=copy({...ledgerBody,ledgerHash:digest(ledgerBody)},262144);check();
  if(a.phase==='train-cal'){
   check();
   const training=rows.filter(r=>r.split==='training'),cal=rows.filter(r=>r.split==='calibration');requireTrue(training.length===48&&cal.length===48);
   const built=buildSpecificityTrainReferences({manifest,expectedPanelIdentity:a.expectedPanelIdentity,expectedManifestHash:a.expectedManifestHash,profileSet:profile,expectedRecipeHash:profile.recipeHash,rootCandidate:a.rootCandidate,
    trainingRows:training.map(r=>r.status==='unavailable'?{id:r.id,groupId:r.groupId,status:r.status,reason:r.reason,inputIdentity:r.inputIdentity}:
     {id:r.id,groupId:r.groupId,status:r.status,nativeInput:nativeInput(r),vectorBindings:{bodyVectorHash:r.bodyVectorHash,titleVectorHash:r.titleVectorHash}})});
   check();if(!built.calibrationAllowed)return {status:'no-reference-set',accounted:96,referenceCount:0,calibrationSelections:0,testAllowed:false};
   requireTrue(++fitCalls===1,'selection-count');
   const fitted=fitNativeLocalDetailCalibration({schema:'native-local-detail-calibration/v1',rootCandidate:a.rootCandidate,detailTemplate:built.detailTemplate,
    trainingCaseIds:built.trainingCaseIds,trainingGroupIds:built.trainingGroupIds,cases:cal.map(r=>({id:r.id,groupId:r.groupId,language:r.panelCase.language,gold:r.panelCase.assessmentGold,
     observation:r.status==='unavailable'?{status:r.status}:{status:r.status,nativeInput:nativeInput(r)}}))});check();
   const codec=createTrainReferenceCodec({expectedManifestHash:a.expectedManifestHash,expectedInputConstructionHash:built.constructionHash,trainingCases:built.trainingCases});
   const referencePacket=codec.encode(fitted.calibratedArtifact),{calibratedArtifact,...calibrationAudit}=fitted;
   requireTrue(referencePacket.artifactHash===fitted.artifactHash,'selection');
   const body={schema:'native-specificity-selected-detail/v1',panelIdentity:a.expectedPanelIdentity,manifestHash:a.expectedManifestHash,producerRecipeHash:profile.recipeHash,
    rootReuseReceiptHash:a.rootReuseReceiptHash,rootTransferHash:rootIdentity.transferHash,inputLedgerHash:inputLedger.ledgerHash,referenceConstruction:built.construction,constructionHash:built.constructionHash,
    trainingCases:built.trainingCases,trainingCaseIds:built.trainingCaseIds,trainingGroupIds:built.trainingGroupIds,calibrationGroupIds:cal.map(r=>r.groupId),
    referencePacket,detailInputDefinition:built.detailTemplate.inputDefinition,supportedRootIds:built.detailTemplate.supportedRootIds,calibrationAudit,
    calibrationSelections:1,independentCalibrationValidation:false,productionValidated:false,assignmentAuthority:false};
   selected=copy({...body,selectionIdentity:digest(body)},1048576);check();
   return {status:'selected-pending-independent-audit',accounted:96,referenceCount:built.referenceCount,calibrationSelections:1,
    selectionIdentity:selected.selectionIdentity,packetHash:referencePacket.packetHash,artifactHash:referencePacket.artifactHash,testAllowed:false};
  }
  check();const s=a.selection;
  const trainingCases=manifest.cases.filter(c=>c.split==='training').map(c=>({id:c.id,groupId:c.groupId,referenceAnnotation:c.referenceAnnotation}));
  requireTrue(digest(trainingCases)===digest(s.trainingCases),'selection');
  const codec=createTrainReferenceCodec({expectedManifestHash:a.expectedManifestHash,expectedInputConstructionHash:s.constructionHash,trainingCases});
  const decoded=codec.decode(s.referencePacket.text,s.referencePacket.packetHash);requireTrue(decoded.artifactHash===s.referencePacket.artifactHash,'selection');
  const composition=compileNativeRootLocalDetailTransfer({schema:'native-root-local-detail-transfer/v1',rootCandidate:a.rootCandidate,
   detail:{artifact:decoded.artifact,inputDefinition:s.detailInputDefinition,supportedRootIds:s.supportedRootIds}});
  const nodes=rootIdentity.nodeIds.map(id=>({id,parentId:null}));for(const n of decoded.artifact.nodes)if(!nodes.some(x=>x.id===n.id))nodes.push(n);
  const baselinePredictions=[],compositionPredictions=[],timings=[];
  const work={baselineRootCoordinateProducts:0,compositionRootCoordinateProducts:0,compositionDetailCoordinateProducts:0,rootScorerInvocations:0,compositionScorerInvocations:0};
  for(const row of rows){check();if(row.status==='unavailable'){
   baselinePredictions.push({id:row.id,status:'unavailable',selectedPath:[]});compositionPredictions.push({id:row.id,status:'unavailable',selectedPath:[]});continue;}
   const input=nativeInput(row),start=check();scoringCalls.baseline++;const base=classifyNativeRootRankCandidate(root,input),middle=check();
   scoringCalls.composition++;const detail=classifyNativeRootLocalDetailTransfer(composition,input),end=check();
   work.baselineRootCoordinateProducts+=base.work.headScalarProducts;work.compositionRootCoordinateProducts+=detail.work.rootHeadCoordinateProducts;
   work.compositionDetailCoordinateProducts+=detail.work.detailCoordinateProducts;work.rootScorerInvocations+=2;work.compositionScorerInvocations++;
   timings.push({id:row.id,baselineMs:middle-start,compositionMs:end-middle});baselinePredictions.push(mappedPrediction(row.id,base));compositionPredictions.push(mappedPrediction(row.id,detail));check();
  }
  const assessment=assessSpecificityTest({manifest,expectedPanelIdentity:a.expectedPanelIdentity,expectedManifestHash:a.expectedManifestHash,nodes,
   availability:rows.map(r=>({id:r.id,status:r.status})),baselinePredictions,compositionPredictions});check();
  return {status:'assessed',accounted:72,selectionIdentity:s.selectionIdentity,assessment,work,timings,timingIncludesPhaseGuards:true,numericScoringOnlyNotUiLatency:true};
 }
 return Object.freeze({
  async run(){if(state!=='ready')throw poison(new Error('Specificity phase cannot repeat'));state='running';
   try{check();const receipts=[];
    for(const batch of batches){until=Math.min(a.phaseDeadline,now()+360000);check();
     const {value:summary}=await operation(()=>caps.captureBatch({batch,onRow:row=>{try{check();cohort.acceptRow(batch.batchId,row);check();}catch(e){throw poison(e);}}}));
     const preparedDrain=cohort.prepareBatchDrain({batchId:batch.batchId,captureSummary:summary});check();
     const {value:ack}=await operation(()=>caps.requestBatchDrain({...preparedDrain,captureSummary:summary}));
     const receipt=cohort.finishBatch({batchId:batch.batchId,captureSummary:summary,guardianReceipt:ack});
     sync(()=>caps.releaseBatch(summary));receipts.push(receipt);check();
    }
    until=a.phaseDeadline;const capture=cohort.finishCapture();check();
    const encoding=await cohort.encodeAfterCohortDrain({requestFinalDrain:r=>caps.requestFinalDrain(r),createEncoder:()=>caps.createEncoder(),
     recheckAssetsAndSources:()=>caps.recheckAssetsAndSources(),revalidateAvailable:revalidate});check();
    // The local lease starts BEFORE publishing the transition. The external
    // guardian starts its own clock at first observation, never from this clock.
    const enter=async(stage,lease)=>{
     check();until=Math.min(a.phaseDeadline,now()+lease);check();
     const {value:ack}=await operation(()=>caps.enterModelStage(copy({phase:a.phase,stage,captureHash:capture.captureHash,encodingHash:digest(encoding)},16384)));
     requireTrue(ack===true,'stage-ack');check();
    };
    await enter(a.phase==='train-cal'?'fitting':'assessment',a.phase==='train-cal'?180000:60000);
    const semanticResult=cohort.consumeEncoded(semantic);check();
    await enter('checks',60000);
    const {value:endcheck}=await operation(()=>caps.recheckAssetsAndSources());requireTrue(endcheck===true,'endcheck');check();
    requireTrue(pending.size===0&&!unsafeOperationRefused&&cohort.snapshot().pendingOriginals===0,'unsettled');
    result=copy({schema:'native-specificity-phase-composition/v1',phase:a.phase,panelIdentity:a.expectedPanelIdentity,manifestHash:a.expectedManifestHash,
     rootReuseReceiptHash:a.rootReuseReceiptHash,capture,encoding,receipts,inputLedger,semantic:semanticResult,
     normalEncoderClosed:cohort.snapshot().encoderCloseAttempted||encoding.available===0,sourceAssetEndchecksPassed:true,
     actualIoAndSupervisorProofRequired:true,productionValidated:false,assignmentAuthority:false},524288);check();state='complete';return result;
   }catch(e){throw poison(e);}
  },
  takeSelection(){try{check();requireTrue(state==='complete'&&a.phase==='train-cal'&&selected!==null,'selection');const value=selected;selected=null;return value;}catch(e){throw poison(e);}},
  abandon(){throw poison(new Error('Specificity phase abandoned'));},
  snapshot(){return freeze({state,failed:hasFault,pendingOriginals:pending.size,unsafeOperationRefused,fitCalls,scoringCalls:{...scoringCalls},cohort:cohort.snapshot(),selectedTrainRetained:selected!==null});}
 });
}
