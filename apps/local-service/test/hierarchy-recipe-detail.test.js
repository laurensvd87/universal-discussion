import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {buildRecipeTrainingReferences,buildRecipeBinaryTrainingRows,compileRecipeBinaryMethods} from '../harness/run-hierarchy-recipe-detail.js';
import {compileHierarchyLocalEvidence,scoreHierarchyLocalEvidence} from '../src/domain/hierarchical-e5-local-evidence.js';
import {compilePairedE5Input,describePairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {trainHierarchyLinearHeads,compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../src/domain/hierarchical-e5-paired-linear-heads.js';
import {fitPooledRootRankPolicy} from '../experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';
import {trainBinaryHierarchyDetail} from '../src/domain/hierarchy-binary-detail.js';
import {RECIPE_TRAIN_MEMBER_GROUPS,RECIPE_TRAIN_STOP_GROUPS} from '../harness/hierarchy-recipe-corpus.js';

const axis=i=>Array.from({length:384},(_,j)=>i===j?1:0);
function fixture(){
 const groups=['explicit-dish','explicit-technique','broad-unknown-cooking','other-root'];
 return {trainingRows:groups.map((groupId,i)=>({id:'invented-training-'+i,groupId,expectedRootId:i===3?'nature':'cooking',sourceInputHash:'a'.repeat(64)})),
  rawPairs:groups.map((_,i)=>({id:'invented-training-'+i,bodyVector:axis(i),titleVector:axis(i)})),
  rootNodes:[{id:'cooking',parentId:null},{id:'nature',parentId:null}],inputDefinition:{bodyWeight:.75,titleWeight:.25,encoderHash:'b'.repeat(64)},
  memberGroups:['explicit-dish'],stopGroups:['explicit-technique'],constructionHash:'c'.repeat(64)};
}
function recipeFeature(artifact,vector=axis(2)){
 const handle=compileHierarchyLocalEvidence(artifact);
 return scoreHierarchyLocalEvidence(handle,{sourceId:'invented-query',sourceVersion:'invented-v1',representation:artifact.representation,representationHash:artifact.representationHash,inputConstructionHash:artifact.inputConstructionHash,vector}).nodes.find(n=>n.nodeId==='recipes');
}

test('reviewed dishes become member references, explicit methods STOP, and broad cooking stays an unknown child prefix',()=>{
 const input=fixture(),before=structuredClone(input),artifact=buildRecipeTrainingReferences(input);
 assert.deepEqual(input,before);assert.equal(artifact.examples.length,4);assert.equal(artifact.nodes.length,3);
 const byGroup=new Map(artifact.examples.map(e=>[e.groupId,e]));
 assert.equal(byGroup.get('explicit-dish').nodeId,'recipes');assert.equal(byGroup.get('explicit-dish').kind,'member');
 assert.equal(byGroup.get('explicit-technique').nodeId,'cooking');assert.equal(byGroup.get('explicit-technique').kind,'stop');
 assert.equal(byGroup.get('broad-unknown-cooking').nodeId,'cooking');assert.equal(byGroup.get('broad-unknown-cooking').kind,'member');
 assert.equal(byGroup.get('other-root').nodeId,'nature');assert.equal(byGroup.get('other-root').kind,'member');
 const feature=recipeFeature(artifact);assert.equal(feature.positiveGroupCount,1);assert.equal(feature.negativeGroupCount,1,'only explicit STOP supplies recipe negative evidence');
 const prefixOnly=buildRecipeTrainingReferences({...input,stopGroups:[]});assert.equal(recipeFeature(prefixOnly).negativeGroupCount,0,'root members and other roots must not create child negatives');
 assert.ok(artifact.nodePolicies.every(p=>!p.enabled&&p.minSupport===2),'no cut fitting or activation occurs in reference mapping');
});

test('unresolved selectors, conflicting editorial roles, root mismatch and duplicate groups cannot silently alter the reference cohort',()=>{
 for(const patch of [{memberGroups:['missing']},{memberGroups:['explicit-dish'],stopGroups:['explicit-dish']},{memberGroups:['other-root']},{stopGroups:['explicit-technique','explicit-technique']}])assert.throws(()=>buildRecipeTrainingReferences({...fixture(),...patch}));
 const duplicate=fixture();duplicate.trainingRows[1].groupId=duplicate.trainingRows[0].groupId;assert.throws(()=>buildRecipeTrainingReferences(duplicate));
 const missingPair=fixture();missingPair.rawPairs.pop();assert.throws(()=>buildRecipeTrainingReferences(missingPair));
 const duplicatePair=fixture();duplicatePair.rawPairs.push(duplicatePair.rawPairs[0]);assert.throws(()=>buildRecipeTrainingReferences(duplicatePair));
});

test('real paired-input validation rejects invalid numeric references instead of inventing or normalizing vectors',()=>{
 for(const values of [Array(384).fill(0),axis(0).slice(1),[NaN,...axis(0).slice(1)]]){
  const input=fixture();input.rawPairs[0].bodyVector=values;assert.throws(()=>buildRecipeTrainingReferences(input));
 }
});

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const definition={bodyWeight:.75,titleWeight:.25,encoderHash:'b'.repeat(64)};
const paired=describePairedE5Input(compilePairedE5Input(definition));
function binaryFixture(trainingRows=null,canonicalPath=['cooking','recipes']){
 const training=trainingRows??[true,true,false,false].map((label,i)=>({id:'binary-train-'+i,groupId:'binary-train-group-'+i,label,vector:axis(label?0:1)}));
 return trainBinaryHierarchyDetail({nodeId:'recipes',canonicalPath,representation:paired.representation,representationHash:paired.representationHash,trainingVersion:'invented-recipe-binary/v1',trainingRows:training,
  calibrationRows:[true,true,true,false,false,false].map((label,i)=>({id:'binary-cal-'+i,groupId:'binary-cal-group-'+i,label,language:'en',vector:axis(label?0:1)}))});
}
function inventedLegacyArtifact(){
 const rootNodes=[{id:'cooking',parentId:null},{id:'nature',parentId:null},...Array.from({length:14},(_,i)=>({id:'invented-root-'+i,parentId:null}))];
 const nodes=[...rootNodes,{id:'recipes',parentId:'cooking'}],examples=[];
 for(const [i,groupId] of RECIPE_TRAIN_MEMBER_GROUPS.entries())examples.push({id:'dish-'+i,groupId,nodeId:'recipes',kind:'member',vector:axis(0)});
 for(const [i,groupId] of RECIPE_TRAIN_STOP_GROUPS.entries())examples.push({id:'technique-'+i,groupId,nodeId:'cooking',kind:'stop',vector:axis(1)});
 for(let i=0;i<121;i++)examples.push({id:'unknown-'+i,groupId:'unknown-group-'+i,nodeId:rootNodes[i%16].id,kind:'member',vector:axis(2)});
 return {schema:'hierarchical-e5-local-evidence/v1',representation:paired.representation,representationHash:paired.representationHash,inputConstructionHash:'c'.repeat(64),
  taxonomyVersion:'invented/v1',evidenceVersion:'invented/v1',calibrationVersion:'invented/v1',calibrationStatus:'experimental',nodes,examples,
  nodePolicies:nodes.map(n=>({nodeId:n.id,enabled:false,minSupport:2,minSimilarity:1,minNegativeMargin:2,minRivalMargin:2}))};
}
function rootFixture(reverse=false){
 const nodes=[{id:'cooking',parentId:null},{id:'nature',parentId:null}],topic=i=>(i<2)!==reverse?'cooking':'nature';
 const model=trainHierarchyLinearHeads({nodes,rows:Array.from({length:4},(_,i)=>({id:'root-train-'+i,groupId:'root-train-group-'+i,split:'training',expectedTopicId:topic(i),vector:axis(i<2?0:1)})),
  representation:paired.representation,representationHash:paired.representationHash,trainingVersion:'invented-root/v1',lambda:.1});
 const handle=compileHierarchyLinearHeads(model);
 const rows=Array.from({length:20},(_,i)=>({id:'root-cal-'+i,groupId:'root-cal-group-'+i,expectedRootId:topic(i%4),
  scores:scoreHierarchyLinearHeads(handle,{sourceId:'root-cal-'+i,sourceVersion:'invented',representation:paired.representation,representationHash:paired.representationHash,vector:axis(i%4<2?0:1)}).scores.map(({nodeId,score})=>({nodeId,score}))}));
 const policy=fitPooledRootRankPolicy({modelHash:digest(model),representationHash:paired.representationHash,inputConstructionHash:'d'.repeat(64),nodeIds:nodes.map(n=>n.id),rows});
 return {model,policy};
}

test('binary reuse labels only four explicit dishes and two techniques while auditing121 unknown groups',()=>{
 const artifact=inventedLegacyArtifact(),before=structuredClone(artifact),rows=buildRecipeBinaryTrainingRows(artifact);assert.deepEqual(artifact,before);
 assert.equal(rows.filter(r=>r.label===true).length,4);assert.equal(rows.filter(r=>r.label===false).length,2);assert.equal(rows.filter(r=>r.label===null).length,121);
 const binary=binaryFixture(rows);assert.equal(binary.model.trainingGroupHashes.length,6);assert.equal(binary.audit.training.unknownGroups,121);assert.equal(binary.eligible,true);
 const changed=inventedLegacyArtifact();changed.examples[0].nodeId='cooking';assert.throws(()=>buildRecipeBinaryTrainingRows(changed));
 const extraStop=inventedLegacyArtifact();extraStop.examples[6].kind='stop';assert.throws(()=>buildRecipeBinaryTrainingRows(extraStop));
});

test('actual root and binary compilers join only an accepted cooking root to the exact recipe path',()=>{
 const binary=binaryFixture(),root=rootFixture(),query={sourceId:'invented-probe',sourceVersion:'invented-observation',bodyVector:axis(0),titleVector:axis(0)};
 const normal=compileRecipeBinaryMethods(root.model,root.policy,definition,binary).classify(query);assert.deepEqual(normal.rootLinear.path,['cooking']);assert.deepEqual(normal.rootWithRealRecipeDetail.path,['cooking','recipes']);assert.equal(normal.rootWithRealRecipeDetail.detailAccepted,true);assert.equal(normal.rootWithRealRecipeDetail.taskScope,'membership-not-root-taxonomy');
 const reversed=rootFixture(true),mismatch=compileRecipeBinaryMethods(reversed.model,reversed.policy,definition,binary).classify(query);assert.deepEqual(mismatch.rootLinear.path,['nature']);assert.deepEqual(mismatch.rootWithRealRecipeDetail.path,['nature']);assert.equal(mismatch.rootWithRealRecipeDetail.binaryEvaluated,false);
 const {policyHash,...disabled}=root.policy;Object.assign(disabled,{enabled:false,minWinnerScore:0,minWinnerGap:0,acceptedGroups:0,correctGroups:0});
 const refused=compileRecipeBinaryMethods(root.model,{...disabled,policyHash:digest(disabled)},definition,binary).classify(query);assert.deepEqual(refused.rootLinear.path,[]);assert.deepEqual(refused.rootWithRealRecipeDetail.path,[]);assert.equal(refused.rootWithRealRecipeDetail.binaryEvaluated,false);
 assert.throws(()=>compileRecipeBinaryMethods(root.model,root.policy,definition,binaryFixture(null,['cooking','regional-food','recipes'])));
});
