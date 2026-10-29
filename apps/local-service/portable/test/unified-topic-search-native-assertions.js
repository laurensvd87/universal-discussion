// Owned PostgreSQL public-search composition. Invented content/coordinates;
// actual app/worker/HTTP/canonical posting ports, no live connection or model.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createUnifiedTopicSearchMaintenance} from '../canonical-v4/unified-topic-search-maintenance.js';
import {createCanonicalV4ReadFacade} from '../canonical-v4/read-facade.js';
import {createCanonicalV4RuntimeRepository} from '../canonical-v4/runtime-repository.js';
import {createCanonicalV4LifecycleRepository} from '../canonical-v4/lifecycle-repository.js';
import {createAutomaticAuthorContextRepository} from '../canonical-v4/automatic-author-context-repository.js';
import {createPostgresCanonicalService} from '../../src/application/create-postgres-canonical-service.js';
import {createRequestHandler} from '../../src/http/request-handler.js';
import {createLocalServiceClient} from '../../../../spikes/topic-resolution/browser/core/local-service-client.js';
import {createCanonicalV4SemanticMetadataRepository} from '../canonical-v4/semantic-metadata-repository.js';
import {projectSemanticTopicDirectory} from '../../src/domain/semantic-topic-directory.js';
const code=c=>e=>e?.code===c,actor={id:'demo-alex',type:'human',demo:true};
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
async function bounded(p){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned search operation timed out')),1200);})]);}finally{clearTimeout(timer);}}
export function unifiedSearchPlanUses(plan,names){return !!plan&&typeof plan==='object'&&(names.includes(plan['Index Name'])||Object.values(plan).some(child=>child&&typeof child==='object'&&(Array.isArray(child)?child.some(v=>unifiedSearchPlanUses(v,names)):unifiedSearchPlanUses(child,names))));}
function requireIndex(plan,names,code){if(!unifiedSearchPlanUses(plan,names))throw Object.assign(Error('Owned public index path unavailable'),{code});}
export async function runUnifiedTopicSearchNativeAssertions(scope){
 const {owner,app,worker,observer,generation,sourceIds,check}=scope,roots=[],replies=[];let serial=0,topicId,legacy,first,client,selected;
 const runtime=createCanonicalV4RuntimeRepository({database:app}),life=createCanonicalV4LifecycleRepository({database:app}),maintenance=createUnifiedTopicSearchMaintenance({database:worker});
 const expected=()=>one(app,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton');
 const reads=createCanonicalV4ReadFacade({database:app,automaticTopics:true,unifiedTopicSearch:true});
 const search=(query='',limit=50,cursor=null)=>reads.semanticSearch({query,limit,cursor});
 async function post(){const id=(await runtime.command({actorId:actor.id,requestId:'unified-native-root-request-'+(++serial),expected:await expected(),
  command:{type:'create-root',topicId,body:'A public older conversation keeps its original canonical destination.',originSourceId:null}})).result.contributionId;roots.push(id);return id;}
 async function drain(){for(let i=0;i<256;i++){const tasks=await maintenance.tasks(JSON.stringify({generation}));if(!tasks.length)return;
  for(const eventId of tasks)assert.notEqual(await maintenance.process(JSON.stringify({generation,eventId})),'busy');}assert.fail('Public search did not drain');}
 async function all(limit){const out=[];let cursor=null;for(let i=0;i<256;i++){const p=await search('',limit,cursor);out.push(...p.topics);cursor=p.nextCursor;if(cursor===null)return out;}assert.fail('Public search did not page');}
 const target=(root=first,nodeId=legacy)=>reads.semanticTarget({nodeId,rootId:root,targetId:root});
 const replyCommand=(view,body)=>({type:'reply',discussionId:view.discussionId,rootId:view.root.id,replyToId:view.root.id,originSourceId:null,body,
  semanticTarget:{nodeId:view.nodeId,topicId:view.topic.id,rootRevision:view.rootRevision,targetRevision:view.targetRevision}});
 await check(18,async()=>{
  const before=await expected(),manifest=(await owner.query('SELECT * FROM canonical_v4.schema_migrations ORDER BY version')).rows;
  await owner.exec(await readFile(new URL('../canonical-v4/drafts/unified-topic-search.sql',import.meta.url),'utf8'));
  assert.deepEqual(await expected(),before);assert.deepEqual((await owner.query('SELECT * FROM canonical_v4.schema_migrations ORDER BY version')).rows,manifest);
  selected=await createAutomaticAuthorContextRepository({database:app}).editor(JSON.stringify({generation,sourceId:sourceIds[1]}));topicId=selected.topicId;legacy='legacy-'+topicId;
 });
 await check(19,async()=>{
  await drain();const result=await all(50),topology=(await owner.query('SELECT n.node_id,n.path FROM canonical_v4.semantic_nodes n JOIN canonical_v4.semantic_installation i ON i.singleton AND i.matcher_hash=n.matcher_hash')).rows;
  const metadata=await createCanonicalV4SemanticMetadataRepository({database:app}).topics({generation}),labels=projectSemanticTopicDirectory(metadata,{revision:0,defaultMaxDepth:8,overrides:[]}).topics;
  for(const n of topology){const found=result.find(t=>t.nodeId===n.node_id);assert(found);assert.deepEqual(found.path,n.path);assert.equal(found.label,labels.find(t=>t.id===n.node_id).title);}
  assert(result.some(t=>t.nodeId==='subject-'+selected.scope.id));assert((await search('Games')).topics.some(t=>t.nodeId==='games'));
  const old=(await owner.query("SELECT DISTINCT d.topic_id FROM canonical_v4.contributions c JOIN canonical_v4.discussions d ON d.id=c.discussion_id WHERE c.root_id IS NULL AND NOT c.withdrawn AND c.visibility='local-public' AND NOT EXISTS(SELECT 1 FROM canonical_v4.named_root_contexts WHERE root_id=c.id) AND NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_root_edges WHERE root_id=c.id)")).rows;
  for(const row of old)assert(result.some(t=>t.nodeId==='legacy-'+row.topic_id));
 });
 await check(20,async()=>{
  first=await post();await drain();const t=(await search()).topics.find(t=>t.nodeId===legacy);assert(t&&t.occupied&&t.human);assert.deepEqual(t.path,[legacy]);
  const canonical=await one(owner,'SELECT title FROM canonical_v4.topics WHERE id=$1',[topicId]);assert.equal(t.label,canonical.title);
  const view=await target();assert.equal(view.topic.id,topicId);assert.equal(view.root.id,first);assert.equal(view.discussionId,'discussion-semantic-manual');
  assert((await reads.semanticFeed({nodeId:legacy,limit:20,cursor:null})).roots.some(v=>v.root.id===first));
 });
 await check(21,async()=>{
  const large=await all(50),small=await all(2);assert.deepEqual(small,large);assert.equal(new Set(small.map(t=>t.nodeId)).size,small.length);
  assert(small.some(t=>t.nodeId===legacy)&&small.some(t=>t.nodeId==='games')&&small.some(t=>t.nodeId==='subject-'+selected.scope.id));
  const firstPage=await search('',1);assert(firstPage.nextCursor);await assert.rejects(search('different',1,firstPage.nextCursor),code('conflict'));
 });
 await check(22,async()=>{
  const service=createPostgresCanonicalService({reads,runtime,lifecycle:life,authoredTopics:createAutomaticAuthorContextRepository({database:app}),semanticDiscussions:true,automaticTopics:true});
  const config={hostHeader:'127.0.0.1:4174',origin:'chrome-extension://'+'a'.repeat(32),capability:'invented-unified-search-capability'},handler=createRequestHandler({config,service});
  client=createLocalServiceClient({fetchImpl:async(url,options)=>{const u=new URL(url),r=await handler({method:options.method,url:u.pathname,headers:{...options.headers,host:config.hostHeader,origin:config.origin},body:options.body});return new Response(r.body,{status:r.status,headers:r.headers});},getToken:()=>config.capability});
  assert((await client.semanticSearch({query:'Games',limit:20,cursor:null})).topics.some(t=>t.nodeId==='games'));
  const view=await client.semanticTarget({nodeId:legacy,rootId:first,targetId:first}),packet={actorId:actor.id,requestId:'unified-native-exact-reply',expected:await expected(),command:replyCommand(view,'Reply through the original saved discussion route.')};
  const saved=await runtime.command(packet);replies.push(saved.result.contributionId);assert.deepEqual(await runtime.command(packet),saved);
  const thread=await client.semanticThread({nodeId:legacy,rootId:first,limit:20,cursor:null});assert(thread.root.replies.some(v=>v.id===saved.result.contributionId));
  const stored=await one(owner,'SELECT discussion_id,root_id FROM canonical_v4.contributions WHERE id=$1',[saved.result.contributionId]);assert.equal(stored.discussion_id,view.discussionId);assert.equal(stored.root_id,first);
 });
 await check(23,async()=>{
  const view=await target(),before=(await owner.query('SELECT count(*)::integer n FROM canonical_v4.contributions')).rows;
  await assert.rejects(runtime.command({actorId:actor.id,requestId:'unified-native-forged-route',expected:await expected(),command:{...replyCommand(view,'Cannot move a discussion.'),semanticTarget:{...replyCommand(view,'x').semanticTarget,nodeId:'legacy-unrelated-topic'}}}),code('conflict'));
  assert.deepEqual((await owner.query('SELECT count(*)::integer n FROM canonical_v4.contributions')).rows,before);
  assert((await search('Orion')).topics.some(t=>t.nodeId==='subject-'+selected.scope.id));
 });
 await check(24,async()=>{
  for(const role of ['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'])for(const sql of ["SELECT * FROM canonical_v4.unified_search_directory","SELECT canonical_v4.unified_derived_reply_member('g','n','r',1,'t','d')"])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
  await assert.rejects(app.query('SELECT canonical_v4.unified_search_tasks($1)',[generation]),code('42501'));
  await assert.rejects(worker.query('SELECT * FROM canonical_v4.unified_search_topics($1,ARRAY[]::text[],NULL,20)',[generation]),code('42501'));
  await assert.rejects(app.query('SELECT * FROM canonical_v4.unified_search_topics($1,ARRAY[NULL]::text[],NULL,20)',[generation]),code('P1303'));
  const searchSql="SELECT * FROM canonical_v4.unified_search_directory WHERE scope_kind='legacy' AND search@@to_tsquery('simple','manual:*')";
  const feedSql="SELECT * FROM canonical_v4.contributions WHERE discussion_id='discussion-semantic-manual' AND root_id IS NULL AND NOT withdrawn AND visibility='local-public' ORDER BY ordinal DESC LIMIT 2";
  await owner.transaction(async tx=>{await tx.exec('SET LOCAL enable_seqscan=off');
   requireIndex((await tx.query('EXPLAIN (FORMAT JSON) '+searchSql)).rows,['unified_search_directory_terms','unified_search_directory_order','unified_search_directory_pkey'],'UNIFIED_SEARCH_INDEX');
   requireIndex((await tx.query('EXPLAIN (FORMAT JSON) '+feedSql)).rows,['unified_legacy_feed_order','contributions_discussion','contributions_ordinal_key'],'UNIFIED_FEED_INDEX');
   requireIndex((await tx.query('EXPLAIN (FORMAT JSON) '+feedSql.replace('SELECT *','SELECT discussion_id,ordinal'))).rows,['unified_legacy_feed_order'],'UNIFIED_FEED_PROBE');
  });
  // On the tiny fixture the planner may prefer a narrow B-tree. Independently
  // prove GIN eligibility with only the NEW directory's competing indexes
  // removed in a rollback. No production schema, query or planner default changes.
  const rollback=Error('Rollback private index isolation');let restored=false;
  try{await owner.transaction(async tx=>{await tx.exec(`SET LOCAL enable_seqscan=off;DROP INDEX canonical_v4.unified_search_directory_order;
    ALTER TABLE canonical_v4.unified_search_directory DROP CONSTRAINT unified_search_directory_pkey;`);
   requireIndex((await tx.query('EXPLAIN (FORMAT JSON) '+searchSql)).rows,['unified_search_directory_terms'],'UNIFIED_GIN_INDEX');throw rollback;
  });}catch(e){if(e!==rollback)throw e;restored=true;}assert(restored);
  const restoredIndexes=await one(owner,"SELECT to_regclass('canonical_v4.unified_search_directory_order') IS NOT NULL AND to_regclass('canonical_v4.unified_search_directory_pkey') IS NOT NULL ok");assert(restoredIndexes.ok);
 });
 await check(25,async()=>{
  const ready=defer(),release=defer(),held=observer.transaction(async tx=>{await tx.query('UPDATE canonical_v4.unified_search_clock SET revision=revision WHERE singleton');ready.resolve();await release.promise;});held.catch(e=>ready.resolve({error:e}));
  let posting=null,primary=null;try{const value=await ready.promise;if(value?.error)throw value.error;posting=post();await bounded(posting);
   assert((await bounded(search())).topics.some(t=>t.nodeId===legacy));const tasks=await maintenance.tasks(JSON.stringify({generation}));assert(tasks.length);
   assert.equal(await bounded(maintenance.process(JSON.stringify({generation,eventId:tasks[0]}))),'busy');
  }catch(e){primary=e;}finally{release.resolve();for(const work of [held,posting])if(work)try{await work;}catch(e){primary??=e;}}
  if(primary)throw primary;await drain();
 });
 await check(26,async()=>{
  const stamp=await reads.semanticStamp();await post();assert.notEqual((await reads.semanticStamp()).revision,stamp.revision);await drain();
  const indexed=await reads.semanticStamp();await life.command(await expected(),{type:'withdraw',contributionId:roots.at(-1)},actor);
  assert(!(await reads.semanticFeed({nodeId:legacy,limit:50,cursor:null})).roots.some(v=>v.root.id===roots.at(-1)),'withdrawal is immediate before maintenance');await drain();
  assert.notEqual((await reads.semanticStamp()).revision,indexed.revision);
 });
 return async()=>check(27,async()=>{
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.sources')).n,0);await drain();
  assert((await search()).topics.some(t=>t.nodeId===legacy));assert.equal((await target()).root.id,first);
  assert((await client.semanticSearch({query:'Orion Console Pro',limit:20,cursor:null})).topics.some(t=>t.nodeId==='subject-'+selected.scope.id));
  for(const root of roots.slice(0,-1))await life.command(await expected(),{type:'withdraw',contributionId:root},actor);
  const ids=[...roots,...replies];await owner.transaction(async tx=>{for(const table of ['command_receipts','revisions'])await tx.query('DELETE FROM canonical_v4.'+table+' WHERE contribution_id=ANY($1::text[])',[ids]);
   await tx.query('DELETE FROM canonical_v4.contributions WHERE id=ANY($1::text[])',[ids]);await tx.query('DELETE FROM canonical_v4.id_registry WHERE id=ANY($1::text[])',[ids]);});
  await owner.exec(`DROP TRIGGER unified_search_root_change ON canonical_v4.contributions;DROP TRIGGER unified_search_root_delete ON canonical_v4.contributions;
   DROP TRIGGER unified_search_static_change ON canonical_v4.semantic_root_edges;DROP TRIGGER unified_search_authored_change ON canonical_v4.named_root_contexts;
   DROP TRIGGER unified_search_caption_change ON canonical_v4.topics;DROP TRIGGER unified_search_repair_deleted ON canonical_v4.unified_search_roots;
   DROP FUNCTION canonical_v4.named_reply_member(text,text,text,bigint,text,text);ALTER FUNCTION canonical_v4.unified_derived_reply_member(text,text,text,bigint,text,text) RENAME TO named_reply_member;
   DROP TABLE canonical_v4.unified_search_directory,canonical_v4.unified_search_roots,canonical_v4.unified_search_events,canonical_v4.unified_search_clock;
   DROP INDEX canonical_v4.unified_legacy_feed_order;
   DROP FUNCTION canonical_v4.unified_schedule_search(),canonical_v4.unified_public_label(text),canonical_v4.unified_search_tasks(text),canonical_v4.unified_process_search_event(text,bigint),
    canonical_v4.unified_after(boolean,bigint,text,text,jsonb),canonical_v4.unified_search_topics(text,text[],jsonb,integer),canonical_v4.unified_read_legacy_feed(text,text,bigint,integer),canonical_v4.unified_read_revision();`);
 });
}
