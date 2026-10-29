// Actual owned PostgreSQL transaction checks. The derived withdrawn state and
// adversarial public competitors are owner-only invented fixture setup, rolled
// back after each check. Actual Source erasure is a separate retained report.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createAutomaticNamedSubjectRepository as subjects} from '../canonical-v4/automatic-named-subject-repository.js';
import {createPublishedTopicEvidenceRepository as evidence} from '../canonical-v4/published-topic-evidence-repository.js';
import {createAutomaticAuthorContextRepository as authors} from '../canonical-v4/automatic-author-context-repository.js';
import {createCanonicalV4LifecycleRepository as lifecycle} from '../canonical-v4/lifecycle-repository.js';
const code=c=>e=>e?.code===c,unit=[1,...Array(383).fill(0)],actor={id:'demo-alex',type:'human',demo:true};
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
async function bounded(work){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Recovery concurrency check timed out')),1200);})]);}finally{clearTimeout(timer);}}
async function rollback(database,work){const marker=Error('Owned recovery fixture rollback');await assert.rejects(database.transaction(async tx=>{await work(tx);throw marker;}),e=>e===marker);}
export async function runPublishedTopicRecoveryNativeAssertions({owner,worker,app,observer,generation,publicationInput,sourceIds,context,publicRootId,check}){
 const publicQuery={generation,representationHash:null,focusKeys:null};let serial=0;
 const canonical=tx=>tx.query(`SELECT c.id,c.discussion_id,c.write_version::text,c.revision_count,r.payload FROM canonical_v4.contributions c
  LEFT JOIN canonical_v4.revisions r ON r.contribution_id=c.id WHERE c.id=$1 ORDER BY r.ordinal`,[publicRootId]).then(r=>r.rows);
 async function withdrawn(work){
  const input=await publicationInput([sourceIds[1],sourceIds[2]]);publicQuery.representationHash=input.representationHash;
  const candidate=input.candidates.find(c=>c.subjectId===context.scope.id);assert(candidate,'fixture must include the actual occupied subject');
  publicQuery.focusKeys=[candidate.focusKey];input.candidates=input.candidates.filter(c=>c.subjectId!==candidate.subjectId);
  await rollback(owner,async tx=>{
   // Explicit owner-only derived fixture setup: public text/canonical routes and
   // current protected Sources stay untouched. No forgotten Source data reused.
   await tx.query('UPDATE canonical_v4.named_subject_ids SET revision=revision+1 WHERE id=$1',[candidate.subjectId]);
   await tx.query('DELETE FROM canonical_v4.named_subject_heads WHERE subject_id=$1',[candidate.subjectId]);
   const pub=evidence({database:tx}),cached=await pub.candidates(JSON.stringify(publicQuery));assert.equal(cached.length,1);assert.equal(cached[0].headPresent,false);
   const repository=port=>subjects({database:tx,publicEvidence:port??pub});
   await work({tx,input,pub,cached,repository});
  });
 }
 await check(11,async()=>{
  await owner.exec(await readFile(new URL('../canonical-v4/drafts/published-topic-recovery.sql',import.meta.url),'utf8'));
  for(const role of ['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'])for(const sql of [
   "SELECT canonical_v4.named_lock_public_recovery('{}')","SELECT canonical_v4.named_current_public_recovery_vector('s','m')"])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
 });
 await check(12,()=>withdrawn(async({tx,input,repository,cached})=>{
  const before=await canonical(tx),ids=await one(tx,'SELECT count(*)::integer n FROM canonical_v4.named_subject_ids');
  const started=performance.now(),r=await repository().publish(JSON.stringify(input));const ms=performance.now()-started;
  assert(r.subjects.some(s=>s.subjectId===context.scope.id&&BigInt(s.revision)===BigInt(cached[0].identityRevision)+1n));
  assert(r.selections.every(s=>s.subjectId===context.scope.id));assert.deepEqual(await canonical(tx),before);
  assert.deepEqual(await one(tx,'SELECT count(*)::integer n FROM canonical_v4.named_subject_ids'),ids);
  assert.equal((await one(tx,'SELECT count(*)::integer n FROM canonical_v4.named_subject_members WHERE subject_id=$1',[context.scope.id])).n,2);
  assert(Number.isFinite(ms)&&ms<1200,'bounded invented recovery must complete in this local transaction');
 }));
 await check(13,()=>withdrawn(async({tx,input,cached,repository})=>{
  await lifecycle({database:tx}).command(await one(tx,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton'),
   {type:'edit',contributionId:publicRootId,body:'The public meaning has changed after planning and needs another current evidence preparation.'},actor);
  await assert.rejects(repository({candidates:async()=>cached}).publish(JSON.stringify(input)),code('conflict'));
 }));
 await check(14,()=>withdrawn(async({tx,input,cached,repository})=>{
  // Forged worker coordinates suggest agreement; protected SQL evidence has the
  // opposite meaning. The publisher must score actual stored values instead.
  await tx.query('UPDATE canonical_v4.named_public_prototypes SET values_double=$2::double precision[] WHERE scope_id=$1',[context.scope.id,unit.map(n=>-n)]);
  await assert.rejects(repository({candidates:async()=>cached}).publish(JSON.stringify(input)),code('invalid'));
 }));
 await check(15,()=>withdrawn(async({tx,input,cached,repository})=>{
  const root='public-recovery-competing-root',topic='a0000000-0000-4000-8000-000000000099';
  await tx.query('INSERT INTO canonical_v4.named_subject_ids VALUES($1,1)',[topic]);
  await tx.query("INSERT INTO canonical_v4.id_registry VALUES($1,'contributions')",[root]);
  await tx.query(`INSERT INTO canonical_v4.contributions SELECT $1,discussion_id,root_id,reply_to_id,author_id,operator_id,origin_source_id,anchor_source_id,
   actor_type,visibility,withdrawn,created_at,revision_count,nextval('canonical_v4.contribution_ordinal_sequence'),payload,write_version FROM canonical_v4.contributions WHERE id=$2`,[root,publicRootId]);
  await tx.query('INSERT INTO canonical_v4.revisions SELECT $1,ordinal,payload FROM canonical_v4.revisions WHERE contribution_id=$2',[root,publicRootId]);
  await tx.query("INSERT INTO canonical_v4.named_root_contexts VALUES($1,$2,'named',$3,$4)",[root,generation,topic,cached[0].caption]);
  await tx.query(`INSERT INTO canonical_v4.named_public_prototypes SELECT p.generation,p.representation_hash,$1,$2,r.public_digest,p.focus_key,p.values_double,r.human,p.input_hash
   FROM canonical_v4.named_public_prototypes p CROSS JOIN canonical_v4.named_public_roots r WHERE p.scope_id=$3 AND r.root_id=$2`,[topic,root,context.scope.id]);
  assert.equal((await evidence({database:tx}).candidates(JSON.stringify(publicQuery))).length,2);
  await assert.rejects(repository({candidates:async()=>cached}).publish(JSON.stringify(input)),code('conflict'));
 }));
 await check(16,()=>withdrawn(async({tx,input,cached,repository})=>{
  await tx.query('UPDATE canonical_v4.named_subject_ids SET revision=revision+1 WHERE id=$1',[context.scope.id]);
  await assert.rejects(repository({candidates:async()=>cached}).publish(JSON.stringify(input)),code('conflict'));
 }));
 await check(17,()=>withdrawn(async({input,repository})=>{
  const ready=defer(),release=defer();let primary;
  const held=rollback(app,async tx=>{await lifecycle({database:tx}).command(await one(tx,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton'),
   {type:'edit',contributionId:publicRootId,body:'An ongoing human edit must win over background public topic identity recovery.'},actor);ready.resolve();await release.promise;});
  held.catch(e=>ready.resolve({error:e}));try{const r=await ready.promise;if(r?.error)throw r.error;
   await assert.rejects(bounded(repository().publish(JSON.stringify(input))),code('conflict'));
  }catch(e){primary=e;}finally{release.resolve();try{await held;}catch(e){primary??=e;}}if(primary)throw primary;
 }));
 await check(18,()=>withdrawn(async({tx,input,repository})=>{
  await repository().publish(JSON.stringify(input));
  // The original public discussion remains readable while all recovery writes
  // are held uncommitted. A normal page-only post uses another actual session.
  assert.equal((await bounded(canonical(observer)))[0].id,publicRootId);
  await bounded(rollback(app,async appTx=>{
   const author=authors({database:appTx,nextId:()=>`public-recovery-concurrent-${++serial}`});
   const page=await author.editor(JSON.stringify({generation,sourceId:sourceIds.at(-1)}));assert.equal(page.scope.kind,'page');
   const out=await author.appendRoot(JSON.stringify({actorId:actor.id,requestId:'public-recovery-concurrent-request',
    expected:await one(appTx,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton'),
    command:{type:'create-root',topicId:page.topicId,body:'A normal page discussion remains writable during independent topic recovery.',originSourceId:page.scope.sourceId},scope:page.scope}));
   assert(out.result.contributionId);
  }));
  assert.equal((await one(tx,'SELECT subject_id::text id FROM canonical_v4.named_subject_heads WHERE subject_id=$1',[context.scope.id])).id,context.scope.id);
 }));
}
