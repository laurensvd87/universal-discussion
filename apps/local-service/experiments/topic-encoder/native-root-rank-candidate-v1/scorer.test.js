import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compileNativeRootRankCandidate as compile,describeNativeRootRankCandidate as describe,
 classifyNativeRootRankCandidate as classify,prepareNativeRootInput as prepare,NATIVE_ROOT_RANK_LIMITS} from './scorer.js';
import {compileBuilderScopedRootRankCandidate as oldCompile,describeBuilderScopedRootRankCandidate as oldDescribe,classifyBuilderScopedRootRankCandidate as oldClassify} from '../builder-scoped-root-rank-candidate-v1/scorer.js';
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
 return {schema:'native-root-rank-candidate/v1',inputDefinition,rootModel,rootPolicy,trainingInputConstructionHash:T,
 targetProfile:{producerId:'native-browser-current',inputConstructionHash:B,
 extractorVersions:['main-text-prefix/v1','article-container-prefix/v1'],effectiveTitleRule:'trim-or-hostname/v1'}};

}
function updateModel(a){rehashModel(a.rootModel);a.rootPolicy.modelHash=digest(a.rootModel);rehashPolicy(a.rootPolicy);}

const URL='https://example.org/article';
function document(){
 const check={windowId:2,tabId:3,focused:true,windowType:'normal',incognito:false,active:true,tabStatus:'complete',
 sourceUrl:URL,documentUrl:URL,permissionGranted:true};
 return {schema:'chrome-scripting-native-reader/v1',studyId:'invented-study',studyRevision:'invented-revision',
 caseId:'invented-page',ordinal:1,observationNonce:'invented-observation',eventEpoch:0,tabId:3,windowId:2,frameId:0,
 documentId:'native-document',sourceUrl:URL,documentUrl:URL,foregroundChecks:Array.from({length:3},()=>({...check})),
 read:{contractVersion:'page-content/1',status:'collected',documentId:'native-document'},
 attestation:{contractVersion:'page-content-attestation/1',status:'attested',url:URL},
 effectiveTitleRule:'trim-or-hostname/v1',nativeDocumentContinuityOnly:true,canonicalAuthority:false};
}
function bind(w){
 const {sourceId,sourceVersion,producerId,producerProfileHash,inputConstructionHash,extractorVersion,fieldBindings,nativeWitness,rightsEvidenceHash}=w;
 w.sourceInputHash=digest({schema:'native-root-paired-input/v1',sourceId,sourceVersion,producerId,producerProfileHash,
 inputConstructionHash,extractorVersion,fieldBindings,nativeWitnessHash:digest(nativeWitness),rightsEvidenceHash});return w;
}
function input(h,{body=axis(0),title=body,...changes}={}){
 const p=describe(h).targetProfiles[0];
 return bind({sourceId:'invented-page',sourceVersion:'invented-observation',producerId:p.producerId,producerProfileHash:p.producerProfileHash,
 inputConstructionHash:p.inputConstructionHash,extractorVersion:'main-text-prefix/v1',
 fieldBindings:{bodySha256:H,bodyCharacters:20,rawTitleSha256:S,rawTitleCharacters:0,effectiveTitleSha256:B,effectiveTitleCharacters:11},
 nativeWitness:document(),rightsEvidenceHash:S,sourceInputHash:H,bodyVector:body,titleVector:title,...changes});
}
function old(a,w){
 const c={...a,schema:'builder-scoped-root-rank-candidate/v1',
 targetProfiles:[{producerId:'current-static',inputConstructionHash:S,extractorVersions:['crawler-static-html-prefix/v1']},
 {producerId:'browser-current',inputConstructionHash:B,extractorVersions:['main-text-prefix/v1','article-container-prefix/v1']}]};
 delete c.targetProfile;const h=oldCompile(c),p=oldDescribe(h).targetProfiles[0];
 return oldClassify(h,{sourceId:w.sourceId,sourceVersion:w.sourceVersion,sourceIncarnation:'invented',
 producerId:'browser-current',producerProfileHash:p.producerProfileHash,inputConstructionHash:B,
 extractorVersion:'main-text-prefix/v1',inputHash:H,
 documentWitness:{kind:'browser-document',finalUrlHash:H,frameId:'f',loaderId:'l',navigationId:'n',documentId:'not-native'},
 bodyVector:w.bodyVector,titleVector:w.titleVector});
}
test('internal native ROOT scoring is exactly differential to frozen builder numeric predicates',()=>{
 for(const settings of [{},{minScore:.5+Number.EPSILON},{minGap:1+Number.EPSILON},{minScore:-1,minGap:0},{enabled:false},{minScore:0,minGap:.1}]){
  const a=fixture(settings),h=compile(a);
  for(const body of [axis(0),axis(1),axis(2),Array.from({length:384},(_,i)=>i<2?Math.SQRT1_2:0)]){
   for(const title of [body,axis(1)]){
    const w=input(h,{body,title}),d=classify(h,w),control=old(a,w);
    assert.deepEqual(d.supportedPath,control.supportedPath);assert.equal(d.reason,control.reason);assert.deepEqual(d.work,control.work);
    assert.deepEqual(d.vectorBindings,control.vectorBindings);
   }
  }
 }
});
test('native construction, raw/effective title identities and full witness are separately bound',()=>{
 const a=fixture(),h=compile(a),w=input(h),d=classify(h,w);
 assert.deepEqual(d.supportedPath,['games']);assert.equal(d.witness.nativeWitnessHash,digest(w.nativeWitness));
 assert.equal(d.witness.sourceInputHash,w.sourceInputHash);assert.deepEqual(d.witness.fieldBindings,w.fieldBindings);
 assert.equal(d.witness.rightsEvidenceHash,w.rightsEvidenceHash);
 assert.equal(d.identity.trainingInputConstructionHash,T);assert.equal(d.witness.inputConstructionHash,B);
 assert.notEqual(d.identity.trainingInputConstructionHash,d.witness.inputConstructionHash);
 assert.equal(d.identity.targetProfiles.length,1);assert.equal(d.identity.modelJsonHash,digest(a.rootModel));
 assert.notEqual(d.identity.modelJsonHash,sha(JSON.stringify(a.rootModel)+'\n'));
 assert.equal(d.assignmentAuthority,false);assert.equal(d.identity.inputIdentityClaims,'caller-declared-not-attested');
 const serialized=JSON.stringify(d);for(const secret of ['https://','"bodyVector":','"titleVector":','"weights":','"scores":','"rawTitle":'])assert.equal(serialized.includes(secret),false);
});
test('pre-encoding helper canonicalizes copied native/field/evidence identity without vectors or scoring',()=>{
 const h=compile(fixture()),w=input(h),{bodyVector,titleVector,sourceInputHash,...metadata}=w;
 const prepared=prepare(h,metadata);assert.equal(prepared.sourceInputHash,sourceInputHash);
 assert.ok(Object.isFrozen(prepared.nativeWitness.foregroundChecks[0]));
 assert.equal(Object.hasOwn(prepared,'vectorBindings'),false);assert.equal(Object.hasOwn(prepared,'supportedPath'),false);
 assert.deepEqual(classify(h,{...prepared,bodyVector,titleVector}),classify(h,w));
 const rekeyed={...metadata,nativeWitness:Object.fromEntries(Object.entries(metadata.nativeWitness).reverse()),
 fieldBindings:Object.fromEntries(Object.entries(metadata.fieldBindings).reverse())};
 assert.deepEqual(prepare(h,rekeyed),prepared);
 const changed=prepare(h,{...metadata,rightsEvidenceHash:H});assert.notEqual(changed.sourceInputHash,sourceInputHash);
 assert.throws(()=>classify(h,{...w,rightsEvidenceHash:H}));
 metadata.nativeWitness.eventEpoch=1;assert.equal(prepared.nativeWitness.eventEpoch,0);
 assert.throws(()=>prepare(h,{...metadata,bodyVector}));assert.throws(()=>prepare({},metadata));
 const noRights={...metadata};delete noRights.rightsEvidenceHash;assert.throws(()=>prepare(h,noRights));
});
test('zero fusion shortcircuits head scoring; endpoint binary64 signed zero is never normalized away',()=>{
 const a=fixture({weight:.5}),h=compile(a),w=input(h,{body:axis(0),title:axis(0,-1)}),d=classify(h,w);
 assert.equal(d.reason,'zero-fused-norm');assert.equal(d.work.headScalarProducts,0);assert.deepEqual(d.supportedPath,old(a,w).supportedPath);
 const endpoint=compile(fixture({weight:1})),p=axis(1),n=axis(1);n[0]=-0;
 const first=classify(endpoint,input(endpoint,{body:p})),second=classify(endpoint,input(endpoint,{body:n,title:p}));
 assert.deepEqual(first.supportedPath,second.supportedPath);assert.notEqual(first.vectorBindings.bodyVectorHash,second.vectorBindings.bodyVectorHash);
 assert.equal(first.vectorBindings.titleVectorHash,second.vectorBindings.titleVectorHash);assert.notEqual(first.semanticWitnessHash,second.semanticWitnessHash);
 const bytes=new Uint8Array(384*8),dv=new DataView(bytes.buffer);n.forEach((x,i)=>dv.setFloat64(i*8,x,true));
 assert.equal(second.vectorBindings.bodyVectorHash,createHash('sha256').update('builder-root-input-vector/binary64-le/384/v1\0').update(bytes).digest('hex'));
});
test('negative finite scores and exact cut boundaries retain the existing policy semantics',()=>{
 const a=fixture({minScore:-.8,minGap:.1});
 a.rootModel.heads.forEach((head,i)=>{head.weights=Array(384).fill(0);head.intercept=i===0?-.8:-.95;});updateModel(a);
 const h=compile(a),w=input(h);assert.deepEqual(classify(h,w).supportedPath,['games']);assert.equal(classify(h,w).reason,old(a,w).reason);
});
test('changed consistent caller observation changes identity, not an invented authoritative freshness verdict',()=>{
 const h=compile(fixture()),w=input(h),first=classify(h,w);
 const doc=structuredClone(w.nativeWitness);doc.observationNonce='invented-new-observation';doc.eventEpoch=1;
 const second=classify(h,input(h,{sourceVersion:doc.observationNonce,nativeWitness:doc}));
 assert.deepEqual(first.supportedPath,second.supportedPath);assert.notEqual(first.semanticWitnessHash,second.semanticWitnessHash);
 assert.throws(()=>classify(h,{...w,nativeWitness:doc})); // inconsistent, not a current-state lookup
});
test('exact native shape refuses PW/CDP, wrong document, foreground and study/profile mismatch',()=>{
 const h=compile(fixture());
 for(const mutate of [
 w=>{w.nativeWitness.loaderId='forged';},w=>{w.nativeWitness.read.documentId='other';},
 w=>{w.nativeWitness.foregroundChecks[1].focused=false;},w=>{w.nativeWitness.foregroundChecks[2].permissionGranted=false;},
 w=>{w.nativeWitness.frameId=-0;},w=>{w.nativeWitness.eventEpoch=-0;},w=>{w.nativeWitness.ordinal=0;},
 w=>{w.nativeWitness.tabId=-1;},w=>{w.nativeWitness.documentId='invalid document';},
 w=>{w.nativeWitness.studyRevision=1;},w=>{w.nativeWitness.attestation.url='https://example.org/other';},
 w=>{w.nativeWitness.foregroundChecks.pop();},w=>{w.nativeWitness.sourceUrl='https://example.org/other';},
 w=>{w.sourceId='other';},w=>{w.producerId='browser-current';},w=>{w.producerProfileHash=H;},
 w=>{w.inputConstructionHash=T;},w=>{w.extractorVersion='unknown';},w=>{w.fieldBindings.effectiveTitleCharacters=0;},
 w=>{w.fieldBindings.rawTitleCharacters=201;},w=>{w.fieldBindings.bodyCharacters=4097;},w=>{w.sourceInputHash=H;}
 ]){const w=input(h);mutate(w);assert.throws(()=>classify(h,w));}
 for(const extra of [{scores:[]},{path:['games']},{supportedPath:['games']}])assert.throws(()=>classify(h,{...input(h),...extra}));
});
test('full native hash includes canonical declared order, with safely copied fields and frozen output',()=>{
 const a=fixture(),h=compile(a),w=input(h),first=classify(h,w),identity=describe(h);
 a.rootModel.heads[0].weights[0]=-100;a.rootPolicy.minWinnerScore=100;a.targetProfile.extractorVersions[0]='wrong';
 w.nativeWitness.foregroundChecks[0].active=false;w.bodyVector[0]=-1;
 assert.deepEqual(classify(h,input(h)),first);assert.equal(describe(h),identity);
 assert.ok(Object.isFrozen(first.witness.fieldBindings));assert.ok(Object.isFrozen(identity.targetProfiles[0].extractorVersions));
 assert.ok(Object.isFrozen(first.witness.nativeDocumentIdentity));assert.deepEqual(Object.keys(h),[]);
 const reordered=fixture();reordered.targetProfile.extractorVersions.reverse();assert.equal(describe(compile(reordered)).transferHash,identity.transferHash);
});
test('wrong model/policy/topology/representation/target contract and capacities reject',()=>{
 for(const mutate of [
 a=>{a.rootModel.representation='raw-e5';},a=>{a.rootPolicy.modelHash=H;rehashPolicy(a.rootPolicy);},
 a=>{a.rootPolicy.inputConstructionHash=B;rehashPolicy(a.rootPolicy);},
 a=>{a.rootModel.nodes[1].parentId='games';updateModel(a);},
 a=>{a.targetProfile.inputConstructionHash=T;},a=>{a.targetProfile.producerId='browser-current';},
 a=>{a.targetProfile.effectiveTitleRule='other';},a=>{a.targetProfile.extractorVersions=['main-text-prefix/v1'];},
 a=>{a.rootModel.nodes=Array.from({length:17},(_,i)=>({id:'root'+i,parentId:null}));},
 a=>{a.rootModel.heads[0].enabled=false;updateModel(a);}
 ]){const a=fixture();mutate(a);assert.throws(()=>compile(a));}
 assert.equal(NATIVE_ROOT_RANK_LIMITS.maxHeadScalarProducts,16*384);assert.throws(()=>describe({}));
});
test('nested proxies/accessors/prototypes are refused without executing caller hooks',()=>{
 let called=0;
 const getter=()=>{called++;throw Error('must not run');};
 for(const make of [
 ()=>new Proxy(fixture(),{getPrototypeOf:getter}),()=>Object.assign(Object.create(null),fixture()),
 ()=>{const a=fixture();Object.defineProperty(a.rootPolicy,'minWinnerScore',{enumerable:true,get:getter});return a;},
 ()=>{const a=fixture();Object.defineProperty(a.targetProfile,'extractorVersions',{enumerable:true,get:getter});return a;}
 ])assert.throws(()=>compile(make()));
 const h=compile(fixture());
 for(const make of [
 ()=>{const w=input(h);Object.defineProperty(w.nativeWitness.read,'documentId',{enumerable:true,get:getter});return w;},
 ()=>{const w=input(h);Object.defineProperty(w.nativeWitness.foregroundChecks[0],'active',{enumerable:true,get:getter});return w;},
 ()=>{const w=input(h);w.fieldBindings=new Proxy({},{get:getter,getPrototypeOf:getter});return w;},
 ()=>{const w=input(h);w.nativeWitness=new Proxy({},{get:getter,getPrototypeOf:getter});return w;},
 ()=>{const w=input(h);w.bodyVector=new Proxy(axis(0),{get:getter});return w;},
 ()=>{const w=input(h);Object.defineProperty(w,'titleVector',{enumerable:true,get:getter});return w;}
 ])assert.throws(()=>classify(h,make()));
 assert.equal(called,0);
});
test('dense unit vector and bounded input requirements remain identical without renormalization',()=>{
 const h=compile(fixture());
 for(const body of [Array(384).fill(0),axis(0).slice(1),[...axis(0),0],new Float64Array(axis(0)),axis(0).map(n=>n*.5),
 axis(0).map((n,i)=>i===0?NaN:n),axis(0).map((n,i)=>i===0?Infinity:n)]){
  assert.throws(()=>classify(h,input(h,{body})));
 }
 const sparse=axis(0);delete sparse[1];assert.throws(()=>classify(h,input(h,{body:sparse})));
 assert.throws(()=>classify(h,input(h,{sourceId:'x'.repeat(161)})));assert.throws(()=>classify({},input(h)));
});
