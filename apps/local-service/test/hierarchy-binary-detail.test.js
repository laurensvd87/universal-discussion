import assert from 'node:assert/strict';
import test from 'node:test';
import {trainBinaryHierarchyDetail,compileBinaryHierarchyDetail,describeBinaryHierarchyDetail,classifyBinaryHierarchyDetail} from '../src/domain/hierarchy-binary-detail.js';

const axis=i=>Array.from({length:384},(_,j)=>j===i?1:0);
function fixture(){
 const trainingRows=[true,true,false,false,null].map((label,i)=>({id:'invented-train-'+i,groupId:'invented-train-group-'+i,label,vector:axis(label===true?0:label===false?1:2)}));
 const calibrationRows=[true,true,true,false,false,false,null].map((label,i)=>({id:'invented-cal-'+i,groupId:'invented-cal-group-'+i,label,language:'en',vector:axis(label===true?0:label===false?1:2)}));
 return {nodeId:'recipes',canonicalPath:['cooking','regional-food','recipes'],representation:'paired-raw-e5-body-title-v1',representationHash:'a'.repeat(64),trainingVersion:'invented-binary-membership/v1',trainingRows,calibrationRows};
}
const query=(i=0,root=['cooking'])=>({sourceId:'invented-query',sourceVersion:'invented-observation',representation:'paired-raw-e5-body-title-v1',representationHash:'a'.repeat(64),vector:axis(i),independentRootPath:root});

test('actual one-node ridge and observed-cut calibration roundtrip preserve full canonical detail prefix',()=>{
 const input=fixture(),before=structuredClone(input),artifact=trainBinaryHierarchyDetail(input);assert.deepEqual(input,before);
 assert.equal(artifact.eligible,true);assert.equal(artifact.model.nodes.length,1);assert.deepEqual(artifact.model.nodes,[{id:'recipes',parentId:null}]);assert.equal(artifact.model.lambda,.1);
 assert.equal(artifact.model.heads[0].positiveGroups,2);assert.equal(artifact.model.heads[0].negativeGroups,2);assert.equal(artifact.policy.rules[0].correctGroups,3);
 assert.equal(artifact.taskScope,'membership-not-root-taxonomy');assert.equal(artifact.independentValidation,false);assert.equal(artifact.productionValidated,false);assert.equal(artifact.assignmentAuthority,false);
 const serialized=JSON.parse(JSON.stringify(artifact)),handle=compileBinaryHierarchyDetail(serialized),decision=classifyBinaryHierarchyDetail(handle,query());
 assert.deepEqual(decision.path,['cooking','regional-food','recipes']);assert.equal(decision.detailAccepted,true);assert.equal(decision.binaryEvaluated,true);assert.ok(Object.isFrozen(decision.path));
 assert.equal(describeBinaryHierarchyDetail(handle).artifactHash,artifact.artifactHash);
 const rejected=classifyBinaryHierarchyDetail(handle,query(1));assert.deepEqual(rejected.path,['cooking']);assert.equal(rejected.detailAccepted,false);
});

test('rejected or mismatched independent root cannot be rescued by a positive binary member score',()=>{
 const handle=compileBinaryHierarchyDetail(trainBinaryHierarchyDetail(fixture()));
 for(const root of [[],['nature']]){
  const decision=classifyBinaryHierarchyDetail(handle,query(0,root));assert.deepEqual(decision.path,root);assert.equal(decision.detailAccepted,false);assert.equal(decision.binaryEvaluated,false);
 }
 assert.throws(()=>classifyBinaryHierarchyDetail(handle,query(0,['cooking','regional-food'])));
});

test('unknown labels are omitted with identity audit and never become training or calibration negatives',()=>{
 const artifact=trainBinaryHierarchyDetail(fixture());assert.equal(artifact.audit.training.unknownGroups,1);assert.equal(artifact.audit.calibration.unknownGroups,1);
 assert.equal(artifact.model.trainingIdHashes.length,4);assert.equal(artifact.policy.calibrationIdHashes.length,6);assert.equal(artifact.audit.training.negativeGroups,2);assert.equal(artifact.audit.calibration.negativeGroups,3);
 assert.equal(artifact.audit.training.omittedIdHashes.length,1);assert.equal(artifact.audit.calibration.omittedGroupHashes.length,1);assert.equal(artifact.audit.unknownRowsOmittedNotNegative,true);
 const unknownOnly=fixture();unknownOnly.trainingRows.forEach(row=>{row.label=null;});const disabled=trainBinaryHierarchyDetail(unknownOnly);assert.equal(disabled.model,null);assert.equal(disabled.policy,null);assert.equal(disabled.eligible,false);assert.equal(disabled.reason,'insufficient-known-training-support');
});

test('positive-only CAL, sparse known negatives and inseparable score ties disable rather than inventing a cut',()=>{
 const positiveOnly=fixture();positiveOnly.calibrationRows=positiveOnly.calibrationRows.filter(r=>r.label!==false);
 const sparse=fixture();sparse.calibrationRows=sparse.calibrationRows.filter(r=>r.id!=='invented-cal-5');
 const tied=fixture();for(const row of tied.calibrationRows)if(row.label!==null)row.vector=axis(0);
 for(const input of [positiveOnly,sparse,tied]){
  const artifact=trainBinaryHierarchyDetail(input);assert.equal(artifact.eligible,false);const handle=compileBinaryHierarchyDetail(artifact),decision=classifyBinaryHierarchyDetail(handle,query());
  assert.deepEqual(decision.path,['cooking']);assert.equal(decision.binaryEvaluated,false);assert.equal(decision.reason,'binary-disabled');
 }
 assert.equal(trainBinaryHierarchyDetail(tied).policy.rules[0].enabled,false);
});

test('cohort IDs and groups cannot leak across splits even through omitted unknown rows',()=>{
 for(const field of ['id','groupId']){const input=fixture();input.calibrationRows[0][field]=input.trainingRows[0][field];assert.throws(()=>trainBinaryHierarchyDetail(input));}
 const omitted=fixture();omitted.calibrationRows[0].groupId=omitted.trainingRows.at(-1).groupId;assert.throws(()=>trainBinaryHierarchyDetail(omitted));
 const duplicate=fixture();duplicate.trainingRows[1].groupId=duplicate.trainingRows[0].groupId;assert.throws(()=>trainBinaryHierarchyDetail(duplicate));
});

test('invalid paths, numeric data and descriptor hooks refuse without mutation or authority',()=>{
 for(const canonicalPath of [[],['recipes'],['cooking','other-node'],['cooking','cooking','recipes'],Array(9).fill('recipes')])assert.throws(()=>trainBinaryHierarchyDetail({...fixture(),canonicalPath}));
 const input=fixture();input.trainingRows[0].vector=Array(384).fill(0);assert.throws(()=>trainBinaryHierarchyDetail(input));
 const artifact=trainBinaryHierarchyDetail(fixture()),altered=structuredClone(artifact);altered.canonicalPath=['nature','recipes'];assert.throws(()=>compileBinaryHierarchyDetail(altered));
 let hooks=0;const hooked=fixture();Object.defineProperty(hooked.trainingRows[0],'label',{enumerable:true,get(){hooks++;throw new Error('must not get');}});assert.throws(()=>trainBinaryHierarchyDetail(hooked));
 const proxy=new Proxy(fixture(),{get(){hooks++;throw new Error('must not get');},getOwnPropertyDescriptor(){hooks++;throw new Error('must not inspect');}});assert.throws(()=>trainBinaryHierarchyDetail(proxy));assert.equal(hooks,0);
});
