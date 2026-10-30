// Mandatory registered18 B checks on the SAME existing owner/worker sessions.
// No new DB/client/model or production connection. Old assertions stay intact.
import assert from 'node:assert/strict';
import {createAutomaticNamedSubjectRepository} from '../canonical-v4/automatic-named-subject-repository.js';
import {createSingleSourceTopicRepository} from '../canonical-v4/single-source-topic-repository.js';
import {planAutomaticNamedSubjectsV3,GENERAL_SUBJECT_POLICY_V3_HASH} from '../../src/application/automatic-named-subject-plan.js';
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
export async function verifyRegisteredNameQualityV3({owner,worker,generation,input}){
 assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.schema_migrations')).n,18);
 for(const [label,expected]of [['Alle',false],['Ａｌｌｅ',false],['All Saints',true],['New York',true],['GTA 6',true],['Kapsalon',true]]){
  assert.equal((await one(owner,'SELECT canonical_v4.named_label_has_content($1) AS accepted',[label])).accepted,expected);
 }
 const value={...input,policyHash:GENERAL_SUBJECT_POLICY_V3_HASH},plan=planAutomaticNamedSubjectsV3(JSON.stringify(value));assert(plan.updates.length>0);
 const command={generation:plan.generation,policyHash:plan.policyHash,matcherHash:plan.matcherHash,representationHash:plan.representationHash,
  updates:structuredClone(plan.updates),selections:plan.selections,witnesses:plan.commitWitnesses,
  candidates:value.candidates.map(({subjectId,revision,focusKey,contextRootId})=>({subjectId,revision,focusKey,contextRootId}))};
 const before=await one(owner,"SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY subject_id),'[]'::jsonb) AS heads FROM canonical_v4.named_subject_heads h");
 command.updates[0].label='Alle';
 await assert.rejects(worker.query('SELECT canonical_v4.named_publish($1::jsonb)',[JSON.stringify(command)]),e=>e?.code==='P1283'&&e.message==='Content-free named label');
 assert.deepEqual(await one(owner,"SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY subject_id),'[]'::jsonb) AS heads FROM canonical_v4.named_subject_heads h"),before);
 const stale=structuredClone(value);stale.sourceWitnesses[0].sourceStamp='f'.repeat(64);
 // Keep the producer hash consistent so the actual SQL Source fence, rather
 // than the JS hash precheck, must reject this stale stamp.
 const {createHash}=await import('node:crypto'),w=stale.sourceWitnesses[0];
 stale.observations.find(r=>r.sourceId===w.sourceId).inputHash=createHash('sha256').update(JSON.stringify([w.sourceId,w.sourceVersion,w.operationId,w.operationDigest,w.sourceStamp])).digest('hex');
 const repo=createAutomaticNamedSubjectRepository({database:worker,namePolicyVersion:3});
 await assert.rejects(repo.publish(JSON.stringify(stale)),e=>e?.code==='conflict');
 assert.deepEqual(await one(owner,"SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY subject_id),'[]'::jsonb) AS heads FROM canonical_v4.named_subject_heads h"),before);
 const published=await repo.publish(JSON.stringify(value));assert.equal(published.status,'published');assert.equal(published.subjects.length,plan.updates.length);
 for(const subject of published.subjects){
  assert(input.candidates.some(c=>c.subjectId===subject.subjectId),'new policy retains existing opaque topic IDs');
  const current=await one(owner,'SELECT policy_hash,revision::text AS revision FROM canonical_v4.named_subject_heads WHERE subject_id=$1',[subject.subjectId]);
  assert.equal(current.policy_hash,GENERAL_SUBJECT_POLICY_V3_HASH);assert.equal(current.revision,subject.revision);
 }
 const first=published.selections.find(s=>s.subjectId!==null);assert(first);
 const matched=await createSingleSourceTopicRepository({database:worker}).match(JSON.stringify({generation,matcherHash:value.matcherHash,sourceId:first.sourceId}));
 assert(['retained','matched'].includes(matched.status));assert.equal(matched.subjectId,first.subjectId,'single-page matching reads V3 heads');
 for(const role of ['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'])
  await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query("SELECT canonical_v4.named_label_has_content('GTA 6')");}),e=>e?.code==='42501');
}
