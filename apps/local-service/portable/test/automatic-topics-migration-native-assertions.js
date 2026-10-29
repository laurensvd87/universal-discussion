// Registered migration proof on the existing second owned database. It reuses
// ownerB and workerB only; app SQL roles run with SET LOCAL on ownerB's original
// exclusive physical session. No new client, model, provider or live connection.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {migrateCanonicalV4,readCanonicalV4MigrationManifest} from '../canonical-v4/index.js';
import {installAutomaticTopics,upgradeAutomaticTopics} from '../canonical-v4/automatic-topics-installation.js';
import {createCanonicalV4RuntimeRepository as runtime} from '../canonical-v4/runtime-repository.js';
import {createCanonicalV4IngestionRepository as ingestion} from '../canonical-v4/ingestion-repository.js';
import {createCanonicalV4LifecycleRepository} from '../canonical-v4/lifecycle-repository.js';
import {createCanonicalV4ReadFacade} from '../canonical-v4/read-facade.js';
import {createCanonicalV4SemanticRepository} from '../canonical-v4/semantic-repository.js';
import {createAutomaticAuthorContextRepository} from '../canonical-v4/automatic-author-context-repository.js';
import {createUnifiedTopicSearchMaintenance} from '../canonical-v4/unified-topic-search-maintenance.js';
import {loadInstalledHierarchyMatcher} from '../../src/application/installed-hierarchy-matcher.js';
import {createPostgresCanonicalService} from '../../src/application/create-postgres-canonical-service.js';
import {createRequestHandler} from '../../src/http/request-handler.js';
import {createLocalServiceClient} from '../../../../spikes/topic-resolution/browser/core/local-service-client.js';
import {runCombinedAuthorHierarchyNativeAssertions} from './combined-author-hierarchy-native-assertions.js';
import {automaticTopicsFixtureInput} from './automatic-topics-fixture-input.js';
import {numericMatcher} from './semantic-native-assertions.js';
const code=c=>e=>e?.code===c,actor={id:'demo-alex',type:'human',demo:true};
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
   const reads=createCanonicalV4ReadFacade({database:app,automaticTopics:true,unifiedTopicSearch:true,combinedHierarchy:true}),service=createPostgresCanonicalService({reads,runtime:runtime({database:app,schemaProfile:'hierarchy18'}),lifecycle:createCanonicalV4LifecycleRepository({database:app,schemaProfile:'hierarchy18'}),authoredTopics:createAutomaticAuthorContextRepository({database:app,ownerGrouping:true,combinedHierarchy:true}),semanticDiscussions:true,automaticTopics:true});
   const config={hostHeader:'127.0.0.1:4174',origin:'chrome-extension://'+'a'.repeat(32),capability:'invented-automatic18-capability'},handle=createRequestHandler({config,service});
   const client=createLocalServiceClient({fetchImpl:async(url,o)=>{const u=new URL(url),r=await handle({method:o.method,url:u.pathname,headers:{...o.headers,host:config.hostHeader,origin:config.origin},body:o.body});return new Response(r.body,{status:r.status,headers:r.headers});},getToken:()=>config.capability});
   const rootId=legacyResult.result.contributionId,nodeId='legacy-topic-semantic-manual';assert((await client.semanticSearch({query:'Invented',limit:20,cursor:null})).topics.some(t=>t.nodeId===nodeId));
   const v=await client.semanticTarget({nodeId,rootId,targetId:rootId});assert.equal(v.topic.id,'topic-semantic-manual');
   const reply=await client.command(await header(),{type:'reply',discussionId:v.discussionId,rootId,replyToId:rootId,originSourceId:null,body:'The original conversation stays open after the upgrade.',semanticTarget:{nodeId,topicId:v.topic.id,rootRevision:v.rootRevision,targetRevision:v.targetRevision}},actor.id);
   assert((await client.semanticThread({nodeId,rootId,limit:20,cursor:null})).root.replies.some(r=>r.id===reply.result.contributionId));
  });
  await check(47,async()=>{
   const rows=await registered(owner),before=await canonical(owner);await rollback(owner,async tx=>{await tx.query("UPDATE canonical_v4.schema_migrations SET hash=repeat('a',64) WHERE version=18");await assert.rejects(migrateCanonicalV4(transactionPort(tx),'hierarchy18'));});
   assert.deepEqual(await registered(owner),rows);assert.deepEqual(await canonical(owner),before);
  });
  let numeric;
  await check(48,async()=>{
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
