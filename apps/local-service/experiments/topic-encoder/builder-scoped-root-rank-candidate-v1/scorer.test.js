import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compileBuilderScopedRootRankCandidate as compile,describeBuilderScopedRootRankCandidate as describe,
 classifyBuilderScopedRootRankCandidate as classify,BUILDER_ROOT_RANK_LIMITS} from './scorer.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../../src/domain/hierarchical-e5-paired-input.js';
import {compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../../../src/domain/hierarchical-e5-paired-linear-heads.js';
import {compilePooledRootRankPolicy,classifyPooledRootRankPolicy} from '../hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';

// Manually authored geometric coefficients and policy metadata only. No fitting,
// E5, prior corpus, real model files, capture, network or Source data.
const sha=v=>createHash('sha256').update(v).digest('hex'),digest=v=>sha(JSON.stringify(v));
const H='a'.repeat(64),T='b'.repeat(64),S='c'.repeat(64),B='d'.repeat(64),axis=(i,sign=1)=>Array.from({length:384},(_,j)=>j===i?sign:0);
function rehashModel(m){
 m.taxonomyHash=digest(m.nodes);m.parameterHash=digest({schema:m.schema,representation:m.representation,representationHash:m.representationHash,heads:m.heads});
}
function rehashPolicy(p){delete p.policyHash;p.policyHash=digest(p);}
function fixture({weight=.75,minScore=.5,minGap=1,enabled=true}={}){
 const inputDefinition={bodyWeight:weight,titleWeight:1-weight,encoderHash:H};
 const representationHash=describePairedE5Input(compilePairedE5Input(inputDefinition)).representationHash;
 const schema='hierarchical-e5-paired-linear-heads-v1',representation='paired-raw-e5-body-title-v1',lambda=.1;
 const nodes=[{id:'games',parentId:null},{id:'nature',parentId:null}];
 const heads=nodes.map((n,i)=>({nodeId:n.id,enabled:true,positiveGroups:2,negativeGroups:2,weights:axis(i),intercept:-.5}));
 const trainingIdHashes=[0,1,2,3].map(i=>sha('invented-id-'+i)).sort(),trainingGroupHashes=[0,1,2,3].map(i=>sha('invented-group-'+i)).sort();
 const rootModel={schema,representation,representationHash,trainingVersion:'manual-not-fitted',
 trainingHash:sha('invented-geometric-not-real-training'),taxonomyHash:digest(nodes),
 settingsHash:digest({schema,lambda,dimensions:384,centering:'training-mean-features-and-labels',solver:'shared-dual-gram-cholesky',
 targets:'ancestor-inclusive-plus-one-otherwise-minus-one',independentGroups:'duplicates-rejected',minimumPositiveGroups:2,minimumNegativeGroups:2}),
 parameterHash:digest({schema,representation,representationHash,heads}),lambda,dimensions:384,trainingIdHashes,trainingGroupHashes,
 provenanceHash:digest({trainingIdHashes,trainingGroupHashes}),experimental:true,productionValidated:false,assignmentAuthority:false,nodes,heads,
 trainingWork:{units:0,gramProducts:0,choleskyProducts:0,solveProducts:0,weightProducts:0}};
 const rootPolicy={schema:'pooled-root-rank-development-policy/v1',modelHash:digest(rootModel),representationHash,inputConstructionHash:T,
 nodeIds:nodes.map(n=>n.id),calibrationHash:sha('invented-metadata-not-real-calibration'),minimumAcceptedGroups:20,
 enabled,minWinnerScore:enabled?minScore:0,minWinnerGap:enabled?minGap:0,acceptedGroups:enabled?20:0,correctGroups:enabled?20:0,
 work:{countedUnits:0,preflightUpperBound:10000},developmentOnly:true,perClassPrecisionGuaranteed:false,productionValidated:false,assignmentAuthority:false};
 rehashPolicy(rootPolicy);
 return {schema:'builder-scoped-root-rank-candidate/v1',inputDefinition,rootModel,rootPolicy,trainingInputConstructionHash:T,
 targetProfiles:[{producerId:'current-static',inputConstructionHash:S,extractorVersions:['crawler-static-html-prefix/v1']},
 {producerId:'browser-current',inputConstructionHash:B,extractorVersions:['main-text-prefix/v1','article-container-prefix/v1']}]};
}
function updateModel(a){rehashModel(a.rootModel);a.rootPolicy.modelHash=digest(a.rootModel);rehashPolicy(a.rootPolicy);}
function input(h,{producerId='current-static',body=axis(0),title=body,...overrides}={}){
 const p=describe(h).targetProfiles.find(p=>p.producerId===producerId);
 return {sourceId:'invented-page',sourceVersion:'claimed-v1',sourceIncarnation:'claimed-incarnation1',producerId,
 producerProfileHash:p.producerProfileHash,inputConstructionHash:p.inputConstructionHash,extractorVersion:producerId==='current-static'?'crawler-static-html-prefix/v1':'main-text-prefix/v1',
 inputHash:H,documentWitness:producerId==='current-static'?{kind:'static-response',finalUrlHash:H,responseWitnessHash:H}:
 {kind:'browser-document',finalUrlHash:H,frameId:'cdp-frame',loaderId:'cdp-loader',navigationId:'harness-navigation',documentId:'harness-not-native-document'},
 bodyVector:body,titleVector:title,...overrides};
}
function frozenNumeric(a,w){
 const adapter=compilePairedE5Input(a.inputDefinition),f=applyPairedE5Input(adapter,{sourceId:'numeric-control',sourceVersion:'invented-only',bodyVector:w.bodyVector,titleVector:w.titleVector});
 const packet=scoreHierarchyLinearHeads(compileHierarchyLinearHeads(a.rootModel),{sourceId:'numeric-control',sourceVersion:'invented-only',
 representation:f.representation,representationHash:f.representationHash,vector:f.vector});
 return classifyPooledRootRankPolicy(compilePooledRootRankPolicy(a.rootPolicy),{modelHash:a.rootPolicy.modelHash,representationHash:a.rootPolicy.representationHash,
 inputConstructionHash:T,sourceId:'numeric-only-control-not-producer-witness',sourceVersion:'invented-numeric-context',
 scores:packet.scores.map(({nodeId,score})=>({nodeId,score}))});
}
test('actual internal ROOT scoring preserves distinct training and both target producer identities',()=>{
 const a=fixture(),h=compile(a);
 for(const producerId of ['current-static','browser-current']){
  const w=input(h,{producerId}),d=classify(h,w);assert.deepEqual(d.supportedPath,['games']);assert.equal(d.reason,'accepted');
  assert.equal(d.witness.inputConstructionHash,w.inputConstructionHash);assert.notEqual(d.witness.inputConstructionHash,T);
  assert.equal(d.identity.trainingInputConstructionHash,T);assert.equal(d.identity.originalPolicySchema,a.rootPolicy.schema);
  assert.equal(d.assignmentAuthority,false);assert.equal(d.identity.inputIdentityClaims,'caller-declared-not-attested');
  assert.equal(d.work.headScalarProducts,768);assert.equal(d.work.rankComparisonWork,8);assert.equal(d.transferValidationStatus,'unvalidated');
 }
});
test('inclusive score/gap thresholds, ties, negative scores and disabled policy match frozen numeric classifier',()=>{
 const cases=[{}, {minScore:.5+Number.EPSILON},{minGap:1+Number.EPSILON},{minScore:-1,minGap:0},{enabled:false}];
 for(const settings of cases){
  const a=fixture(settings),h=compile(a);
  for(const body of [axis(0),axis(1),axis(2),Array.from({length:384},(_,i)=>i<2?Math.SQRT1_2:0)]){
   const w=input(h,{body}),actual=classify(h,w),control=frozenNumeric(a,w);
   assert.deepEqual(actual.supportedPath,control.selectedPath);assert.equal(actual.reason,control.reason);
  }
 }
 const a=fixture({minScore:-.8,minGap:.1});a.rootModel.heads.forEach((head,i)=>{head.weights=Array(384).fill(0);head.intercept=i===0?-.8:-.95;});updateModel(a);
 const h=compile(a);assert.deepEqual(classify(h,input(h)).supportedPath,['games']);
});
test('mixed title/body vectors use the same adapter and numeric cuts, with no caller scores or paths',()=>{
 const a=fixture({minScore:0,minGap:.1}),h=compile(a),w=input(h,{body:axis(0),title:axis(1)});
 assert.deepEqual(classify(h,w).supportedPath,frozenNumeric(a,w).selectedPath);
 for(const extra of [{scores:[]},{path:['games']},{supportedPath:['games']}])assert.throws(()=>classify(h,{...w,...extra}));
});
test('zero-fusion abstains without head scoring, and vector hashes still bind both valid inputs',()=>{
 const h=compile(fixture({weight:.5})),d=classify(h,input(h,{body:axis(0),title:axis(0,-1)}));
 assert.equal(d.status,'unresolved');assert.equal(d.reason,'zero-fused-norm');assert.deepEqual(d.supportedPath,[]);
 assert.equal(d.work.headScalarProducts,0);assert.match(d.vectorBindings.bodyVectorHash,/^[a-f0-9]{64}$/u);
 assert.notEqual(d.vectorBindings.bodyVectorHash,d.vectorBindings.titleVectorHash);
});
test('LE binary64 vector binding preserves signed zero even when classification is identical',()=>{
 const h=compile(fixture()),positive=axis(1),negative=axis(1);negative[0]=-0;
 const first=classify(h,input(h,{body:positive})),second=classify(h,input(h,{body:negative,title:positive}));
 assert.deepEqual(first.supportedPath,second.supportedPath);assert.notEqual(first.vectorBindings.bodyVectorHash,second.vectorBindings.bodyVectorHash);
 assert.notEqual(first.semanticWitnessHash,second.semanticWitnessHash);assert.equal(first.vectorBindings.titleVectorHash,second.vectorBindings.titleVectorHash);
 const bytes=new Uint8Array(384*8),dv=new DataView(bytes.buffer);for(let i=0;i<384;i++)dv.setFloat64(i*8,negative[i],true);
 const expected=createHash('sha256').update('builder-root-input-vector/binary64-le/384/v1\0').update(bytes).digest('hex');
 assert.equal(second.vectorBindings.bodyVectorHash,expected);
});
test('changed claimed incarnation/document/input changes binding, not a fictitious freshness verdict',()=>{
 const h=compile(fixture()),w=input(h,{producerId:'browser-current'}),first=classify(h,w);
 for(const change of [{sourceIncarnation:'claimed-incarnation2'},{sourceVersion:'claimed-v2'},{inputHash:S},
 {documentWitness:{...w.documentWitness,loaderId:'new-loader'}}]){
  const d=classify(h,{...w,...change});assert.deepEqual(d.supportedPath,first.supportedPath);assert.notEqual(d.semanticWitnessHash,first.semanticWitnessHash);
 }
});
test('producer/profile/extractor/document-kind mismatches and training-builder relabelling reject',()=>{
 const h=compile(fixture()),w=input(h);
 for(const change of [{producerId:'unknown'},{producerProfileHash:H},{inputConstructionHash:T},{extractorVersion:'main-text-prefix/v1'},
 {documentWitness:{kind:'browser-document',finalUrlHash:H,frameId:'f',loaderId:'l',navigationId:'n',documentId:'d'}}]){
  assert.throws(()=>classify(h,{...w,...change}));
 }
 const browser=input(h,{producerId:'browser-current'});assert.throws(()=>classify(h,{...browser,documentWitness:w.documentWitness}));
});
test('private copies and immutable outputs survive caller mutations; profiles canonicalize only declaration order',()=>{
 const a=fixture(),h=compile(a),identity=describe(h),before=classify(h,input(h));
 a.rootModel.heads[0].weights[0]=-100;a.rootPolicy.minWinnerScore=100;a.targetProfiles[0].extractorVersions[0]='changed';
 assert.deepEqual(classify(h,input(h)),before);assert.equal(describe(h),identity);assert.ok(Object.isFrozen(identity.targetProfiles[0].extractorVersions));
 const reordered=fixture();reordered.targetProfiles.reverse();reordered.targetProfiles[0].extractorVersions.reverse();
 assert.equal(describe(compile(reordered)).transferHash,identity.transferHash);
 assert.deepEqual(Object.keys(h),[]);assert.ok(Object.isFrozen(before.witness.documentWitness));
});
test('model digest is JSON.stringify artifact identity, not file-byte SHA or JCS',()=>{
 const a=fixture(),d=describe(compile(a));assert.equal(d.modelJsonHash,digest(a.rootModel));
 assert.notEqual(d.modelJsonHash,sha(JSON.stringify(a.rootModel)+'\n'));assert.match(d.modelJsonHashConvention,/not-JCS-or-file-bytes/u);
 const reverse=fixture();reverse.rootModel=Object.fromEntries(Object.entries(reverse.rootModel).reverse());
 assert.throws(()=>compile(reverse)); // Existing pooled policy binds the original declared serialization.
});
test('compile refuses wrong representations, policies, root topology, unsupported heads and capacities',()=>{
 for(const mutate of [
 a=>{a.rootModel.representation='raw-e5';},a=>{a.rootPolicy.modelHash=H;rehashPolicy(a.rootPolicy);},
 a=>{a.rootPolicy.inputConstructionHash=S;rehashPolicy(a.rootPolicy);},a=>{a.rootModel.nodes[1].parentId='games';updateModel(a);},
 a=>{a.rootModel.heads[0].enabled=false;a.rootModel.heads[0].positiveGroups=1;a.rootModel.heads[0].negativeGroups=3;
 a.rootModel.heads[0].weights=Array(384).fill(0);a.rootModel.heads[0].intercept=0;updateModel(a);},
 a=>{a.targetProfiles[0].inputConstructionHash=T;},a=>{a.targetProfiles[1].inputConstructionHash=S;},
 a=>{a.targetProfiles.push(a.targetProfiles[0]);},a=>{a.rootModel.nodes=Array.from({length:17},(_,i)=>({id:'root'+i,parentId:null}));}
 ]){const a=fixture();mutate(a);assert.throws(()=>compile(a));}
 assert.equal(BUILDER_ROOT_RANK_LIMITS.maxHeadScalarProducts,16*384);
});
test('accessors/proxies/prototypes never invoke caller code at compile or classification boundaries',()=>{
 let called=0;
 for(const make of [
 ()=>{const a=fixture();Object.defineProperty(a.rootModel.heads[0].weights,'0',{enumerable:true,get(){called++;throw Error('getter');}});return a;},
 ()=>{const a=fixture();Object.defineProperty(a.rootPolicy,'minWinnerScore',{enumerable:true,get(){called++;return 0;}});return a;},
 ()=>new Proxy(fixture(),{getPrototypeOf(){called++;throw Error('proxy');}}),
 ()=>Object.assign(Object.create(null),fixture())
 ])assert.throws(()=>compile(make()));
 const h=compile(fixture());
 for(const make of [
 ()=>{const w=input(h);Object.defineProperty(w,'bodyVector',{enumerable:true,get(){called++;return axis(0);}});return w;},
 ()=>input(h,{body:new Proxy(axis(0),{get(){called++;throw Error('vector proxy');}})}),
 ()=>input(h,{documentWitness:new Proxy({},{get(){called++;throw Error('document proxy');}})}),
 ()=>{const w=input(h);Object.defineProperty(w.documentWitness,'finalUrlHash',{enumerable:true,get(){called++;return H;}});return w;}
 ])assert.throws(()=>classify(h,make()));
 assert.equal(called,0);
});
test('finite dense384 unit vectors, exact input schema and identifier capacities remain mandatory',()=>{
 const h=compile(fixture());
 for(const body of [Array(384).fill(0),axis(0).slice(1),[...axis(0),0],new Float64Array(axis(0)),axis(0).map((n,i)=>i===0?NaN:n),
 axis(0).map((n,i)=>i===0?Infinity:n),axis(0).map(n=>n*.5)])assert.throws(()=>classify(h,input(h,{body})));
 const sparse=axis(0);delete sparse[1];assert.throws(()=>classify(h,input(h,{body:sparse})));
 assert.throws(()=>classify(h,input(h,{sourceId:'x'.repeat(161)})));assert.throws(()=>classify({},input(h)));
 const serialized=JSON.stringify(classify(h,input(h)));assert.equal(serialized.includes('"weights"'),false);assert.equal(serialized.includes('"bodyVector":'),false);
 assert.equal(serialized.includes('"scores"'),false);
});
