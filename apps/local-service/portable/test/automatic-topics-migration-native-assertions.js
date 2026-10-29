// Registered migration proof on the existing second owned database. It reuses
// ownerB and workerB only; app SQL roles run with SET LOCAL on ownerB's original
// exclusive physical session. No new client, model, provider or live connection.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {migrateCanonicalV4,readCanonicalV4MigrationManifest} from '../canonical-v4/index.js';
import {installAutomaticTopics,upgradeAutomaticTopics} from '../canonical-v4/automatic-topics-installation.js';
import {createCanonicalV4RuntimeRepository as runtime} from '../canonical-v4/runtime-repository.js';
import {createCanonicalV4IngestionRepository as ingestion} from '../canonical-v4/ingestion-repository.js';
import {createCanonicalV4SemanticRepository} from '../canonical-v4/semantic-repository.js';
import {createCanonicalV4SemanticSourceRepository} from '../canonical-v4/semantic-source-repository.js';
import {createUnifiedTopicSearchMaintenance} from '../canonical-v4/unified-topic-search-maintenance.js';
import {loadInstalledHierarchyMatcher} from '../../src/application/installed-hierarchy-matcher.js';
import {openDormantPostgresApplication} from '../../src/startup.js';
import {openInstalledHierarchyRuntimeForTest} from '../../src/application/installed-hierarchy-runtime.js';
import {openHierarchyWorkerResourcesForTest} from '../../src/application/hierarchy-worker-resources.js';
import {createLocalServiceClient} from '../../../../spikes/topic-resolution/browser/core/local-service-client.js';
import {runCombinedAuthorHierarchyNativeAssertions} from './combined-author-hierarchy-native-assertions.js';
import {automaticTopicsFixtureInput} from './automatic-topics-fixture-input.js';
import {numericMatcher} from './semantic-native-assertions.js';
const code=c=>e=>e?.code===c,actor={id:'demo-alex',type:'human',demo:true};
export const AUTOMATIC_TOPICS_NATIVE_CAPABILITY='invented-automatic18-pairing-capability';
const tables=['meta','id_registry','topics','discussions','sources','embeddings','source_links','topic_memberships','fixed_references','contributions','revisions','operation_receipts','import_ledger','runtime_state','command_receipts','runtime_source_stamps','ingestion_jobs'];
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
const transactionPort=tx=>({query:(...args)=>tx.query(...args),transaction:work=>work(tx)});
async function canonical(db){const out={};for(const table of tables){const r=await one(db,`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text wire FROM canonical_v4.${table} t`);out[table]=createHash('sha256').update(r.wire).digest('hex');}return out;}
const registered=db=>db.query('SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version').then(r=>r.rows);
async function rollback(db,work){const marker=Error('Rollback owned migration proof');let restored=false;try{await db.transaction(async tx=>{await work(tx);throw marker;});}catch(e){if(e!==marker)throw e;restored=true;}assert(restored);}
export function createAutomaticTopicsMigrationNativeAssertions({check}){
 let baseline=null,legacyPacket=null,legacyResult=null,expectedHead=null,expectedPolicy=null,upgradeResult=null,installed=null,app=null;
 const appRole=owner=>Object.freeze({
  query:(sql,args=[])=>owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE murmingle_app');return tx.query(sql,args);}),
  transaction:work=>owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE murmingle_app');return work(tx);}),
 });
 async function before({owner}){
  await check(39,async()=>{
   baseline=await canonical(owner);const old=await registered(owner),m17=await readCanonicalV4MigrationManifest('hierarchy17'),m18=await readCanonicalV4MigrationManifest('hierarchy18');
   assert.equal(m18.length,18);assert.deepEqual(m18.slice(0,17),m17);
   await rollback(owner,async tx=>{const r=await migrateCanonicalV4(transactionPort(tx),'hierarchy18');assert.equal(r.schemaVersion,18);assert.equal((await registered(tx)).length,18);assert.deepEqual(await canonical(tx),baseline);});
   assert.deepEqual(await registered(owner),old);assert.deepEqual(await canonical(owner),baseline);
  });
  await check(40,async()=>{
   const old=await registered(owner);await rollback(owner,async tx=>{const r=await installAutomaticTopics({database:transactionPort(tx),expectedHeadRevision:0,expectedPolicyRevision:0,policy:{defaultMaxDepth:1,overrides:[]}});
    assert.equal(r.schemaVersion,18);assert.equal(r.headRevision,1);assert.equal(r.policyRevision,1);assert.deepEqual(await canonical(tx),baseline);});
   assert.deepEqual(await registered(owner),old);assert.deepEqual(await canonical(owner),baseline);
  });
 }
 async function after({owner,worker,generation}){
  const header=()=>one(app??owner,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton');
  const head=()=>one(owner,'SELECT revision::integer revision,matcher_hash FROM canonical_v4.semantic_installation WHERE singleton');
  const policy=()=>one(owner,'SELECT revision::integer revision,default_max_depth,overrides FROM canonical_v4.semantic_owner_policy WHERE singleton');
  await check(41,async()=>{
   installed=await loadInstalledHierarchyMatcher();expectedHead=await head();expectedPolicy=await policy();const before=await canonical(owner),rows=await registered(owner);
   await assert.rejects(upgradeAutomaticTopics({database:owner,expectedHeadRevision:expectedHead.revision+1,expectedPolicyRevision:expectedPolicy.revision}),code('conflict'));
   assert.deepEqual(await canonical(owner),before);assert.deepEqual(await registered(owner),rows);
  });
  await check(42,async()=>{
   app=appRole(owner);legacyPacket={actorId:actor.id,requestId:'automatic18-legacy-original',expected:await header(),command:{type:'create-root',topicId:'topic-semantic-manual',body:'A saved public discussion predates automatic topic installation.',originSourceId:null}};
   legacyResult=await runtime({database:app,schemaProfile:'hierarchy17'}).command(legacyPacket);baseline=await canonical(owner);
   upgradeResult=await upgradeAutomaticTopics({database:owner,expectedHeadRevision:expectedHead.revision,expectedPolicyRevision:expectedPolicy.revision});
   assert.equal(upgradeResult.schemaVersion,18);assert.deepEqual(await canonical(owner),baseline);assert.deepEqual(await head(),expectedHead);assert.deepEqual(await policy(),expectedPolicy);
   assert.equal((await registered(owner)).length,18);assert.deepEqual(await runtime({database:app,schemaProfile:'hierarchy18'}).command(legacyPacket),legacyResult);assert.deepEqual(await canonical(owner),baseline);
  });
  await check(43,async()=>{
   const rows=await registered(owner),queues=(await owner.query('SELECT event_id::text,generation,root_id FROM canonical_v4.unified_search_events ORDER BY event_id')).rows;
   assert.deepEqual(await upgradeAutomaticTopics({database:owner,expectedHeadRevision:expectedHead.revision,expectedPolicyRevision:expectedPolicy.revision}),upgradeResult);
   assert.deepEqual(await registered(owner),rows);assert.deepEqual(await canonical(owner),baseline);assert.deepEqual((await owner.query('SELECT event_id::text,generation,root_id FROM canonical_v4.unified_search_events ORDER BY event_id')).rows,queues);
  });
  await check(44,async()=>{
   assert.equal((await runtime({database:app,schemaProfile:'hierarchy18'}).health()).schemaVersion,18);
   assert.equal((await ingestion({database:worker,schemaProfile:'hierarchy18'}).health()).schemaVersion,18);
   for(const profile of ['legacy9','hierarchy16','hierarchy17'])await assert.rejects(runtime({database:app,schemaProfile:profile}).health());
   assert.deepEqual(await canonical(owner),baseline);
  });
  await check(45,async()=>{
   for(const role of ['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'])for(const sql of ["SELECT * FROM canonical_v4.named_subject_heads","SELECT canonical_v4.named_attach_root_context('a','b','c','d','e','{}')"])
    await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE murmingle_app');return upgradeAutomaticTopics({database:transactionPort(tx),expectedHeadRevision:expectedHead.revision,expectedPolicyRevision:expectedPolicy.revision});}),code('forbidden'));
  });
  await check(46,async()=>{
   const maintenance=createUnifiedTopicSearchMaintenance({database:worker});for(let i=0;i<8;i++){const tasks=await maintenance.tasks(JSON.stringify({generation}));if(!tasks.length)break;for(const eventId of tasks)await maintenance.process(JSON.stringify({generation,eventId}));}
   const config={host:'127.0.0.1',port:4174,origin:'chrome-extension://'+'a'.repeat(32),capability:AUTOMATIC_TOPICS_NATIVE_CAPABILITY};let serial=0;
   const application=await openDormantPostgresApplication({config,canonicalDatabase:app,hierarchicalTopics:true,automaticTopics:true,
    databasePath:fileURLToPath(new URL('../data/automatic18-unused.sqlite',import.meta.url)),nextId:kind=>'automatic18-http-'+kind+'-'+(++serial),now:()=> '2026-10-29T00:00:00.000Z',ai:{dispose(){},restore:async()=>false}});
   try{
   const handle=application.handle;
   const client=createLocalServiceClient({fetchImpl:async(url,o)=>{const u=new URL(url),r=await handle({method:o.method,url:u.pathname,headers:{...o.headers,host:'127.0.0.1:4174',origin:config.origin},body:o.body});return new Response(r.body,{status:r.status,headers:r.headers});},getToken:()=>config.capability});
   const oldRequest=(path,body)=>handle({method:'POST',url:path,headers:{host:'127.0.0.1:4174',origin:config.origin,authorization:'Bearer '+config.capability,'content-type':'application/json'},body:JSON.stringify(body)});
   const oldCaps=await oldRequest('/v1/semantic/capabilities',{});assert.equal(oldCaps.status,200);assert.deepEqual(JSON.parse(oldCaps.body),{protocol:'semantic-topics/v1'});
   const oldTopics=await oldRequest('/v1/semantic/topics',{});assert.equal(oldTopics.status,200);assert(JSON.parse(oldTopics.body).topics.length>0);
   assert.equal((await client.semanticCapabilities()).protocol,'semantic-topics/v2');
   const legacyRoot=await client.command(await header(),{type:'create-root',topicId:'topic-semantic-manual',body:'An older client can still start its canonical discussion.',originSourceId:null},actor.id);
   const legacyId=legacyRoot.result.contributionId;assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_root_contexts WHERE root_id=$1',[legacyId])).n,0);
   const oldReply=await client.command(await header(),{type:'reply',discussionId:'discussion-semantic-manual',rootId:legacyId,replyToId:legacyId,body:'Reply from an older client.',originSourceId:null},actor.id);
   assert.equal((await one(owner,'SELECT root_id FROM canonical_v4.contributions WHERE id=$1',[oldReply.result.contributionId])).root_id,legacyId);
   const originalView=await client.discussion('topic-semantic-manual');assert(originalView.roots.some(r=>r.id===legacyResult.result.contributionId));
   assert(originalView.roots.find(r=>r.id===legacyId).replies.some(r=>r.id===oldReply.result.contributionId));
   const rootId=legacyResult.result.contributionId,nodeId='legacy-topic-semantic-manual';assert((await client.semanticSearch({query:'Invented',limit:20,cursor:null})).topics.some(t=>t.nodeId===nodeId));
   const v=await client.semanticTarget({nodeId,rootId,targetId:rootId});assert.equal(v.topic.id,'topic-semantic-manual');
   const reply=await client.command(await header(),{type:'reply',discussionId:v.discussionId,rootId,replyToId:rootId,originSourceId:null,body:'The original conversation stays open after the upgrade.',semanticTarget:{nodeId,topicId:v.topic.id,rootRevision:v.rootRevision,targetRevision:v.targetRevision}},actor.id);
   assert((await client.semanticThread({nodeId,rootId,limit:20,cursor:null})).root.replies.some(r=>r.id===reply.result.contributionId));
   }finally{await application.close();}
  });
  await check(47,async()=>{
   const rows=await registered(owner),before=await canonical(owner);await rollback(owner,async tx=>{await tx.query("UPDATE canonical_v4.schema_migrations SET hash=repeat('a',64) WHERE version=18");await assert.rejects(migrateCanonicalV4(transactionPort(tx),'hierarchy18'));});
   assert.deepEqual(await registered(owner),rows);assert.deepEqual(await canonical(owner),before);
  });
  let numeric;
  await check(48,async()=>{
   // Reuse workerB through a FIFO adapter: the original owned session rejects
   // overlapping commands, while the production binding uses a bounded pool.
   // This proves real SQL wiring and physical drains, not pool/load or real E5.
   let tail=Promise.resolve(),opened=0,closed=0;
   const enqueue=work=>{const original=tail.then(work);tail=original.then(()=>undefined,()=>undefined);return original;};
   const database={query:(...args)=>enqueue(()=>worker.query(...args)),transaction:work=>enqueue(()=>worker.transaction(work))};
   const running=await openInstalledHierarchyRuntimeForTest({database,referenceMatcher:{represent:()=>assert.fail('Empty B must not represent a new claim')},nextId:kind=>'automatic18-worker-'+kind,now:()=> '2026-10-29T00:00:00.000Z',automaticTopics:true,workerOptions:{idleDelayMs:1000}},
    {openResources:options=>openHierarchyWorkerResourcesForTest(options,{loadInstalled:loadInstalledHierarchyMatcher,
     openEncoder:async()=>{opened++;return {modelId:'e5-small-q8-browser-main-prefix-v1',embed:()=>assert.fail('Empty B must not encode text'),close:async()=>{closed++;}};},
     createIngestionRepository:ingestion,createSemanticRepository:createCanonicalV4SemanticRepository,createStoredRepository:createCanonicalV4SemanticSourceRepository})});
   try{const deadline=performance.now()+3000;while(running.describe().automatic.phase!=='waiting'&&performance.now()<deadline)await new Promise(done=>setTimeout(done,5));
    const state=running.describe().automatic;assert.equal(state.phase,'waiting');assert.equal(state.counts.failures,0);assert.equal(state.counts.conflicts,0);assert.equal(opened,1);
   }finally{await running.close();await tail;}
   assert.equal(closed,1);
   numeric=numericMatcher('joined-automatic18');const semantic=createCanonicalV4SemanticRepository({database:owner}),registered=await semantic.registerMatcher(numeric);
   await semantic.activateMatcher({matcherIdentityHash:registered.matcherIdentityHash,expectedRevision:(await head()).revision});
   const identity=await one(app,'SELECT current_user role');assert.equal(identity.role,'murmingle_app');assert.equal((await ingestion({database:worker,schemaProfile:'hierarchy18'}).health()).schemaVersion,18);
  });
  await runCombinedAuthorHierarchyNativeAssertions({owner,worker,app,generation,matcher:numeric,schemaProfile:'hierarchy18',alreadyInstalled:true,retireSchema:false,
   publicationInput:sourceIds=>automaticTopicsFixtureInput({database:owner,generation,matcher:numeric,sourceIds}),check:(index,body)=>check(49+index,body),
   afterRetirement:async()=>{await createCanonicalV4SemanticRepository({database:owner}).activateMatcher({matcherIdentityHash:installed.descriptor.matcherIdentityHash,expectedRevision:(await head()).revision});
    assert.equal((await head()).matcher_hash,installed.descriptor.matcherIdentityHash);assert.equal((await ingestion({database:worker,schemaProfile:'hierarchy18'}).health()).schemaVersion,18);},
  });
 }
 return Object.freeze({before,after});
}
