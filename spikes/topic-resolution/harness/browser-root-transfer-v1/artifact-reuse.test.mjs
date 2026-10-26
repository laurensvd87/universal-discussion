// Manually authored geometric coefficients and metadata only. No fit, scoring,
// E5, real artifact, captured body, final outcome or model-asset file is opened.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBrowserArtifactReuseReceipt,validateBrowserArtifactReuseReceipt,ARTIFACT_REUSE_DEPENDENCY_PINS} from './artifact-reuse.js';
import {ROOT_IDS,digest,sha} from '../current-producer-final-v1/manifest.js';
import {compilePairedE5Input,describePairedE5Input} from '../../../../apps/local-service/src/domain/hierarchical-e5-paired-input.js';
import {compileBuilderScopedRootRankCandidate,describeBuilderScopedRootRankCandidate} from '../../../../apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js';
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
 return {oldFit:{freezeBytes,supervisorBytes,selectionReceiptBytes,sourceHashes,selectionBytes,modelBytes,policyBytes,inputDefinitionBytes},
  next:{browserProfile:profile('browser-current',NB),profileRecipeHash:'5'.repeat(64),protocolSha256:'6'.repeat(64),
   candidateSha256:'3'.repeat(64),labelSealSha256:'4'.repeat(64)},dependencySourceHashes:{...ARTIFACT_REUSE_DEPENDENCY_PINS}};
}
function metadata(input){const {freezeBytes,supervisorBytes,selectionReceiptBytes,sourceHashes}=input.oldFit;return {freezeBytes,supervisorBytes,selectionReceiptBytes,sourceHashes};}
test('same unchanged artifact bytes compile new profiles without fitting/scoring or rewriting old selection',async()=>{
 const f=fixture(),original=Buffer.from(f.oldFit.selectionReceiptBytes),receipt=await createBrowserArtifactReuseReceipt(f),selection=JSON.parse(original);
 assert.equal(receipt.schema,'browser-root-artifact-reuse/v1');
 assert.deepEqual(receipt.evaluatedProducers,['browser-current']);assert.deepEqual(receipt.unexercisedProducers,['current-static']);
 assert.deepEqual(receipt.targetProfiles[0],selection.targetProfiles[0]);assert.deepEqual(receipt.transferIdentity.targetProfiles.find(p=>p.producerId==='current-static'),selection.targetProfiles[0]);
 assert.equal(receipt.networkRequestIdCorrelated,false);assert.equal(receipt.oldSelectionReceiptSha256,sha(original));
 assert.equal(receipt.selectedModelSha256,selection.selectedModelSha256);assert.equal(receipt.policyHash,selection.policyHash);
 assert.equal(receipt.selectedInputDefinitionSha256,selection.selectedInputDefinitionSha256);
 assert.notEqual(receipt.modelJsonHash,receipt.selectedModelSha256,'JSON artifact digest is not pretty-file byte SHA');
 assert.notEqual(receipt.transferHash,selection.transferHash);assert.equal(receipt.originalTransferHash,selection.transferHash);
 assert.equal(receipt.transferIdentity.modelJsonHash,selection.modelJsonHash);assert.equal(receipt.transferIdentity.policyHash,selection.policyHash);
 assert.equal(receipt.bodyWeight,.75);assert.equal(receipt.titleWeight,.25);assert.equal(receipt.noRefit,true);assert.equal(receipt.noRetune,true);
 assert.equal(receipt.reobservation.untouchedIndependentCohort,false);assert.equal(receipt.ordinaryDynamicBrowserProducerValidated,false);
 assert.equal(receipt.assignmentAuthority,false);assert.ok(Object.isFrozen(receipt.transferIdentity.targetProfiles));assert.deepEqual(f.oldFit.selectionReceiptBytes,original);
 assert.equal(JSON.stringify(receipt).includes('"weights"'),false);assert.equal(JSON.stringify(receipt).includes('"modelBytes"'),false);
 assert.deepEqual(validateBrowserArtifactReuseReceipt({receipt,oldProof:metadata(f),next:f.next}),receipt);
});
test('collector validator consumes only old metadata and recomputes new transfer identity/receipt hash',async()=>{
 const f=fixture(),receipt=await createBrowserArtifactReuseReceipt(f);
 assert.deepEqual(Object.keys(metadata(f)),['freezeBytes','supervisorBytes','selectionReceiptBytes','sourceHashes']);
 for(const change of [r=>r.schema='current-producer-artifact-reuse/v1',r=>r.transferHash=H,r=>r.transferIdentity.bodyWeight=.5,r=>r.selectedModelSha256=H,r=>r.noRetune=false,
  r=>r.ordinaryDynamicBrowserProducerValidated=true,r=>r.reobservation.oldPacketBodyVectorSplice=true,r=>r.receiptHash=H,r=>r.extra='not allowed',r=>r.targetProfiles[0].inputConstructionHash=H,r=>r.evaluatedProducers.push('current-static'),r=>r.networkRequestIdCorrelated=true]){
  const r=structuredClone(receipt);change(r);assert.throws(()=>validateBrowserArtifactReuseReceipt({receipt:r,oldProof:metadata(f),next:f.next}));
 }
});
test('candidate/label/browser recipe/training builder and producer kind cannot change',async()=>{
 for(const change of [f=>f.next.candidateSha256=H,f=>f.next.labelSealSha256=H,f=>f.next.profileRecipeHash='2'.repeat(64),
  f=>f.next.browserProfile=profile('browser-current',T),f=>f.next.browserProfile=profile('browser-current',S),
  f=>f.next.browserProfile=profile('browser-current',B),f=>f.next.browserProfile=profile('current-static',NB),
  f=>f.next.browserProfile.schema='forged-profile/v1',
  f=>f.next.targetProfiles=[]]){
  const f=fixture();change(f);await assert.rejects(createBrowserArtifactReuseReceipt(f));
 }
});
test('artifact whitespace/coefficient/provenance/report/input bytes and incomplete old supervisor reject',async()=>{
 for(const key of ['modelBytes','policyBytes','inputDefinitionBytes','selectionBytes','freezeBytes']){
  const f=fixture();f.oldFit[key]=Buffer.concat([f.oldFit[key],Buffer.from(' ')]);await assert.rejects(createBrowserArtifactReuseReceipt(f));
 }
 for(const change of [m=>m.heads[0].weights[0]=.9,m=>m.trainingIdHashes[0]=H,m=>m.heads[0].weights.pop()]){
  const f=fixture(),m=JSON.parse(f.oldFit.modelBytes);change(m);f.oldFit.modelBytes=bytes(m);await assert.rejects(createBrowserArtifactReuseReceipt(f));
 }
 for(const change of [s=>s.reason='failed',s=>s.sourceHashesRechecked=false,s=>s.ownTreeCleanupConfirmed=false,s=>s.exitCode=1,
  s=>s.elapsedSeconds=181,s=>s.sampledPeakTreePrivateBytes=1536*1048576+1,s=>s.sourceHashes={} ]){
  const f=fixture(),s=JSON.parse(f.oldFit.supervisorBytes);change(s);f.oldFit.supervisorBytes=bytes(s);await assert.rejects(createBrowserArtifactReuseReceipt(f));
 }
 const f=fixture();f.dependencySourceHashes[Object.keys(f.dependencySourceHashes)[0]]=H;await assert.rejects(createBrowserArtifactReuseReceipt(f));
});
test('creator privately copies bytes and definitions before asynchronous compiler import',async()=>{
 const f=fixture(),expected=await createBrowserArtifactReuseReceipt(f),promise=createBrowserArtifactReuseReceipt(f);
 f.oldFit.modelBytes.fill(0);f.oldFit.selectionReceiptBytes.fill(0);f.next.browserProfile.inputConstructionHash=H;
 assert.deepEqual(await promise,expected);
});
test('proxy/getter/extended-buffer/cycle/capacity inputs reject without caller callbacks',async()=>{
 let called=0;const proxy=new Proxy({},{get(){called++;throw Error();},ownKeys(){called++;throw Error();}});
 await assert.rejects(createBrowserArtifactReuseReceipt(proxy));assert.throws(()=>validateBrowserArtifactReuseReceipt(proxy));
 const f=fixture();Object.defineProperty(f.next,'profileRecipeHash',{enumerable:true,get(){called++;throw Error();}});await assert.rejects(createBrowserArtifactReuseReceipt(f));
 const b=fixture();Object.defineProperty(b.oldFit.modelBytes,'secret',{get(){called++;throw Error();}});await assert.rejects(createBrowserArtifactReuseReceipt(b));
 const c=fixture();c.next.browserProfile=c.next;await assert.rejects(createBrowserArtifactReuseReceipt(c));
 const large=fixture();large.oldFit.modelBytes=Buffer.alloc(262145);await assert.rejects(createBrowserArtifactReuseReceipt(large));assert.equal(called,0);
});
test('dependency source pins match actual CODE files and helper has no IO/scoring/default actions',async()=>{
 for(const [name,pin]of Object.entries(ARTIFACT_REUSE_DEPENDENCY_PINS)){
  const source=await readFile(new URL('../../../../'+name,import.meta.url));assert.equal(sha(source),pin);
 }
 const source=await readFile(new URL('./artifact-reuse.js',import.meta.url),'utf8');
 assert.ok(!/from ['"]node:(?:fs|child_process|https?|net|tls)/u.test(source));
 assert.ok(!source.includes('classifyBuilderScopedRootRankCandidate('));assert.ok(!source.includes('trainHierarchy'));
 assert.equal((source.match(/await import\(/gu)??[]).length,1);
 assert.ok(source.indexOf('await import(')>source.indexOf('export async function createBrowserArtifactReuseReceipt'));
 assert.ok(!source.includes('process.argv'));
});


