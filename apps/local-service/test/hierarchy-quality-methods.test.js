import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {compileHierarchyQualityMethods} from '../harness/hierarchy-quality-methods.js';
import {compilePairedE5Input,describePairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';

const sha=x=>createHash('sha256').update(x).digest('hex'),digest=x=>sha(JSON.stringify(x));
const axis=i=>Array.from({length:384},(_,j)=>i===j?1:0);
const roots=[{id:'games',parentId:null},{id:'nature',parentId:null}];
const definition={bodyWeight:.75,titleWeight:.25,encoderHash:'a'.repeat(64)};
function fixture(inputDefinition=definition){
 const paired=describePairedE5Input(compilePairedE5Input(inputDefinition)),representation=paired.representation,representationHash=paired.representationHash;
 const schema='hierarchical-e5-paired-linear-heads-v1',lambda=.1,
  heads=roots.map((r,i)=>({nodeId:r.id,enabled:true,positiveGroups:2,negativeGroups:2,weights:axis(i),intercept:0}));
 const trainingIdHashes=[0,1,2,3].map(i=>sha('invented-id-'+i)).sort(),trainingGroupHashes=[0,1,2,3].map(i=>sha('invented-group-'+i)).sort();
 const rootModel={schema,representation,representationHash,trainingVersion:'invented-geometric-not-fitted',trainingHash:sha('invented'),taxonomyHash:digest(roots),
  settingsHash:digest({schema,lambda,dimensions:384,centering:'training-mean-features-and-labels',solver:'shared-dual-gram-cholesky',targets:'ancestor-inclusive-plus-one-otherwise-minus-one',independentGroups:'duplicates-rejected',minimumPositiveGroups:2,minimumNegativeGroups:2}),
  parameterHash:digest({schema,representation,representationHash,heads}),lambda,dimensions:384,trainingIdHashes,trainingGroupHashes,provenanceHash:digest({trainingIdHashes,trainingGroupHashes}),
  experimental:true,productionValidated:false,assignmentAuthority:false,nodes:structuredClone(roots),heads,
  trainingWork:{units:0,gramProducts:0,choleskyProducts:0,solveProducts:0,weightProducts:0}};
 const policy={schema:'pooled-root-rank-development-policy/v1',modelHash:digest(rootModel),representationHash,inputConstructionHash:'b'.repeat(64),nodeIds:['games','nature'],calibrationHash:'c'.repeat(64),
  minimumAcceptedGroups:20,enabled:true,minWinnerScore:.5,minWinnerGap:.1,acceptedGroups:20,correctGroups:20,work:{countedUnits:0,preflightUpperBound:1000},developmentOnly:true,perClassPrecisionGuaranteed:false,productionValidated:false,assignmentAuthority:false};
 const makeLocal=(nodes,examples)=>({schema:'hierarchical-e5-local-evidence/v1',representation,representationHash,inputConstructionHash:'d'.repeat(64),
  taxonomyVersion:'invented/v1',evidenceVersion:'invented/v1',calibrationVersion:'invented/v1',calibrationStatus:'experimental',nodes,
  examples:examples.map(([id,nodeId,i])=>({id,groupId:id,nodeId,kind:'member',vector:axis(i)})),
  nodePolicies:nodes.map(n=>({nodeId:n.id,enabled:true,minSupport:1,minSimilarity:.85,minNegativeMargin:0,minRivalMargin:0}))});
 return {rootModel,rootPolicy:{...policy,policyHash:digest(policy)},rootInputDefinition:{...inputDefinition},localInputDefinition:{...inputDefinition},
  realRootArtifact:makeLocal(structuredClone(roots),[['real-games','games',0],['real-nature','nature',1]]),
  detailArtifact:makeLocal([...structuredClone(roots),{id:'gta',parentId:'games'},{id:'zelda',parentId:'games'},{id:'koalas',parentId:'nature'}],
   [['detail-games','gta',0],['detail-nature','koalas',1]])};
}
const query=i=>({sourceId:'invented-query',sourceVersion:'invented-v1',bodyVector:axis(i),titleVector:axis(i)});

test('selected numeric root and same-root detail use actual scorers without changing artifacts',()=>{
 const a=fixture(),before=structuredClone(a),methods=compileHierarchyQualityMethods(a),out=methods.classify(query(0));
 assert.deepEqual(a,before);assert.deepEqual(out.rootLinear.path,['games']);assert.deepEqual(out.realRootReferences.path,['games']);
 assert.deepEqual(out.rootWithSyntheticDetail.path,['games','gta']);assert.equal(out.rootWithSyntheticDetail.detailEvaluated,true);
 assert.equal(out.rootWithSyntheticDetail.syntheticDetailReferences,true);assert.equal(out.productionValidated,false);assert.equal(out.assignmentAuthority,false);
 assert.ok(Object.isFrozen(out.rootWithSyntheticDetail.path));assert.ok(Object.isFrozen(methods.identity));
 a.rootModel.heads[0].weights[0]=-99;a.detailArtifact.examples[0].vector[0]=-1;a.rootPolicy.minWinnerScore=99;
 assert.deepEqual(methods.classify(query(0)),out,'compiled methods detach numeric artifacts from subsequent caller changes');
});

test('a rejected independent root cannot be rescued by supported local evidence',()=>{
 const a=fixture();a.detailArtifact.examples[0].vector=axis(2);a.realRootArtifact.examples[0].vector=axis(2);
 const out=compileHierarchyQualityMethods(a).classify(query(2));
 assert.equal(out.rootLinear.status,'abstained');assert.equal(out.realRootReferences.status,'accepted');
 assert.equal(out.rootWithSyntheticDetail.status,'abstained');assert.deepEqual(out.rootWithSyntheticDetail.path,[]);
 assert.equal(out.rootWithSyntheticDetail.detailEvaluated,false);assert.equal(out.rootWithSyntheticDetail.reason,'root-abstained');
});

test('stored root cuts and zero paired vectors abstain without a nearest or title fallback',()=>{
 const a=fixture();a.rootPolicy.minWinnerScore=1.1;const {policyHash,...body}=a.rootPolicy;a.rootPolicy.policyHash=digest(body);
 const rejected=compileHierarchyQualityMethods(a).classify(query(0));assert.equal(rejected.rootLinear.reason,'below-pooled-cut');assert.equal(rejected.realRootReferences.status,'accepted');assert.equal(rejected.rootWithSyntheticDetail.detailEvaluated,false);assert.deepEqual(rejected.rootWithSyntheticDetail.path,[]);
 const zero=compileHierarchyQualityMethods(fixture({...definition,bodyWeight:.5,titleWeight:.5})).classify({...query(0),titleVector:axis(0).map(x=>-x)});
 assert.equal(zero.rootLinear.reason,'zero-paired-vector');assert.equal(zero.realRootReferences.status,'abstained');assert.equal(zero.rootWithSyntheticDetail.status,'abstained');assert.equal(zero.rootWithSyntheticDetail.detailEvaluated,false);
});

test('wrong-root detail cannot replace the accepted root or invent a matching descendant',()=>{
 const a=fixture();a.detailArtifact.examples[0].vector=axis(2);a.detailArtifact.examples[1].vector=axis(0);
 const out=compileHierarchyQualityMethods(a).classify(query(0));assert.deepEqual(out.rootWithSyntheticDetail.path,['games']);
 assert.equal(out.rootWithSyntheticDetail.reason,'detail-root-disagreement');
});

test('ambiguous siblings retain the actual local common ancestor and unsupported detail retains root',()=>{
 const a=fixture();a.detailArtifact.examples.push({id:'sibling',groupId:'sibling',nodeId:'zelda',kind:'member',vector:axis(0)});
 const coarsened=compileHierarchyQualityMethods(a).classify(query(0));assert.deepEqual(coarsened.rootWithSyntheticDetail.path,['games']);assert.equal(coarsened.rootWithSyntheticDetail.reason,'same-root-local-coarsening');
 a.detailArtifact.examples[0].vector=axis(2);a.detailArtifact.examples[2].vector=axis(2);
 const unsupported=compileHierarchyQualityMethods(a).classify(query(0));assert.deepEqual(unsupported.rootWithSyntheticDetail.path,['games']);assert.equal(unsupported.rootWithSyntheticDetail.reason,'detail-abstained');
});

test('numeric inputs and mismatched artifact identities fail closed without getter hooks',()=>{
 const methods=compileHierarchyQualityMethods(fixture());
 for(const vector of [axis(0).slice(1),Array(384).fill(0),[NaN,...axis(0).slice(1)],Array(384).fill(1)])assert.throws(()=>methods.classify({...query(0),bodyVector:vector}));
 const bad=fixture();bad.rootPolicy.modelHash='f'.repeat(64);const {policyHash,...body}=bad.rootPolicy;bad.rootPolicy.policyHash=digest(body);assert.throws(()=>compileHierarchyQualityMethods(bad));
 const mismatched=fixture();mismatched.detailArtifact.representationHash='e'.repeat(64);assert.throws(()=>compileHierarchyQualityMethods(mismatched));
 let hooks=0;const q=query(0);Object.defineProperty(q,'bodyVector',{enumerable:true,get(){hooks++;throw new Error('getter');}});assert.throws(()=>methods.classify(q));
 const proxy=new Proxy(query(0),{get(){hooks++;throw new Error('proxy');},getOwnPropertyDescriptor(){hooks++;throw new Error('proxy');}});assert.throws(()=>methods.classify(proxy));assert.equal(hooks,0);
});
