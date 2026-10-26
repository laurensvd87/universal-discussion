import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {compileRootedHierarchyMatcher,describeRootedHierarchyMatcher,classifyRootedHierarchyMatcher} from '../src/domain/hierarchy-rooted-matcher.js';
import {compilePairedE5Input,describePairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {trainHierarchyLinearHeads,compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../src/domain/hierarchical-e5-paired-linear-heads.js';
import {fitPooledRootRankPolicy} from '../experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';
import {trainBinaryHierarchyDetail} from '../src/domain/hierarchy-binary-detail.js';

const axis=i=>Array.from({length:384},(_,j)=>i===j?1:0),digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const inputDefinition={bodyWeight:.75,titleWeight:.25,encoderHash:'a'.repeat(64)},paired=describePairedE5Input(compilePairedE5Input(inputDefinition));
const nodes=[{id:'games',parentId:null},{id:'video-games',parentId:'games'},{id:'gta',parentId:'video-games'},{id:'gta-mods',parentId:'gta'},
 {id:'minecraft',parentId:'video-games'},{id:'board-games',parentId:'games'},{id:'nature',parentId:null},{id:'animals',parentId:'nature'},{id:'koalas',parentId:'animals'}];
const paths={video:['games','video-games'],gta:['games','video-games','gta'],mods:['games','video-games','gta','gta-mods'],minecraft:['games','video-games','minecraft'],board:['games','board-games'],koalas:['nature','animals','koalas']};
function binary(canonicalPath,positiveAxis=0,representationHash=paired.representationHash){
 return trainBinaryHierarchyDetail({nodeId:canonicalPath.at(-1),canonicalPath,representation:paired.representation,representationHash,trainingVersion:'invented-detail-'+canonicalPath.at(-1),
  trainingRows:[true,true,false,false].map((label,i)=>({id:'train-'+i,groupId:'train-group-'+i,label,vector:axis(label?positiveAxis:positiveAxis===0?1:0)})),
  calibrationRows:[true,true,true,false,false,false].map((label,i)=>({id:'cal-'+i,groupId:'cal-group-'+i,label,language:'en',vector:axis(label?positiveAxis:positiveAxis===0?1:0)}))});
}
function fixture(detailArtifacts=[]){
 const rootNodes=[{id:'games',parentId:null},{id:'nature',parentId:null}];
 const rootModel=trainHierarchyLinearHeads({nodes:rootNodes,rows:Array.from({length:4},(_,i)=>({id:'root-train-'+i,groupId:'root-train-group-'+i,split:'training',expectedTopicId:i<2?'games':'nature',vector:axis(i<2?0:1)})),
  representation:paired.representation,representationHash:paired.representationHash,trainingVersion:'invented-root/v1',lambda:.1});
 const compiled=compileHierarchyLinearHeads(rootModel);
 const rows=Array.from({length:20},(_,i)=>({id:'root-cal-'+i,groupId:'root-cal-group-'+i,expectedRootId:i%2?'nature':'games',
  scores:scoreHierarchyLinearHeads(compiled,{sourceId:'root-cal-'+i,sourceVersion:'invented/v1',representation:paired.representation,representationHash:paired.representationHash,vector:axis(i%2?1:0)}).scores.map(({nodeId,score})=>({nodeId,score}))}));
 const rootPolicy=fitPooledRootRankPolicy({modelHash:digest(rootModel),representationHash:paired.representationHash,inputConstructionHash:'b'.repeat(64),nodeIds:['games','nature'],rows});
 return {rootModel:structuredClone(rootModel),rootPolicy:structuredClone(rootPolicy),inputDefinition:{...inputDefinition},nodes:structuredClone(nodes),detailArtifacts:structuredClone(detailArtifacts)};
}
const query=(i=0)=>({sourceId:'invented-query',sourceVersion:'invented-observation',bodyVector:axis(i),titleVector:axis(i)});

test('zero detail models return only the independent root and compiled state detaches caller artifacts',()=>{
 const input=fixture(),before=structuredClone(input),handle=compileRootedHierarchyMatcher(input),out=classifyRootedHierarchyMatcher(handle,query());
 assert.deepEqual(input,before);assert.deepEqual(out.rootPath,['games']);assert.deepEqual(out.semanticPath,['games']);assert.deepEqual(out.evaluatedDetailNodes,[]);
 assert.equal(out.nativeObservation,false);assert.equal(out.productionValidated,false);assert.equal(out.assignmentAuthority,false);
 input.rootModel.heads[0].weights[0]=-99;input.rootPolicy.inputConstructionHash='f'.repeat(64);input.nodes[0].parentId='nature';
 assert.deepEqual(classifyRootedHierarchyMatcher(handle,query()),out);assert.ok(Object.isFrozen(describeRootedHierarchyMatcher(handle).nodes));
});

test('accepted deepest path removes accepted ancestor nominations using actual independent binary models',()=>{
 const input=fixture([binary(paths.video),binary(paths.gta),binary(paths.mods)]),before=structuredClone(input),handle=compileRootedHierarchyMatcher(input),out=classifyRootedHierarchyMatcher(handle,query());
 assert.deepEqual(input,before);assert.deepEqual(out.semanticPath,paths.mods);assert.equal(out.acceptedDetailPaths.length,3);assert.deepEqual(out.maximalDetailPaths,[paths.mods]);assert.equal(out.reason,'supported-detail-path');
 input.detailArtifacts[0].model.heads[0].weights[0]=-99;assert.deepEqual(classifyRootedHierarchyMatcher(handle,query()),out);assert.ok(Object.isFrozen(out.acceptedDetailPaths[0]));
});

test('sibling nominations coarsen to their LCA instead of comparing independently scaled head scores',()=>{
 const sibling=classifyRootedHierarchyMatcher(compileRootedHierarchyMatcher(fixture([binary(paths.gta),binary(paths.minecraft),binary(paths.video)])),query());
 assert.deepEqual(sibling.semanticPath,paths.video);assert.equal(sibling.maximalDetailPaths.length,2);assert.equal(sibling.reason,'detail-common-ancestor');
 const broad=classifyRootedHierarchyMatcher(compileRootedHierarchyMatcher(fixture([binary(paths.gta),binary(paths.minecraft),binary(paths.board)])),query());
 assert.deepEqual(broad.semanticPath,['games']);assert.equal(broad.reason,'detail-conflict-root-only');
});

test('other-root models never evaluate and cannot rescue an abstained independent root',()=>{
 const input=fixture([binary(paths.gta),binary(paths.koalas)]),handle=compileRootedHierarchyMatcher(input),out=classifyRootedHierarchyMatcher(handle,query());
 assert.deepEqual(out.evaluatedDetailNodes,['gta']);assert.deepEqual(out.semanticPath,paths.gta);
 const unknown=classifyRootedHierarchyMatcher(handle,query(2));assert.equal(unknown.status,'abstained');assert.deepEqual(unknown.semanticPath,[]);assert.deepEqual(unknown.evaluatedDetailNodes,[]);
 const {policyHash,...disabled}=input.rootPolicy;Object.assign(disabled,{enabled:false,minWinnerScore:0,minWinnerGap:0,acceptedGroups:0,correctGroups:0});
 const rejected=classifyRootedHierarchyMatcher(compileRootedHierarchyMatcher({...input,rootPolicy:{...disabled,policyHash:digest(disabled)}}),query());
 assert.deepEqual(rejected.semanticPath,[]);assert.deepEqual(rejected.acceptedDetailPaths,[]);assert.deepEqual(rejected.evaluatedDetailNodes,[]);
 const unsupported=classifyRootedHierarchyMatcher(compileRootedHierarchyMatcher(fixture([binary(paths.gta,1)])),query());assert.deepEqual(unsupported.semanticPath,['games']);assert.equal(unsupported.reason,'root-only-no-supported-detail');
});

test('declared tree, exact detail ancestry, unique nodes, shared representation and capacities are checked',()=>{
 const changed=fixture([binary(paths.gta)]);changed.nodes.find(n=>n.id==='gta').parentId='board-games';assert.throws(()=>compileRootedHierarchyMatcher(changed));
 const extraRoot=fixture();extraRoot.nodes.push({id:'technology',parentId:null});assert.throws(()=>compileRootedHierarchyMatcher(extraRoot));
 const cycle=fixture();cycle.nodes.find(n=>n.id==='video-games').parentId='gta';assert.throws(()=>compileRootedHierarchyMatcher(cycle));
 const missing=fixture();missing.nodes.find(n=>n.id==='gta').parentId='missing';assert.throws(()=>compileRootedHierarchyMatcher(missing));
 assert.throws(()=>compileRootedHierarchyMatcher(fixture([binary(paths.gta),binary(paths.gta)])));
 assert.throws(()=>compileRootedHierarchyMatcher(fixture([binary(paths.gta,0,'f'.repeat(64))])));
 assert.throws(()=>compileRootedHierarchyMatcher(fixture([binary(['games'])])));
 const deep=fixture();let parent='games';for(let i=0;i<8;i++){deep.nodes.push({id:'deep-'+i,parentId:parent});parent='deep-'+i;}assert.throws(()=>compileRootedHierarchyMatcher(deep));
 const capacity=fixture();capacity.nodes=Array.from({length:513},(_,i)=>({id:'root-'+i,parentId:null}));assert.throws(()=>compileRootedHierarchyMatcher(capacity));
 assert.throws(()=>compileRootedHierarchyMatcher(fixture(Array(129).fill(binary(paths.gta)))));
 const wrongWeights=fixture();wrongWeights.inputDefinition={...inputDefinition,bodyWeight:.5,titleWeight:.5};assert.throws(()=>compileRootedHierarchyMatcher(wrongWeights));
 const wrongModelPin=fixture(),{policyHash,...policyBody}=wrongModelPin.rootPolicy;policyBody.modelHash='f'.repeat(64);wrongModelPin.rootPolicy={...policyBody,policyHash:digest(policyBody)};assert.throws(()=>compileRootedHierarchyMatcher(wrongModelPin));
 const wrongRoots=fixture(),{policyHash:unused,...rootsBody}=wrongRoots.rootPolicy;rootsBody.nodeIds=['games','technology'];wrongRoots.rootPolicy={...rootsBody,policyHash:digest(rootsBody)};assert.throws(()=>compileRootedHierarchyMatcher(wrongRoots));
});

test('descriptor, getter, proxy and numeric validation call no injected hooks',()=>{
 let hooks=0;const input=fixture();Object.defineProperty(input.nodes[0],'parentId',{enumerable:true,get(){hooks++;throw new Error('getter');}});assert.throws(()=>compileRootedHierarchyMatcher(input));
 const rootHook=fixture();rootHook.rootModel.toJSON=()=>{hooks++;throw new Error('must not stringify invalid artifact');};assert.throws(()=>compileRootedHierarchyMatcher(rootHook));
 const proxy=new Proxy(fixture(),{get(){hooks++;throw new Error('proxy');},getOwnPropertyDescriptor(){hooks++;throw new Error('proxy');}});assert.throws(()=>compileRootedHierarchyMatcher(proxy));
 const handle=compileRootedHierarchyMatcher(fixture()),q=query();Object.defineProperty(q,'bodyVector',{enumerable:true,get(){hooks++;throw new Error('getter');}});assert.throws(()=>classifyRootedHierarchyMatcher(handle,q));
 assert.throws(()=>classifyRootedHierarchyMatcher(handle,{...query(),titleVector:Array(384).fill(0)}));
 const nonfinite=query();nonfinite.bodyVector[0]=NaN;assert.throws(()=>classifyRootedHierarchyMatcher(handle,nonfinite));assert.equal(hooks,0);
});
