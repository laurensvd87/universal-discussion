// Owned PostgreSQL checks. Current Source preparation and normal worker/app
// ports are real; titles/vectors and adversarial owner-only head setup are
// invented. No live database, new process, model or semantic-quality claim.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createSingleSourceTopicRepository as single} from '../canonical-v4/single-source-topic-repository.js';
import {singleSourceTopicFocus,SINGLE_SOURCE_TOPIC_POLICY_HASH} from '../../src/application/single-source-topic-focus.js';
import {createAutomaticSubjectCoordinator} from '../../src/application/automatic-subject-coordinator.js';
import {createCanonicalV4RuntimeRepository} from '../canonical-v4/runtime-repository.js';
const code=c=>e=>e?.code===c,wire=v=>'{'+v.join(',')+'}';
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
async function bounded(p){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Single source check timed out')),1200);})]);}finally{clearTimeout(timer);}}
async function rollback(db,work){const marker=Error('Rollback invented single source fixture');await assert.rejects(db.transaction(async tx=>{await work(tx);throw marker;}),e=>e===marker);}
export async function runSingleSourceTopicNativeAssertions(scope){
 const {owner,worker,app,observer,generation,matcherHash,descriptor,sourceIds,publicationInput,prepareFixtureSources,changeFixtureTitle,subjects,retrieval,page,check}=scope;
 const probe=sourceIds.at(-1),request=JSON.stringify({generation,matcherHash,sourceId:probe}),repo=single({database:worker});
 const broad=(await one(owner,"SELECT subject_id::text id FROM canonical_v4.named_subject_heads WHERE label='Orion Console'")).id,
  narrow=(await one(owner,"SELECT subject_id::text id FROM canonical_v4.named_subject_heads WHERE label='Orion Console Pro'")).id,
  sibling=(await one(owner,"SELECT subject_id::text id FROM canonical_v4.named_subject_heads WHERE label='Orion Console Lite'")).id;
 const routes=()=>owner.query('SELECT source_id,topic_id,method,payload FROM canonical_v4.source_links ORDER BY source_id').then(r=>r.rows);
 const registry=()=>owner.query('SELECT id::text,revision::text FROM canonical_v4.named_subject_ids ORDER BY id').then(r=>r.rows);
 async function prepare(title){await owner.query('DELETE FROM canonical_v4.named_subject_members WHERE source_id=$1',[probe]);await changeFixtureTitle(probe,title);await prepareFixtureSources();}
 await check(9,async()=>{
  await owner.exec(await readFile(new URL('../canonical-v4/drafts/single-source-topic-match.sql',import.meta.url),'utf8'));
  for(const role of ['murmingle_app','murmingle_crawler_submitter'])for(const sql of ["SELECT canonical_v4.named_read_single_source('g','m','s')","SELECT canonical_v4.named_match_single_source('g','m','{}','[]','p')"])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
  await prepare('Orion Console Pro battery field test');
 });
 await check(10,async()=>{
  assert.equal((await page(probe)).subject,null);const before=await registry(),canonical=await routes();
  const r=await bounded(repo.match(request));assert.equal(r.status,'matched');assert.equal(r.subjectId,narrow);assert.equal((await page(probe)).subject.id,narrow);
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_subject_members WHERE source_id=$1 AND subject_id=ANY($2::uuid[])',[probe,[broad,narrow]])).n,2);
  assert.deepEqual(await registry(),before);assert.deepEqual(await routes(),canonical);
 });
 await check(11,async()=>{
  const state=()=>owner.query('SELECT subject_id::text,xmin::text FROM canonical_v4.named_subject_members WHERE source_id=$1 ORDER BY subject_id',[probe]).then(r=>r.rows);
  const before=await state();for(let i=0;i<10;i++){const r=await bounded(repo.match(request));assert.equal(r.status,'retained');assert.equal(r.subjectId,narrow);}
  assert.deepEqual(await state(),before);
 });
 await check(12,async()=>{
  await prepare('Orion Console Pro versus Orion Console Lite comparison');const vector=(await publicationInput([probe])).observations[0].vector;
  const withScore=x=>vector.map((v,i)=>x*v+(i===300?Math.sqrt(1-x*x):0));
  await rollback(owner,async tx=>{
   for(const [id,score]of [[narrow,.9],[sibling,.875],[broad,.95]])await tx.query('UPDATE canonical_v4.named_subject_heads SET prototype_values=$2::double precision[] WHERE subject_id=$1',[id,wire(withScore(score))]);
   const r=await single({database:tx}).match(request);assert.equal(r.subjectId,broad,'near sibling including below-floor competitor falls back to parent');
   await tx.query('UPDATE canonical_v4.named_subject_heads SET prototype_values=$2::double precision[] WHERE subject_id=$1',[sibling,wire(withScore(.3))]);
   await tx.query('UPDATE canonical_v4.named_subject_heads SET prototype_values=$2::double precision[] WHERE subject_id=$1',[broad,wire(withScore(.99))]);
   assert.equal((await single({database:tx}).match(request)).subjectId,narrow,'confident child wins over higher-scoring parent');
  });
 });
 await check(13,async()=>{
  const witness=(await one(worker,'SELECT canonical_v4.named_read_single_source($1,$2,$3) value',[generation,matcherHash,probe])).value;
  await prepare('Orion Console Pro different current field test');
  await assert.rejects(worker.query('SELECT canonical_v4.named_match_single_source($1,$2,$3::jsonb,$4::jsonb,$5)',[generation,matcherHash,JSON.stringify(witness),JSON.stringify(singleSourceTopicFocus(witness.title).focusKeys),SINGLE_SOURCE_TOPIC_POLICY_HASH]),code('P1321'));
  assert.equal((await repo.match(request)).subjectId,narrow);
 });
 await check(14,async()=>{
  await rollback(owner,async tx=>{
   for(let i=0;i<65;i++){const id='b0000000-0000-4000-8000-'+String(i).padStart(12,'0');
    await tx.query('INSERT INTO canonical_v4.named_subject_ids VALUES($1,1)',[id]);
    await tx.query(`INSERT INTO canonical_v4.named_subject_heads SELECT $1,1,generation,policy_hash,matcher_hash,representation_hash,focus_key,context_root_id,
     label,label_source_id,NULL,ancestor_path,prototype_values FROM canonical_v4.named_subject_heads WHERE subject_id=$2`,[id,narrow]);
   }
   const r=await single({database:tx}).match(request);assert.equal(r.status,'capacity');assert.equal(r.subjectId,null);assert.equal(r.candidates,65);
  });
 });
 await check(15,async()=>{
  for(const lock of ['SELECT 1 FROM canonical_v4.named_subject_heads WHERE subject_id=$1 FOR UPDATE','SELECT 1 FROM canonical_v4.sources WHERE id=$1 FOR UPDATE']){
   const ready=defer(),release=defer();const held=owner.transaction(async tx=>{await tx.query(lock,[lock.includes('heads')?narrow:probe]);ready.resolve();await release.promise;});held.catch(e=>ready.resolve({error:e}));
   try{const r=await ready.promise;if(r?.error)throw r.error;assert.equal((await bounded(repo.match(request))).status,'busy');}
   finally{release.resolve();await held;}
  }
 });
 await check(16,async()=>{
  await prepare('Orion Console Pro independent battery test');
  await owner.query('DELETE FROM canonical_v4.named_subject_members WHERE source_id=$1',[sourceIds[2]]);
  const ready=defer(),release=defer();
  const held=worker.transaction(async tx=>{assert.equal((await single({database:tx}).match(request)).status,'matched');ready.resolve();await release.promise;});held.catch(e=>ready.resolve({error:e}));
  try{const r=await ready.promise;if(r?.error)throw r.error;
   assert.equal((await bounded(page(probe))).subject,null);
   await bounded(rollback(app,async tx=>{
    const runtime=createCanonicalV4RuntimeRepository({database:tx,nextId:()=> 'single-source-concurrent-root',now:()=>new Date().toISOString()});
    const expected=await one(tx,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton');
    const posted=await runtime.command({actorId:'demo-alex',requestId:'single-source-concurrent-request',expected,
     command:{type:'create-root',topicId:'topic-semantic-manual',body:'A normal discussion post completes while a page assignment is held.',originSourceId:probe}});assert(posted.result.contributionId);
   }));
   await bounded(observer.transaction(async tx=>{await tx.exec('SET LOCAL ROLE murmingle_ingest_worker');const other=await single({database:tx}).match(JSON.stringify({generation,matcherHash,sourceId:sourceIds[2]}));assert.equal(other.status,'matched');assert.equal(other.subjectId,narrow);}));
  }finally{release.resolve();await held;}
 });
 await check(17,async()=>{
  await prepare('Orion Console Pro another independent field test');const entered=defer(),release=defer();let acknowledged=false;
  const loop=createAutomaticSubjectCoordinator({retrieval:{indexTasks:async raw=>(await retrieval.indexTasks(raw)).filter(t=>t.sourceId===probe),index:raw=>retrieval.index(raw),
   discoveryTasks:async raw=>(await retrieval.discoveryTasks(raw)).filter(t=>t.sourceId===probe),neighbours:async raw=>{entered.resolve();await release.promise;return retrieval.neighbours(raw);},
   complete:async raw=>{acknowledged=true;return retrieval.complete(raw);}},subjects,singleSourceTopics:repo,descriptorJson:JSON.stringify(descriptor),readGeneration:async()=>generation}).start();
  try{await bounded(entered.promise);assert.equal((await bounded(page(probe))).subject.id,narrow);assert.equal(loop.describe().counts.singleMatched,1);}
  finally{const closing=loop.close();release.resolve();await closing;}
  assert.equal(acknowledged,false);
 });
 await check(18,async()=>{
  // Real Source change withdraws this derived membership/head, including the
  // parent. The owner-only test setup is then restored for existing fixtures.
  await changeFixtureTitle(probe,'Unannounced novel product');assert.equal((await page(probe)).subject,null);
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_subject_members WHERE source_id=$1',[probe])).n,0);
  await prepareFixtureSources();await subjects.publish(JSON.stringify(await publicationInput(sourceIds)));
 });
}
