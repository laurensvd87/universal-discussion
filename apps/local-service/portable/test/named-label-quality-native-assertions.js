// Mandatory registered18 B checks on the SAME existing owner/worker sessions.
// No new DB/client/model or production connection. Old assertions stay intact.
import assert from 'node:assert/strict';
import {createAutomaticNamedSubjectRepository} from '../canonical-v4/automatic-named-subject-repository.js';
import {createSingleSourceTopicRepository} from '../canonical-v4/single-source-topic-repository.js';
import {planAutomaticNamedSubjectsV3,GENERAL_SUBJECT_POLICY_V3_HASH} from '../../src/application/automatic-named-subject-plan.js';
import {createCanonicalV4SemanticSourceRepository} from '../canonical-v4/semantic-source-repository.js';
import {createStoredSourceHierarchyPreparation} from '../canonical-v4/semantic-source-preparation.js';
import {automaticTopicsFixtureInput} from './automatic-topics-fixture-input.js';
import {sourceStamp,operationDigestFor} from '../../src/domain/source-threads.js';
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
export async function verifyRegisteredNameQualityV3({owner,worker,generation,input,matcher,at}){
 at('BUNDLE');
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
 at('CONTEXT');
 await assert.rejects(repo.publish(JSON.stringify(stale)),e=>e?.code==='conflict');
 assert.deepEqual(await one(owner,"SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY subject_id),'[]'::jsonb) AS heads FROM canonical_v4.named_subject_heads h"),before);
 at('PUBLISH');
 const published=await repo.publish(JSON.stringify(value));assert.equal(published.status,'published');assert.equal(published.subjects.length,plan.updates.length);
 at('RESULT');
 for(const subject of published.subjects){
  assert(input.candidates.some(c=>c.subjectId===subject.subjectId),'new policy retains existing opaque topic IDs');
  const current=await one(owner,'SELECT policy_hash,revision::text AS revision,label,prototype_values FROM canonical_v4.named_subject_heads WHERE subject_id=$1',[subject.subjectId]);
  const founding=before.heads.find(h=>h.subject_id===subject.subjectId);assert(founding);
  // Reusing a subject adds evidence and advances its revision. It does not
  // certify the founding label/prototype as newly produced by the V3 policy.
  assert.equal(current.policy_hash,founding.policy_hash);assert.equal(current.label,founding.label);
  assert.deepEqual(current.prototype_values,founding.prototype_values);assert.equal(current.revision,subject.revision);
 }
 const first=published.selections.find(s=>s.subjectId!==null);assert(first);
 const matched=await createSingleSourceTopicRepository({database:worker}).match(JSON.stringify({generation,matcherHash:value.matcherHash,sourceId:first.sourceId}));
 assert(['retained','matched'].includes(matched.status));assert.equal(matched.subjectId,first.subjectId,'single-page matching preserves reused topic IDs');
 at('THREAD');
 await verifyNewV3Subject({owner,worker,generation,matcher,matcherHash:input.matcherHash,repo});
 at('START');
 for(const role of ['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'])
  await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query("SELECT canonical_v4.named_label_has_content('GTA 6')");}),e=>e?.code==='42501');
}

// A genuinely new V3 head is required as well as reuse of V2 heads. These two
// invented Sources use the same original physical sessions, protected prepare,
// publisher and single-page matcher. Remove their material before old feed,
// dashboard and erasure checks continue on the four original fixture Sources.
async function verifyNewV3Subject({owner,worker,generation,matcher,matcherHash,repo}){
 const modelId='e5-small-q8-browser-main-prefix-v1',topicId='topic-semantic-manual';
 const rows=[1,.97].map((x,i)=>({id:'name-quality-v3-source-'+i,title:'Aurora Keypad Pro '+(i?'screen':'battery')+' replacement',
  values:Array.from({length:384},(_,j)=>j===0?x:j===1?-Math.sqrt(1-x*x):0)})),ids=rows.map(r=>r.id);
 let inserted=false;
 try{
  await owner.transaction(async tx=>{for(const row of rows){
   const material={url:'https://invented.example.org/v3/'+row.id,title:row.title,embedding:{modelId,values:row.values},extractorVersion:'crawler-static-html-prefix/v1'},
    operationId='operation-'+row.id,operationDigest=operationDigestFor(material),policyVersion='ridge1-fixed-reference-radius/v1';
   await tx.query("INSERT INTO canonical_v4.id_registry VALUES($1,'sources')",[row.id]);
   await tx.query(`INSERT INTO canonical_v4.sources(id,ordinal,payload,url,title,provenance,extractor_version,policy_version,operation_id,has_embedding)
    VALUES($1,nextval('canonical_v4.source_ordinal_sequence'),$2,$3,$4,'owner-local-page-embedding/v1',$5,$6,$7,true)`,
    [row.id,JSON.stringify({id:row.id,...material,provenance:'owner-local-page-embedding/v1',operationId,operationDigest,policyVersion,topicIds:[topicId]}),material.url,row.title,material.extractorVersion,policyVersion,operationId]);
   await tx.query('INSERT INTO canonical_v4.embeddings(source_id,payload,model_id,dimensions,values_double) VALUES($1,$2,$3,384,$4::double precision[])',[row.id,JSON.stringify(material.embedding),modelId,'{'+row.values.join(',')+'}']);
   await tx.query('INSERT INTO canonical_v4.operation_receipts VALUES($1,$2,$3)',[row.id,operationId,operationDigest]);
   await tx.query('INSERT INTO canonical_v4.runtime_source_stamps VALUES($1,$2,true)',[row.id,sourceStamp(material)]);
   await tx.query('INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal) VALUES($1,$2,0)',[row.id,topicId]);
   await tx.query("INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method) VALUES($1,$2,nextval('canonical_v4.source_link_ordinal_sequence'),$3,'manual-confirmed')",[row.id,topicId,JSON.stringify({sourceId:row.id,topicId,method:'manual-confirmed'})]);
  }});inserted=true;
  const stored=createCanonicalV4SemanticSourceRepository({database:worker});
  const prep=createStoredSourceHierarchyPreparation({matcher,embedTitle:async title=>({modelId,values:rows.find(r=>r.title===title)?.values})});
  try{
   const packet=await stored.candidates({generation,matcherIdentityHash:matcherHash,afterOrdinal:null,limit:50});
   const candidates=packet.candidates.filter(c=>ids.includes(c.sourceId));assert.equal(candidates.length,2);
   for(const candidate of candidates){const prepared=await prep.prepare(candidate);assert(prepared);await stored.reclassify({generation,matcherIdentityHash:matcherHash,items:[prepared]});}
  }finally{await prep.close();}
  const input={...await automaticTopicsFixtureInput({database:owner,generation,matcher,sourceIds:ids}),policyHash:GENERAL_SUBJECT_POLICY_V3_HASH};
  assert.equal(input.candidates.length,0);const result=await repo.publish(JSON.stringify(input));assert.equal(result.status,'published');assert.equal(result.subjects.length,1);
  const subject=result.subjects[0],head=await one(owner,'SELECT policy_hash,revision::text AS revision,label FROM canonical_v4.named_subject_heads WHERE subject_id=$1',[subject.subjectId]);
  assert.equal(head.policy_hash,GENERAL_SUBJECT_POLICY_V3_HASH);assert.equal(head.revision,'1');assert.equal(head.label,'Aurora Keypad Pro');
  for(const sourceId of ids){
   const selection=result.selections.find(s=>s.sourceId===sourceId);assert.equal(selection.subjectId,subject.subjectId);
   const matched=await createSingleSourceTopicRepository({database:worker}).match(JSON.stringify({generation,matcherHash:input.matcherHash,sourceId}));
   assert(['retained','matched'].includes(matched.status));assert.equal(matched.subjectId,subject.subjectId,'single-page matching reads newly created V3 heads');
  }
 }finally{if(inserted){for(const id of ids)await owner.query('SELECT canonical_v4.ingest_forget_source($1,$2)',[generation,id]);
  await owner.query('DELETE FROM canonical_v4.id_registry WHERE id=ANY($1::text[])',[ids]);}}
}
