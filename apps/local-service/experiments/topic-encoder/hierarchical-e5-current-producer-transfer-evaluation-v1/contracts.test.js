// Invented metadata/text/axes only. Never imports actual candidates or model files.
import test from 'node:test';
import assert from 'node:assert/strict';
import {BATCHES,ROOT_IDS,buildInputPacket,digest,sha} from '../../../../../spikes/topic-resolution/harness/current-producer-final-v1/manifest.js';
import {validateCaptureCompletion,makeEncodingPlan,encodingAvailability,validateAllEncodingMetadata,assessEvidenceLinkedOutcomes,validateRootFitEvidence} from './contracts.js';
import {vectorBitHash} from './contracts.js';
import {compactRootDecision} from './contracts.js';
import {summarizeDecisionWork} from './contracts.js';
import {VECTOR_SCHEMA,serializeVectorPacket} from './vector-packet.js';
import {verifyStoredBundle} from './verify.js';
import {readFile} from 'node:fs/promises';
const H='a'.repeat(64),bytes=v=>Buffer.from(JSON.stringify(v));
function profile(producerId){
 const p={schema:'root-rank-target-producer-profile/v1',producerId,inputConstructionHash:producerId==='current-static'?H:'b'.repeat(64),
  extractorVersions:producerId==='current-static'?['crawler-static-html-prefix/v1']:['article-container-prefix/v1','main-text-prefix/v1']};
 return {...p,producerProfileHash:digest(p)};
}
function fixture(empty=false,missing=false){
 const cases=BATCHES.flat().map((id,i)=>({id,groupId:'invented-'+i,url:'https://fixture.example/article-'+i,language:['en','de','nl','fr','es'][i%5]}));
 const sourceHashes={inventedSource:H},material={schema:'current-producer-final-freeze/v1',sourceHashes,protocolSha256:H,candidateSha256:H,labelSealSha256:H,selectionReceiptSha256:H,targetProfiles:['current-static','browser-current'].map(profile)};
 const captureFreeze={...material,freezeHash:digest(material)},captureFreezeSha256=sha(bytes(captureFreeze)),batches=[],packets=[];
 for(const [phaseIndex,phase]of ['static','browser'].entries())for(let batch=1;batch<=8;batch++){
  const scope=cases.slice((batch-1)*4,batch*4),producerProfile=material.targetProfiles[phaseIndex],rows=scope.map((c,i)=>{
   const documentWitness=phase==='static'?{kind:'static-response',finalUrlHash:sha(c.url),responseWitnessHash:H}:
    {kind:'browser-document',finalUrlHash:sha(c.url),frameId:'f'+i,loaderId:'l'+i,navigationId:'n'+i,documentId:'d'+i};
   return {...c,sourceVersion:captureFreeze.freezeHash+'|'+phase+'|'+batch,title:empty&&batch===1&&i===0&&phase==='static'?'':'Invented title',
    body:'Invented bounded fixture prose only.',extractorVersion:producerProfile.extractorVersions[0],documentWitness,originPolicyHash:H,pagePolicyHash:H};
  }).map(({language,...row})=>row);
  const missingFirst=missing&&phase==='browser'&&batch===8;
  const packet=buildInputPacket({phase,batch,freezeHash:captureFreeze.freezeHash,candidateSha256:H,labelSealSha256:H,selectionReceiptSha256:H,producerProfile,rows:missingFirst?rows.slice(1):rows}),packetBytes=bytes(packet);
  packets.push(packetBytes);
  const result={schema:'current-producer-final-result/v1',phase,batch,status:'complete',freezeHash:captureFreeze.freezeHash,freezeSha256:captureFreezeSha256,protocolSha256:H,
   candidateSha256:H,labelSealSha256:H,selectionReceiptSha256:H,sourceHashesRechecked:true,denominator:4,fullProducerDenominator:32,sourceHashes,producerProfile,
   packetSha256:sha(packetBytes),protocolCallbacksDrained:true,cases:scope.map((c,i)=>missingFirst&&i===0?({...c,status:'unavailable',reason:'reader-unsupported',originPolicyHash:H}):({...c,status:'collected',reason:null,originPolicyHash:H,rightsTransportEligible:true,
    responseWitnessHash:H,documentWitness:rows[i].documentWitness,capture:{titleSha256:sha(rows[i].title),bodySha256:sha(rows[i].body),
     titleCharacters:rows[i].title.length,bodyCharacters:rows[i].body.length,extractorVersion:rows[i].extractorVersion}})),
   priorEvidence:batches.map(b=>({resultSha256:sha(b.resultBytes),supervisorSha256:sha(b.supervisorBytes),packetSha256:JSON.parse(b.resultBytes).packetSha256}))};
  const resultBytes=bytes(result),supervisor={schema:'current-producer-final-supervisor/v1',phase,batch,reason:null,exitCode:0,cleanupReason:null,ownTreeCleanupConfirmed:true,
   sourceHashesRechecked:true,freezeSha256:captureFreezeSha256,resultSha256:sha(resultBytes),packetSha256:sha(packetBytes),denominator:4,fullProducerDenominator:32,
   sourceHashes,batchCaseIds:scope.map(c=>c.id),elapsedSeconds:1};
  batches.push({phase,batch,resultBytes,supervisorBytes:bytes(supervisor)});
 }
 return {context:{captureFreeze,captureFreezeSha256,sourceHashes,selectionReceiptSha256:H,cases,batches},packets};
}
function plansFor(f){const completion=validateCaptureCompletion(f.context);return BATCHES.map((_,i)=>makeEncodingPlan({completion,batch:i+1,staticPacketBytes:f.packets[i],browserPacketBytes:f.packets[i+8]}));}
function encodingMetadata(plans){
 return {freezeHash:H,freezeFileSha256:H,sourceHashes:{fixture:H},encoderHash:H,plans,batches:plans.map(p=>{
  const receipt={schema:'current-producer-transfer-encoding-receipt/v1',freezeHash:H,encoderHash:H,batch:p.batch,captureCompletionHash:p.captureCompletionHash,inputPacketHashes:p.inputPacketHashes,
   rows:p.rows,encoderCalls:p.expectedEncoderCalls,vectorPacketSha256:H,sourceHashesRechecked:true,timings:{initializationMs:1,encodingMs:1,totalChildMs:3},
   ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false};
  const receiptBytes=bytes(receipt),supervisorBytes=bytes({schema:'current-producer-transfer-evaluation-supervisor/v1',phase:'encode-batch',batch:p.batch,reason:null,exitCode:0,cleanupReason:null,
   ownTreeCleanupConfirmed:true,sourceHashesRechecked:true,receiptSha256:sha(receiptBytes),resultSha256:sha(receiptBytes),vectorPacketSha256:H,elapsedSeconds:1,
   freezeSha256:H,sourceHashes:{fixture:H},jobMemoryLimitBytes:1536*1048576,sampledPeakTreeRssBytes:1048576,sampledPeakTreePrivateBytes:1048576});
  return {batch:p.batch,receiptBytes,supervisorBytes};
 })};
}
test('all16 metadata gate fixes two producers/eight batches and original evidence chain',()=>{
 const f=fixture(),c=validateCaptureCompletion(f.context);assert.equal(c.batches.length,16);assert.equal(c.all16Complete,true);assert.ok(Object.isFrozen(c.batches[0].results));
 for(const change of [x=>x.batches.pop(),x=>x.batches.reverse(),x=>x.selectionReceiptSha256='c'.repeat(64),x=>x.captureFreezeSha256='d'.repeat(64)]){
  const x=structuredClone(f.context);change(x); // structuredClone Buffer becomes Uint8Array; restore the bounded original buffers.
  x.batches=x.batches.map(b=>({...b,resultBytes:Buffer.from(b.resultBytes),supervisorBytes:Buffer.from(b.supervisorBytes)}));assert.throws(()=>validateCaptureCompletion(x));
 }
});
test('incomplete/failed-supervisor/source/packet/cleanup metadata cannot admit any body',()=>{
 for(const change of [r=>r.status='fatal',r=>r.priorEvidence=[],r=>r.packetSha256='c'.repeat(64),r=>r.sourceHashesRechecked=false]){
  const f=fixture(),i=15,r=JSON.parse(f.context.batches[i].resultBytes);change(r);f.context.batches[i].resultBytes=bytes(r);assert.throws(()=>validateCaptureCompletion(f.context));
 }
 const f=fixture(),s=JSON.parse(f.context.batches[15].supervisorBytes);s.ownTreeCleanupConfirmed=false;f.context.batches[15].supervisorBytes=bytes(s);
 assert.throws(()=>validateCaptureCompletion(f.context));
});
test('plans use full8x8 producer rows and exact field checks before encoding, including empty title',()=>{
 const f=fixture(),plans=plansFor(f);assert.equal(plans.reduce((n,p)=>n+p.expectedEncoderCalls,0),128);
 assert.equal(plans[0].rows.length,8);assert.notEqual(plans[0].rows[0].sourceIncarnation,plans[0].rows[1].sourceIncarnation);
 const missing=plansFor(fixture(true));assert.equal(missing[0].expectedEncoderCalls,14);assert.equal(missing[0].rows[0].reason,'encoding-title-empty');
 assert.equal(missing[0].rows[1].encodingAvailable,true);assert.equal(missing[0].rows[0].sourceInputHash,missing[0].rows[0].inputIdentity);
 for(const title of ['', '   '])assert.deepEqual(encodingAvailability({title,body:'Literal prose'}),{available:false,reason:'encoding-title-empty',encoderCalls:0});
 assert.equal(encodingAvailability({title:'Title',body:'bad\u0080control'}).reason,'embedding-text-contract-unsupported');
 let calls=0;assert.throws(()=>encodingAvailability({get title(){calls++;throw 0},body:'x'}));assert.equal(calls,0);
});
test('typed capture-unavailable remains in denominator with evaluation-only identity and no Source hash',()=>{
 const f=fixture(false,true),plans=plansFor(f),row=plans[7].rows[1];
 assert.equal(row.captureStatus,'unavailable');assert.equal(row.encodingAvailable,false);assert.equal(row.sourceInputHash,null);
 assert.equal(row.bodySha256,null);assert.equal(row.titleSha256,null);assert.equal(row.documentWitness,null);
 assert.equal(row.reason,'reader-unsupported');assert.match(row.inputIdentity,/^[a-f0-9]{64}$/u);assert.equal(plans[7].expectedEncoderCalls,14);
 const item=f.context.batches[15],r=JSON.parse(item.resultBytes);r.cases[0].reason='arbitrary-unhandled-error';
 item.resultBytes=bytes(r);const sup=JSON.parse(item.supervisorBytes);sup.resultSha256=sha(item.resultBytes);item.supervisorBytes=bytes(sup);
 assert.throws(()=>validateCaptureCompletion(f.context));
});
test('packet mutation/different source version/hash never passes metadata-first evidence check',()=>{
 const f=fixture(),c=validateCaptureCompletion(f.context),p=JSON.parse(f.packets[0]);p.rows[0].body='changed';
 assert.throws(()=>makeEncodingPlan({completion:c,batch:1,staticPacketBytes:bytes(p),browserPacketBytes:f.packets[8]}));
 assert.throws(()=>makeEncodingPlan({completion:c,batch:9,staticPacketBytes:f.packets[0],browserPacketBytes:f.packets[8]}));
});
test('exact8 successful encoding supervisors and actual calls required before evaluation',()=>{
 const input=encodingMetadata(plansFor(fixture())),out=validateAllEncodingMetadata(input);assert.equal(out.encoderCalls,128);assert.equal(out.all8Complete,true);
 const s=JSON.parse(input.batches[7].supervisorBytes);s.reason='resource';input.batches[7].supervisorBytes=bytes(s);assert.throws(()=>validateAllEncodingMetadata(input));
 const bad=encodingMetadata(plansFor(fixture())),r=JSON.parse(bad.batches[0].receiptBytes);r.encoderCalls=15;bad.batches[0].receiptBytes=bytes(r);assert.throws(()=>validateAllEncodingMetadata(bad));
 for(const change of [s=>s.freezeSha256='b'.repeat(64),s=>s.sourceHashes={other:H},s=>s.exitCode=1,s=>s.cleanupReason='still-running',
  s=>s.resultSha256='b'.repeat(64),s=>s.jobMemoryLimitBytes=2048*1048576,s=>s.sampledPeakTreeRssBytes=1536*1048576+1,s=>s.elapsedSeconds=181]){
  const x=encodingMetadata(plansFor(fixture())),sup=JSON.parse(x.batches[0].supervisorBytes);change(sup);x.batches[0].supervisorBytes=bytes(sup);assert.throws(()=>validateAllEncodingMetadata(x));
 }
});
function outcomeFixture(){
 const plans=plansFor(fixture(true)),cases=BATCHES.flat().map((id,i)=>({id,groupId:'invented-'+i,rootId:ROOT_IDS[Math.floor(i/2)],language:['en','de','nl','fr','es'][i%5],host:'fixture.example'}));
 const outcomes=plans.flatMap(p=>p.rows).map(p=>{
  const root=cases.find(c=>c.id===p.id).rootId;
 const decision=p.encodingAvailable?{schema:'current-producer-transfer-compact-root-decision/v1',originalSchema:'builder-scoped-root-rank-transfer-decision/v1',transferHash:H,productionValidated:false,assignmentAuthority:false,status:'candidate',supportedPath:[root],
   witness:{sourceId:p.id,sourceVersion:p.sourceVersion,sourceIncarnation:p.sourceIncarnation,producerId:p.producerId,inputHash:p.sourceInputHash,documentWitness:structuredClone(p.documentWitness)},
   work:{headDotProducts:16,headScalarProducts:6144,rankComparisonWork:64,fusionCoordinateVisitUpperBound:3072}}:null;
  return {id:p.id,producerId:p.producerId,captureStatus:p.captureStatus,inputAvailable:p.encodingAvailable,reason:p.reason,sourceInputHash:p.sourceInputHash,
   inputIdentity:p.inputIdentity,bodySha256:p.bodySha256,titleSha256:p.titleSha256,selectedRootId:decision?root:null,decision,classificationMs:decision?1:null};
 });
 return {cases,plans,outcomes};
}
test('full32 perproducer, scope restriction and honest paired arithmetic preserve missing input',()=>{
 const x=outcomeFixture(),r=assessEvidenceLinkedOutcomes(x);assert.equal(r.assessment.static.total,32);assert.equal(r.assessment.static.available,31);
 assert.equal(r.assessment.browser.total,32);assert.equal(r.assessment.distinctArticleGroups,32);assert.equal(r.assessment.statisticalIndependenceClaim,false);
 assert.equal(r.ordinaryDynamicBrowserProducerValidated,false);assert.equal(r.producerScopes['browser-current'],'restricted-single-document-dom-reader/v1');
 assert.equal(r.assessment.paired.totalArticles,32);assert.equal(r.classificationReexecuted,false);
});
test('stored source/status/availability/path/input substitutions rejected independently of counters',()=>{
 for(const change of [x=>x.outcomes.pop(),x=>x.outcomes[0].inputAvailable=true,x=>x.outcomes[1].sourceInputHash=H,
  x=>x.outcomes[1].decision.witness.documentWitness.loaderId='changed',x=>x.outcomes[1].selectedRootId='nature',x=>x.outcomes[0].classificationMs=0]){
  const x=outcomeFixture();change(x);assert.throws(()=>assessEvidenceLinkedOutcomes(x));
 }
 const x=outcomeFixture();x.outcomes[1].decision.supportedPath=['games','gta'];assert.throws(()=>assessEvidenceLinkedOutcomes(x));
});
test('root fitter proof rejects unsuccessful receipt before artifact parsing',()=>{
 assert.throws(()=>validateRootFitEvidence(new Proxy({}, {get(){throw Error('must not execute')}})));
 assert.throws(()=>validateRootFitEvidence({}));
});
function fitEvidence(){
 const sourceHashes={fixture:H},material={schema:'current-producer-root-fit-freeze/v1',sourceHashes,protocolSha256:H},freezeHash=digest(material),freezeBytes=bytes({...material,freezeHash});
 // Minimal invented identity records: this tests receipt linkage, NOT model compilation.
 const model={representationHash:H,lambda:.1,trainingVersion:freezeHash+'|0.5'},modelJsonHash=digest(model),modelBytes=bytes(model);
 const policy={modelHash:modelJsonHash,policyHash:H,inputConstructionHash:H,enabled:true,representationHash:H},policyBytes=bytes(policy);
 const inputDefinitionBytes=bytes({bodyWeight:.5,titleWeight:.5,encoderHash:H});
 const selectionBytes=bytes({schema:'current-producer-root-fit-report/v1',freezeHash,selectedIndex:0});
 const selectionReceiptBytes=bytes({schema:'current-producer-root-selection/v1',phase:'selected-before-final-transfer',finalTestEvaluated:false,
  freezeHash,freezeFileSha256:sha(freezeBytes),protocolSha256:H,selectionSha256:sha(selectionBytes),selectedIndex:0,bodyWeight:.5,titleWeight:.5,lambda:.1,
  trainingInputConstructionHash:H,eligibleCohortHash:H,eligibilityReceiptSha256:H,calibrationGoldSha256:H,selectedModelSha256:sha(modelBytes),modelJsonHash,
  selectedPolicySha256:sha(policyBytes),policyHash:H,selectedInputDefinitionSha256:sha(inputDefinitionBytes),transferHash:H,
  targetProfiles:['current-static','browser-current'].map(profile),sourceBindingsHash:H,candidateSha256:H,labelSealSha256:H,encoderHash:H,
  representationHash:H,inputView:'current-static',productionValidated:false,assignmentAuthority:false});
 const supervisorBytes=bytes({schema:'current-producer-root-fit-supervisor/v1',phase:'fit-current',reason:null,exitCode:0,cleanupReason:null,
  ownTreeCleanupConfirmed:true,sourceHashesRechecked:true,freezeSha256:sha(freezeBytes),resultSha256:sha(selectionReceiptBytes),sourceHashes,elapsedSeconds:1});
 return {freezeBytes,sourceHashes,selectionReceiptBytes,supervisorBytes,selectionBytes,modelBytes,policyBytes,inputDefinitionBytes};
}
test('root fitter receipt binds exact artifact bytes, selectedweight, frozen provenance and drained supervisor',()=>{
 const f=fitEvidence(),proof=validateRootFitEvidence(f);assert.equal(proof.selectionReceiptSha256,sha(f.selectionReceiptBytes));
 for(const key of ['modelBytes','policyBytes','inputDefinitionBytes','selectionBytes','freezeBytes']){
  const x=fitEvidence();x[key]=Buffer.concat([x[key],Buffer.from(' ')]);assert.throws(()=>validateRootFitEvidence(x));
 }
 const x=fitEvidence(),s=JSON.parse(x.supervisorBytes);s.sourceHashesRechecked=false;x.supervisorBytes=bytes(s);assert.throws(()=>validateRootFitEvidence(x));
});
function storedFixture(){
 const f=fixture(true),completion=validateCaptureCompletion(f.context),plans=plansFor(f),encoding=encodingMetadata(plans),x=outcomeFixture();
 const identity={schema:'builder-scoped-root-rank-candidate/v1',fixture:'invented-geometric-artifact-identity-not-a-real-model',productionValidated:false,assignmentAuthority:false};
 const transferHash=digest(identity),fullIdentity={...identity,transferHash};
 const vectorPacketBytes=plans.map((p,i)=>{
  const rows=p.rows.filter(r=>r.encodingAvailable).map(r=>{
   const bodyVector=Array.from({length:384},(_,j)=>j===0?1:0),titleVector=Array.from({length:384},(_,j)=>j===1?1:0);bodyVector[2]=-0;
   return {id:r.id,producerId:r.producerId,sourceInputHash:r.sourceInputHash,bodySha256:r.bodySha256,titleSha256:r.titleSha256,bodyVector,titleVector,
    bodyVectorHash:vectorBitHash(bodyVector),titleVectorHash:vectorBitHash(titleVector)};
  });
  const vectorBytes=serializeVectorPacket({schema:VECTOR_SCHEMA,freezeHash:H,encoderHash:H,batch:i+1,inputPacketHashes:p.inputPacketHashes,rows});
  const rec=JSON.parse(encoding.batches[i].receiptBytes);rec.vectorPacketSha256=sha(vectorBytes);encoding.batches[i].receiptBytes=bytes(rec);
  const sup=JSON.parse(encoding.batches[i].supervisorBytes);sup.receiptSha256=sha(encoding.batches[i].receiptBytes);sup.resultSha256=sup.receiptSha256;sup.vectorPacketSha256=sha(vectorBytes);encoding.batches[i].supervisorBytes=bytes(sup);
  for(const r of rows){
   const outcome=x.outcomes.find(o=>o.id===r.id&&o.producerId===r.producerId),d=outcome.decision,profile=completion.batches[(r.producerId==='current-static'?0:8)+i].producerProfile;
   d.transferHash=transferHash;Object.assign(d.witness,{producerProfileHash:profile.producerProfileHash,inputConstructionHash:profile.inputConstructionHash,extractorVersion:profile.extractorVersions[0]});
   d.vectorBindings={encoding:'ieee754-binary64-little-endian/384/v1',bodyVectorHash:r.bodyVectorHash,titleVectorHash:r.titleVectorHash};
   d.semanticWitnessHash=digest({schema:'builder-scoped-root-rank-semantic-witness/v1',transferHash,witness:d.witness,vectorBindings:d.vectorBindings});
  }
  return vectorBytes;
 });
 const enc=validateAllEncodingMetadata(encoding),result={schema:'current-producer-transfer-root-evaluation/v1',freezeHash:H,captureCompletionHash:digest(completion),
  encodingCompletionHash:digest(enc),encoderHash:H,transferHash,transferIdentity:fullIdentity,encoderCalls:enc.encoderCalls,outcomes:x.outcomes,assessment:assessEvidenceLinkedOutcomes(x),
  work:summarizeDecisionWork(x.outcomes),timings:{compileMs:1,classificationMs:x.outcomes.reduce((n,r)=>n+(r.classificationMs??0),0),totalChildMs:2,scope:'classifier-wrapper-only-not-capture-E5-queue-or-DB'},
  ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false};
 return {cases:x.cases,completion,pairedPacketBytes:plans.map((_,i)=>({staticPacketBytes:f.packets[i],browserPacketBytes:f.packets[i+8]})),
  encodingBatches:encoding.batches,vectorPacketBytes,freezeHash:H,freezeFileSha256:H,sourceHashes:{fixture:H},encoderHash:H,transferHash,resultBytes:bytes(result)};
}
test('stored verifier rebinds actual vector bits and descriptive full32 summaries without rescoring',()=>{
 const input=storedFixture(),r=verifyStoredBundle(input);assert.equal(r.checked,true);assert.equal(r.encoderCalls,126);
 assert.equal(r.classificationReexecuted,false);assert.equal(r.ordinaryDynamicBrowserProducerValidated,false);
});
test('stored verifier rejects semantic/vector/source/summary tampering or hidden unavailable rows',()=>{
 for(const change of [r=>r.outcomes[1].decision.vectorBindings.titleVectorHash=H,r=>r.outcomes[1].decision.semanticWitnessHash=H,
  r=>r.outcomes[1].decision.witness.inputConstructionHash=H,r=>r.assessment.assessment.static.total=31,
  r=>r.outcomes.shift(),r=>r.ordinaryDynamicBrowserProducerValidated=true,r=>r.extraBody='must not be retained']){
  const input=storedFixture(),result=JSON.parse(input.resultBytes);change(result);input.resultBytes=bytes(result);assert.throws(()=>verifyStoredBundle(input));
 }
 const input=storedFixture();input.vectorPacketBytes[0]=Buffer.from(input.vectorPacketBytes[0]);input.vectorPacketBytes[0][0]=0;assert.throws(()=>verifyStoredBundle(input));
});
test('manifest fixed paths and private admission cannot consume caller paths or forged handles',async()=>{
 const {fixedPath,readAdmittedPairedPackets,createFixedReadLedger,captureMetadataKeys,encodingEvidenceKeys,CAPTURE_SOURCE_KEYS,SOURCE_KEYS,admitCompletedCaptureMetadata}=await import('./manifest.js');
 assert.throws(()=>fixedPath('../hierarchical-e5-real-root-v3/output/test.current-static.vectors.json'));
 assert.throws(()=>fixedPath('apps/local-service/data/accounts.sqlite'));
 assert.throws(()=>fixedPath('spikes/topic-resolution/harness/current-producer-final-v1/output-static-01/../../private'));
 await assert.rejects(readAdmittedPairedPackets({},1));await assert.rejects(readAdmittedPairedPackets({},9));
 const ledger=createFixedReadLedger();
 for(const key of [...captureMetadataKeys().map(s=>s.packet),...encodingEvidenceKeys().map(s=>s.vectors)]){
  await assert.rejects(ledger.read(key),/private completed-metadata admission/);
 }
 await assert.rejects(admitCompletedCaptureMetadata({ledger},[]),/privately validated/);
 assert.equal(CAPTURE_SOURCE_KEYS.length,36);assert.equal(new Set(CAPTURE_SOURCE_KEYS).size,36);
 assert.ok(CAPTURE_SOURCE_KEYS.every(k=>SOURCE_KEYS.includes(k)));
 assert.ok(SOURCE_KEYS.every(k=>!/(?:output-test|test\.current-static|accounts\.sqlite|topic-crawler\.sqlite|root-model\.json|\.assets\/model\.onnx)/u.test(k)));
 const {run}=await import('./run.js');assert.equal(await run([]),'inert');await assert.rejects(run(['--encode-batch','1']));
});
test('full64 actual geometric scorer decisions fit bounded report by sharing identity once',async t=>{
 const {compileBuilderScopedRootRankCandidate:compile,describeBuilderScopedRootRankCandidate:describe,classifyBuilderScopedRootRankCandidate:classify}=
  await import('../builder-scoped-root-rank-candidate-v1/scorer.js');
 const {compilePairedE5Input,describePairedE5Input}=await import('../../../src/domain/hierarchical-e5-paired-input.js');
 const axis=i=>Array.from({length:384},(_,j)=>i===j?1:0),inputDefinition={bodyWeight:.75,titleWeight:.25,encoderHash:H};
 const representationHash=describePairedE5Input(compilePairedE5Input(inputDefinition)).representationHash;
 const schema='hierarchical-e5-paired-linear-heads-v1',representation='paired-raw-e5-body-title-v1',lambda=.1;
 const nodes=[...ROOT_IDS].sort().map(id=>({id,parentId:null})),heads=nodes.map((n,i)=>({nodeId:n.id,enabled:true,positiveGroups:2,negativeGroups:2,weights:axis(i),intercept:-.5}));
 const trainingIdHashes=[0,1,2,3].map(i=>sha('invented-'+i)).sort(),trainingGroupHashes=[0,1,2,3].map(i=>sha('group-'+i)).sort();
 const rootModel={schema,representation,representationHash,trainingVersion:'invented-untrained-geometric-artifact',trainingHash:H,taxonomyHash:digest(nodes),
  settingsHash:digest({schema,lambda,dimensions:384,centering:'training-mean-features-and-labels',solver:'shared-dual-gram-cholesky',targets:'ancestor-inclusive-plus-one-otherwise-minus-one',
   independentGroups:'duplicates-rejected',minimumPositiveGroups:2,minimumNegativeGroups:2}),
  parameterHash:digest({schema,representation,representationHash,heads}),lambda,dimensions:384,trainingIdHashes,trainingGroupHashes,
  provenanceHash:digest({trainingIdHashes,trainingGroupHashes}),experimental:true,productionValidated:false,assignmentAuthority:false,nodes,heads,
  trainingWork:{units:0,gramProducts:0,choleskyProducts:0,solveProducts:0,weightProducts:0}};
 const rootPolicy={schema:'pooled-root-rank-development-policy/v1',modelHash:digest(rootModel),representationHash,inputConstructionHash:'c'.repeat(64),nodeIds:nodes.map(n=>n.id),
  calibrationHash:H,minimumAcceptedGroups:20,enabled:true,minWinnerScore:0,minWinnerGap:.01,acceptedGroups:20,correctGroups:20,work:{countedUnits:0,preflightUpperBound:10000},
  developmentOnly:true,perClassPrecisionGuaranteed:false,productionValidated:false,assignmentAuthority:false};rootPolicy.policyHash=digest(rootPolicy);
 const handle=compile({schema:'builder-scoped-root-rank-candidate/v1',inputDefinition,rootModel,rootPolicy,trainingInputConstructionHash:rootPolicy.inputConstructionHash,
  targetProfiles:['current-static','browser-current'].map(id=>{const p=profile(id);return {producerId:p.producerId,inputConstructionHash:p.inputConstructionHash,extractorVersions:p.extractorVersions};})});
 const identity=describe(handle),f=fixture(),completion=validateCaptureCompletion(f.context),plans=plansFor(f);
 const cases=BATCHES.flat().map((id,i)=>({id,groupId:'invented-'+i,rootId:ROOT_IDS[Math.floor(i/2)],language:['en','de','nl','fr','es'][i%5],host:'fixture'+i%16+'.example'}));
 const raw=[],outcomes=plans.flatMap(p=>p.rows).map(p=>{
  const target=cases.find(c=>c.id===p.id),profile=identity.targetProfiles.find(t=>t.producerId===p.producerId),vector=axis(nodes.findIndex(n=>n.id===target.rootId));
  const decision=classify(handle,{sourceId:p.id,sourceVersion:p.sourceVersion,sourceIncarnation:p.sourceIncarnation,producerId:p.producerId,
   producerProfileHash:profile.producerProfileHash,inputConstructionHash:profile.inputConstructionHash,extractorVersion:profile.extractorVersions[0],
   inputHash:p.sourceInputHash,documentWitness:p.documentWitness,bodyVector:vector,titleVector:vector});
  raw.push(decision);
  return {id:p.id,producerId:p.producerId,captureStatus:p.captureStatus,inputAvailable:true,reason:null,sourceInputHash:p.sourceInputHash,inputIdentity:p.inputIdentity,
   bodySha256:p.bodySha256,titleSha256:p.titleSha256,selectedRootId:decision.supportedPath[0]??null,decision:compactRootDecision(decision),classificationMs:1.23456789};
 });
 const report={schema:'current-producer-transfer-root-evaluation/v1',freezeHash:H,captureCompletionHash:digest(completion),encodingCompletionHash:H,encoderHash:H,
  transferHash:identity.transferHash,transferIdentity:identity,encoderCalls:128,outcomes,assessment:assessEvidenceLinkedOutcomes({cases,plans,outcomes}),
  work:summarizeDecisionWork(outcomes),timings:{compileMs:1,classificationMs:outcomes.reduce((n,r)=>n+r.classificationMs,0),totalChildMs:2,scope:'classifier-wrapper-only-not-capture-E5-queue-or-DB'},
  ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false};
 const compactBytes=bytes(report).length;assert.ok(compactBytes<=262144,'actual64-decision report exceeds fixed cap: '+compactBytes);
 t.diagnostic('Invented64-decision compact report bytes: '+compactBytes+' / 262144');
 assert.ok(raw.every(d=>d.supportedPath.length===1));assert.ok(outcomes.every(o=>!Object.hasOwn(o.decision,'identity')));
 assert.equal(new Set(outcomes.map(o=>o.decision.transferHash)).size,1);
 // The numeric scorer/semantic hash are unchanged; only redundant identity is removed.
 assert.deepEqual(outcomes[0].decision.witness,raw[0].witness);assert.equal(outcomes[0].decision.semanticWitnessHash,raw[0].semanticWitnessHash);
});
test('fixed phase/output contracts reject replay aliases, pathlike batches and hostile arrays before IO',async()=>{
 const {phaseFor,outputDirectory,run}=await import('./run.js');
 assert.equal(phaseFor([]),null);assert.equal(await run([]),'inert');
 assert.deepEqual(phaseFor(['--admit-captures']),{phase:'admit-captures',batch:null});assert.deepEqual(phaseFor(['--evaluate']),{phase:'evaluate',batch:null});
 for(let i=1;i<=8;i++){
  const spec=phaseFor(['--encode-batch',String(i)]);assert.equal(spec.batch,i);assert.ok(outputDirectory(spec).endsWith('output-encode-0'+i));
 }
 for(const args of [['--freeze'],['--fit'],['--encode-batch','01'],['--encode-batch','9'],['--encode-batch','../1'],['--evaluate','extra']])assert.throws(()=>phaseFor(args));
 let calls=0;const bad=new Proxy([],{get(){calls++;throw Error();}});
 assert.throws(()=>phaseFor(bad));assert.equal(calls,0);
 assert.throws(()=>outputDirectory({phase:'encode-batch',batch:'../1'}));
});
test('supervisor exact source closure and reviewed own-Job mechanics remain aligned without execution',async()=>{
 const {SOURCE_KEYS,CAPTURE_SOURCE_KEYS}=await import('./manifest.js');
 const py=await readFile(new URL('./supervise.py',import.meta.url),'utf8');
 const block=py.slice(py.indexOf('SOURCE_NAMES = ')+15,py.indexOf('\nFIT = '));assert.deepEqual(JSON.parse(block),SOURCE_KEYS);
 const collector=await readFile(new URL('../../../../../spikes/topic-resolution/harness/current-producer-final-v1/run.mjs',import.meta.url),'utf8');
 const literal=collector.slice(collector.indexOf('export const SOURCE_FILES'),collector.indexOf('].map(name => [name,resolve(REPO,name)]))'));
 assert.deepEqual([...literal.matchAll(/"([^"]+)"/gu)].map(m=>m[1]),CAPTURE_SOURCE_KEYS);
 const old=await readFile(new URL('../hierarchical-e5-current-producer-transfer-v1/supervise.py',import.meta.url),'utf8');
 const mechanics=text=>text.slice(text.indexOf('class MemoryStatus'),text.indexOf('def digest(path):'));
 // New IO helpers begin after the unmodified Win32 structures/membership guards.
 assert.equal(py.slice(py.indexOf('class MemoryStatus'),py.indexOf('def fixed_bytes(')).trimEnd(),mechanics(old).trimEnd());
 assert.ok(py.indexOf('AssignProcessToJobObject(job, process_handle)')<py.indexOf('child.stdin.write('));
 assert.ok(py.includes("'--import', str(guard)"));assert.ok(py.includes("'TEMP': str(temp), 'TMP': str(temp)"));
 assert.ok(py.includes('cleanup_deadline = time.monotonic() + 5'));assert.ok(py.includes('WALL_LIMIT, ACTIVE_LIMIT = 180, 170'));
});
