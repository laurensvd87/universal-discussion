// Shared invented fixtures for this seven-file slice. No IO, model fitting,
// classification, real metadata/artifact reads or actual native observations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSpecificityProducerProfile,validateSpecificityProducerProfile,CONSTRUCTION_SOURCE_KEYS,ROOT_IDS} from './producer-profile.js';
import {buildSpecificityManifest,digest,sha} from './manifest.js';
import {compilePairedE5Input,describePairedE5Input} from '../../../../../apps/local-service/src/domain/hierarchical-e5-paired-input.js';
import {compileBuilderScopedRootRankCandidate,describeBuilderScopedRootRankCandidate} from '../../../../../apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js';
import {compileNativeRootRankCandidate,prepareNativeRootInput} from '../../../../../apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js';

export const H='a'.repeat(64),T='b'.repeat(64);
export const axis=i=>Array.from({length:384},(_,j)=>j===i?1:j===383?-0:0);
export const bytes=v=>Buffer.from(JSON.stringify(v,null,2));
export function vectorHash(v){const b=Buffer.alloc(3072);v.forEach((n,i)=>b.writeDoubleLE(n,i*8));return sha(Buffer.concat([Buffer.from('builder-root-input-vector/binary64-le/384/v1\0'),b]));}
const paths={gta:['games','video-games','gta'],minecraft:['games','video-games','minecraft'],koalas:['nature','animals','koalas'],dolphins:['nature','animals','dolphins'],kapsalon:['cooking','recipes','kapsalon'],pasta:['cooking','recipes','pasta'],games:['games'],'video-games':['games','video-games'],nature:['nature'],animals:['nature','animals'],cooking:['cooking'],recipes:['cooking','recipes']};
function panel(){
 const cases=[];for(const split of ['training','calibration','test'])for(let i=0;i<(split==='test'?72:48);i++){
  const id=split==='test'&&i<2?`adr159-test-${i?'083':'054'}`:`invented-${split}-${i}`,unknown=split==='test'&&i<2;
  let nodeId='games',role='parent-stop',ref=null,gold={kind:'complete',path:['games']};
  if(split==='training'){
   if(i<24){nodeId=Object.keys(paths)[Math.floor(i/4)];role='leaf';ref={nodeId,kind:'member'};gold={kind:'complete',path:[...paths[nodeId]]};}
   else if(i<36){nodeId=['games','video-games','nature','animals','cooking','recipes'][Math.floor((i-24)/2)];ref={nodeId,kind:'stop'};gold={kind:'complete',path:[...paths[nodeId]]};}
   else {const excluded=['games','nature','cooking'][Math.floor((i-36)/4)];role='scoped-confounder';ref={nodeId:excluded,kind:'outside'};nodeId=i%2?'science':excluded;gold={kind:'prefix',path:['science']};}
  }
  cases.push({id,groupId:'group-'+id,split,role,nodeId,publicUrl:`https://publisher${i%7}.org/${id}`,publicSupportUrl:`https://publisher${i%7}.org/${id}`,language:'en',publisherFamily:`family-${split}-${i%(split==='test'?25:24)}`,proposedGold:gold,assessmentGold:unknown?null:{kind:gold.kind,path:[...gold.path]},labelStatus:unknown?'unverified':'verified',referenceAnnotation:ref});
 }
 const body={schema:'hierarchy-native-specificity-panel/v1',cases,counts:{},sourceDigests:{},taxonomy:{unionNodeCount:25},assessmentPolicy:{allOriginalRowsAndDenominatorsRetained:true,unverifiedOrDisputedProposedGoldNeverPassedToAssessor:true},limitations:{},fullyReviewedGoldReady:false,nativeReady:false,modelReady:false,productionValidated:false,assignmentAuthority:false};
 const expectedPanelIdentity=digest(body);return buildSpecificityManifest({panel:{...body,panelIdentity:expectedPanelIdentity},expectedPanelIdentity});
}
function oldProfile(producerId,inputConstructionHash){const p={schema:'root-rank-target-producer-profile/v1',producerId,inputConstructionHash,extractorVersions:producerId==='current-static'?['crawler-static-html-prefix/v1']:['article-container-prefix/v1','main-text-prefix/v1']};return {...p,producerProfileHash:digest(p)};}
export function inventedFixture(){
 const manifest=panel(),sourceHashes=Object.fromEntries(CONSTRUCTION_SOURCE_KEYS.map(k=>[k,sha('invented-code-'+k)]));
 const profileSet=buildSpecificityProducerProfile({panelIdentity:manifest.panelIdentity,manifestHash:manifest.manifestHash,encoderHash:H,sourceHashes});
 const oldSources={'protocol.json':H,'invented-source.js':'1'.repeat(64)},oldProfiles=[oldProfile('current-static','c'.repeat(64)),oldProfile('browser-current','d'.repeat(64))];
 const fm={schema:'current-producer-root-fit-freeze/v1',sourceHashes:oldSources,protocolSha256:H,profileRecipeHash:'2'.repeat(64),targetProfiles:oldProfiles},freezeHash=digest(fm),freezeBytes=bytes({...fm,freezeHash});
 const inputDefinition={bodyWeight:.75,titleWeight:.25,encoderHash:H},representationHash=describePairedE5Input(compilePairedE5Input(inputDefinition)).representationHash;
 const schema='hierarchical-e5-paired-linear-heads-v1',representation='paired-raw-e5-body-title-v1',lambda=.1,nodes=[...ROOT_IDS].sort().map(id=>({id,parentId:null}));
 const heads=nodes.map((n,i)=>({nodeId:n.id,enabled:true,positiveGroups:2,negativeGroups:2,weights:axis(i),intercept:-.5}));
 const trainingIdHashes=[0,1,2,3].map(i=>sha('invented-id-'+i)).sort(),trainingGroupHashes=[0,1,2,3].map(i=>sha('invented-group-'+i)).sort();
 const model={schema,representation,representationHash,trainingVersion:freezeHash+'|0.75',trainingHash:H,taxonomyHash:digest(nodes),
  settingsHash:digest({schema,lambda,dimensions:384,centering:'training-mean-features-and-labels',solver:'shared-dual-gram-cholesky',targets:'ancestor-inclusive-plus-one-otherwise-minus-one',independentGroups:'duplicates-rejected',minimumPositiveGroups:2,minimumNegativeGroups:2}),
  parameterHash:digest({schema,representation,representationHash,heads}),lambda,dimensions:384,trainingIdHashes,trainingGroupHashes,provenanceHash:digest({trainingIdHashes,trainingGroupHashes}),experimental:true,productionValidated:false,assignmentAuthority:false,nodes,heads,trainingWork:{units:0,gramProducts:0,choleskyProducts:0,solveProducts:0,weightProducts:0}};
 const policy={schema:'pooled-root-rank-development-policy/v1',modelHash:digest(model),representationHash,inputConstructionHash:T,nodeIds:nodes.map(n=>n.id),calibrationHash:H,minimumAcceptedGroups:20,enabled:true,minWinnerScore:.1,minWinnerGap:.01,acceptedGroups:20,correctGroups:20,work:{countedUnits:0,preflightUpperBound:10000},developmentOnly:true,perClassPrecisionGuaranteed:false,productionValidated:false,assignmentAuthority:false};policy.policyHash=digest(policy);
 const original=describeBuilderScopedRootRankCandidate(compileBuilderScopedRootRankCandidate({schema:'builder-scoped-root-rank-candidate/v1',inputDefinition,rootModel:model,rootPolicy:policy,trainingInputConstructionHash:T,targetProfiles:oldProfiles.map(({producerId,inputConstructionHash,extractorVersions})=>({producerId,inputConstructionHash,extractorVersions}))}));
 const modelBytes=bytes(model),policyBytes=bytes(policy),inputDefinitionBytes=bytes(inputDefinition),selectionBytes=bytes({schema:'current-producer-root-fit-report/v1',freezeHash,selectedIndex:1,scope:'invented-not-real-fit'});
 const selectionReceiptBytes=bytes({schema:'current-producer-root-selection/v1',phase:'selected-before-final-transfer',finalTestEvaluated:false,freezeHash,freezeFileSha256:sha(freezeBytes),protocolSha256:H,selectionSha256:sha(selectionBytes),selectedIndex:1,bodyWeight:.75,titleWeight:.25,lambda:.1,trainingInputConstructionHash:T,eligibleCohortHash:H,eligibilityReceiptSha256:H,calibrationGoldSha256:H,selectedModelSha256:sha(modelBytes),modelJsonHash:digest(model),selectedPolicySha256:sha(policyBytes),policyHash:policy.policyHash,selectedInputDefinitionSha256:sha(inputDefinitionBytes),transferHash:original.transferHash,targetProfiles:oldProfiles,sourceBindingsHash:H,candidateSha256:'3'.repeat(64),labelSealSha256:'4'.repeat(64),encoderHash:H,representationHash,inputView:'current-static',productionValidated:false,assignmentAuthority:false});
 const supervisorBytes=bytes({schema:'current-producer-root-fit-supervisor/v1',phase:'fit-current',reason:null,exitCode:0,cleanupReason:null,ownTreeCleanupConfirmed:true,sourceHashesRechecked:true,freezeSha256:sha(freezeBytes),resultSha256:sha(selectionReceiptBytes),sourceHashes:oldSources,elapsedSeconds:1,jobMemoryLimitBytes:1536*1048576,sampledPeakTreeRssBytes:1048576,sampledPeakTreePrivateBytes:1048576});
 const oldFit={freezeBytes,supervisorBytes,selectionReceiptBytes,selectionBytes,modelBytes,policyBytes,inputDefinitionBytes,sourceHashes:oldSources};
 const expectedOldFileHashes=Object.fromEntries(Object.keys(oldFit).filter(k=>k!=='sourceHashes').map(k=>[k,sha(oldFit[k])]));
 const {producerId,inputConstructionHash,extractorVersions,effectiveTitleRule}=profileSet.producerProfile;
 const rootCandidate={schema:'native-root-rank-candidate/v1',inputDefinition,rootModel:model,rootPolicy:policy,trainingInputConstructionHash:T,targetProfile:{producerId,inputConstructionHash,extractorVersions,effectiveTitleRule}},handle=compileNativeRootRankCandidate(rootCandidate);
 const trainingRows=manifest.cases.filter(c=>c.split==='training').map((c,i)=>{
  const b=manifest.batches.find(b=>b.cases.some(x=>x.id===c.id)),bc=b.cases.find(x=>x.id===c.id),url=c.publicUrl;
  const foreground={windowId:7,tabId:3,focused:true,windowType:'normal',incognito:false,active:true,tabStatus:'complete',sourceUrl:url,documentUrl:url,permissionGranted:true};
  const nativeWitness={schema:'chrome-scripting-native-reader/v1',studyId:'study-'+b.batchId,studyRevision:b.batchId,caseId:c.id,ordinal:bc.nativeOrdinal,observationNonce:'observation-'+i,eventEpoch:0,tabId:3,windowId:7,frameId:0,documentId:'native-doc-'+i,sourceUrl:url,documentUrl:url,foregroundChecks:[{...foreground},{...foreground},{...foreground}],read:{contractVersion:'page-content/1',status:'collected',documentId:'native-doc-'+i},attestation:{contractVersion:'page-content-attestation/1',status:'attested',url},effectiveTitleRule:'trim-or-hostname/v1',nativeDocumentContinuityOnly:true,canonicalAuthority:false};
  const metadata={sourceId:c.id,sourceVersion:'observation-'+i,producerId,producerProfileHash:profileSet.producerProfile.producerProfileHash,inputConstructionHash,extractorVersion:'main-text-prefix/v1',fieldBindings:{bodySha256:H,bodyCharacters:20,rawTitleSha256:H,rawTitleCharacters:10,effectiveTitleSha256:H,effectiveTitleCharacters:10},nativeWitness,rightsEvidenceHash:H};
  const bodyVector=axis(i%16),titleVector=axis(i%16);
  return {id:c.id,groupId:c.groupId,status:'available',nativeInput:structuredClone({...prepareNativeRootInput(handle,metadata),bodyVector,titleVector}),vectorBindings:{bodyVectorHash:vectorHash(bodyVector),titleVectorHash:vectorHash(titleVector)}};
 });
 return {manifest,profileSet,rootCandidate,trainingRows,oldFit,expectedOldFileHashes,expectedOldSourceHashes:oldSources};
}
export const builderInput=f=>({manifest:f.manifest,expectedPanelIdentity:f.manifest.panelIdentity,expectedManifestHash:f.manifest.manifestHash,profileSet:f.profileSet,expectedRecipeHash:f.profileSet.recipeHash,rootCandidate:f.rootCandidate,trainingRows:f.trainingRows});
export const reuseInput=f=>({oldFit:f.oldFit,profileSet:f.profileSet,expectedRecipeHash:f.profileSet.recipeHash,panelIdentity:f.manifest.panelIdentity,manifestHash:f.manifest.manifestHash,protocolHash:H});

test('exact29 literal SOURCE keys bind native168/four-case recipe without future selection cycles',()=>{
 const f=inventedFixture(),p=f.profileSet;assert.equal(CONSTRUCTION_SOURCE_KEYS.length,29);assert.equal(new Set(CONSTRUCTION_SOURCE_KEYS).size,29);
 for(const name of ['run.mjs','stage.js'])assert.ok(CONSTRUCTION_SOURCE_KEYS.includes('spikes/topic-resolution/harness/experimental/native-specificity-study-v3/'+name));
 assert.equal(p.construction.observation.batchCases,4);assert.equal(p.construction.observation.independentProfiles,42);assert.equal(p.producerProfile.schema,'native-root-target-producer-profile/v1');
 const q=validateSpecificityProducerProfile({profileSet:p,expectedRecipeHash:p.recipeHash,expectedPanelIdentity:f.manifest.panelIdentity,expectedManifestHash:f.manifest.manifestHash});assert.deepEqual(q,p);assert.ok(Object.isFrozen(p.construction.sourceHashes));
 for(const forbidden of ['selectedArtifact','calibrationAudit','referenceConstructionHash','receiptHash'])assert.equal(JSON.stringify(p).includes(forbidden),false);
});
test('profile rejects wrong external pins, source omissions/extras, getter/proxy and recipe mutation',()=>{
 const f=inventedFixture(),args={profileSet:f.profileSet,expectedRecipeHash:f.profileSet.recipeHash,expectedPanelIdentity:f.manifest.panelIdentity,expectedManifestHash:f.manifest.manifestHash};
 assert.throws(()=>validateSpecificityProducerProfile({...args,expectedRecipeHash:H}));assert.throws(()=>validateSpecificityProducerProfile({...args,expectedManifestHash:H}));
 for(const modify of [s=>{delete s[CONSTRUCTION_SOURCE_KEYS[0]];},s=>{s.extra=H;}]){const s={...f.profileSet.construction.sourceHashes};modify(s);assert.throws(()=>buildSpecificityProducerProfile({panelIdentity:H,manifestHash:H,encoderHash:H,sourceHashes:s}));}
 let calls=0;const s={...f.profileSet.construction.sourceHashes};Object.defineProperty(s,CONSTRUCTION_SOURCE_KEYS[0],{enumerable:true,get(){calls++;throw Error();}});assert.throws(()=>buildSpecificityProducerProfile({panelIdentity:H,manifestHash:H,encoderHash:H,sourceHashes:s}));assert.equal(calls,0);
 const changed=structuredClone(f.profileSet);changed.construction.fields.bodyLimitUtf16=4097;assert.throws(()=>validateSpecificityProducerProfile({...args,profileSet:changed}));
 assert.throws(()=>validateSpecificityProducerProfile({...args,profileSet:new Proxy(f.profileSet,{})}));
});
