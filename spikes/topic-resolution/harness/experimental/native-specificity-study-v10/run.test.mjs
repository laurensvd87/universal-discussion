// All geometry, text and observations below are invented. No actual capability.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpecificityPhaseRunner,assessSpecificityTest} from './run.mjs';
import {publishSpecificityTrainSelection} from './driver.mjs';
import {inventedFixture,axis,H,T} from './producer-profile.test.mjs';
import {buildSpecificityManifest,digest,sha} from './manifest.js';
import {buildSpecificityProducerProfile} from './producer-profile.js';
import {MODEL_ID} from '../../../browser/embedding/embedding-contract.js';
import {createTrainReferenceCodec} from './reference-codec.js';
import {compilePairedE5Input,applyPairedE5Input} from '../../../../../apps/local-service/src/domain/hierarchical-e5-paired-input.js';
const LEAVES=['gta','minecraft','koalas','dolphins','kapsalon','pasta'];
const STOPS=['games','video-games','nature','animals','cooking','recipes'];
const PATHS={gta:['games','video-games','gta'],minecraft:['games','video-games','minecraft'],koalas:['nature','animals','koalas'],dolphins:['nature','animals','dolphins'],kapsalon:['cooking','recipes','kapsalon'],pasta:['cooking','recipes','pasta'],games:['games'],'video-games':['games','video-games'],nature:['nature'],animals:['nature','animals'],cooking:['cooking'],recipes:['cooking','recipes']};
const clone=structuredClone;
function fixture({varied=false}={}){
 const original=inventedFixture(),cases=clone(original.manifest.cases).map(({globalOrdinal,...c})=>c);
 const cal=cases.filter(c=>c.split==='calibration');
 for(let i=0;i<48;i++){const c=cal[i];if(i<24){c.nodeId=LEAVES[Math.floor(i/4)];c.role='leaf';c.proposedGold={kind:'complete',path:PATHS[c.nodeId]};}
  else if(i<36){c.nodeId=STOPS[Math.floor((i-24)/2)];c.role='parent-stop';c.proposedGold={kind:'complete',path:PATHS[c.nodeId]};}
  else{c.nodeId='science';c.role='scoped-confounder';c.proposedGold={kind:'prefix',path:['science']};}c.assessmentGold=clone(c.proposedGold);}
 const testCases=cases.filter(c=>c.split==='test');
 for(let i=0;i<72;i++){const c=testCases[i];if(i>=2&&i<38){c.nodeId=LEAVES[Math.floor((i-2)/6)];c.role='leaf';c.proposedGold={kind:'complete',path:PATHS[c.nodeId]};}
  else if(i>=38&&i<56){c.nodeId=STOPS[Math.floor((i-38)/3)];c.role='parent-stop';c.proposedGold={kind:'complete',path:PATHS[c.nodeId]};}
  else{c.nodeId='science';c.role='scoped-confounder';c.proposedGold={kind:'prefix',path:['science']};}c.assessmentGold=i<2?null:clone(c.proposedGold);}
 if(varied){const otherRoots=original.rootCandidate.rootModel.nodes.map(n=>n.id).filter(id=>!['games','nature','cooking'].includes(id));
  cases.forEach((c,i)=>{c.language=['en','de','nl','fr','es'][i%5];if(c.role==='scoped-confounder'){
   c.nodeId=otherRoots[i%otherRoots.length];c.proposedGold={kind:'prefix',path:[c.nodeId]};if(c.assessmentGold!==null)c.assessmentGold=clone(c.proposedGold);
  }});}
 const body={schema:'hierarchy-native-specificity-panel/v1',cases,counts:{},sourceDigests:{},taxonomy:{unionNodeCount:25},assessmentPolicy:{allOriginalRowsAndDenominatorsRetained:true,unverifiedOrDisputedProposedGoldNeverPassedToAssessor:true},limitations:{},fullyReviewedGoldReady:false,nativeReady:false,modelReady:false,productionValidated:false,assignmentAuthority:false};
 const manifest=buildSpecificityManifest({panel:{...body,panelIdentity:digest(body)},expectedPanelIdentity:digest(body)});
 const profileSet=buildSpecificityProducerProfile({panelIdentity:manifest.panelIdentity,manifestHash:manifest.manifestHash,encoderHash:H,sourceHashes:original.profileSet.construction.sourceHashes});
 const rootCandidate=clone(original.rootCandidate),model=rootCandidate.rootModel;
 model.heads=model.heads.map((head,i)=>{let dims=[40+i];if(head.nodeId==='games')dims=[0,1,10,11];if(head.nodeId==='nature')dims=[2,3,12,13];if(head.nodeId==='cooking')dims=[4,5,14,15];return {...head,intercept:0,weights:Array.from({length:384},(_,j)=>dims.includes(j)?.8:0)};});
 model.parameterHash=digest({schema:model.schema,representation:model.representation,representationHash:model.representationHash,heads:model.heads});
 const {policyHash,...policy}=rootCandidate.rootPolicy;policy.modelHash=digest(model);policy.minWinnerScore=.5;policy.minWinnerGap=.1;rootCandidate.rootPolicy={...policy,policyHash:digest(policy)};
 const {producerId,inputConstructionHash,extractorVersions,effectiveTitleRule}=profileSet.producerProfile;rootCandidate.targetProfile={producerId,inputConstructionHash,extractorVersions,effectiveTitleRule};
 return {manifest,profileSet,rootCandidate};
}
function nativeRow(f,batch,c,options){
 if(options.unavailable?.(c))return {status:'unavailable',caseId:c.id,ordinal:c.nativeOrdinal,reason:'article-unavailable'};
 const pc=f.manifest.cases[c.globalOrdinal-1];let dim=LEAVES.includes(pc.nodeId)?LEAVES.indexOf(pc.nodeId):STOPS.includes(pc.nodeId)?10+STOPS.indexOf(pc.nodeId):40+f.rootCandidate.rootModel.nodes.findIndex(n=>n.id===pc.proposedGold.path[0]);
 if(pc.assessmentGold===null)dim=options.assignUnknown?0:100;
 const text='axis:'+dim,title=options.distinctPairs&&['invented-training-0','invented-calibration-0','invented-test-2'].includes(c.id)?'axis:100':text,url=c.url,nonce='observation-'+c.id,documentId='native-doc-'+c.globalOrdinal;
 const foreground={windowId:7,tabId:3,focused:true,windowType:'normal',incognito:false,active:true,tabStatus:'complete',sourceUrl:url,documentUrl:url,permissionGranted:true};
 const nativeWitness={schema:'chrome-scripting-native-reader/v1',studyId:'study-'+batch.batchId,studyRevision:batch.batchId,caseId:c.id,ordinal:c.nativeOrdinal,observationNonce:nonce,eventEpoch:0,tabId:3,windowId:7,frameId:0,documentId,sourceUrl:url,documentUrl:url,foregroundChecks:[{...foreground},{...foreground},{...foreground}],read:{contractVersion:'page-content/1',status:'collected',documentId},attestation:{contractVersion:'page-content-attestation/1',status:'attested',url},effectiveTitleRule:'trim-or-hostname/v1',nativeDocumentContinuityOnly:true,canonicalAuthority:false};
 const dom={tabId:3,frameId:0,documentId,sourceUrlHash:sha(url),documentUrlHash:sha(url),domPolicyHash:H,canonicalUrlHash:null,canonicalEqualsExpected:false,headComplete:true};
 const rightsEvidence={schema:'native-reader-bracketed-rights/v1',caseId:c.id,ordinal:c.nativeOrdinal,studyId:nativeWitness.studyId,studyRevision:batch.batchId,observationNonce:nonce,eventEpoch:0,documentId,tabId:3,windowId:7,sourceUrlHash:sha(url),documentUrlHash:sha(url),originPolicyHash:H,
  mainResponseJourney:{schema:'native-main-response-journey/v1',finalUrlHash:sha(url),status:200,frameId:'frame',loaderId:'loader',fetchRequestId:'request',fetchResponseId:'response',networkRequestId:'network',requestUrlExact:true,ordinaryTlsSecure:true,selectedPublicPinMatched:true,pinHash:H,headerPolicyHash:H,navigationLoaderVerified:true,domPolicyRequiredSeparately:true,nativeDocumentIdDirectlyCorrelated:false},documentBefore:{...dom},documentAfter:{...dom},sameNativeDocument:true,httpNativeIdDirectlyCorrelated:false};
 const row={status:'collected',caseId:c.id,ordinal:c.nativeOrdinal,rawTitle:title,effectiveTitle:title,body:text,extractorVersion:'main-text-prefix/v1',nativeWitness,rightsEvidence};options.mutateRow?.(row,c);return row;
}
function setup(f,phase='train-cal',selection=null,options={}){
 let time=0,active=null,closed=0,captured=0,released=0,finalAck=false,created=0,fieldCalls=0,authorized=0,healthFailure=null;const events=[],embeddedTexts=[];
 const capabilities={now:()=>time,guard:()=>true,assertCaptureHealthy(){if(healthFailure)throw healthFailure;return true;},
  captureBatch({batch,onRow}){assert.equal(active,null);assert.equal(created,0);active=batch.batchId;for(const c of batch.cases){onRow(nativeRow(f,batch,c,options));captured++;}const summary={batchId:batch.batchId,closed:true};events.push('capture'+batch.batchIndex);return summary;},
  requestBatchDrain({batch,captureSummary,batchCaptureHash,captureSummaryHash}){assert.equal(captureSummary.batchId,batch.batchId);assert.equal(captureSummaryHash,digest(captureSummary));assert.match(batchCaptureHash,/^[0-9a-f]{64}$/);events.push('ack'+batch.batchIndex);return {batchId:batch.batchId,batchCaptureHash,summaryHash:captureSummaryHash};},
  verifyBatchDrain(r){assert.equal(r.guardianReceipt.batchId,r.batch.batchId);assert.equal(r.guardianReceipt.summaryHash,digest(r.captureSummary));assert.equal(r.captureSummaryHash,r.guardianReceipt.summaryHash);assert.equal(r.batchCaptureHash,r.guardianReceipt.batchCaptureHash);return {batchId:r.batch.batchId,manifestHash:r.manifestHash,nodeIdentityHash:r.nodeIdentityHash,batchCaptureHash:r.batchCaptureHash,receiptHash:digest(r.guardianReceipt)};},
  releaseBatch(summary){assert.equal(summary.batchId,active);active=null;released++;events.push('release'+released);},
  requestFinalDrain(r){assert.equal(captured,phase==='test'?72:96);assert.equal(released,phase==='test'?18:24);assert.equal(active,null);assert.equal(created,0);finalAck=true;return {requestHash:r.requestHash,receiptHash:H,nodeIdentityHash:T,requestedAt:time,acknowledgedAt:time};},
  createEncoder(){assert.equal(finalAck,true);created++;return {modelId:MODEL_ID,embed(text){fieldCalls++;embeddedTexts.push(text);return {modelId:MODEL_ID,values:axis(Number(text.slice(5)))};},close(){closed++;return true;}};},
  enterModelStage(r){assert.equal(r.phase,phase);assert.equal(closed,1);assert.equal(active,null);assert.equal(r.stage==='checks'||r.stage===(phase==='train-cal'?'fitting':'assessment'),true);assert.match(r.captureHash,/^[0-9a-f]{64}$/);assert.match(r.encodingHash,/^[0-9a-f]{64}$/);events.push(r.stage);return true;},
  recheckAssetsAndSources:()=>true,authorizeTest(r){authorized++;return {manifestHash:r.manifestHash,selectionIdentity:r.selectionIdentity,auditIdentity:H};}};
 const input={manifest:f.manifest,expectedPanelIdentity:f.manifest.panelIdentity,expectedManifestHash:f.manifest.manifestHash,profileSet:f.profileSet,expectedRecipeHash:f.profileSet.recipeHash,
  rootCandidate:f.rootCandidate,rootReuseReceiptHash:H,phase,selection,nodeIdentityHash:T,phaseDeadline:10000000,capabilities};
 return {input,capabilities,events,embeddedTexts,setTime:n=>{time=n;},setHealth:e=>{healthFailure=e;},counts:()=>({closed,captured,released,created,fieldCalls,authorized})};
}
let successfulSelection;
test('joined invented96 capture→24real-seamACKs→192field calls→one unchanged CAL fit→bit codec',async()=>{
 const f=fixture(),s=setup(f),runner=createSpecificityPhaseRunner(s.input),result=await runner.run();
 assert.equal(result.semantic.status,'selected-pending-independent-audit');assert.equal(result.semantic.calibrationSelections,1);assert.equal(result.semantic.referenceCount,48);
 assert.deepEqual(s.counts(),{closed:1,captured:96,released:24,created:1,fieldCalls:192,authorized:0});assert.equal(runner.snapshot().fitCalls,1);
 let selected=null,takes=0,publishes=0;
 const selectedSha=await publishSpecificityTrainSelection({semantic:result.semantic,
  takeSelection:()=>{takes++;return runner.takeSelection();},publishSelection:value=>{publishes++;selected=value;return H;},guard:()=>true});
 assert.equal(selectedSha,H);assert.equal(takes,1);assert.equal(publishes,1);
 assert.equal(selected.calibrationAudit.availability.cases,48);assert.equal(selected.referencePacket.examples,48);
 assert.equal(result.inputLedger.rows.length,96);assert.equal(selected.inputLedgerHash,result.inputLedger.ledgerHash);
 assert.equal(result.inputLedger.rows[0].bodyVectorHash,result.encoding.vectorBindings[0].bodyVectorHash);assert.ok(result.inputLedger.rows.every(r=>r.inputIdentity&&r.groupId));
 assert.equal(Object.hasOwn(selected.calibrationAudit,'calibratedArtifact'),false);assert.equal(JSON.stringify(selected).includes('"bodyVector"'),false);assert.equal(JSON.stringify(selected).includes('"titleVector"'),false);
 assert.ok(JSON.parse(selected.referencePacket.text).artifact.examples.every(e=>!Object.hasOwn(e,'vector')&&e.vectorBase64.length===4096));
 assert.equal(runner.snapshot().cohort.privateVectorRows,0);assert.equal(runner.snapshot().selectedTrainRetained,false);successfulSelection=selected;
 assert.deepEqual(s.events.slice(-3),['release24','fitting','checks']);
 assert.throws(()=>runner.takeSelection());await assert.rejects(runner.run());
});
test('locked invented72 TEST preserves unknown2, uses actual adapters/assessor, reports both root scoring passes',async()=>{
 const f=fixture(),s=setup(f,'test',successfulSelection),runner=createSpecificityPhaseRunner(s.input),result=await runner.run();
 assert.deepEqual(s.counts(),{closed:1,captured:72,released:18,created:1,fieldCalls:144,authorized:1});
 const a=result.semantic.assessment;assert.equal(a.allCases,72);assert.equal(a.supportedLabelSubreport.composition.cases.total,70);assert.equal(a.unknownRows.length,2);
 assert.ok(a.unknownRows.every(r=>r.correctnessAssessed===false&&r.semanticRejectionCredit===false));assert.equal(a.assignedUnassessed,0);
 assert.equal(a.exactLeaves,36);assert.equal(a.exactParents,18);assert.equal(a.qualityGatePassed,true);assert.equal(a.all72AccuracyClaim,false);
 assert.equal(result.semantic.work.rootScorerInvocations,144);assert.equal(result.semantic.work.compositionScorerInvocations,72);
 assert.equal(result.semantic.work.baselineRootCoordinateProducts,result.semantic.work.compositionRootCoordinateProducts);assert.equal(result.semantic.numericScoringOnlyNotUiLatency,true);
 assert.deepEqual(s.events.slice(-3),['release18','assessment','checks']);
});
test('assigned unknown fails fixed gate even when every supported leaf/parent matches',async()=>{
 const f=fixture(),s=setup(f,'test',successfulSelection,{assignUnknown:true}),r=await createSpecificityPhaseRunner(s.input).run(),a=r.semantic.assessment;
 assert.equal(a.assignedUnassessed,2);assert.equal(a.supportedLabelSubreport.composition.cases.wrongAccepted,0);assert.equal(a.gate.noAssignedUnassessed,false);assert.equal(a.qualityGatePassed,false);
});
test('all48 unavailableTRAIN rows stop before fit, retain96accounted and no selected packet',async()=>{
 const f=fixture(),s=setup(f,'train-cal',null,{unavailable:c=>c.split==='training'}),runner=createSpecificityPhaseRunner(s.input),r=await runner.run();
 assert.deepEqual(r.semantic,{status:'no-reference-set',accounted:96,referenceCount:0,calibrationSelections:0,testAllowed:false});
 assert.equal(runner.snapshot().fitCalls,0);assert.equal(s.counts().fieldCalls,96);
 let takes=0;const files=new Map();
 const selected=await publishSpecificityTrainSelection({semantic:r.semantic,takeSelection:()=>{takes++;return runner.takeSelection();},
  publishSelection:value=>{files.set('selection.json',value);return H;},guard:()=>true});
 assert.equal(selected,null);assert.equal(takes,0);assert.equal(files.size,0);assert.equal(r.inputLedger.rows.length,96);assert.equal(r.receipts.length,24);
 assert.deepEqual(s.counts(),{closed:1,captured:96,released:24,created:1,fieldCalls:96,authorized:0});
 assert.deepEqual(r.inputLedger.rows.map(row=>row.status).slice(0,48),Array(48).fill('unavailable'));
 assert.equal(runner.snapshot().state,'complete');
 const denied=setup(f,'test',null);assert.throws(()=>createSpecificityPhaseRunner(denied.input));assert.equal(denied.counts().captured,0);
 assert.throws(()=>runner.takeSelection());
});
test('missing/wrong saved TEST audit admission cannot open first TEST batch',()=>{
 const f=fixture(),s=setup(f,'test',successfulSelection);s.capabilities.authorizeTest=()=>true;assert.throws(()=>createSpecificityPhaseRunner(s.input));assert.equal(s.counts().captured,0);
 const t=setup(f,'test',successfulSelection);t.capabilities.authorizeTest=r=>({manifestHash:r.manifestHash,selectionIdentity:H,auditIdentity:H});assert.throws(()=>createSpecificityPhaseRunner(t.input));assert.equal(t.counts().captured,0);
});
test('native nonce/ordinal/rights substitutions fail before encoding and are sticky',async()=>{
 for(const mutateRow of [r=>{r.nativeWitness.observationNonce='foreign';},r=>{r.nativeWitness.ordinal=33;},r=>{r.rightsEvidence.documentBefore.documentId='foreign';}]){
  const s=setup(fixture(),'train-cal',null,{mutateRow}),runner=createSpecificityPhaseRunner(s.input);await assert.rejects(runner.run());assert.equal(s.counts().created,0);assert.equal(runner.snapshot().state,'failed');await assert.rejects(runner.run());
 }
});
test('actual first ACK await retains original capacity across abandon and late rejection',async()=>{
 const s=setup(fixture());let reject;const original=new Promise((_,no)=>{reject=no;});s.capabilities.requestBatchDrain=()=>original;
 const runner=createSpecificityPhaseRunner(s.input),waiting=runner.run();for(let i=0;i<8;i++)await Promise.resolve();assert.equal(runner.snapshot().pendingOriginals,1);
 assert.throws(()=>runner.abandon());assert.equal(runner.snapshot().pendingOriginals,1);reject(Error('invented late physical rejection'));await assert.rejects(waiting);assert.equal(runner.snapshot().pendingOriginals,0);assert.equal(s.counts().released,0);assert.equal(s.counts().created,0);
});
test('post-guard deadline/capture-health and asynchronous sync caps cannot dispatch more work',async()=>{
 for(const key of ['now','guard','assertCaptureHealthy']){const s=setup(fixture());s.capabilities[key]=()=>Promise.reject(Error('invented safely observed'));assert.throws(()=>createSpecificityPhaseRunner(s.input));}
 const s=setup(fixture());let checks=0;s.capabilities.guard=()=>{if(++checks===3)s.setTime(10000000);return true;};const runner=createSpecificityPhaseRunner(s.input);await assert.rejects(runner.run());assert.equal(s.counts().captured,0);
 const t=setup(fixture());t.capabilities.createEncoder=()=>{t.setHealth(Error('invented late capture fault'));return {modelId:MODEL_ID,embed(){throw Error('must not encode');},close(){return true;}};};const failed=createSpecificityPhaseRunner(t.input);await assert.rejects(failed.run());assert.equal(failed.snapshot().fitCalls,0);
});
test('unsafe original Promise hooks are not invoked and external work is not called settled',async()=>{
 const s=setup(fixture());let hooks=0;const p=Promise.resolve();Object.defineProperty(p,'constructor',{get(){hooks++;throw Error();}});s.capabilities.captureBatch=()=>p;
 const runner=createSpecificityPhaseRunner(s.input);await assert.rejects(runner.run());assert.equal(hooks,0);assert.equal(runner.snapshot().unsafeOperationRefused,true);assert.equal(s.counts().created,0);
});
test('assessment boundary refuses foreign/path/getter input without fabricated unknown gold',async()=>{
 const f=fixture(),s=setup(f,'test',successfulSelection),r=await createSpecificityPhaseRunner(s.input).run();assert.equal(r.semantic.assessment.unknownRows.length,2);
 let hooks=0;const input={};Object.defineProperty(input,'manifest',{enumerable:true,get(){hooks++;throw Error();}});assert.throws(()=>assessSpecificityTest(input));assert.equal(hooks,0);
});
test('falsy callback failures remain sticky and swallowed onRow guard faults cannot be rescued',async()=>{
 for(const thrown of [null,undefined,false,0]){
  const s=setup(fixture());s.capabilities.captureBatch=()=>Promise.reject(thrown);const runner=createSpecificityPhaseRunner(s.input);await assert.rejects(runner.run());assert.equal(runner.snapshot().failed,true);await assert.rejects(runner.run());assert.equal(s.counts().created,0);
 }
 const f=fixture(),s=setup(f);let failOnce=false;s.capabilities.guard=()=>{if(failOnce){failOnce=false;throw undefined;}return true;};
 s.capabilities.captureBatch=({batch,onRow})=>{failOnce=true;try{onRow(nativeRow(f,batch,batch.cases[0],{}));}catch{}return {batchId:batch.batchId,closed:true};};
 const runner=createSpecificityPhaseRunner(s.input);await assert.rejects(runner.run());assert.equal(runner.snapshot().failed,true);assert.equal(s.counts().created,0);
});
test('fresh fence after baseline prevents composition dispatch on deadline or late capture fault',async()=>{
 for(const fault of ['deadline','health']){
  const s=setup(fixture(),'test',successfulSelection);let runner;
  s.capabilities.guard=()=>{if(runner?.snapshot().scoringCalls.baseline===1&&runner.snapshot().scoringCalls.composition===0){if(fault==='deadline')s.setTime(10000000);else s.setHealth(Error('invented late failure'));}return true;};
  runner=createSpecificityPhaseRunner(s.input);await assert.rejects(runner.run());assert.deepEqual(runner.snapshot().scoringCalls,{baseline:1,composition:0});
 }
});
test('swallowed admission failure poisons outer phase before any guardian ACK dispatch',async()=>{
 const f=fixture(),s=setup(f);let drainRequests=0;
 s.capabilities.captureBatch=({batch,onRow})=>{const row=nativeRow(f,batch,batch.cases[0],{});row.rightsEvidence.documentAfter.documentId='foreign';try{onRow(row);}catch{}return {batchId:batch.batchId,closed:true};};
 s.capabilities.requestBatchDrain=()=>{drainRequests++;return {};};const runner=createSpecificityPhaseRunner(s.input);await assert.rejects(runner.run());assert.equal(drainRequests,0);assert.equal(s.counts().created,0);assert.equal(runner.snapshot().failed,true);
});
test('final report serialization is followed by fresh publication health fence',async()=>{
 const f=fixture(),s=setup(f),runner=createSpecificityPhaseRunner(s.input),stringify=JSON.stringify;let observed=false;
 try{JSON.stringify=function(value,...args){if(value?.schema==='native-specificity-phase-composition/v1'){observed=true;s.setHealth(Error('invented publication-time failure'));}return Reflect.apply(stringify,this,[value,...args]);};
  await assert.rejects(runner.run());assert.equal(observed,true);assert.equal(runner.snapshot().failed,true);assert.equal(runner.snapshot().selectedTrainRetained,false);assert.throws(()=>runner.takeSelection());
 }finally{JSON.stringify=stringify;}
});
test('distinct paired fields preserve expected fused TRAIN bits; five languages/multiple roots fit result cap',async()=>{
 const f=fixture({varied:true}),s=setup(f,'train-cal',null,{distinctPairs:true}),runner=createSpecificityPhaseRunner(s.input),train=await runner.run(),selected=runner.takeSelection();
 assert.deepEqual(s.embeddedTexts.slice(0,2),['axis:0','axis:100']);const ledger=train.inputLedger.rows[0];assert.notEqual(ledger.bodyVectorHash,ledger.titleVectorHash);assert.equal(ledger.fieldBindings.bodySha256,sha('axis:0'));assert.equal(ledger.fieldBindings.effectiveTitleSha256,sha('axis:100'));
 const codec=createTrainReferenceCodec({expectedManifestHash:f.manifest.manifestHash,expectedInputConstructionHash:selected.constructionHash,trainingCases:selected.trainingCases});
 const decoded=codec.decode(selected.referencePacket.text,selected.referencePacket.packetHash),expected=applyPairedE5Input(compilePairedE5Input(selected.detailInputDefinition),{sourceId:'invented-training-0',sourceVersion:'observation-invented-training-0',bodyVector:axis(0),titleVector:axis(100)});
 for(let i=0;i<384;i++)assert.ok(Object.is(decoded.artifact.examples[0].vector[i],expected.vector[i]));assert.ok(Object.is(decoded.artifact.examples[0].vector[383],-0));
 const t=setup(f,'test',selected,{distinctPairs:true}),result=await createSpecificityPhaseRunner(t.input).run();assert.equal(result.inputLedger.rows.length,72);
 assert.equal(result.semantic.assessment.supportedLabelSubreport.composition.byLanguage.length,5);assert.ok(result.semantic.assessment.supportedLabelSubreport.composition.byRoot.length>6);
 assert.ok(Buffer.byteLength(JSON.stringify(result))<=524288);assert.equal(result.semantic.assessment.allCases,72);
});

test('model-stage original ACK stays charged and blocks fitting or assessment until actual settlement',async()=>{
 for(const phase of ['train-cal','test']){
  const s=setup(fixture(),phase,phase==='test'?successfulSelection:null);let reject,dispatched=false;
  const original=new Promise((_,no)=>{reject=no;});s.capabilities.enterModelStage=r=>{dispatched=true;assert.equal(r.stage,phase==='test'?'assessment':'fitting');return original;};
  const runner=createSpecificityPhaseRunner(s.input),running=runner.run();
  for(let i=0;i<5000&&!dispatched;i++)await Promise.resolve();
  assert.equal(dispatched,true);assert.equal(runner.snapshot().pendingOriginals,1);assert.equal(runner.snapshot().fitCalls,0);assert.deepEqual(runner.snapshot().scoringCalls,{baseline:0,composition:0});
  assert.throws(()=>runner.abandon());assert.equal(runner.snapshot().pendingOriginals,1);
  reject(Error('invented late stage rejection'));await assert.rejects(running);assert.equal(runner.snapshot().pendingOriginals,0);assert.equal(runner.snapshot().failed,true);
 }
});

test('stage ACK refusal or its expired wait cannot dispatch semantic work; checks ACK gates final checks/publication',async()=>{
 for(const phase of ['train-cal','test'])for(const form of ['refusal','expired']){
  const s=setup(fixture(),phase,phase==='test'?successfulSelection:null);
  s.capabilities.enterModelStage=()=>{if(form==='expired')s.setTime(phase==='train-cal'?180000:60000);return form==='expired';};
  const runner=createSpecificityPhaseRunner(s.input);await assert.rejects(runner.run());assert.equal(runner.snapshot().fitCalls,0);assert.deepEqual(runner.snapshot().scoringCalls,{baseline:0,composition:0});
 }
 const s=setup(fixture());let refused=false,afterRefusal=0;
 s.capabilities.enterModelStage=r=>{if(r.stage==='checks'){refused=true;return false;}return true;};
 s.capabilities.recheckAssetsAndSources=()=>{if(refused)afterRefusal++;return true;};
 const runner=createSpecificityPhaseRunner(s.input);await assert.rejects(runner.run());assert.equal(refused,true);assert.equal(afterRefusal,0);assert.equal(runner.snapshot().fitCalls,1);assert.equal(runner.snapshot().selectedTrainRetained,false);assert.throws(()=>runner.takeSelection());
});
