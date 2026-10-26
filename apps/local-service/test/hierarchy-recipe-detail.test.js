import assert from 'node:assert/strict';
import test from 'node:test';
import {buildRecipeTrainingReferences} from '../harness/run-hierarchy-recipe-detail.js';
import {compileHierarchyLocalEvidence,scoreHierarchyLocalEvidence} from '../src/domain/hierarchical-e5-local-evidence.js';

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
