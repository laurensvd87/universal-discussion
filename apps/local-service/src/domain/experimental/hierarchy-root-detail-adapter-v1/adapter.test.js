// Invented coefficients, metadata and geometric axes only. No fit/encoder/IO.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compileRootDetailTransferAdapter as compile,describeRootDetailTransferAdapter as describe,classifyRootDetailTransferAdapter as classify} from './adapter.js';
import {compilePairedE5Input,describePairedE5Input} from '../../hierarchical-e5-paired-input.js';
import {observedHeadPolicyWorkUpperBound} from '../../hierarchical-e5-observed-head-policy.js';
const sha=v=>createHash('sha256').update(v).digest('hex'),digest=v=>sha(JSON.stringify(v)),H='a'.repeat(64),T='b'.repeat(64);
const axis=i=>Array.from({length:384},(_,j)=>i===j?1:0),definition=(weight,encoderHash=H)=>({bodyWeight:weight,titleWeight:1-weight,encoderHash});
const nodes=[{id:'games',parentId:null},{id:'gta',parentId:'games'},{id:'nature',parentId:null},{id:'plants',parentId:'nature'}];
function model(inputDefinition,nodeList=nodes,leafDirection=null){
 const schema='hierarchical-e5-paired-linear-heads-v1',representation='paired-raw-e5-body-title-v1',lambda=.1;
 const representationHash=describePairedE5Input(compilePairedE5Input(inputDefinition)).representationHash;
 const sorted=nodeList.map(n=>({...n})).sort((a,b)=>a.id<b.id?-1:1),heads=sorted.map(n=>({nodeId:n.id,enabled:true,positiveGroups:2,negativeGroups:2,
  weights:axis(n.id==='games'||n.parentId==='games'?(n.parentId&&leafDirection!==null?leafDirection:0):1),intercept:0}));
 const trainingIdHashes=[0,1,2,3].map(i=>sha('invented-train-'+i)).sort(),trainingGroupHashes=[0,1,2,3].map(i=>sha('invented-group-'+i)).sort();
 return {schema,representation,representationHash,trainingVersion:'manual-geometric-not-trained',trainingHash:H,taxonomyHash:digest(sorted),
  settingsHash:digest({schema,lambda,dimensions:384,centering:'training-mean-features-and-labels',solver:'shared-dual-gram-cholesky',
   targets:'ancestor-inclusive-plus-one-otherwise-minus-one',independentGroups:'duplicates-rejected',minimumPositiveGroups:2,minimumNegativeGroups:2}),
  parameterHash:digest({schema,representation,representationHash,heads}),lambda,dimensions:384,trainingIdHashes,trainingGroupHashes,
  provenanceHash:digest({trainingIdHashes,trainingGroupHashes}),experimental:true,productionValidated:false,assignmentAuthority:false,nodes:sorted,heads,
  trainingWork:{units:0,gramProducts:0,choleskyProducts:0,solveProducts:0,weightProducts:0}};
}
function detailPolicy(m,observed=false){
 const n=6,calibrationIdHashes=Array.from({length:n},(_,i)=>sha('invented-cal-'+i)).sort(),
  calibrationGroupHashes=Array.from({length:n},(_,i)=>sha('invented-cal-group-'+i)).sort();
 const body={schema:observed?'hierarchical-e5-observed-head-policy-v1':'hierarchical-e5-paired-head-policy-v1',
  ...(observed?{cutpointMode:'observed-score-positive-sibling-margin-tie-group-sweep/v1'}:{}),decisionMode:'single-path-root-contrast',
  representation:m.representation,representationHash:m.representationHash,modelArtifactHash:digest(m),modelParameterHash:m.parameterHash,
  modelTrainingHash:m.trainingHash,modelProvenanceHash:m.provenanceHash,taxonomyHash:m.taxonomyHash,
  calibrationHash:H,calibrationIdHashes,calibrationGroupHashes,minimumAcceptedGroups:3,targetPrecision:1,
  ...(observed?{nodeObservations:m.nodes.map(x=>({nodeId:x.id,scoreCutpoints:[0,.5,1],marginCutpoints:[0,.1,1],observationHash:sha(x.id)}))}:{}),
  rules:m.nodes.map(x=>({nodeId:x.id,enabled:true,minScore:.5,minMargin:.1,acceptedGroups:3,correctGroups:3})),
  ...(observed?{calibrationWork:{preflightUpperBound:observedHeadPolicyWorkUpperBound(n,m.nodes.length),units:n*m.heads.length*384,
   scoringCoordinateProducts:n*m.heads.length*384,validationUnits:0,featureComparisons:0,sortComparisons:0,sweepVisits:0,ruleEvaluations:0,
   rows:n,nodes:m.nodes.length,marginCandidates:3*m.nodes.length}}:{}),experimental:true,productionValidated:false,assignmentAuthority:false};
 return {...body,policyHash:digest(body)};
}
function fixture({rootWeight=.75,detailWeight=.25,detailNodes=nodes,leafDirection=null,observed=false}={}){
 const inputDefinition=definition(rootWeight),rootModel=model(inputDefinition,nodes.filter(n=>n.parentId===null));
 const rootPolicy={schema:'pooled-root-rank-development-policy/v1',modelHash:digest(rootModel),representationHash:rootModel.representationHash,
  inputConstructionHash:T,nodeIds:rootModel.nodes.map(n=>n.id),calibrationHash:H,minimumAcceptedGroups:20,enabled:true,minWinnerScore:.5,minWinnerGap:.1,
  acceptedGroups:20,correctGroups:20,work:{countedUnits:0,preflightUpperBound:10000},developmentOnly:true,perClassPrecisionGuaranteed:false,
  productionValidated:false,assignmentAuthority:false};rootPolicy.policyHash=digest(rootPolicy);
 const targetProfiles=['current-static','browser-current'].map((producerId,i)=>({producerId,inputConstructionHash:String(i+1).repeat(64),
  extractorVersions:i?['article-container-prefix/v1','main-text-prefix/v1']:['crawler-static-html-prefix/v1']}));
 const rootCandidate={schema:'builder-scoped-root-rank-candidate/v1',inputDefinition,rootModel,rootPolicy,trainingInputConstructionHash:T,targetProfiles};
 const detailInput=definition(detailWeight),detailModel=model(detailInput,detailNodes,leafDirection);
 return {schema:'hierarchy-root-detail-transfer-adapter/v1',rootCandidate,
  detail:{inputDefinition:detailInput,model:detailModel,policy:detailPolicy(detailModel,observed),trainingInputConstructionHash:'c'.repeat(64)}};
}
function witness(handle,body=axis(0),title=axis(1),producerId='current-static'){
 const p=describe(handle).rootTransferIdentity.targetProfiles.find(x=>x.producerId===producerId);
 return {sourceId:'invented-page',sourceVersion:'claimed-v1',sourceIncarnation:'claimed-incarnation-1',producerId,
  producerProfileHash:p.producerProfileHash,inputConstructionHash:p.inputConstructionHash,extractorVersion:p.extractorVersions[0],inputHash:H,
  documentWitness:producerId==='current-static'?{kind:'static-response',finalUrlHash:H,responseWitnessHash:T}:
   {kind:'browser-document',finalUrlHash:H,frameId:'frame',loaderId:'loader',navigationId:'nav',documentId:'document'},
  bodySha256:sha('invented-body-not-loaded'),titleSha256:sha('invented-title-not-loaded'),bodyVector:body,titleVector:title};
}

test('different representations execute independently; a conflicting detail branch cannot replace the root',()=>{
 const h=compile(fixture()),identity=describe(h),d=classify(h,witness(h));
 assert.notEqual(identity.rootTransferIdentity.representationHash,identity.detailTransferIdentity.representationHash);
 assert.equal(identity.rootTransferIdentity.encoderHash,identity.detailTransferIdentity.encoderHash);
 assert.deepEqual(d.supportedPath,['games']);assert.equal(d.reason,'independent-root-detail-conflict');assert.equal(d.detailEvaluated,true);
 assert.equal(d.assignmentAuthority,false);assert.equal(d.detailQualityValidated,false);assert.equal(identity.detailTransferIdentity.transferValidationStatus,'unvalidated');
});

test('agreeing independently-scored detail retains its deepest confident path for either producer',()=>{
 for(const observed of [false,true]){
  const h=compile(fixture({observed}));for(const producer of ['current-static','browser-current']){
   const d=classify(h,witness(h,axis(0),axis(0),producer));assert.deepEqual(d.supportedPath,['games','gta']);assert.equal(d.reason,'independent-root-detail-agree');
   assert.equal(d.work.rootHeadDotProducts,2);assert.equal(d.work.detailHeadDotProducts,4);assert.equal(d.work.fusionCoordinateVisitUpperBound,6144);
  }
  assert.equal(describe(h).detailTransferIdentity.detailPolicyMode,observed?'observed':'fixed');
 }
});

test('root abstention/ties/disabled cuts never run detail or acquire its confident child',()=>{
 for(const [direction,change] of [[2,()=>{}],[0,a=>{
  const p=a.rootCandidate.rootPolicy;Object.assign(p,{enabled:false,acceptedGroups:0,correctGroups:0,minWinnerGap:0,minWinnerScore:0});delete p.policyHash;p.policyHash=digest(p);
 }],[0,a=>{const p=a.rootCandidate.rootPolicy;p.minWinnerScore=1.25;delete p.policyHash;p.policyHash=digest(p);} ]]){
  const a=fixture();change(a);const h=compile(a),d=classify(h,witness(h,axis(direction),axis(direction)));
  assert.deepEqual(d.supportedPath,[]);assert.equal(d.detailEvaluated,false);assert.equal(d.detailDerivedVectorHash,null);
  assert.equal(d.work.detailHeadDotProducts,0);assert.equal(d.work.detailHeadScalarProducts,0);assert.equal(d.work.fusionCoordinateVisitUpperBound,3072);
 }
 const h=compile(fixture({rootWeight:.5})),d=classify(h,witness(h,axis(0),axis(0).map(x=>-x)));
 assert.deepEqual(d.supportedPath,[]);assert.equal(d.detailEvaluated,false);assert.equal(d.work.rootHeadScalarProducts,0);
});

test('confident root survives detail ancestor stopping, unresolved detail and zero detail fusion',()=>{
 const ancestor=compile(fixture({leafDirection:2}));assert.deepEqual(classify(ancestor,witness(ancestor,axis(0),axis(0))).supportedPath,['games']);
 const a=fixture();for(const r of a.detail.policy.rules)r.enabled=false;delete a.detail.policy.policyHash;a.detail.policy.policyHash=digest(a.detail.policy);
 // Disabled fixed-grid rules require their declared conservative sentinels.
 for(const r of a.detail.policy.rules)Object.assign(r,{minScore:1.25,minMargin:.4,acceptedGroups:0,correctGroups:0});
 delete a.detail.policy.policyHash;a.detail.policy.policyHash=digest(a.detail.policy);
 const unresolved=compile(a),u=classify(unresolved,witness(unresolved,axis(0),axis(0)));assert.deepEqual(u.supportedPath,['games']);assert.equal(u.reason,'independent-root-detail-unresolved');
 const zero=compile(fixture({rootWeight:1,detailWeight:.5})),negative=axis(0).map(x=>-x),d=classify(zero,witness(zero,axis(0),negative));
 assert.deepEqual(d.supportedPath,['games']);assert.equal(d.detailEvaluated,false);assert.equal(d.reason,'independent-root-detail-input-unavailable');
});

test('same capture binds actual signed-zero vector bits and separate caller text/document identities',()=>{
 const h=compile(fixture({rootWeight:1,detailWeight:1})),a=witness(h,axis(0),axis(0)),d=classify(h,a);
 a.bodyVector[2]=-0;const signed=classify(h,a);assert.notEqual(signed.vectorBindings.bodyVectorHash,d.vectorBindings.bodyVectorHash);
 assert.notEqual(signed.detailDerivedVectorHash,d.detailDerivedVectorHash);assert.notEqual(signed.captureWitnessHash,d.captureWitnessHash);
 a.titleSha256=sha('other-claimed-title');const other=classify(h,a);assert.notEqual(other.captureWitnessHash,signed.captureWitnessHash);
 assert.equal(other.rootSemanticWitnessHash,signed.rootSemanticWitnessHash); // text hashes are claims, not vector provenance.
 a.documentWitness.responseWitnessHash=sha('other-document');assert.notEqual(classify(h,a).captureWitnessHash,other.captureWitnessHash);
 assert.equal(d.inputIdentityClaims,'caller-declared-not-attested');assert.ok(Object.isFrozen(d.witness.documentWitness));
});

test('private copies, exact schemas, hash/model/encoder/taxonomy guards and mutation isolation',()=>{
 const a=fixture(),h=compile(a),w=witness(h,axis(0),axis(0)),before=classify(h,w);
 a.rootCandidate.rootModel.heads[0].weights.fill(-100);a.detail.model.heads[0].weights.fill(-100);a.detail.policy.rules[0].enabled=false;
 assert.deepEqual(classify(h,w),before);w.bodyVector.fill(0);assert.deepEqual(before.supportedPath,['games','gta']);assert.throws(()=>classify(h,w));
 for(const change of [x=>x.extra=true,x=>x.detail.extra=true,x=>x.detail.model.representationHash=T,
  x=>x.detail.inputDefinition.encoderHash=T,x=>x.detail.trainingInputConstructionHash='1'.repeat(64),x=>x.detail.policy.policyHash=T,
  x=>x.detail.policy.schema='unsupported']){const f=fixture();change(f);assert.throws(()=>compile(f));}
 const foreign=fixture({detailNodes:[{id:'games',parentId:null},{id:'foreign',parentId:null}]});assert.throws(()=>compile(foreign));
 assert.throws(()=>classify({},{}));assert.throws(()=>describe({}));
});

test('mismatched producer/construction/source shape and supplied path/score are refused, not stale-authority claims',()=>{
 const h=compile(fixture());for(const change of [w=>w.inputConstructionHash=T,w=>w.producerProfileHash=T,w=>w.producerId='other',
  w=>w.extractorVersion='old-extractor',w=>w.documentWitness.kind='browser-document',w=>w.sourceVersion='',w=>w.titleSha256='no',
  w=>w.supportedPath=['games','gta'],w=>w.score=1]){const w=witness(h);change(w);assert.throws(()=>classify(h,w));}
 const w=witness(h);w.sourceIncarnation='different-but-caller-claimed-incarnation';assert.equal(classify(h,w).witness.sourceIncarnation,w.sourceIncarnation);
});

test('hostile getters/proxies/sparse vectors never execute and bounded work is explicit',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('must not run');},h=compile(fixture());
 for(const make of [()=>{const a=fixture();Object.defineProperty(a.detail.policy,'schema',{enumerable:true,get:trap});return a;},
  ()=>new Proxy({},{getPrototypeOf:trap}),()=>{const a=fixture();a.rootCandidate=new Proxy({},{getPrototypeOf:trap});return a;}])assert.throws(()=>compile(make()));
 for(const make of [()=>{const w=witness(h);Object.defineProperty(w,'bodyVector',{enumerable:true,get:trap});return w;},
  ()=>{const w=witness(h);w.titleVector=new Proxy([],{getPrototypeOf:trap});return w;},
  ()=>{const w=witness(h);Object.defineProperty(w.bodyVector,'0',{enumerable:true,get:trap});return w;},
  ()=>{const w=witness(h);delete w.bodyVector[2];return w;}])assert.throws(()=>classify(h,make()));assert.equal(calls,0);
 const largeNodes=[{id:'games',parentId:null},{id:'nature',parentId:null},...Array.from({length:126},(_,i)=>({id:'child-'+String(i).padStart(3,'0'),parentId:'games'}))];
 const large=compile(fixture({detailNodes:largeNodes})),d=classify(large,witness(large,axis(0),axis(0))),identity=describe(large);
 assert.equal(identity.maximumHeadDotProducts,130);assert.equal(identity.maximumHeadScalarProducts,49920);assert.equal(d.work.detailHeadScalarProducts,128*384);
 assert.deepEqual(d.supportedPath,['games']); // ambiguous detail children cannot be invented.
 const excess=fixture({detailNodes:[...largeNodes,{id:'too-many',parentId:'games'}]});assert.throws(()=>compile(excess));
});
