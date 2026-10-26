// Invented metadata, bytes, geometry and reports ONLY. No files or capabilities.
import test from 'node:test';
import assert from 'node:assert/strict';
import {admitSpecificityTest,TEST_ADMISSION_LIMITS} from './test-admission.js';
import {inventedFixture,builderInput,H,T} from './producer-profile.test.mjs';
import {digest,sha} from './manifest.js';
import {buildSpecificityTrainReferences} from './reference-builder.js';
import {createTrainReferenceCodec} from './reference-codec.js';
import {compileNativeRootRankCandidate,describeNativeRootRankCandidate,prepareNativeRootInput} from '../../../../../apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js';
import {fitNativeLocalDetailCalibration} from '../../../../../apps/local-service/experiments/topic-encoder/native-local-detail-calibration-v1/fit.js';
const clone=structuredClone,wire=v=>Buffer.from(JSON.stringify(v)),idHash=(v,k)=>{const {[k]:ignored,...body}=v;v[k]=digest(body);};
let cached;
// Independently authored ADR218 metadata transcript. This is an invented
// committed control, never a substitute for the actual IO/writer causal tests.
function authoredFinishFixture(f,head){
 const s=f.supervisor,o=f.outer,cp=p=>Object.fromEntries([['sequence',p.sequence],['chainHash',p.chainHash]]);
 const bindings=[['sourceIdentityHash',s.sourceIdentityHash],['sourceMapHash',o.sourceMapHash],['nodeIdentityHash',o.nodeIdentityHash],
  ['readySha256',o.readySha256],['startupAckSha256',o.startupAckSha256],['baselineHash',o.baselineHash]];
 const finish=Object.fromEntries([['schema','native-specificity-finish-request/v1'],['phase','train-cal'],...bindings,
  ['resultSha256',s.resultSha256],['selectionSha256',s.selectionSha256],['finalDrainAckHash',s.guardianComplete.finalAckHash],['fsProofCheckpoint',cp(s.stats.fsProofCheckpoints.finish)]]);
 const request=Object.fromEntries([['schema','native-specificity-finish-publication-request/v1'],['controlSequence',1],['phase','train-cal'],...bindings,
  ['finishRequestSha256',sha(wire(finish))],['fsProofCheckpoint',cp(head)]]);
 const requestHash=sha(wire(request));
 const body=Object.fromEntries([['schema','native-specificity-finish-publication-receipt/v1'],['controlSequence',1],['phase','train-cal'],...bindings,
  ['requestHash',requestHash],['finishRequestSha256',request.finishRequestSha256],['fsProofCheckpoint',cp(head)]]);
 const receipt={...body,receiptHash:sha(wire(body))};
 return {finish,request,receipt,evidence:{schema:'native-specificity-finish-publication-evidence/v1',controlSequence:1,
  fsProofCheckpoint:cp(head),controlRequestHash:requestHash,controlReceiptHash:sha(wire(receipt))}};
}
function fixture(){
 if(cached)return clone(cached);
 const f=inventedFixture(),built=buildSpecificityTrainReferences(builderInput(f)),cal=f.manifest.cases.filter(c=>c.split==='calibration');
 // Exercise the unchanged fitter only on invented unavailable CAL observations.
 const fitted=fitNativeLocalDetailCalibration({schema:'native-local-detail-calibration/v1',rootCandidate:f.rootCandidate,detailTemplate:built.detailTemplate,trainingCaseIds:built.trainingCaseIds,trainingGroupIds:built.trainingGroupIds,cases:cal.map(c=>({id:c.id,groupId:c.groupId,language:c.language,gold:c.assessmentGold,observation:{status:'unavailable'}}))});
 const {calibratedArtifact,...calibrationAudit}=fitted,codec=createTrainReferenceCodec({expectedManifestHash:f.manifest.manifestHash,expectedInputConstructionHash:built.constructionHash,trainingCases:built.trainingCases}),referencePacket=codec.encode(calibratedArtifact);
 const context={freezeFileSha256:sha('inventedfreezeFILE'),freezeHash:sha('inventedfreeze'),sourceMapHash:sha('inventedsourcemap'),panelIdentity:f.manifest.panelIdentity,manifestHash:f.manifest.manifestHash,producerRecipeHash:f.profileSet.recipeHash,rootReuseReceiptHash:H,rootTransferHash:describeNativeRootRankCandidate(compileNativeRootRankCandidate(f.rootCandidate)).transferHash,manifest:f.manifest,rootCandidate:f.rootCandidate};
 const captureHash=sha('inventedcapture'),rows=f.manifest.cases.filter(c=>c.split!=='test').map((c,i)=>{
  const batch=f.manifest.batches[Math.floor(i/4)],common={id:c.id,groupId:c.groupId,split:c.split,globalOrdinal:c.globalOrdinal,nativeOrdinal:i%4+1,batchId:batch.batchId,status:i<48?'available':'unavailable',inputIdentity:sha('input'+i),assessmentGoldHash:c.assessmentGold===null?null:digest(c.assessmentGold),referenceAnnotationHash:c.referenceAnnotation===null?null:digest(c.referenceAnnotation)};
  if(i>=48)return {...common,reason:'article-unavailable'};const n=f.trainingRows[i].nativeInput;
  return {...common,inputIdentity:n.sourceInputHash,sourceVersion:n.sourceVersion,producerProfileHash:n.producerProfileHash,inputConstructionHash:n.inputConstructionHash,extractorVersion:n.extractorVersion,fieldBindings:n.fieldBindings,nativeWitnessHash:digest(n.nativeWitness),rightsEvidenceHash:n.rightsEvidenceHash,...f.trainingRows[i].vectorBindings};
 });
 const inputLedger={schema:'native-specificity-ordered-input-metadata/v1',phase:'train-cal',manifestHash:context.manifestHash,captureHash,rows};inputLedger.ledgerHash=digest(inputLedger);
 const selection={schema:'native-specificity-selected-detail/v1',panelIdentity:context.panelIdentity,manifestHash:context.manifestHash,producerRecipeHash:context.producerRecipeHash,rootReuseReceiptHash:H,rootTransferHash:context.rootTransferHash,inputLedgerHash:inputLedger.ledgerHash,referenceConstruction:built.construction,constructionHash:built.constructionHash,trainingCases:built.trainingCases,trainingCaseIds:built.trainingCaseIds,trainingGroupIds:built.trainingGroupIds,calibrationGroupIds:cal.map(c=>c.groupId),referencePacket,detailInputDefinition:built.detailTemplate.inputDefinition,supportedRootIds:built.detailTemplate.supportedRootIds,calibrationAudit,calibrationSelections:1,independentCalibrationValidation:false,productionValidated:false,assignmentAuthority:false};selection.selectionIdentity=digest(selection);
 const receipts=f.manifest.batches.filter(b=>b.phase==='train-cal').map((b,i)=>({batchId:b.batchId,receiptHash:sha('inventedreceipt'+i),completedBatches:i+1})),batchReceiptHashes=receipts.map(r=>r.receiptHash);
 const report={schema:'native-specificity-phase-composition/v1',phase:'train-cal',panelIdentity:context.panelIdentity,manifestHash:context.manifestHash,rootReuseReceiptHash:H,capture:{captureHash,accounted:96,available:48,batchReceiptHashes},encoding:{captureHash,encoderCalls:96,available:48,encodingStartedAt:1,encodingCompletedAt:2,rawTextRetained:false,vectorBindings:rows.slice(0,48).map(r=>({id:r.id,bodyVectorHash:r.bodyVectorHash,titleVectorHash:r.titleVectorHash}))},receipts,inputLedger,semantic:{status:'selected-pending-independent-audit',accounted:96,referenceCount:48,calibrationSelections:1,selectionIdentity:selection.selectionIdentity,packetHash:referencePacket.packetHash,artifactHash:referencePacket.artifactHash,testAllowed:false},normalEncoderClosed:true,sourceAssetEndchecksPassed:true,actualIoAndSupervisorProofRequired:true,productionValidated:false,assignmentAuthority:false,networkPacing:{schema:'native-specificity-origin-pacing/v1',originDelays:[{origin:'https://publisher0.org',maximumDelayMs:2000}],clockCarried:false}};
 const outer={schema:'native-specificity-study-result/v1',phase:'train-cal',freezeHash:context.freezeHash,sourceMapHash:context.sourceMapHash,nodeIdentityHash:T,readySha256:H,startupAckSha256:H,baselineHash:H,result:report,selectionSha256:sha(wire(selection)),fsProofCheckpoint:{sequence:100,chainHash:H},sourceAssetEndchecksPassed:true,productionValidated:false,assignmentAuthority:false};
 const supervisor={schema:'native-specificity-study-supervisor/v1',phase:'train-cal',sourceIdentityHash:context.freezeFileSha256,sourceIdentityKind:'freeze-file',freezeHash:context.freezeHash,sourceMapHash:context.sourceMapHash,nodeIdentityHash:T,normalExit:true,exitCode:0,normalEmptyJob:true,endchecksPassed:true,resultSha256:sha(wire(outer)),selectionSha256:sha(wire(selection)),guardianComplete:{phase:'train-cal',captureHash,batchReceiptHashes,finalAckHash:H,cpuSeconds:1.0,pending:0},stats:{peakRssBytes:1,peakPrivateBytes:1,peakJobMembers:1,peakCpuSeconds:1,peakStudyBytes:1,peakStudyEntries:1,fsProofSequence:103,fsProofChainHash:H,fsProofWireBytes:20000,fsProofMaximumFrame:1000,fsProofCheckpoints:{result:outer.fsProofCheckpoint,finish:{sequence:101,chainHash:H},completion:{sequence:103,chainHash:H}},rawProofFramesRetained:false,jobEnumeration:{schema:'native-specificity-job-enumeration/v1',logicalObservations:10,physicalQueries:10,retryQueries:0,firstMismatch:null},finishPublication:null},emergencyOwnJobTermination:false,ownCleanupPassed:true,failure:null,cleanupFailure:null,productionValidated:false,assignmentAuthority:false,supervisorHash:H};
 // Result head100, finish-request head101, original publication settled at
 // head102, control physically committed there, completion head103. No FS
 // sequence is invented for the control itself; its aggregate count is one.
 supervisor.stats.finishPublication=authoredFinishFixture({supervisor,outer},{sequence:102,chainHash:H}).evidence;
 const audit={schema:'native-specificity-independent-selection-audit/v1',phase:'train-cal',...Object.fromEntries(Object.keys(context).filter(k=>!['manifest','rootCandidate'].includes(k)).map(k=>[k,context[k]])),trainFiles:{supervisorSha256:sha(wire(supervisor)),resultSha256:sha(wire(outer)),selectionSha256:sha(wire(selection))},trainNodeIdentityHash:T,selectionIdentity:selection.selectionIdentity,packetHash:referencePacket.packetHash,artifactHash:referencePacket.artifactHash,inputLedgerHash:inputLedger.ledgerHash,review:{selectedPolicyAndBindingsChecked:true,fullGridReplay:false,omittedQueryFeaturesNotRecomputed:true,testPermitted:true,scope:'fixed-168-specificity/v1'}};audit.auditIdentity=digest(audit);
 cached={context,supervisor,outer,selection,audit};return clone(cached);
}
function args(f=fixture()){
 const bundle={auditBytes:wire(f.audit),supervisorBytes:wire(f.supervisor),resultBytes:wire(f.outer),selectionBytes:wire(f.selection)};
 return {expectedAuditFileHash:sha(bundle.auditBytes),bundle,context:f.context,guard:()=>true};
}
function reseal(f,refreshFinish=true){
 idHash(f.outer.result.inputLedger,'ledgerHash');f.selection.inputLedgerHash=f.outer.result.inputLedger.ledgerHash;f.audit.inputLedgerHash=f.selection.inputLedgerHash;
 idHash(f.selection,'selectionIdentity');f.audit.selectionIdentity=f.selection.selectionIdentity;f.outer.result.semantic.selectionIdentity=f.selection.selectionIdentity;
 f.outer.selectionSha256=sha(wire(f.selection));f.supervisor.selectionSha256=f.outer.selectionSha256;f.supervisor.resultSha256=sha(wire(f.outer));
 // Explicitly re-author the existing invented committed transcript for changed
 // fixture FILEs. Missing/null evidence is NEVER upgraded to a successful one.
 if(refreshFinish&&f.supervisor.stats.finishPublication!==null&&Object.hasOwn(f.supervisor.stats,'finishPublication'))
  f.supervisor.stats.finishPublication=authoredFinishFixture(f,f.supervisor.stats.finishPublication.fsProofCheckpoint).evidence;
 f.audit.trainFiles={supervisorSha256:sha(wire(f.supervisor)),resultSha256:sha(wire(f.outer)),selectionSha256:sha(wire(f.selection))};idHash(f.audit,'auditIdentity');return f;
}
test('closed saved-TRAIN bundle admits exact96/24 joins and codec, returns pacing not clock authority',()=>{
 const a=args(),admitted=admitSpecificityTest(a);assert.equal(admitted.manifestHash,a.context.manifestHash);assert.equal(admitted.selectionIdentity,fixture().selection.selectionIdentity);assert.ok(Object.isFrozen(admitted.selection.referenceConstruction));
 assert.deepEqual(admitted.networkPacing,fixture().outer.result.networkPacing);assert.equal(admitted.networkPacing.clockCarried,false);assert.equal(Object.hasOwn(admitted,'inputLedger'),false);
});
test('ADR218 authored control preserves exact insertion order and separates complete receipt from body and LF domains',()=>{
 const f=fixture(),e=f.supervisor.stats.finishPublication,t=authoredFinishFixture(f,e.fsProofCheckpoint);
 assert.deepEqual(Object.keys(t.request),['schema','controlSequence','phase','sourceIdentityHash','sourceMapHash','nodeIdentityHash','readySha256','startupAckSha256','baselineHash','finishRequestSha256','fsProofCheckpoint']);
 assert.deepEqual(Object.keys(t.receipt),['schema','controlSequence','phase','sourceIdentityHash','sourceMapHash','nodeIdentityHash','readySha256','startupAckSha256','baselineHash','requestHash','finishRequestSha256','fsProofCheckpoint','receiptHash']);
 assert.deepEqual(Object.keys(e),['schema','controlSequence','fsProofCheckpoint','controlRequestHash','controlReceiptHash']);
 assert.deepEqual(Object.keys(e.fsProofCheckpoint),['sequence','chainHash']);
 assert.equal(e.controlRequestHash,sha(wire(t.request)));assert.equal(e.controlReceiptHash,sha(wire(t.receipt)));
 assert.notEqual(e.controlReceiptHash,t.receipt.receiptHash);assert.notEqual(e.controlReceiptHash,sha(Buffer.concat([wire(t.receipt),Buffer.from('\n')])));
 assert.ok(admitSpecificityTest(args(f)));
 for(const edit of [
  (e,t)=>{e.controlReceiptHash=t.receipt.receiptHash;},
  (e,t)=>{e.controlReceiptHash=sha(Buffer.concat([wire(t.receipt),Buffer.from('\n')]));},
  (e,t)=>{e.controlRequestHash=sha(Buffer.concat([wire(t.request),Buffer.from('\n')]));},
  (e,t)=>{const {receiptHash,...body}=t.receipt;e.controlReceiptHash=sha(wire({...body,receiptHash:sha(wire(t.receipt))}));},
 ]){const g=fixture(),e=g.supervisor.stats.finishPublication;edit(e,authoredFinishFixture(g,e.fsProofCheckpoint));assert.throws(()=>admitSpecificityTest(args(reseal(g,false))));}
});

test('ADR218 null legacy, unknown, malformed, replayed and out-of-order committed evidence cannot gain TEST authority',()=>{
 for(const edit of [
  s=>{delete s.finishPublication;},s=>{s.finishPublication=null;},s=>{s.finishPublication.schema='other';},
  s=>{s.finishPublication.extra=true;},s=>{delete s.finishPublication.controlReceiptHash;},
  ...[true,false,0,-0,2,'1',null].map(v=>s=>{s.finishPublication.controlSequence=v;}),
  s=>{s.finishPublication.fsProofCheckpoint.sequence=100;},s=>{s.finishPublication.fsProofCheckpoint.sequence=104;},
  s=>{s.finishPublication.fsProofCheckpoint.sequence=-0;},s=>{s.finishPublication.fsProofCheckpoint.sequence=true;},
  s=>{s.finishPublication.fsProofCheckpoint={sequence:101,chainHash:T};},
  s=>{s.finishPublication.fsProofCheckpoint={sequence:103,chainHash:T};},
  s=>{s.finishPublication.fsProofCheckpoint.extra=0;},s=>{s.finishPublication.controlRequestHash=T;},s=>{s.finishPublication.controlReceiptHash=T;},
 ]){const f=fixture();edit(f.supervisor.stats);assert.throws(()=>admitSpecificityTest(args(reseal(f,false))));}
 const f=fixture(),old=f.supervisor.stats.finishPublication;f.outer.readySha256=T;reseal(f);f.supervisor.stats.finishPublication=old;
 assert.throws(()=>admitSpecificityTest(args(reseal(f,false))));
 // Re-author consistent hashes too: equality itself is stale, independent of
 // the byte joins. Original publication and ACK reads both require FS work.
 for(const sequence of [101,103]){const g=fixture();g.supervisor.stats.finishPublication.fsProofCheckpoint={sequence,chainHash:H};
  assert.throws(()=>admitSpecificityTest(args(reseal(g))));}
});

test('ADR218 even mutually hashed foreign request and receipt must match authenticated fixed finish/startup/FS joins',()=>{
 for(const edit of [
  q=>{q.phase='prepare';},q=>{q.sourceIdentityHash=T;},q=>{q.sourceMapHash=T;},q=>{q.nodeIdentityHash=H;},
  q=>{q.readySha256=T;},q=>{q.startupAckSha256=T;},q=>{q.baselineHash=T;},q=>{q.finishRequestSha256=T;},
  q=>{q.fsProofCheckpoint={sequence:101,chainHash:H};},q=>{q.controlSequence=2;},q=>{q.extra=0;},
 ]){const f=fixture(),e=f.supervisor.stats.finishPublication,t=authoredFinishFixture(f,e.fsProofCheckpoint);edit(t.request);
  e.controlRequestHash=sha(wire(t.request));const {receiptHash,...body}=t.receipt;body.requestHash=e.controlRequestHash;
  e.controlReceiptHash=sha(wire({...body,receiptHash:sha(wire(body))}));
  assert.throws(()=>admitSpecificityTest(args(reseal(f,false))));
 }
 const f=fixture(),e=f.supervisor.stats.finishPublication,t=authoredFinishFixture(f,e.fsProofCheckpoint);
 e.controlRequestHash=sha(wire(Object.fromEntries(Object.entries(t.request).reverse())));
 assert.throws(()=>admitSpecificityTest(args(reseal(f,false))));
});

test('ADR218 one control shares the original65536 aggregate cap without entering FS history',()=>{
 const f=fixture(),s=f.supervisor.stats;s.fsProofSequence=65535;s.fsProofCheckpoints.completion.sequence=65535;
 s.finishPublication.fsProofCheckpoint.sequence=65534;assert.ok(admitSpecificityTest(args(reseal(f))));
 assert.deepEqual(Object.keys(s.fsProofCheckpoints),['result','finish','completion']);
 const g=fixture();g.supervisor.stats.fsProofSequence=65536;g.supervisor.stats.fsProofCheckpoints.completion.sequence=65536;
 g.supervisor.stats.finishPublication.fsProofCheckpoint.sequence=65535;assert.throws(()=>admitSpecificityTest(args(reseal(g))));
});

test('available CAL rows join all192 vector bindings without persisting their query vectors',()=>{
 const f=fixture(),source=inventedFixture(),built=buildSpecificityTrainReferences(builderInput(source)),root=compileNativeRootRankCandidate(source.rootCandidate),cal=source.manifest.cases.filter(c=>c.split==='calibration'),observations=[];
 for(let i=0;i<48;i++){
  const c=cal[i],row=f.outer.result.inputLedger.rows[i+48],native=clone(source.trainingRows[i].nativeInput),{sourceInputHash,bodyVector,titleVector,...metadata}=native,w=metadata.nativeWitness,url=c.publicUrl;
  metadata.sourceId=c.id;metadata.sourceVersion='cal-observation-'+i;w.caseId=c.id;w.studyId='study-'+row.batchId;w.studyRevision=row.batchId;w.observationNonce=metadata.sourceVersion;w.ordinal=row.nativeOrdinal;w.sourceUrl=url;w.documentUrl=url;w.attestation.url=url;w.foregroundChecks.forEach(g=>{g.sourceUrl=url;g.documentUrl=url;});
  const prepared=prepareNativeRootInput(root,metadata),vectorBindings=source.trainingRows[i].vectorBindings;
  const {reason,...common}=row;
  f.outer.result.inputLedger.rows[i+48]={...common,status:'available',inputIdentity:prepared.sourceInputHash,sourceVersion:prepared.sourceVersion,producerProfileHash:prepared.producerProfileHash,inputConstructionHash:prepared.inputConstructionHash,extractorVersion:prepared.extractorVersion,fieldBindings:prepared.fieldBindings,nativeWitnessHash:digest(prepared.nativeWitness),rightsEvidenceHash:prepared.rightsEvidenceHash,...vectorBindings};
  observations.push({id:c.id,groupId:c.groupId,language:c.language,gold:c.assessmentGold,observation:{status:'available',nativeInput:{...prepared,bodyVector,titleVector}}});
 }
 const {calibratedArtifact,...calibrationAudit}=fitNativeLocalDetailCalibration({schema:'native-local-detail-calibration/v1',rootCandidate:source.rootCandidate,detailTemplate:built.detailTemplate,trainingCaseIds:built.trainingCaseIds,trainingGroupIds:built.trainingGroupIds,cases:observations}),packet=createTrainReferenceCodec({expectedManifestHash:source.manifest.manifestHash,expectedInputConstructionHash:built.constructionHash,trainingCases:built.trainingCases}).encode(calibratedArtifact);
 f.selection.calibrationAudit=calibrationAudit;f.selection.referencePacket=packet;f.audit.packetHash=packet.packetHash;f.audit.artifactHash=packet.artifactHash;
 f.outer.result.capture.available=96;f.outer.result.encoding.available=96;f.outer.result.encoding.encoderCalls=192;f.outer.result.encoding.vectorBindings=f.outer.result.inputLedger.rows.map(r=>({id:r.id,bodyVectorHash:r.bodyVectorHash,titleVectorHash:r.titleVectorHash}));f.outer.result.semantic.packetHash=packet.packetHash;f.outer.result.semantic.artifactHash=packet.artifactHash;
 const admitted=admitSpecificityTest(args(reseal(f)));assert.equal(admitted.selection.calibrationAudit.availability.inputAvailable,48);assert.equal(JSON.stringify(admitted).includes('"bodyVector"'),false);assert.equal(JSON.stringify(admitted).includes('"titleVector"'),false);
 f.outer.result.encoding.vectorBindings[95].bodyVectorHash=T;assert.throws(()=>admitSpecificityTest(args(reseal(f))));
});
test('external audit FILE SHA precedes any parser and all three TRAIN hashes precede TRAIN parsing',()=>{
 const a=args();a.bundle.auditBytes=Buffer.from('{invalid');assert.throws(()=>admitSpecificityTest(a));
 const f=fixture(),x=args(f);x.bundle.supervisorBytes=Buffer.from('{invalid');assert.throws(()=>admitSpecificityTest(x));
 // Authenticate invalid supervisor too: remaining wrong result hash must still
 // stop before JSON parser, demonstrated with global parser hooks unused.
 let hooks=0;const original=JSON.parse;JSON.parse=()=>{hooks++;throw Error();};try{assert.throws(()=>admitSpecificityTest(x));assert.equal(hooks,0);}finally{JSON.parse=original;}
});
test('strict JSON rejects duplicate decoded keys, invalid UTF8, malformed UTF16, nonfinite and depth',()=>{
 for(const raw of ['{"schema":1,"\\u0073chema":2}','{"x":1e999}','{"x":"\\ud800"}','['.repeat(25)+'0'+']'.repeat(25),'[1,]','{"__proto__":{},"__proto__":{}}']){const a=args();a.bundle.auditBytes=Buffer.from(raw);a.expectedAuditFileHash=sha(a.bundle.auditBytes);assert.throws(()=>admitSpecificityTest(a));}
 const a=args();a.bundle.auditBytes=Buffer.from([0xc0,0xaf]);a.expectedAuditFileHash=sha(a.bundle.auditBytes);assert.throws(()=>admitSpecificityTest(a));assert.equal({}.polluted,undefined);
});
test('Python finite numeric spelling in supervisor is accepted without JS stringify FILE equivalence',()=>{
 const f=fixture(),a=args(f);a.bundle.supervisorBytes=Buffer.from(JSON.stringify(f.supervisor).replace('"cpuSeconds":1,','"cpuSeconds":1.0,'));assert.notDeepEqual(a.bundle.supervisorBytes,wire(f.supervisor));f.audit.trainFiles.supervisorSha256=sha(a.bundle.supervisorBytes);idHash(f.audit,'auditIdentity');a.bundle.auditBytes=wire(f.audit);a.expectedAuditFileHash=sha(a.bundle.auditBytes);assert.ok(admitSpecificityTest(a));
});

test('ADR184 normal enumeration counters are closed, finite, overflow-safe and retain first retry mismatch',()=>{
 for(const dto of [
  {schema:'native-specificity-job-enumeration/v1',logicalObservations:10,physicalQueries:12,retryQueries:2,firstMismatch:{assigned:4,listed:2}},
  {schema:'native-specificity-job-enumeration/v1',logicalObservations:Number.MAX_SAFE_INTEGER,physicalQueries:Number.MAX_SAFE_INTEGER,retryQueries:0,firstMismatch:null},
 ]){const f=fixture();f.supervisor.stats.jobEnumeration=dto;assert.ok(admitSpecificityTest(args(reseal(f))));}
 for(const edit of [
  d=>{d.schema='other';},d=>{d.extra=0;},d=>{delete d.physicalQueries;},d=>{d.logicalObservations=-1;},d=>{d.physicalQueries=9;},d=>{d.physicalQueries=31;d.retryQueries=21;},d=>{d.retryQueries=1;},
  d=>{d.logicalObservations=1.5;},d=>{d.logicalObservations=Number.MAX_SAFE_INTEGER+1;},d=>{d.logicalObservations='10';},d=>{d.logicalObservations=null;},d=>{d.logicalObservations=-0;},
  d=>{d.physicalQueries=11;d.retryQueries=1;},
  d=>{d.firstMismatch={assigned:4,listed:2};},d=>{d.physicalQueries=11;d.retryQueries=1;d.firstMismatch={assigned:4,listed:4};},
  d=>{d.physicalQueries=11;d.retryQueries=1;d.firstMismatch={assigned:128,listed:127};},
  d=>{d.physicalQueries=11;d.retryQueries=1;d.firstMismatch={assigned:4294967296,listed:0};},
  d=>{d.physicalQueries=11;d.retryQueries=1;d.firstMismatch={assigned:4,listed:2,pid:123};},
 ]){const f=fixture();edit(f.supervisor.stats.jobEnumeration);assert.throws(()=>admitSpecificityTest(args(reseal(f))));}
 const f=fixture();delete f.supervisor.stats.jobEnumeration;assert.throws(()=>admitSpecificityTest(args(reseal(f))));
});
test('abnormal supervisor and mismatched epoch/node/file joins refuse even consistently reauthenticated',()=>{
 for(const edit of [f=>{f.supervisor.normalExit=false;},f=>{f.supervisor.exitCode=1;},f=>{f.supervisor.normalEmptyJob=false;},f=>{f.supervisor.endchecksPassed=false;},f=>{f.supervisor.ownCleanupPassed=false;},f=>{f.supervisor.emergencyOwnJobTermination=true;},f=>{f.supervisor.failure={family:'supervisor',code:'x'};},f=>{f.supervisor.cleanupFailure='x';},f=>{f.supervisor.guardianComplete.pending=1;},f=>{f.supervisor.nodeIdentityHash=H;},f=>{f.outer.freezeHash=H;},f=>{f.supervisor.sourceIdentityHash=H;}]){const f=fixture();edit(f);assert.throws(()=>admitSpecificityTest(args(reseal(f))));}
});
test('all96 metadata rows retain exact case/group/order/split/gold and available vector bindings',()=>{
 for(const edit of [r=>{r.rows.pop();},r=>{r.rows.reverse();},r=>{r.rows[0].groupId='other';},r=>{r.rows[0].split='test';},r=>{r.rows[0].globalOrdinal=2;},r=>{r.rows[0].nativeOrdinal=4;},r=>{r.rows[0].assessmentGoldHash=H;},r=>{r.rows[0].bodyVectorHash=H;},r=>{r.rows[0].fieldBindings.bodyCharacters=4097;},r=>{r.rows[48].reason='made-up';}]){const f=fixture();edit(f.outer.result.inputLedger);assert.throws(()=>admitSpecificityTest(args(reseal(f))));}
});
test('24 unique ordered receipts and final/capture/encoding joins cannot be replaced by counts',()=>{
 for(const edit of [r=>r.receipts.pop(),r=>r.receipts.reverse(),r=>{r.receipts[0].completedBatches=2;},r=>{r.capture.batchReceiptHashes[0]=r.capture.batchReceiptHashes[1];},r=>{r.capture.captureHash=H;},r=>{r.encoding.encoderCalls=192;},r=>{r.encoding.vectorBindings.pop();}]){const f=fixture();edit(f.outer.result);assert.throws(()=>admitSpecificityTest(args(reseal(f))));}
 const f=fixture();f.supervisor.guardianComplete.finalAckHash=null;assert.throws(()=>admitSpecificityTest(args(reseal(f))));
});
test('selection packet, exact48 annotations, construction/ledger and immutable root cuts checked by real adapters',()=>{
 for(const edit of [f=>{f.selection.trainingCases.pop();},f=>{f.selection.trainingCases[0].referenceAnnotation.kind='stop';},f=>{f.selection.trainingCaseIds.reverse();},f=>{f.selection.trainingGroupIds.pop();},f=>{f.selection.referenceConstruction.orderedAssociations[0].bodyVectorHash=H;},f=>{f.selection.referencePacket.text+=' ';},f=>{f.selection.referencePacket.artifactHash=H;},f=>{f.context.rootCandidate.rootPolicy.minWinnerScore=.3;},f=>{f.selection.calibrationAudit.rootGate.rootCutsRetuned=true;},f=>{f.selection.calibrationSelections=2;},f=>{f.selection.calibrationAudit.nodeAudits[0].enabled=true;}]){const f=fixture();edit(f);assert.throws(()=>admitSpecificityTest(args(reseal(f))));}
});
test('no supplied review boolean establishes independent grid replay or production authority',()=>{
 for(const edit of [f=>{f.audit.review.testPermitted=false;},f=>{f.audit.review.fullGridReplay=true;},f=>{f.audit.review.omittedQueryFeaturesNotRecomputed=false;},f=>{f.audit.review.extra=true;},f=>{f.selection.productionValidated=true;},f=>{f.selection.calibrationAudit.bodyVector=[1];}]){const f=fixture();edit(f);assert.throws(()=>admitSpecificityTest(args(reseal(f))));}
});
test('network pacing is exact primary origin-only sorted unique bounded delays and no carried clock',()=>{
 for(const pacing of [{schema:'native-specificity-origin-pacing/v1',originDelays:[{origin:'https://unpkg.com',maximumDelayMs:2000}],clockCarried:false},{schema:'native-specificity-origin-pacing/v1',originDelays:[{origin:'https://publisher0.org',maximumDelayMs:1999}],clockCarried:false},{schema:'native-specificity-origin-pacing/v1',originDelays:[{origin:'https://publisher0.org',maximumDelayMs:86400001}],clockCarried:false},{schema:'native-specificity-origin-pacing/v1',originDelays:[{origin:'https://publisher0.org',maximumDelayMs:2000},{origin:'https://publisher0.org',maximumDelayMs:3000}],clockCarried:false},{schema:'native-specificity-origin-pacing/v1',originDelays:[],clockCarried:true}]){const f=fixture();f.outer.result.networkPacing=pacing;assert.throws(()=>admitSpecificityTest(args(reseal(f))));}
 const f=fixture();f.outer.result.networkPacing.originDelays=[];assert.ok(admitSpecificityTest(args(reseal(f))));
});
test('descriptor/proxy/Promise inputs invoke no hooks or async admission authority',()=>{
 let hooks=0;const a=args();Object.defineProperty(a,'context',{get(){hooks++;throw Error();},enumerable:true});assert.throws(()=>admitSpecificityTest(a));assert.equal(hooks,0);
 const b=args();b.context=new Proxy(b.context,{getPrototypeOf(){hooks++;throw Error();}});assert.throws(()=>admitSpecificityTest(b));assert.equal(hooks,0);
 const raw=Buffer.from('invented');Object.setPrototypeOf(raw,new Proxy(Buffer.prototype,{getPrototypeOf(){hooks++;throw Error();}}));const bad=args();bad.bundle.auditBytes=raw;assert.throws(()=>admitSpecificityTest(bad));assert.equal(hooks,0);
 const c=args(),p=Promise.resolve(true);Object.defineProperty(p,'constructor',{get(){hooks++;throw Error();}});c.guard=()=>p;assert.throws(()=>admitSpecificityTest(c));assert.equal(hooks,0);
 class Sub extends Promise{}const d=args(),q=Sub.resolve(true);Object.defineProperty(q,'then',{get(){hooks++;throw Error();}});d.guard=()=>q;assert.throws(()=>admitSpecificityTest(d));assert.equal(hooks,0);
 const e=args();e.guard=()=>Promise.reject(Error('invented safely observed'));assert.throws(()=>admitSpecificityTest(e));
});
test('held synchronous guard brackets work and final return; no late false guard admission',()=>{
 for(const stop of [1,2,3,4,5,6,7,8,9,10]){const a=args();let calls=0;a.guard=()=>++calls===stop?false:true;assert.throws(()=>admitSpecificityTest(a));assert.equal(calls,stop);}
});
test('saved CAL outcome counts/metadata rejoin manifest without replaying omitted features',()=>{
 for(const edit of [f=>{f.selection.calibrationAudit.finalCalibrationAudit.assessment.cases.total=47;},f=>{f.selection.calibrationAudit.finalCalibrationAudit.assessment.outcomes[0].groupId='other';},f=>{f.selection.calibrationAudit.finalCalibrationAudit.assessment.outcomes[0].goldPath=['science'];},f=>{f.selection.calibrationAudit.finalCalibrationAudit.assessment.outcomes.reverse();}]){const f=fixture();edit(f);assert.throws(()=>admitSpecificityTest(args(reseal(f))));}
});
test('FILE and strict JSON resource caps fail closed before oversized materialization',()=>{
 assert.equal(TEST_ADMISSION_LIMITS.auditBytes,65536);for(const k of ['auditBytes','supervisorBytes','resultBytes','selectionBytes']){const a=args();a.bundle[k]=Buffer.alloc(k==='auditBytes'?65537:524289,32);if(k==='auditBytes')a.expectedAuditFileHash=sha(a.bundle[k]);assert.throws(()=>admitSpecificityTest(a));}
 for(const raw of ['['+'0,'.repeat(1024)+'0]','{'+Array.from({length:129},(_,i)=>'"x'+i+'":0').join(',')+'}']){const a=args();a.bundle.auditBytes=Buffer.from(raw);a.expectedAuditFileHash=sha(a.bundle.auditBytes);assert.throws(()=>admitSpecificityTest(a));}
});
