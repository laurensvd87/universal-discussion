// Manually authored geometric coefficients and metadata only. No fit, scoring,
// E5, real artifact, captured body, final outcome or model-asset file is opened.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNativeArtifactReuseReceipt,validateNativeArtifactReuseReceipt,ARTIFACT_REUSE_DEPENDENCY_PINS,OLD_FIT_SOURCE_PATHS,OLD_TARGET_SOURCE_PATHS} from './artifact-reuse.js';
import {ROOT_IDS,digest,sha} from '../../current-producer-final-v1/manifest.js';
import {compilePairedE5Input,describePairedE5Input} from '../../../../../apps/local-service/src/domain/hierarchical-e5-paired-input.js';
import {compileBuilderScopedRootRankCandidate,describeBuilderScopedRootRankCandidate} from '../../../../../apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js';
import {buildNativeProducerProfile,CONSTRUCTION_SOURCE_KEYS} from './producer-profile.js';
const H='a'.repeat(64),T='b'.repeat(64),S='c'.repeat(64),B='d'.repeat(64),NS='e'.repeat(64),NB='f'.repeat(64);
const bytes=v=>Buffer.from(JSON.stringify(v,null,2)),axis=i=>Array.from({length:384},(_,j)=>i===j?1:0);
function profile(producerId,inputConstructionHash){
 const p={schema:'root-rank-target-producer-profile/v1',producerId,inputConstructionHash,
  extractorVersions:producerId==='current-static'?['crawler-static-html-prefix/v1']:['article-container-prefix/v1','main-text-prefix/v1']};
 return {...p,producerProfileHash:digest(p)};
}
function fixture(){
 const sourceHashes={'protocol.json':H,'invented-source.js':'1'.repeat(64)},oldProfiles=[profile('current-static',S),profile('browser-current',B)];
 const fm={schema:'current-producer-root-fit-freeze/v1',sourceHashes,protocolSha256:H,profileRecipeHash:'2'.repeat(64),targetProfiles:oldProfiles},freezeHash=digest(fm),freezeBytes=bytes({...fm,freezeHash});
 const inputDefinition={bodyWeight:.75,titleWeight:.25,encoderHash:H},representationHash=describePairedE5Input(compilePairedE5Input(inputDefinition)).representationHash;
 const schema='hierarchical-e5-paired-linear-heads-v1',representation='paired-raw-e5-body-title-v1',lambda=.1,nodes=[...ROOT_IDS].sort().map(id=>({id,parentId:null}));
 const heads=nodes.map((n,i)=>({nodeId:n.id,enabled:true,positiveGroups:2,negativeGroups:2,weights:axis(i),intercept:-.5}));
 const trainingIdHashes=[0,1,2,3].map(i=>sha('invented-id-'+i)).sort(),trainingGroupHashes=[0,1,2,3].map(i=>sha('invented-group-'+i)).sort();
 const model={schema,representation,representationHash,trainingVersion:freezeHash+'|0.75',trainingHash:H,taxonomyHash:digest(nodes),
  settingsHash:digest({schema,lambda,dimensions:384,centering:'training-mean-features-and-labels',solver:'shared-dual-gram-cholesky',
   targets:'ancestor-inclusive-plus-one-otherwise-minus-one',independentGroups:'duplicates-rejected',minimumPositiveGroups:2,minimumNegativeGroups:2}),
  parameterHash:digest({schema,representation,representationHash,heads}),lambda,dimensions:384,trainingIdHashes,trainingGroupHashes,
  provenanceHash:digest({trainingIdHashes,trainingGroupHashes}),experimental:true,productionValidated:false,assignmentAuthority:false,nodes,heads,
  trainingWork:{units:0,gramProducts:0,choleskyProducts:0,solveProducts:0,weightProducts:0}};
 const policy={schema:'pooled-root-rank-development-policy/v1',modelHash:digest(model),representationHash,inputConstructionHash:T,nodeIds:nodes.map(n=>n.id),
  calibrationHash:H,minimumAcceptedGroups:20,enabled:true,minWinnerScore:.1,minWinnerGap:.01,acceptedGroups:20,correctGroups:20,
  work:{countedUnits:0,preflightUpperBound:10000},developmentOnly:true,perClassPrecisionGuaranteed:false,productionValidated:false,assignmentAuthority:false};
 policy.policyHash=digest(policy);
 const original=describeBuilderScopedRootRankCandidate(compileBuilderScopedRootRankCandidate({schema:'builder-scoped-root-rank-candidate/v1',
  inputDefinition,rootModel:model,rootPolicy:policy,trainingInputConstructionHash:T,
  targetProfiles:oldProfiles.map(({producerId,inputConstructionHash,extractorVersions})=>({producerId,inputConstructionHash,extractorVersions}))}));
 const modelBytes=bytes(model),policyBytes=bytes(policy),inputDefinitionBytes=bytes(inputDefinition);
 const selectionBytes=bytes({schema:'current-producer-root-fit-report/v1',freezeHash,selectedIndex:1,scope:'invented-not-a-real-fit'});
 const selectionReceiptBytes=bytes({schema:'current-producer-root-selection/v1',phase:'selected-before-final-transfer',finalTestEvaluated:false,
  freezeHash,freezeFileSha256:sha(freezeBytes),protocolSha256:H,selectionSha256:sha(selectionBytes),selectedIndex:1,bodyWeight:.75,titleWeight:.25,lambda:.1,
  trainingInputConstructionHash:T,eligibleCohortHash:H,eligibilityReceiptSha256:H,calibrationGoldSha256:H,selectedModelSha256:sha(modelBytes),
  modelJsonHash:digest(model),selectedPolicySha256:sha(policyBytes),policyHash:policy.policyHash,selectedInputDefinitionSha256:sha(inputDefinitionBytes),
  transferHash:original.transferHash,targetProfiles:oldProfiles,sourceBindingsHash:H,candidateSha256:'3'.repeat(64),labelSealSha256:'4'.repeat(64),
  encoderHash:H,representationHash,inputView:'current-static',productionValidated:false,assignmentAuthority:false});
 const supervisorBytes=bytes({schema:'current-producer-root-fit-supervisor/v1',phase:'fit-current',reason:null,exitCode:0,cleanupReason:null,
  ownTreeCleanupConfirmed:true,sourceHashesRechecked:true,freezeSha256:sha(freezeBytes),resultSha256:sha(selectionReceiptBytes),sourceHashes,elapsedSeconds:1,
  jobMemoryLimitBytes:1536*1048576,sampledPeakTreeRssBytes:1048576,sampledPeakTreePrivateBytes:1048576});
 const native=buildNativeProducerProfile(Object.fromEntries(CONSTRUCTION_SOURCE_KEYS.map(key=>[key,sha('invented-code-'+key)])));
 return {oldFit:{freezeBytes,supervisorBytes,selectionReceiptBytes,sourceHashes,selectionBytes,modelBytes,policyBytes,inputDefinitionBytes},
  next:{nativeProfile:structuredClone(native.producerProfile),profileRecipeHash:native.recipeHash,protocolSha256:'6'.repeat(64),
   candidateSha256:'3'.repeat(64),labelSealSha256:'4'.repeat(64)},dependencySourceHashes:{...ARTIFACT_REUSE_DEPENDENCY_PINS}};
}
function metadata(input){const {freezeBytes,supervisorBytes,selectionReceiptBytes,sourceHashes}=input.oldFit;return {freezeBytes,supervisorBytes,selectionReceiptBytes,sourceHashes};}

test('same original artifact bytes compile a distinct native profile without rewriting original fit targets',async()=>{
 const f=fixture(),original=Buffer.from(f.oldFit.selectionReceiptBytes),receipt=await createNativeArtifactReuseReceipt(f),selection=JSON.parse(original);
 assert.equal(receipt.schema,'native-root-artifact-reuse/v1');
 assert.deepEqual(receipt.evaluatedProducers,['native-browser-current']);assert.deepEqual(receipt.unexercisedProducers,['current-static','browser-current']);
 assert.deepEqual(receipt.originalTargetProfiles,selection.targetProfiles);assert.equal(receipt.targetProfiles.length,1);
 assert.equal(receipt.targetProfiles[0].producerId,'native-browser-current');
 assert.equal(receipt.oldSelectionReceiptSha256,sha(original));assert.equal(receipt.selectedModelSha256,selection.selectedModelSha256);
 assert.equal(receipt.policyHash,selection.policyHash);assert.equal(receipt.selectedInputDefinitionSha256,selection.selectedInputDefinitionSha256);
 assert.notEqual(receipt.modelJsonHash,receipt.selectedModelSha256,'Program JSON digest is not file SHA');
 assert.notEqual(receipt.transferHash,selection.transferHash);assert.equal(receipt.originalTransferHash,selection.transferHash);
 assert.equal(receipt.transferIdentity.modelJsonHash,selection.modelJsonHash);assert.equal(receipt.bodyWeight,.75);assert.equal(receipt.titleWeight,.25);
 assert.equal(receipt.lambda,.1);assert.equal(receipt.noRefit,true);assert.equal(receipt.noRetune,true);assert.equal(receipt.noClassificationInReceiptCreation,true);
 assert.equal(receipt.reobservation.untouchedIndependentCohort,false);assert.equal(receipt.actualNativeCompatibilityEstablished,false);
 assert.equal(receipt.individualResourceProcessingRightsProven,false);assert.equal(receipt.assignmentAuthority,false);
 assert.ok(Object.isFrozen(receipt.transferIdentity.targetProfiles));assert.deepEqual(f.oldFit.selectionReceiptBytes,original);
 const json=JSON.stringify(receipt);for(const forbidden of ['"weights"','"modelBytes"','"bodyVector"'])assert.equal(json.includes(forbidden),false);
 assert.deepEqual(validateNativeArtifactReuseReceipt({receipt,oldProof:metadata(f),next:f.next}),receipt);
});
test('metadata-only validator recomputes native transfer and exact receipt structure/hash, not coefficient math',async()=>{
 const f=fixture(),receipt=await createNativeArtifactReuseReceipt(f);
 for(const change of [
 r=>r.schema='browser-root-artifact-reuse/v1',r=>r.transferHash=H,r=>r.transferIdentity.bodyWeight=.5,
 r=>r.selectedModelSha256=H,r=>r.noRetune=false,r=>r.actualNativeCompatibilityEstablished=true,
 r=>r.reobservation.oldPacketBodyVectorSplice=true,r=>r.receiptHash=H,r=>r.extra=true,
 r=>r.originalTargetProfiles[0].inputConstructionHash=H,r=>r.targetProfiles[0].producerId='browser-current',
 r=>r.originalFitReceiptUnchanged=false,r=>r.evaluatedProducers.push('current-static')
 ]){const r=structuredClone(receipt);change(r);assert.throws(()=>validateNativeArtifactReuseReceipt({receipt:r,oldProof:metadata(f),next:f.next}));}
});
test('candidate, labels, construction recipe, native producer and original training lineage cannot change',async()=>{
 for(const change of [
 f=>f.next.candidateSha256=H,f=>f.next.labelSealSha256=H,f=>f.next.profileRecipeHash=H,
 f=>{f.next.nativeProfile.inputConstructionHash=T;},
 f=>{f.next.nativeProfile.producerId='browser-current';},
 f=>{f.next.nativeProfile.schema='forged-profile';},
 f=>{f.next.nativeProfile.effectiveTitleRule='other';},f=>{f.next.targetProfiles=[];}
 ]){const f=fixture();change(f);await assert.rejects(createNativeArtifactReuseReceipt(f));}
});
test('byte hashes, malformed model/provenance and failed original fit evidence reject',async()=>{
 for(const key of ['modelBytes','policyBytes','inputDefinitionBytes','selectionBytes','freezeBytes']){
  const f=fixture();f.oldFit[key]=Buffer.concat([f.oldFit[key],Buffer.from(' ')]);await assert.rejects(createNativeArtifactReuseReceipt(f));
 }
 for(const change of [m=>m.heads[0].weights[0]=.9,m=>m.trainingIdHashes[0]=H,m=>m.heads[0].weights.pop()]){
  const f=fixture(),m=JSON.parse(f.oldFit.modelBytes);change(m);f.oldFit.modelBytes=bytes(m);await assert.rejects(createNativeArtifactReuseReceipt(f));
 }
 for(const change of [
 s=>s.reason='failed',s=>s.sourceHashesRechecked=false,s=>s.ownTreeCleanupConfirmed=false,s=>s.exitCode=1,
 s=>s.elapsedSeconds=181,s=>s.sampledPeakTreePrivateBytes=1536*1048576+1,s=>s.sourceHashes={}
 ]){const f=fixture(),s=JSON.parse(f.oldFit.supervisorBytes);change(s);f.oldFit.supervisorBytes=bytes(s);await assert.rejects(createNativeArtifactReuseReceipt(f));}
 const f=fixture();f.dependencySourceHashes[Object.keys(f.dependencySourceHashes)[0]]=H;await assert.rejects(createNativeArtifactReuseReceipt(f));
});
test('creator privately copies supplied artifact/proof bytes and profile before its asynchronous compile imports',async()=>{
 const f=fixture(),expected=await createNativeArtifactReuseReceipt(f),pending=createNativeArtifactReuseReceipt(f);
 f.oldFit.modelBytes.fill(0);f.oldFit.selectionReceiptBytes.fill(0);f.next.nativeProfile={};f.oldFit.sourceHashes['protocol.json']=S;
 assert.deepEqual(await pending,expected);
});
test('proxy/accessor/extended-buffer/cycle/byte/source-map caps reject without invoking caller hooks',async()=>{
 let calls=0;const trap=()=>{calls++;throw Error('must not execute');},proxy=new Proxy({},{get:trap,ownKeys:trap});
 await assert.rejects(createNativeArtifactReuseReceipt(proxy));assert.throws(()=>validateNativeArtifactReuseReceipt(proxy));
 const f=fixture();Object.defineProperty(f.next,'profileRecipeHash',{enumerable:true,get:trap});await assert.rejects(createNativeArtifactReuseReceipt(f));
 const b=fixture();Object.defineProperty(b.oldFit.modelBytes,'secret',{get:trap});await assert.rejects(createNativeArtifactReuseReceipt(b));
 const c=fixture();c.next.nativeProfile=c.next;await assert.rejects(createNativeArtifactReuseReceipt(c));
 const large=fixture();large.oldFit.modelBytes=Buffer.alloc(262145);await assert.rejects(createNativeArtifactReuseReceipt(large));
 const extended=fixture();extended.oldFit.sourceHashes=Object.fromEntries(Array.from({length:129},(_,i)=>['key'+i,H]));await assert.rejects(createNativeArtifactReuseReceipt(extended));
 assert.equal(calls,0);
});
test('literal dependency CODE pins and original source alias mappings are fixed, without IO or actions in helper',async()=>{
 assert.equal(Object.keys(OLD_FIT_SOURCE_PATHS).length,16);assert.equal(Object.keys(OLD_TARGET_SOURCE_PATHS).length,11);
 for(const [name,pin]of Object.entries(ARTIFACT_REUSE_DEPENDENCY_PINS)){
  assert.equal(sha(await readFile(new URL('../../../../../'+name,import.meta.url))),pin);
 }
 const source=await readFile(new URL('./artifact-reuse.js',import.meta.url),'utf8');
 assert.ok(!/from ['"]node:(?:fs|child_process|https?|net|tls)/u.test(source));
 assert.ok(!source.includes('classifyNativeRootRankCandidate('));assert.ok(!source.includes('trainHierarchy'));assert.ok(!source.includes('process.argv'));
 assert.equal((source.match(/await import\(/gu)??[]).length,2);
 assert.ok(source.indexOf('await import(')>source.indexOf('export async function createNativeArtifactReuseReceipt'));
 for(const path of [...Object.values(OLD_FIT_SOURCE_PATHS),...Object.values(OLD_TARGET_SOURCE_PATHS)])
  assert.ok(!path.includes('/data/')&&!path.includes('/output/')&&!path.includes('freeze.json'));
});
