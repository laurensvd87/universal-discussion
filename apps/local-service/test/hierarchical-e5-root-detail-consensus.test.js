import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {observedHeadPolicyWorkUpperBound} from '../src/domain/hierarchical-e5-observed-head-policy.js';
import {compileHierarchyRootDetailConsensus as compile,classifyHierarchyRootDetailConsensus as classify,
  describeHierarchyRootDetailConsensus as describe,ROOT_DETAIL_CONSENSUS_LIMITS} from '../src/domain/hierarchical-e5-root-detail-consensus.js';

// Manually specified analytic coefficients and metadata ONLY. No trained model,
// encoder, prior corpus, frozen experiment files or Source data are loaded.
const hash=s=>createHash('sha256').update(s).digest('hex'),digest=v=>hash(JSON.stringify(v));
const axis=i=>Array.from({length:384},(_,j)=>j===i?1:0);
const representation='paired-raw-e5-body-title-v1',representationHash='a'.repeat(64);
function model(nodes,kind){
  const schema='hierarchical-e5-paired-linear-heads-v1',lambda=.1;
  nodes=[...nodes].sort((a,b)=>a.id<b.id?-1:1);
  const heads=nodes.map(n=>{
    const weights=Array(384).fill(0);let intercept=0;
    const directions=kind==='root'?n.id==='games'?[0,1,3]:n.id==='nature'?[2,3]:[]:
      n.id==='games'||n.id==='gta'?[1,2,3,4]:n.id==='nature'||n.id==='koalas'?[0]:[];
    for(const i of directions)weights[i]=1;if(!directions.length)intercept=-2;
    return {nodeId:n.id,enabled:true,positiveGroups:2,negativeGroups:2,weights,intercept};
  });
  const trainingIdHashes=[0,1,2,3].map(i=>hash(`new-manual-${kind}-training-${i}`)).sort();
  const trainingGroupHashes=[0,1,2,3].map(i=>hash(`new-manual-${kind}-origin-${i}`)).sort();
  return {schema,representation,representationHash,trainingVersion:`new-manual-consensus-${kind}`,
    trainingHash:hash(`manual-geometric-not-fitted-${kind}`),taxonomyHash:digest(nodes),
    settingsHash:digest({schema,lambda,dimensions:384,centering:'training-mean-features-and-labels',solver:'shared-dual-gram-cholesky',
      targets:'ancestor-inclusive-plus-one-otherwise-minus-one',independentGroups:'duplicates-rejected',minimumPositiveGroups:2,minimumNegativeGroups:2}),
    parameterHash:digest({schema,representation,representationHash,heads}),lambda,dimensions:384,trainingIdHashes,trainingGroupHashes,
    provenanceHash:digest({trainingIdHashes,trainingGroupHashes}),experimental:true,productionValidated:false,assignmentAuthority:false,nodes,heads,
    trainingWork:{units:0,gramProducts:0,choleskyProducts:0,solveProducts:0,weightProducts:0}};
}
function policy(m,observed){
  const kind=observed?'root':'detail',n=6;
  const calibrationIdHashes=Array.from({length:n},(_,i)=>hash(`new-manual-${kind}-cal-${i}`)).sort();
  const calibrationGroupHashes=Array.from({length:n},(_,i)=>hash(`new-manual-${kind}-cal-origin-${i}`)).sort();
  const rules=m.nodes.map(node=>({nodeId:node.id,enabled:['games','nature','gta','koalas'].includes(node.id),minScore:.5,minMargin:.1,acceptedGroups:3,correctGroups:3}));
  for(const r of rules)if(!r.enabled)Object.assign(r,observed?{minScore:0,minMargin:0,acceptedGroups:0,correctGroups:0}:
    {minScore:1.25,minMargin:.4,acceptedGroups:0,correctGroups:0});
  const body={schema:observed?'hierarchical-e5-observed-head-policy-v1':'hierarchical-e5-paired-head-policy-v1',
    ...(observed?{cutpointMode:'observed-score-positive-sibling-margin-tie-group-sweep/v1'}:{}),decisionMode:'single-path-root-contrast',
    representation:m.representation,representationHash:m.representationHash,modelArtifactHash:digest(m),modelParameterHash:m.parameterHash,
    modelTrainingHash:m.trainingHash,modelProvenanceHash:m.provenanceHash,taxonomyHash:m.taxonomyHash,
    calibrationHash:hash(`new-manual-${kind}-calibration-metadata-not-real-data`),calibrationIdHashes,calibrationGroupHashes,
    minimumAcceptedGroups:3,targetPrecision:1,
    ...(observed?{nodeObservations:m.nodes.map(node=>({nodeId:node.id,scoreCutpoints:[-2,0,.5,1],marginCutpoints:[0,.1,1],observationHash:hash(`manual-observation-${node.id}`)}))}:{}),rules,
    ...(observed?{calibrationWork:{preflightUpperBound:observedHeadPolicyWorkUpperBound(n,m.nodes.length),units:n*m.heads.length*384,
      scoringCoordinateProducts:n*m.heads.length*384,validationUnits:0,featureComparisons:0,sortComparisons:0,sweepVisits:0,ruleEvaluations:0,
      rows:n,nodes:m.nodes.length,marginCandidates:3*m.nodes.length}}:{}),experimental:true,productionValidated:false,assignmentAuthority:false};
  return {...body,policyHash:digest(body)};
}
function fixture(rootNodes=[{id:'games',parentId:null},{id:'nature',parentId:null}]){
  const rootModel=model(rootNodes,'root'),detailModel=model([...rootNodes,{id:'gta',parentId:'games'},{id:'koalas',parentId:'nature'}],'detail');
  return {rootModel,rootPolicy:policy(rootModel,true),detailModel,detailPolicy:policy(detailModel,false)};
}
const witness=i=>({sourceId:'new-geometric-probe',sourceVersion:'new-manual-v1',representation,representationHash,vector:axis(i)});
function rehashPolicy(p){delete p.policyHash;p.policyHash=digest(p);}

test('independent root corrects wrong detail branch without inventing a child',()=>{
  const h=compile(fixture()),d=classify(h,witness(0));
  assert.equal(d.independentRootId,'games');assert.equal(d.primaryNodeId,'games');assert.deepEqual(d.supportedPath,['games']);
  assert.equal(d.detailEvaluated,true);assert.equal(d.reason,'independent-root-detail-disagreement');
  assert.equal(d.assignmentAuthority,false);assert.equal(d.productionValidated,false);assert.ok(Object.isFrozen(d.supportedPath));
});
test('agreeing root and fixed detail preserve the deeper existing path',()=>{
  const h=compile(fixture()),d=classify(h,witness(1));assert.equal(d.primaryNodeId,'gta');
  assert.deepEqual(d.supportedPath,['games','gta']);assert.deepEqual(d.paths,[['games','gta']]);assert.equal(d.reason,'independent-root-and-detail-agree');
  assert.equal(d.sourceId,witness(1).sourceId);assert.equal(d.sourceVersion,witness(1).sourceVersion);
  assert.equal(d.detailPolicyMode,'fixed');
});
test('observed detail may refine only within the independently supported root',()=>{
  const a=fixture(),fixedIdentity=describe(compile(a));a.detailPolicy=policy(a.detailModel,true);
  const h=compile(a),d=classify(h,witness(1)),identity=describe(h);
  assert.equal(identity.detailPolicyMode,'observed');assert.equal(d.detailPolicyMode,'observed');
  assert.deepEqual(d.supportedPath,['games','gta']);assert.equal(d.reason,'independent-root-and-detail-agree');
  assert.notEqual(identity.consensusHash,fixedIdentity.consensusHash);
  assert.equal(identity.rootModelArtifactHash,fixedIdentity.rootModelArtifactHash);
  assert.equal(identity.detailModelArtifactHash,fixedIdentity.detailModelArtifactHash);
  assert.notEqual(identity.detailPolicyHash,fixedIdentity.detailPolicyHash);
});
test('observed detail disagreement and confidence cannot replace or rescue the root gate',()=>{
  const a=fixture();a.detailPolicy=policy(a.detailModel,true);const h=compile(a),d=classify(h,witness(0));
  assert.deepEqual(d.supportedPath,['games']);assert.equal(d.reason,'independent-root-detail-disagreement');
  for(const i of [3,4]){const rejected=classify(h,witness(i));assert.equal(rejected.status,'unresolved');assert.equal(rejected.detailEvaluated,false);}
});
test('detail schema dispatch rejects accessors, proxies, prototypes, unknown schemas and supplied functions',()=>{
  let called=0;
  for(const make of [
    ()=>{const p=fixture().detailPolicy;Object.defineProperty(p,'schema',{enumerable:true,get(){called++;throw Error('private');}});return p;},
    ()=>new Proxy({},{getPrototypeOf(){called++;throw Error('private');}}),
    ()=>Object.assign(Object.create(null),fixture().detailPolicy),
    ()=>({...fixture().detailPolicy,schema:'caller-supplied-policy'}),
    ()=>({...fixture().detailPolicy,schema:()=>{called++;return 'hierarchical-e5-paired-head-policy-v1';}}),
  ]){const a=fixture();a.detailPolicy=make();assert.throws(()=>compile(a));}
  assert.equal(called,0);
  const extra=fixture();extra.classifyDetail=()=>{called++;};assert.throws(()=>compile(extra));assert.equal(called,0);
});
test('root ambiguity and outside cannot be rescued by a confident detail prediction',()=>{
  const h=compile(fixture());for(const i of [3,4,5]){
    const d=classify(h,witness(i));assert.equal(d.status,'unresolved');assert.equal(d.primaryNodeId,null);assert.deepEqual(d.paths,[]);
    assert.equal(d.detailEvaluated,false);assert.equal(d.reason,'independent-root-unresolved');
    assert.equal(d.work.dotProducts,2);assert.equal(d.work.scalarProducts,2*384);
  }
});
test('detail rejection retains only independently supported root',()=>{
  const a=fixture();a.detailPolicy.rules.forEach(r=>Object.assign(r,{enabled:false,minScore:1.25,minMargin:.4,acceptedGroups:0,correctGroups:0}));
  rehashPolicy(a.detailPolicy);const d=classify(compile(a),witness(1));assert.deepEqual(d.supportedPath,['games']);
  assert.equal(d.reason,'independent-root-detail-unresolved');
});
test('root-only topology, exact shared roots, hashes and policy owners are mandatory',()=>{
  for(const change of [a=>{a.rootModel.nodes[0].parentId='nature';},a=>{a.rootPolicy=a.detailPolicy;},a=>{a.detailPolicy=a.rootPolicy;},
    a=>{a.rootModel.representation='raw-e5';},a=>{a.detailModel.representationHash='b'.repeat(64);},a=>{a.rootPolicy.modelArtifactHash='b'.repeat(64);},
    a=>{a.detailModel.nodes[0].id='foreign';}]){const a=fixture();change(a);assert.throws(()=>compile(a));}
  const roots=[{id:'games',parentId:null},{id:'nature',parentId:null},{id:'foreign',parentId:null}],a=fixture(roots);
  a.rootModel=model(roots.slice(0,2),'root');a.rootPolicy=policy(a.rootModel,true);assert.throws(()=>compile(a));
  const nested=fixture();nested.rootModel=model([{id:'games',parentId:null},{id:'nature',parentId:'games'}],'root');
  nested.rootPolicy=policy(nested.rootModel,true);assert.throws(()=>compile(nested));
  const differentGeometry=fixture();differentGeometry.detailModel.representationHash='b'.repeat(64);
  differentGeometry.detailModel.parameterHash=digest({schema:differentGeometry.detailModel.schema,
    representation:differentGeometry.detailModel.representation,representationHash:differentGeometry.detailModel.representationHash,
    heads:differentGeometry.detailModel.heads});
  differentGeometry.detailPolicy=policy(differentGeometry.detailModel,false);
  assert.throws(()=>compile(differentGeometry));
});
test('all four identities contribute to consensus identity and private copies survive mutation',()=>{
  const a=fixture(),h=compile(a),before=classify(h,witness(1)),identity=describe(h);
  assert.equal(identity.rootModelArtifactHash,digest(a.rootModel));assert.equal(identity.detailModelArtifactHash,digest(a.detailModel));
  assert.equal(identity.rootPolicyHash,a.rootPolicy.policyHash);assert.equal(identity.detailPolicyHash,a.detailPolicy.policyHash);
  a.rootModel.heads[0].weights.fill(0);a.rootPolicy.rules[0].enabled=false;a.detailModel.heads[0].weights.fill(0);a.detailPolicy.rules[0].enabled=false;
  assert.deepEqual(classify(h,witness(1)),before);assert.ok(Object.isFrozen(identity.rootIds));
  const changed=fixture();changed.detailPolicy.calibrationHash='b'.repeat(64);rehashPolicy(changed.detailPolicy);
  assert.notEqual(describe(compile(changed)).consensusHash,identity.consensusHash);
  const changedRoot=fixture();changedRoot.rootPolicy.calibrationHash='c'.repeat(64);rehashPolicy(changedRoot.rootPolicy);
  assert.notEqual(describe(compile(changedRoot)).consensusHash,identity.consensusHash);
});
test('strict schemas/accessors/proxies/forged paths reject without running caller code',()=>{
  let touched=0;const a=fixture();Object.defineProperty(a,'rootModel',{enumerable:true,get(){touched++;throw Error('private');}});
  assert.throws(()=>compile(a));assert.equal(touched,0);assert.throws(()=>compile(new Proxy({},{ownKeys(){touched++;throw Error('private');}})));
  assert.equal(touched,0);const h=compile(fixture()),w=witness(1);
  Object.defineProperty(w,'vector',{enumerable:true,get(){touched++;throw Error('private');}});assert.throws(()=>classify(h,w));assert.equal(touched,0);
  assert.throws(()=>classify(h,{...witness(1),paths:[['nature']]}));assert.throws(()=>classify({},witness(1)));assert.throws(()=>describe({}));
  assert.throws(()=>classify(h,witness(1),{}));assert.throws(()=>compile(fixture(),{}));
});
test('actual trusted scoring work is summed and bounded, with root rejection short circuit',()=>{
  const h=compile(fixture()),identity=describe(h),d=classify(h,witness(1));
  assert.equal(d.work.dotProducts,6);assert.equal(d.work.scalarProducts,6*384);
  assert.equal(identity.maximumScalarProducts,6*384);assert.ok(d.work.scalarProducts<=ROOT_DETAIL_CONSENSUS_LIMITS.maxScalarProducts);
  const roots=Array.from({length:17},(_,i)=>({id:i===0?'games':i===1?'nature':`unused-${i}`,parentId:null}));
  const boundary=describe(compile(fixture(roots.slice(0,16))));assert.equal(boundary.rootNodes,16);assert.equal(boundary.detailNodes,18);
  assert.throws(()=>compile(fixture(roots)));
});
