import test from 'node:test';import assert from 'node:assert/strict';
import {buildAutomaticSubjectCohort} from '../src/application/automatic-subject-cohort.js';
import {planAutomaticNamedSubjectsV2} from '../src/application/automatic-named-subject-plan.js';
import {planPublishedTopicRecovery as plan,PUBLIC_IDENTITY_RECOVERY_POLICY as policy,PUBLIC_IDENTITY_RECOVERY_POLICY_HASH as policyHash} from '../src/application/published-topic-recovery-plan.js';
import {publishedTopicInput,PUBLISHED_TOPIC_INPUT_HASH} from '../src/application/published-topic-evidence.js';
import {createAutomaticNamedSubjectRepository} from '../portable/canonical-v4/automatic-named-subject-repository.js';
import {automaticCohortFixture} from './fixtures/automatic-subject-cohort.js';
const oldId='a0000000-0000-4000-8000-000000000001',otherId='a0000000-0000-4000-8000-000000000002';
const vector=(x=1)=>[x,Math.sqrt(1-x*x),...Array(382).fill(0)];
function fixture(){const f=automaticCohortFixture(),input=structuredClone(buildAutomaticSubjectCohort(JSON.stringify(f)).input);
 // Preserve the distinct prepared coordinates: identical vectors are already
 // excluded as duplicate material by the ordinary discovery policy.
 const publicText={rootId:'old-public-root',topicId:oldId,caption:'Kapsalon',body:'People discuss preparing chicken and fries with salad and garlic sauce.'},p=publishedTopicInput(JSON.stringify(publicText));
 return {input,publicCandidates:[{...publicText,rootVersion:'8',publicDigest:p.publicDigest,representationHash:input.representationHash,focusKey:p.focusKey,
  inputHash:PUBLISHED_TOPIC_INPUT_HASH,vector:vector(),identityRevision:'12',headPresent:false}]};}
const result=a=>plan(JSON.stringify(a));
test('independent current public meaning restores a withdrawn opaque ID with revision proof',()=>{
 const a=fixture(),r=result(a);assert.equal(r.updates.length,1);assert.equal(r.updates[0].subjectId,oldId);assert.equal(r.updates[0].expectedRevision,'12');
 assert(r.selections.every(s=>s.subjectId===oldId));assert.equal(r.decisions[0].status,'recover-published-subject');assert.equal(r.publicRecovery.proofs[0].rootVersion,'8');
 assert.equal(r.publicRecovery.policyHash,policyHash);assert(Object.isFrozen(r.publicRecovery.proofs));assert.equal(r.assignmentAuthority,false);
 assert(!JSON.stringify(r.publicRecovery).includes(a.publicCandidates[0].body));assert(!JSON.stringify(r.publicRecovery).includes('sourceId'));
});
test('every current member must meet the public threshold, not merely the centroid',()=>{
 const a=fixture();a.input.observations[1].vector=vector(.87);const r=result(a);assert.notEqual(r.updates[0].subjectId,oldId);assert.equal(r.publicRecovery.proofs.length,0);
});
test('a below-floor competitor participates in the ambiguity margin',()=>{
 const a=fixture(),first=a.publicCandidates[0];first.vector=vector(.9);a.publicCandidates.push({...first,topicId:otherId,rootId:'other-root',vector:vector(.875)});
 a.publicCandidates[1].publicDigest=publishedTopicInput(JSON.stringify(Object.fromEntries(['rootId','topicId','caption','body'].map(k=>[k,a.publicCandidates[1][k]])))).publicDigest;
 const r=result(a);assert.equal(r.updates.length,0);assert(r.selections.every(s=>s.subjectId===null));assert.equal(r.decisions[0].status,'ambiguous-public-subject');
});
test('active public heads outside the resolved candidate scope are not merged or duplicated',()=>{
 const a=fixture();a.publicCandidates[0].headPresent=true;const r=result(a);assert.equal(r.updates.length,0);assert.equal(r.publicRecovery.proofs.length,0);
 assert.equal(r.decisions[0].status,'public-subject-has-unresolved-active-head');
});
test('an already resolved current head follows its existing publication path',()=>{
 const a=fixture(),u=planAutomaticNamedSubjectsV2(JSON.stringify(a.input)).updates[0];
 a.input.candidates=[{subjectId:otherId,revision:'2',focusKey:u.focusKey,contextRootId:u.contextRootId,prototypeValues:vector(),representationHash:a.input.representationHash,parentId:null}];
 const r=result(a);assert.equal(r.updates[0].subjectId,otherId);assert.equal(r.updates[0].expectedRevision,'2');assert.equal(r.publicRecovery.proofs.length,0);
});
test('refusing an ambiguous narrow scope keeps its most specific confident parent',()=>{
 const f=automaticCohortFixture(4);f.rows.forEach((r,i)=>{r.title=['Steam Deck OLED battery replacement','Steam Deck OLED screen replacement','Steam Deck LCD battery replacement','Steam Deck LCD screen replacement'][i];r.supportedPath=['games'];});
 const a=fixture();a.input=structuredClone(buildAutomaticSubjectCohort(JSON.stringify(f)).input);
 const first=planAutomaticNamedSubjectsV2(JSON.stringify(a.input)),child=first.updates.find(u=>u.label==='Steam Deck OLED');assert(child);
 const c=a.publicCandidates[0];c.caption=child.label;c.focusKey=child.focusKey;c.publicDigest=publishedTopicInput(JSON.stringify(Object.fromEntries(['rootId','topicId','caption','body'].map(k=>[k,c[k]])))).publicDigest;
 const rival={...c,rootId:'other-root',topicId:otherId};rival.publicDigest=publishedTopicInput(JSON.stringify(Object.fromEntries(['rootId','topicId','caption','body'].map(k=>[k,rival[k]])))).publicDigest;a.publicCandidates.push(rival);
 const r=result(a),broad=r.updates.find(u=>u.label==='Steam Deck');assert(broad);assert(!r.updates.some(u=>u.label==='Steam Deck OLED'));
 for(const id of f.rows.slice(0,2).map(r=>r.sourceId))assert.equal(r.selections.find(s=>s.sourceId===id).subjectId,broad.subjectId);
});
test('public text, focus, representation and head state are all part of the typed boundary',()=>{
 for(const change of [c=>{c.body+=' changed';},c=>{c.focusKey='b'.repeat(64);},c=>{c.inputHash='c'.repeat(64);},c=>{c.representationHash='d'.repeat(64);},c=>{c.headPresent=0;},c=>{c.body='OK';c.publicDigest=publishedTopicInput(JSON.stringify(Object.fromEntries(['rootId','topicId','caption','body'].map(k=>[k,c[k]])))).publicDigest;}]){
  const a=fixture();change(a.publicCandidates[0]);assert.throws(()=>result(a),TypeError);
 }
 const a=fixture();a.publicCandidates.push(a.publicCandidates[0]);assert.throws(()=>result(a),TypeError);
});
test('empty public candidates preserve ordinary discovery and explicit recovery policy bounds',()=>{
 const a=fixture();a.publicCandidates=[];const r=result(a);assert.equal(r.updates.length,1);assert.equal(r.updates[0].expectedRevision,null);
 assert.deepEqual(r.publicRecovery.candidates,[]);assert.equal(policy.minimumSimilarity,.88);assert.equal(policy.minimumMargin,.03);assert.equal(policy.maximumCandidates,64);
});
test('the actual repository opt-in carries recovery proof to the existing atomic publisher',async()=>{
 const a=fixture();let wire,lookups=0;const r=createAutomaticNamedSubjectRepository({publicEvidence:{async candidates(raw){lookups++;assert.deepEqual(JSON.parse(raw).focusKeys,[a.publicCandidates[0].focusKey]);return a.publicCandidates;}},
  database:{async query(sql,args){assert(sql.includes('named_publish'));wire=JSON.parse(args[0]);return {rows:[{result:{generation:wire.generation,policyHash:wire.policyHash,
   subjects:wire.updates.map(u=>({subjectId:u.subjectId,revision:String(BigInt(u.expectedRevision)+1n)})),selections:wire.selections}}]};}}});
 const out=await r.publish(JSON.stringify(a.input));assert.equal(out.status,'published');assert.equal(out.subjects[0].subjectId,oldId);assert.equal(out.subjects[0].revision,'13');assert.equal(lookups,1);
 assert.equal(wire.publicRecovery.proofs.length,1);assert.equal(wire.updates[0].expectedRevision,'12');
});
test('a failed public lookup never silently falls back to minting another topic ID',async()=>{
 const a=fixture(),r=createAutomaticNamedSubjectRepository({database:{query:async()=>assert.fail('must not publish after uncertain public lookup')},publicEvidence:{candidates:async()=>{throw Error('public index unavailable');}}});
 await assert.rejects(r.publish(JSON.stringify(a.input)),/public index unavailable/u);
});
