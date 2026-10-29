// Actual owned PostgreSQL/normal coordinator path, invented Source material only.
// Uses existing physical sessions. No model, public/private capture or live DB.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createAutomaticSubjectRetrievalRepository as retrievalRepo} from '../canonical-v4/automatic-subject-retrieval-repository.js';
import {createAutomaticNamedSubjectRepository as subjectRepo} from '../canonical-v4/automatic-named-subject-repository.js';
import {buildAutomaticSubjectCohort} from '../../src/application/automatic-subject-cohort.js';
import {createAutomaticSubjectCoordinator} from '../../src/application/automatic-subject-coordinator.js';
import {describeRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';
import {runSingleSourceTopicNativeAssertions} from './single-source-topic-native-assertions.js';
import names from './automatic-retrieval-native-cases.json' with {type:'json'};
export const AUTOMATIC_RETRIEVAL_NATIVE_CASES=Object.freeze([...names]);
const code=c=>e=>e?.code===c,sha=v=>createHash('sha256').update(v).digest('hex');
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
async function within(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('bounded retrieval operation timed out')),1200);})]);}finally{clearTimeout(timer);}}
async function test(cases,index,body){const row={name:names[index],status:'running'};cases.push(row);try{await body();row.status='passed';}catch(e){row.status='failed';throw e;}}
function findIndex(plan,name){if(!plan||typeof plan!=='object')return false;return plan['Index Name']===name||Object.values(plan).some(v=>Array.isArray(v)?v.some(x=>findIndex(x,name)):v&&typeof v==='object'&&findIndex(v,name));}

export async function runAutomaticRetrievalNativeAssertions(scope){
 const {owner,worker,app,observer,generation,matcher,sourceIds,publicationInput,prepareFixtureSources,changeFixtureTitle,cases}=scope;
 const identity=describeRootedHierarchyMatcher(matcher),matcherHash=sha(JSON.stringify(identity)),d=identity.inputDefinition,
  descriptor={matcherHash,representationHash:identity.representationHash,inputDefinition:{bodyWeight:d.bodyWeight,titleWeight:d.titleWeight,encoderHash:d.encoderHash}},
  retrieval=retrievalRepo({database:worker}),subjects=subjectRepo({database:worker}),reads=subjectRepo({database:app}),rawScope=JSON.stringify({generation,matcherHash});
 const page=id=>reads.source(JSON.stringify({generation,sourceId:id}));
 const work=()=>retrieval.indexTasks(rawScope),seeds=()=>retrieval.discoveryTasks(rawScope);
 const counts=()=>one(owner,`SELECT (SELECT count(*)::integer FROM canonical_v4.named_retrieval_inputs) cache,
  (SELECT count(*)::integer FROM canonical_v4.named_retrieval_terms) terms,(SELECT count(*)::integer FROM canonical_v4.named_index_requests) indexing,
  (SELECT count(*)::integer FROM canonical_v4.named_discovery_requests) discovery`);
 const req=task=>JSON.stringify({generation,matcherHash,task});
 await test(cases,0,async()=>{
  const before=await one(owner,'SELECT revision::text FROM canonical_v4.runtime_state WHERE singleton');
  await owner.exec(await readFile(new URL('../canonical-v4/drafts/automatic-subject-retrieval.sql',import.meta.url),'utf8'));
  assert.deepEqual(await one(owner,'SELECT revision::text FROM canonical_v4.runtime_state WHERE singleton'),before);
  assert.equal((await counts()).indexing,sourceIds.length);assert.equal((await work()).length,sourceIds.length);
 });
 await test(cases,1,async()=>{
  for(const task of await work())assert.equal(await retrieval.index(req(task)),'indexed');
  assert.deepEqual(await work(),[]);const c=await counts();assert.equal(c.cache,sourceIds.length);assert(c.terms<=sourceIds.length*8);assert.equal(c.indexing,0);assert.equal(c.discovery,sourceIds.length);
 });
 await test(cases,2,async()=>{
  const s=(await seeds())[0],rows=await retrieval.neighbours(JSON.stringify({generation,matcherHash,...s}));assert(rows.some(r=>r.sourceId===s.sourceId));assert(rows.length<=128);assert(rows.some(r=>r.lexical));
  const cohort=buildAutomaticSubjectCohort(JSON.stringify({...descriptor,generation,seedSourceId:s.sourceId,rows}));assert.equal(cohort.work.selected,sourceIds.length);
  const stored=(await owner.query('SELECT source_id,mirror::text mirror FROM canonical_v4.named_retrieval_inputs')).rows;
  for(const r of stored){const values=JSON.parse(r.mirror),expected=cohort.input.observations.find(o=>o.sourceId===r.source_id).vector;
   assert(Math.max(...values.map((n,i)=>Math.abs(n-expected[i])))<1e-6);
  }
 });
 await test(cases,3,async()=>{
  const mirror=(await one(owner,'SELECT mirror::text value FROM canonical_v4.named_retrieval_inputs LIMIT 1')).value;
  await owner.transaction(async tx=>{
   await tx.exec('SET LOCAL enable_seqscan=off');
   const p=(await one(tx,'EXPLAIN(FORMAT JSON) SELECT source_id FROM canonical_v4.named_retrieval_inputs WHERE mirror IS NOT NULL ORDER BY mirror OPERATOR(public.<=>) $1::public.vector(384) LIMIT 95',[mirror]))['QUERY PLAN'];
   assert(findIndex(p,'named_retrieval_hnsw'));
   const q=(await one(tx,"EXPLAIN(FORMAT JSON) SELECT source_id FROM canonical_v4.named_retrieval_terms WHERE term='steam' ORDER BY source_ordinal DESC,source_id LIMIT 4"))['QUERY PLAN'];
   assert(findIndex(q,'named_retrieval_term_recent'));
  });
  const before=await one(worker,"SELECT current_setting('hnsw.ef_search') ef,current_setting('hnsw.iterative_scan') iterative");
  const s=(await seeds())[0];await retrieval.neighbours(JSON.stringify({generation,matcherHash,...s}));assert.deepEqual(await one(worker,"SELECT current_setting('hnsw.ef_search') ef,current_setting('hnsw.iterative_scan') iterative"),before);
 });
 await test(cases,4,async()=>{
  const id=sourceIds.at(-1);await owner.query('DELETE FROM canonical_v4.named_retrieval_inputs WHERE source_id=$1',[id]);await owner.query('SELECT canonical_v4.named_enqueue_index($1)',[id]);
  const task=(await work()).find(t=>t.sourceId===id),before=await counts(),bad=structuredClone(task);bad.snapshot.sourceVersion='922';
  await assert.rejects(retrieval.index(req(bad)),code('conflict'));assert.deepEqual(await counts(),before);
  assert.equal(await retrieval.index(req({...task,queueOrdinal:'9223372036854775807'})),'retired');assert.deepEqual(await counts(),before);
 });
 await test(cases,5,async()=>{
  const id=sourceIds.at(-1),task=(await work()).find(t=>t.sourceId===id),ready=deferred(),release=deferred();
  const held=worker.transaction(async tx=>{await retrievalRepo({database:tx}).index(req(task));ready.resolve();await release.promise;});held.catch(()=>ready.resolve());
  try{await ready.promise;assert.equal((await within(page(id))).pageTitle,'Unannounced novel product');
   const lock=await one(app,"SELECT current_setting('lock_timeout') value");
   assert.equal((await within(app.query('SELECT canonical_v4.named_request_priority($1,$2) value',[generation,id]))).rows[0].value,false);
   assert.deepEqual(await one(app,"SELECT current_setting('lock_timeout') value"),lock);
   await within(observer.query('UPDATE canonical_v4.runtime_state SET revision=revision WHERE singleton'));
  }finally{release.resolve();await held;}
 });
 await test(cases,6,async()=>{
  const existing=(await page(sourceIds[0])).subject;assert(existing);
  const singleton=await subjects.publish(JSON.stringify(await publicationInput([sourceIds[0]])));
  assert.equal(singleton.selections[0].subjectId,existing.id);assert.equal(singleton.selections[0].reason,'retained-supported-subject');
  const loop=createAutomaticSubjectCoordinator({retrieval,subjects,descriptorJson:JSON.stringify(descriptor),
   readGeneration:async()=>(await one(owner,'SELECT generation FROM canonical_v4.runtime_state WHERE singleton')).generation}).start();
  try{const end=performance.now()+2500;while(loop.describe().counts.discoveries<1&&loop.describe().counts.failures===0&&performance.now()<end)await new Promise(r=>setTimeout(r,10));}
  finally{await loop.close();}
  assert.equal(loop.describe().testComposition,false);assert.equal(loop.describe().counts.failures,0);assert(loop.describe().counts.discoveries>=1);
  assert.equal((await page(sourceIds[0])).subject.id,existing.id);
 });
 await test(cases,7,async()=>{
  const [a,b,c,d]=sourceIds.slice(1,5);
  await changeFixtureTitle(a,'Orion Console Pro battery replacement');await changeFixtureTitle(b,'Orion Console Pro screen replacement');await prepareFixtureSources();
  await subjects.publish(JSON.stringify(await publicationInput([a,b])));const first=(await page(a)).subject;assert.equal(first.title,'Orion Console Pro');assert.equal(first.parentId,null);
  await changeFixtureTitle(c,'Orion Console Lite battery replacement');await changeFixtureTitle(d,'Orion Console Lite screen replacement');await prepareFixtureSources();
  await subjects.publish(JSON.stringify(await publicationInput([a,b,c,d])));const next=(await page(a)).subject;assert.equal(next.id,first.id);assert(next.parentId);
  assert.equal((await one(owner,'SELECT label FROM canonical_v4.named_subject_heads WHERE subject_id=$1',[next.parentId])).label,'Orion Console');
 });
 await test(cases,8,async()=>{
  for(const role of ['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'])for(const sql of ['SELECT * FROM canonical_v4.named_retrieval_inputs','SELECT * FROM canonical_v4.named_indexable_sources'])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
  for(const role of ['murmingle_app','murmingle_crawler_submitter'])for(const sql of ["SELECT canonical_v4.named_neighbours('g','h','s',1)","SELECT canonical_v4.named_index_tasks('g','h')"])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
 });
 await runSingleSourceTopicNativeAssertions({...scope,matcherHash,descriptor,subjects,retrieval,page,check:(index,body)=>test(cases,index,body)});
}

export async function retireAutomaticRetrievalNativeAssertions({owner,cases}){
 await test(cases,19,async()=>{
  for(const table of ['named_retrieval_inputs','named_retrieval_terms','named_index_requests','named_discovery_requests'])assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.'+table)).n,0);
  await owner.exec(`DROP TRIGGER named_prepared_index_request ON canonical_v4.semantic_observations;
   DROP TRIGGER named_retrieval_source ON canonical_v4.sources;DROP TRIGGER named_retrieval_receipt ON canonical_v4.operation_receipts;
   DROP TRIGGER named_retrieval_stamp ON canonical_v4.runtime_source_stamps;DROP TRIGGER named_retrieval_embedding ON canonical_v4.embeddings;
   DROP FUNCTION canonical_v4.named_prepared_index_request(),canonical_v4.named_invalidate_retrieval(),canonical_v4.named_enqueue_index(text),
    canonical_v4.named_index_tasks(text,text),canonical_v4.named_index_source(text,text,text,bigint,jsonb,jsonb),canonical_v4.named_discovery_tasks(text,text),
    canonical_v4.named_neighbours(text,text,text,bigint),canonical_v4.named_complete_discovery(text,text,text,bigint),canonical_v4.named_request_priority(text,text);
   DROP FUNCTION canonical_v4.named_read_single_source(text,text,text),canonical_v4.named_match_single_source(text,text,jsonb,jsonb,text);
   DROP VIEW canonical_v4.named_indexable_sources;
   DROP TABLE canonical_v4.named_discovery_requests,canonical_v4.named_index_requests,canonical_v4.named_retrieval_terms,canonical_v4.named_retrieval_inputs;`);
 });
}
