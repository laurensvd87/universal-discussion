import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {planAutomaticNamedSubjectsV2,planAutomaticNamedSubjectsV3 as plan,GENERAL_SUBJECT_POLICY_V2_HASH as oldHash,
 GENERAL_SUBJECT_POLICY_V3 as policy,GENERAL_SUBJECT_POLICY_V3_HASH as policyHash} from '../src/application/automatic-named-subject-plan.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
function input(){const titles=['Alle reden über GTA 6: Was Eltern wissen müssen','GTA 6: Alle neuen Screenshots','GTA 6 erhält eine Erwachsenenfreigabe'];return {
 generation:'fixture-generation',policyHash,representationHash:'a'.repeat(64),matcherHash:'b'.repeat(64),minimumSimilarity:.8,
 observations:titles.map((title,i)=>({sourceId:'source-'+i,inputHash:hash('input'+i),materialHash:hash('material'+i),title,publisherKey:'publisher'+i+'.test',acceptedPath:['games'],
 vector:Array.from({length:384},(_,j)=>i===0?(j===0?1:0):j===0?.95:j===i?Math.sqrt(1-.95**2):0)})),
 sourceWitnesses:titles.map((_,i)=>({sourceId:'source-'+i,sourceVersion:'1',operationId:'operation-'+i,operationDigest:'c'.repeat(64),sourceStamp:'d'.repeat(64)})),candidates:[]};}
test('V3 has a distinct exact algorithm and policy identity; old descriptors remain unchanged',async()=>{
 const b=await readFile(new URL('../experiments/automatic-topic-discovery-v3/focus-subjects.js',import.meta.url));assert.equal(hash(b),policy.algorithmSha256);
 assert.equal(hash(JSON.stringify(policy)),policyHash);assert.notEqual(policyHash,oldHash);assert.equal(oldHash,'cd4f0786245a561499253c33cf53a0dc45e0d75e0471707e3a3f8606fb7c4217');
});
test('explicit V3 application plan selects GTA6 for all three articles and retains exact Source fences',()=>{
 const a=input(),r=plan(JSON.stringify(a));assert.equal(r.schema,'general-named-subject-publication-plan/v3');assert.deepEqual(r.updates.map(u=>u.label),['GTA 6']);
 assert(r.selections.every(s=>s.subjectId===r.updates[0].subjectId));assert.deepEqual(r.commitWitnesses,a.sourceWitnesses);assert.equal(r.assignmentAuthority,false);assert.equal(r.registryChanged,false);
 const old=planAutomaticNamedSubjectsV2(JSON.stringify({...a,policyHash:oldHash}));assert(old.updates.some(u=>u.label==='Alle'));
 assert.throws(()=>planAutomaticNamedSubjectsV2(JSON.stringify(a)));assert.throws(()=>plan(JSON.stringify({...a,policyHash:oldHash})));
});
test('same concrete scope reuses its opaque ID, head revision and established parent across label policy upgrades',()=>{
 const a=input(),first=plan(JSON.stringify(a)),u=first.updates[0];a.candidates=[{subjectId:u.subjectId,revision:'7',focusKey:u.focusKey,contextRootId:u.contextRootId,
  prototypeValues:u.prototypeValues,representationHash:a.representationHash,parentId:'12345678-1234-4123-8123-123456789abc'}];
 const r=plan(JSON.stringify(a));assert.equal(r.updates[0].subjectId,u.subjectId);assert.equal(r.updates[0].expectedRevision,'7');assert.equal(r.updates[0].parentId,a.candidates[0].parentId);
});
test('missing Source witness, changed thresholds and arbitrary policies cannot be published through V3',()=>{
 const a=input();a.sourceWitnesses.pop();assert.throws(()=>plan(JSON.stringify(a)));
 for(const patch of [{minimumSimilarity:.81},{policyHash:'f'.repeat(64)}])assert.throws(()=>plan(JSON.stringify({...input(),...patch})));
 assert.throws(()=>plan(JSON.stringify(input()),{}));
});
