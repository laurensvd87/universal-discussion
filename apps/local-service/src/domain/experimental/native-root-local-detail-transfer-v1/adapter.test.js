// Invented geometric artifacts ONLY. No saved model/data, IO or E5 execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compileNativeRootLocalDetailTransfer as compile,describeNativeRootLocalDetailTransfer as describe,
 prepareNativeRootLocalDetailInput as prepare,classifyNativeRootLocalDetailTransfer as classify,NativeRootLocalDetailError} from './adapter.js';
import {compileNativeRootRankCandidate,prepareNativeRootInput,classifyNativeRootRankCandidate} from '../../../../experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js';
import {compilePairedE5Input,describePairedE5Input} from '../../hierarchical-e5-paired-input.js';
import {compileHierarchyLocalEvidence,describeHierarchyLocalEvidence} from '../../hierarchical-e5-local-evidence.js';
const sha=v=>createHash('sha256').update(v).digest('hex'),digest=v=>sha(JSON.stringify(v));
const H='a'.repeat(64),TRAIN='b'.repeat(64),DETAIL='c'.repeat(64),TARGET='d'.repeat(64);
const axis=i=>Array.from({length:384},(_,j)=>j===i?1:0),mix=(i,j)=>axis(i).map((x,k)=>(x+(k===j?1:0))/Math.SQRT2);
const definition=bodyWeight=>({bodyWeight,titleWeight:1-bodyWeight,encoderHash:H});
const detailNodes=[{id:'games',parentId:null},{id:'video',parentId:'games'},{id:'gta',parentId:'video'},
 {id:'minecraft',parentId:'video'},{id:'board',parentId:'games'},{id:'nature',parentId:null},{id:'animals',parentId:'nature'},{id:'koala',parentId:'animals'}];
function rootModel(inputDefinition,rootIds=['games','nature']){
 const schema='hierarchical-e5-paired-linear-heads-v1',lambda=.1,representation='paired-raw-e5-body-title-v1',
  representationHash=describePairedE5Input(compilePairedE5Input(inputDefinition)).representationHash;
 const nodes=rootIds.map(id=>({id,parentId:null})).sort((a,b)=>a.id<b.id?-1:1);
 const heads=nodes.map((n,i)=>({nodeId:n.id,enabled:true,positiveGroups:2,negativeGroups:2,
  weights:axis(n.id==='games'?0:n.id==='nature'?1:i+2),intercept:0}));
 const trainingIdHashes=Array.from({length:4},(_,i)=>sha('invented-training-'+i)).sort(),trainingGroupHashes=Array.from({length:4},(_,i)=>sha('invented-group-'+i)).sort();
 return {schema,representation,representationHash,trainingVersion:'manual-geometric-not-trained',trainingHash:H,taxonomyHash:digest(nodes),
  settingsHash:digest({schema,lambda,dimensions:384,centering:'training-mean-features-and-labels',solver:'shared-dual-gram-cholesky',
   targets:'ancestor-inclusive-plus-one-otherwise-minus-one',independentGroups:'duplicates-rejected',minimumPositiveGroups:2,minimumNegativeGroups:2}),
  parameterHash:digest({schema,representation,representationHash,heads}),lambda,dimensions:384,trainingIdHashes,trainingGroupHashes,
  provenanceHash:digest({trainingIdHashes,trainingGroupHashes}),experimental:true,productionValidated:false,assignmentAuthority:false,nodes,heads,
  trainingWork:{units:0,gramProducts:0,choleskyProducts:0,solveProducts:0,weightProducts:0}};
}
function fixture({rootWeight=1,detailWeight=1,rootIds=['games','nature'],nodes=detailNodes,examples=null,supportedRootIds=null}={}){
 const inputDefinition=definition(rootWeight),model=rootModel(inputDefinition,rootIds);
 const body={schema:'pooled-root-rank-development-policy/v1',modelHash:digest(model),representationHash:model.representationHash,
  inputConstructionHash:TRAIN,nodeIds:model.nodes.map(n=>n.id),calibrationHash:H,minimumAcceptedGroups:20,enabled:true,minWinnerScore:.5,minWinnerGap:.1,
  acceptedGroups:20,correctGroups:20,work:{countedUnits:0,preflightUpperBound:10000},developmentOnly:true,perClassPrecisionGuaranteed:false,
  productionValidated:false,assignmentAuthority:false};
 const rootCandidate={schema:'native-root-rank-candidate/v1',inputDefinition,rootModel:model,rootPolicy:{...body,policyHash:digest(body)},
  trainingInputConstructionHash:TRAIN,targetProfile:{producerId:'native-browser-current',inputConstructionHash:TARGET,
   extractorVersions:['article-container-prefix/v1','main-text-prefix/v1'],effectiveTitleRule:'trim-or-hostname/v1'}};
 const def=definition(detailWeight),paired=describePairedE5Input(compilePairedE5Input(def));
 const refs=examples??['gta','minecraft','koala','board'].flatMap((nodeId,k)=>Array.from({length:2},(_,i)=>({id:nodeId+'-ref'+i,groupId:nodeId+'-group'+i,
  nodeId,kind:'member',vector:axis([0,2,1,4][k])})));
 const artifact={schema:'hierarchical-e5-local-evidence/v1',representation:paired.representation,representationHash:paired.representationHash,
  inputConstructionHash:DETAIL,taxonomyVersion:'invented-detail/v1',evidenceVersion:'invented-evidence/v1',calibrationVersion:'invented-cuts/v1',calibrationStatus:'experimental',
  nodes:nodes.map(n=>({...n})),examples:refs,nodePolicies:nodes.map(n=>({nodeId:n.id,enabled:true,minSupport:2,minSimilarity:.7,minNegativeMargin:0,minRivalMargin:0}))};
 return {schema:'native-root-local-detail-transfer/v1',rootCandidate,detail:{artifact,inputDefinition:def,
  supportedRootIds:supportedRootIds??nodes.filter(n=>n.parentId===null).map(n=>n.id)}};
}
function metadata(handle){
 const p=describe(handle).actualNativeTargetProfile,url='https://example.org/invented-page',documentId='invented-native-document';
 const foreground={windowId:7,tabId:3,focused:true,windowType:'normal',incognito:false,active:true,tabStatus:'complete',sourceUrl:url,documentUrl:url,permissionGranted:true};
 return {sourceId:'invented-case',sourceVersion:'invented-observation',producerId:p.producerId,producerProfileHash:p.producerProfileHash,
  inputConstructionHash:p.inputConstructionHash,extractorVersion:p.extractorVersions[0],
  fieldBindings:{bodySha256:sha('invented-body'),bodyCharacters:13,rawTitleSha256:sha('invented-title'),rawTitleCharacters:14,
   effectiveTitleSha256:sha('invented-title'),effectiveTitleCharacters:14},
  nativeWitness:{schema:'chrome-scripting-native-reader/v1',studyId:'invented-study',studyRevision:'invented-revision',caseId:'invented-case',ordinal:1,
   observationNonce:'invented-observation',eventEpoch:0,tabId:3,windowId:7,frameId:0,documentId,sourceUrl:url,documentUrl:url,
   foregroundChecks:[{...foreground},{...foreground},{...foreground}],read:{contractVersion:'page-content/1',status:'collected',documentId},
   attestation:{contractVersion:'page-content-attestation/1',status:'attested',url},effectiveTitleRule:'trim-or-hostname/v1',nativeDocumentContinuityOnly:true,canonicalAuthority:false},rightsEvidenceHash:H};
}
const input=(h,body=axis(0),title=axis(0))=>({...prepare(h,metadata(h)),bodyVector:body,titleVector:title});

test('GTA and Koala receive actual same-root detail while native witness/builder remain unchanged',()=>{
 const f=fixture(),h=compile(f),beforeArtifact=digest(f.detail.artifact);
 for(const [v,path]of [[axis(0),['games','video','gta']],[axis(1),['nature','animals','koala']]]){
  const a=input(h,v,v),d=classify(h,a),root=compileNativeRootRankCandidate(f.rootCandidate);
  const r=classifyNativeRootRankCandidate(root,{...prepareNativeRootInput(root,metadata(h)),bodyVector:v,titleVector:v});
  assert.deepEqual(d.supportedPath,path);assert.equal(d.reason,'independent-root-local-detail-refinement');
  assert.deepEqual(d.witness,r.witness);assert.deepEqual(d.vectorBindings,r.vectorBindings);assert.equal(d.rootSemanticWitnessHash,r.semanticWitnessHash);
  assert.equal(d.witness.inputConstructionHash,TARGET);assert.notEqual(d.semanticWitnessHash,r.semanticWitnessHash);
  assert.equal(d.internalNumericQuery.namespace.originalArtifactInputConstructionHash,DETAIL);
  assert.match(d.internalNumericQuery.sourceId,/^numeric-detail-[a-f0-9]{64}$/);assert.match(d.internalNumericQuery.sourceVersion,/^numeric-policy-[a-f0-9]{64}$/);
  assert.notEqual(d.internalNumericQuery.sourceId,a.sourceId);assert.notEqual(d.internalNumericQuery.sourceVersion,a.sourceVersion);
  assert.equal(d.internalNumericQuery.nativeSourceIdentity,false);assert.equal(d.localOutcome.selectedPath.at(-1),path.at(-1));
  assert.equal(d.work.detailDotProducts,8);assert.equal(d.work.detailCoordinateProducts,8*384);
 }
 assert.equal(digest(f.detail.artifact),beforeArtifact);assert.equal(describe(h).transferValidationStatus,'unvalidated');
 assert.equal(describe(h).originalDetailArtifactHash,describeHierarchyLocalEvidence(compileHierarchyLocalEvidence(f.detail.artifact)).artifactHash);
});
test('independent fusion weights select independently, encoder/representation identity mismatch refused',()=>{
 const h=compile(fixture({rootWeight:1,detailWeight:0})),d=classify(h,input(h,axis(0),axis(2)));
 assert.deepEqual(d.supportedPath,['games','video','minecraft']);assert.equal(d.independentlySupportedRootId,'games');
 assert.notEqual(describe(h).rootTransferIdentity.representationHash,describe(h).detailRepresentationHash);
 for(const change of [f=>f.detail.inputDefinition.encoderHash='e'.repeat(64),f=>f.detail.artifact.representationHash='e'.repeat(64),
  f=>f.detail.artifact.inputConstructionHash=TARGET]){const f=fixture();change(f);assert.throws(()=>compile(f));}
});
test('sibling nominations return common ancestor; direct STOP excludes unjustified specialization',()=>{
 const f=fixture();for(const e of f.detail.artifact.examples)if(e.nodeId==='minecraft')e.vector=axis(0);
 const h=compile(f),d=classify(h,input(h));assert.deepEqual(d.supportedPath,['games','video']);
 assert.equal(d.localOutcome.reason,'supported-common-ancestor');assert.equal(d.localOutcome.plausiblePaths.length,2);
 const stop=fixture();for(let i=0;i<2;i++)stop.detail.artifact.examples.push({id:'stop'+i,groupId:'stop-group'+i,nodeId:'video',kind:'stop',vector:axis(0)});
 const sh=compile(stop),sd=classify(sh,input(sh));assert.deepEqual(sd.supportedPath,['games','video']);
 assert.equal(sd.localOutcome.plausiblePaths[0].explicitStop,true);
 assert.notEqual(sd.localOutcomeHash,d.localOutcomeHash);assert.notEqual(sd.semanticWitnessHash,d.semanticWitnessHash);
});
test('unknown child can stop at supported parent and no nearest child is fabricated',()=>{
 const f=fixture({detailWeight:0});for(let i=0;i<2;i++)f.detail.artifact.examples.push({id:'unknown-child-stop'+i,groupId:'parent-group'+i,nodeId:'video',kind:'stop',vector:axis(5)});
 const h=compile(f),d=classify(h,input(h,axis(0),axis(5)));assert.deepEqual(d.supportedPath,['games','video']);
 const no=compile(fixture({detailWeight:0})),unsupported=classify(no,input(no,axis(0),axis(5)));
 assert.deepEqual(unsupported.supportedPath,['games']);assert.equal(unsupported.reason,'local-detail-unresolved');
});
test('scoped outside excludes child not parent, repeated group views do not invent support',()=>{
 const f=fixture();for(let i=0;i<2;i++)f.detail.artifact.examples.push({id:'gta-outside'+i,groupId:'outside'+i,nodeId:'gta',kind:'outside',vector:axis(0)});
 const h=compile(f);assert.deepEqual(classify(h,input(h)).supportedPath,['games','video']);
 const duplicate=fixture();for(const e of duplicate.detail.artifact.examples)if(e.nodeId==='gta')e.groupId='same-entity-group';
 const dh=compile(duplicate),d=classify(dh,input(dh));assert.deepEqual(d.supportedPath,['games']);
});
test('root abstention, tie and zero root fusion never run detail; unsupported root skips both detail fusion/scoring',()=>{
 const h=compile(fixture());for(const v of [axis(3),mix(0,1)]){
  const d=classify(h,input(h,v,v));assert.deepEqual(d.supportedPath,[]);assert.equal(d.detailFusionEvaluated,false);assert.equal(d.detailEvaluated,false);
  assert.equal(d.work.detailDotProducts,0);assert.equal(d.detailDerivedVectorHash,null);assert.equal(d.internalNumericQuery,null);
 }
 const zero=compile(fixture({rootWeight:.5})),z=classify(zero,input(zero,axis(0),axis(0).map(x=>-x)));assert.deepEqual(z.supportedPath,[]);assert.equal(z.detailFusionEvaluated,false);
 const disabled=fixture(),p=disabled.rootCandidate.rootPolicy;Object.assign(p,{enabled:false,acceptedGroups:0,correctGroups:0,minWinnerScore:0,minWinnerGap:0});delete p.policyHash;p.policyHash=digest(p);
 const off=compile(disabled),o=classify(off,input(off));assert.deepEqual(o.supportedPath,[]);assert.equal(o.work.detailDotProducts,0);assert.equal(o.detailFusionEvaluated,false);
 const f=fixture();f.detail.artifact.nodes=f.detail.artifact.nodes.filter(n=>!['nature','animals','koala'].includes(n.id));
 f.detail.artifact.examples=f.detail.artifact.examples.filter(e=>e.nodeId!=='koala');f.detail.artifact.nodePolicies=f.detail.artifact.nodePolicies.filter(n=>!['nature','animals','koala'].includes(n.nodeId));f.detail.supportedRootIds=['games'];
 const sh=compile(f),s=classify(sh,input(sh,axis(1),axis(1)));assert.deepEqual(s.supportedPath,['nature']);assert.equal(s.reason,'accepted-root-outside-detail-scope');
 assert.equal(s.detailFusionEvaluated,false);assert.equal(s.work.detailCoordinateProducts,0);assert.equal(s.work.fusionCoordinateVisitUpperBound,3072);
});
test('cross-root conflict and cross-root local ambiguity retain independent root; zero detail fusion likewise',()=>{
 const h=compile(fixture({detailWeight:0}));for(const title of [axis(1),mix(0,1)]){
  const d=classify(h,input(h,axis(0),title));assert.deepEqual(d.supportedPath,['games']);assert.equal(d.detailEvaluated,true);
  assert.equal(d.reason,title[0]===0?'local-detail-conflict':'local-detail-unresolved');
 }
 const zero=compile(fixture({detailWeight:.5})),z=classify(zero,input(zero,axis(0),axis(0).map(x=>-x)));
 assert.deepEqual(z.supportedPath,['games']);assert.equal(z.reason,'detail-fusion-unavailable');assert.equal(z.detailFusionEvaluated,true);assert.equal(z.detailEvaluated,false);
});
test('composite witness binds actual final/local paths, artifact/representation, native fields and derived signed-zero bits',()=>{
 const h=compile(fixture()),a=input(h),d=classify(h,a);a.bodyVector[3]=-0;const signed=classify(h,a);
 assert.notEqual(signed.vectorBindings.bodyVectorHash,d.vectorBindings.bodyVectorHash);assert.notEqual(signed.detailDerivedVectorHash,d.detailDerivedVectorHash);
 assert.notEqual(signed.internalNumericQuery.queryBindingHash,d.internalNumericQuery.queryBindingHash);assert.notEqual(signed.semanticWitnessHash,d.semanticWitnessHash);
 const meta=metadata(h);meta.rightsEvidenceHash='f'.repeat(64);const changed=classify(h,{...prepare(h,meta),bodyVector:axis(0),titleVector:axis(0)});
 assert.notEqual(changed.semanticWitnessHash,d.semanticWitnessHash);
 const g=fixture();g.detail.artifact.nodePolicies.find(n=>n.nodeId==='gta').minSimilarity=1;
 const gh=compile(g);assert.notEqual(describe(gh).transferHash,describe(h).transferHash);
 assert.equal(d.semanticWitnessVersion,'native-root-local-detail-semantic-witness/v1');assert.ok(Object.isFrozen(d.localOutcome.plausiblePaths));
 assert.equal(d.localOutcomeHash,digest(d.localOutcome));
 assert.equal(d.semanticWitnessHash,digest({schema:'native-root-local-detail-semantic-witness/v1',transferHash:d.transferHash,
  rootSemanticWitnessHash:d.rootSemanticWitnessHash,nativeSourceInputHash:d.witness.sourceInputHash,
  originalDetailArtifactHash:d.originalDetailArtifactHash,originalDetailRepresentationHash:describe(h).detailRepresentationHash,
  detailDerivedVectorHash:d.detailDerivedVectorHash,numericQueryBindingHash:d.internalNumericQuery.queryBindingHash,
  localOutcomeHash:d.localOutcomeHash,supportedPath:d.supportedPath,reason:d.reason}));
});
test('supported root subset and full lineage are strict; approved roots cannot masquerade as children',()=>{
 for(const change of [f=>f.detail.supportedRootIds=[],f=>f.detail.supportedRootIds=['games','games'],f=>f.detail.supportedRootIds=['games'],
  f=>f.detail.artifact.nodes.find(n=>n.id==='nature').parentId='games',f=>f.detail.artifact.nodes.find(n=>n.id==='video').parentId='missing',
  f=>f.detail.artifact.nodes.find(n=>n.id==='games').parentId='gta',f=>f.detail.artifact.schema='wrong']){
  const f=fixture();change(f);assert.throws(()=>compile(f));
 }
 const f=fixture();f.detail.artifact.nodes.find(n=>n.id==='nature').id='foreign';f.detail.artifact.nodes.find(n=>n.id==='animals').parentId='foreign';
 f.detail.artifact.nodePolicies.find(n=>n.nodeId==='nature').nodeId='foreign';f.detail.supportedRootIds=['games','foreign'];assert.throws(()=>compile(f));
});
test('exact cap supports 128 nodes/512 refs/16 roots, bounds actual work; overcap rejected before scoring',()=>{
 const nodes=[{id:'games',parentId:null},{id:'nature',parentId:null},...Array.from({length:126},(_,i)=>({id:'child'+i,parentId:'games'}))];
 const examples=Array.from({length:512},(_,i)=>({id:'ref'+i,groupId:'group'+Math.floor(i/16),nodeId:'child0',kind:'member',vector:axis(0)}));
 const roots=['games','nature',...Array.from({length:14},(_,i)=>'root'+i)],f=fixture({nodes,examples,rootIds:roots}),h=compile(f),d=classify(h,input(h));
 assert.equal(d.work.rootHeadDotProducts+d.work.detailDotProducts,528);assert.equal(d.work.rootHeadCoordinateProducts+d.work.detailCoordinateProducts,202752);
 assert.equal(d.work.rootRankComparisons,64);assert.equal(d.work.fusionCoordinateVisitUpperBound,6144);assert.ok(d.work.localCountedUnits<=d.work.localPreflightUpperBound&&d.work.localPreflightUpperBound<=4000000);
 for(const change of [x=>x.detail.artifact.nodes.push({id:'excess',parentId:'games'}),x=>x.detail.artifact.examples.push({...examples[0],id:'excess'})]){
  const x=fixture({nodes,examples:[...examples],rootIds:roots});change(x);assert.throws(()=>compile(x),e=>e instanceof NativeRootLocalDetailError&&e.code==='capacity');
 }
});
test('opaque handles, private artifact/vector copies and exact hostile schemas never execute caller hooks',()=>{
 const f=fixture(),h=compile(f),a=input(h),d=classify(h,a);f.detail.artifact.examples[0].vector.fill(-1);f.rootCandidate.rootModel.heads[0].weights.fill(-1);
 assert.deepEqual(classify(h,a),d);a.bodyVector.fill(0);assert.deepEqual(d.supportedPath,['games','video','gta']);assert.throws(()=>classify(h,a));
 assert.throws(()=>describe({}));assert.throws(()=>classify({},{}));assert.throws(()=>compile(fixture(),{}));assert.throws(()=>classify(h,input(h),{}));
 let calls=0;const trap=()=>{calls++;throw Error('must not run');};
 for(const make of [()=>new Proxy({},{getPrototypeOf:trap}),()=>{const f=fixture();Object.defineProperty(f.detail,'artifact',{enumerable:true,get:trap});return f;},
  ()=>{const f=fixture();f.detail.supportedRootIds=new Proxy([],{getPrototypeOf:trap});return f;},
  ()=>{const f=fixture();Object.defineProperty(f.detail.artifact.examples[0].vector,'0',{enumerable:true,get:trap});return f;}])assert.throws(()=>compile(make()));
 for(const make of [()=>{const a=input(h);Object.defineProperty(a,'nativeWitness',{enumerable:true,get:trap});return a;},
  ()=>{const a=input(h);Object.defineProperty(a.bodyVector,'0',{enumerable:true,get:trap});return a;},
  ()=>{const a=input(h);a.titleVector=new Proxy([],{getPrototypeOf:trap});return a;},
  ()=>{const a=input(h);a.score=1;return a;},()=>{const a=input(h);a.supportedPath=['games','gta'];return a;}])assert.throws(()=>classify(h,make()));
 assert.equal(calls,0);
});
test('native source/profile/rights/hash mismatch and malformed vectors are errors, never broad fallback',()=>{
 const h=compile(fixture());for(const change of [a=>a.inputConstructionHash=DETAIL,a=>a.sourceInputHash=H,a=>a.producerProfileHash=H,
  a=>a.sourceVersion='wrong',a=>a.nativeWitness.read.documentId='wrong',a=>a.rightsEvidenceHash='bad',a=>a.bodyVector[0]=NaN,
  a=>delete a.titleVector[2],a=>a.bodyVector.push(0)]){const a=input(h); // prepared metadata is frozen: replace its native record when mutating.
   const mutable=structuredClone(a);change(mutable);assert.throws(()=>classify(h,mutable));}
});
