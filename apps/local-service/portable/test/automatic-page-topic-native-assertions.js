// Actual owned SQL/application/HTTP checks. Invented public-web material only;
// no new model, capture, provider, process, live connection or source inference.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {types} from 'node:util';
import {createAutomaticAuthorContextRepository} from '../canonical-v4/automatic-author-context-repository.js';
import {createAutomaticTopicFeedRepository} from '../canonical-v4/automatic-topic-feed-repository.js';
import {createAutomaticNamedSubjectRepository} from '../canonical-v4/automatic-named-subject-repository.js';
import {createCanonicalV4ReadFacade} from '../canonical-v4/read-facade.js';import {createCanonicalV4RuntimeRepository} from '../canonical-v4/runtime-repository.js';
import {createCanonicalV4LifecycleRepository} from '../canonical-v4/lifecycle-repository.js';
import {createPostgresCanonicalService} from '../../src/application/create-postgres-canonical-service.js';import {createRequestHandler} from '../../src/http/request-handler.js';
import {createLocalServiceClient} from '../../../../spikes/topic-resolution/browser/core/local-service-client.js';
import {runPublishedTopicEvidenceNativeAssertions} from './published-topic-evidence-native-assertions.js';
import names from './automatic-page-topic-native-cases.json' with {type:'json'};
export const AUTOMATIC_PAGE_TOPIC_NATIVE_CASES=Object.freeze([...names]);
const actor={id:'demo-alex',type:'human',demo:true},code=c=>e=>e?.code===c;
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
async function check(cases,index,work){const row={name:names[index],status:'running'};cases.push(row);try{await work();row.status='passed';}catch(e){row.status='failed';
 const d=e&&!types.isProxy(e)&&Object.getOwnPropertyDescriptor(e,'code'),raw=d&&Object.hasOwn(d,'value')?d.value:null;
 const safe=['42601','42702','42883','23503','23505','23514','42501','P1301','P1303','P1304','ERR_ASSERTION','invalid','invalid-request','invalid-response','conflict','storage-failure','storage-corrupt','unavailable'].includes(raw)?raw.toUpperCase().replaceAll('-','_'):'UNKNOWN';
 throw Object.assign(Error('Owned page-topic check did not complete'),{code:`PAGE_${index}_${safe}`});}}
async function within(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned page-topic operation timed out')),1200);})]);}finally{clearTimeout(timer);}}

export async function runAutomaticPageTopicNativeAssertions(scope){
 const {owner,worker,app,observer,generation,sourceIds,publicationInput,prepareFixtureSources,changeFixtureTitle,cases}=scope;
 let serial=0,oldPage=null,oldNamed=null,atlas=null,parent=null,original=null,aiRoot=null,harbor=null,currentRoot=null,heldRoot=null,legacyRoot=null;
 const roots=[],replies=[],author=createAutomaticAuthorContextRepository({database:app,nextId:()=>`page-member-root-${++serial}`}),reads=createCanonicalV4ReadFacade({database:app,automaticTopics:true}),
  runtime=createCanonicalV4RuntimeRepository({database:app,nextId:()=>`page-member-reply-${++serial}`}),lifecycle=createCanonicalV4LifecycleRepository({database:app});
 const service=createPostgresCanonicalService({reads,runtime,lifecycle,semanticDiscussions:true,authoredTopics:author,automaticTopics:true});
 const config={hostHeader:'127.0.0.1:4174',origin:'chrome-extension://'+'a'.repeat(32),capability:'invented-page-topic-http-capability'},handle=createRequestHandler({config,service});
 const client=createLocalServiceClient({getToken:()=>config.capability,fetchImpl:async(url,options)=>{const u=new URL(url),r=await handle({method:options.method,url:u.pathname,headers:{...options.headers,host:config.hostHeader,origin:config.origin},body:options.body});return new Response(r.body,{status:r.status,headers:r.headers});}});
 const expected=()=>one(owner,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton'),editor=sourceId=>client.authorContext({sourceId}).then(v=>v.context);
 const maintenance=createAutomaticTopicFeedRepository({database:worker}),feed=createAutomaticTopicFeedRepository({database:app}),subjects=createAutomaticNamedSubjectRepository({database:worker});
 const scopeId=uuid=>'subject-'+uuid,pageId=id=>'page-'+id,has=(nodeId,rootId)=>feed.contains(JSON.stringify({generation,nodeId,rootId}));
 async function drain(){for(let i=0;i<256;i++){const tasks=await maintenance.tasks(JSON.stringify({generation}));if(!tasks.length){assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_feed_events')).n,0);return;}
  for(const eventId of tasks)assert.notEqual(await maintenance.process(JSON.stringify({generation,eventId})),'busy');}assert.fail('Bounded page-topic cohort did not settle');}
 async function pagePost(context){const r=await client.command(await expected(),{type:'create-root',topicId:context.topicId,body:'An exact page discussion '+(++serial),originSourceId:context.pageScope.sourceId,authorScope:context.pageScope},actor.id);
  roots.push(r.result.contributionId);return r.result.contributionId;}
 const caption=rootId=>author.root(JSON.stringify({generation,rootId}));
 async function reindex(rootId){const r=await one(owner,"INSERT INTO canonical_v4.named_feed_events(generation,kind,root_id,scope_kind,scope_id) SELECT generation,'root',root_id,scope_kind,scope_id FROM canonical_v4.named_root_contexts WHERE root_id=$1 RETURNING event_id::text id",[rootId]);
  return maintenance.process(JSON.stringify({generation,eventId:r.id}));}
 const search=query=>client.semanticSearch({query,limit:50,cursor:null});
 const state=()=>one(owner,`SELECT (SELECT count(*)::integer FROM canonical_v4.contributions) contributions,(SELECT count(*)::integer FROM canonical_v4.command_receipts) receipts,
  (SELECT count(*)::integer FROM canonical_v4.named_page_root_material) material,(SELECT revision::text FROM canonical_v4.runtime_state WHERE singleton) revision`);
 const a=sourceIds[1],b=sourceIds[2],c=sourceIds[3],d=sourceIds[4];
 await check(cases,0,async()=>{
  const existing=await editor(c);assert.equal(existing.scope.kind,'named');oldNamed=existing.scope.id;legacyRoot=await pagePost(existing);
  const before=await expected(),contexts=(await owner.query('SELECT * FROM canonical_v4.named_root_contexts ORDER BY root_id')).rows;
  await owner.exec(await readFile(new URL('../canonical-v4/drafts/automatic-page-topic-membership.sql',import.meta.url),'utf8'));
  assert.deepEqual(await expected(),before);assert.deepEqual((await owner.query('SELECT * FROM canonical_v4.named_root_contexts ORDER BY root_id')).rows,contexts);
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_page_root_material')).n,0);await drain();
  assert.equal(await has(scopeId(oldNamed),legacyRoot),false);assert.equal(await has(pageId(c),legacyRoot),true);
 });
 await check(cases,1,async()=>{
  await changeFixtureTitle(a,'Atlas Camera Pro battery guide');await changeFixtureTitle(b,'Atlas Camera Pro screen guide');await prepareFixtureSources();
  oldPage=await editor(a);assert.equal(oldPage.scope.kind,'page');original=await pagePost(oldPage);
  const operationId='page-member-invented-completed-ai',body='A complete authored AI page insight before grouping';
  const command={type:'share-insight',topicId:oldPage.topicId,body,operationId,originSourceId:a},proof={kind:'generated-insight',operationId,actorId:actor.id,topicId:oldPage.topicId,originSourceId:a,body,rootId:null,replyToId:null,discussionId:null};
  const result=await author.shareInsight(JSON.stringify({expected:await expected(),command,actor,proof,scope:oldPage.pageScope}));aiRoot=result.result.contributionId;roots.push(aiRoot);
  const material=(await owner.query('SELECT root_id,source_id,material_digest FROM canonical_v4.named_page_root_material WHERE root_id=ANY($1::text[])',[[original,aiRoot]])).rows;
  assert.equal(material.length,2);assert(material.every(v=>v.source_id===a&&v.material_digest===oldPage.pageScope.materialDigest));
  const before=await state();await assert.rejects(client.command(await expected(),{type:'create-root',topicId:oldPage.topicId,body:'Forged material must not leave a capture',originSourceId:a,authorScope:{...oldPage.pageScope,materialDigest:'f'.repeat(64)}},actor.id),code('conflict'));assert.deepEqual(await state(),before);
  assert.equal(await has(pageId(a),original),true);
 });
 await check(cases,2,async()=>{
  await subjects.publish(JSON.stringify(await publicationInput(sourceIds)));const selected=await editor(a);assert.equal(selected.scope.kind,'named');assert.equal(selected.scope.caption,'Atlas Camera Pro');atlas=selected.scope.id;
  await drain();assert.equal(await has(scopeId(atlas),original),true);assert.equal(await has(scopeId(atlas),aiRoot),true);
  const view=await client.semanticFeed({nodeId:scopeId(atlas),limit:20,cursor:null}),row=view.roots.find(v=>v.root.id===original);assert(row);assert.equal(row.scope.kind,'page');assert.equal(row.scope.caption,oldPage.pageScope.caption);assert.equal(row.topic.id,oldPage.topicId);assert.equal(row.discussionId,'discussion-semantic-manual');
  const card=(await search('Atlas Camera Pro')).topics.find(v=>v.nodeId===scopeId(atlas));assert(card?.human&&card.occupied);
  assert.equal((await one(owner,'SELECT caption_root_id IS NULL derived FROM canonical_v4.named_topic_cards WHERE scope_kind=\'named\' AND scope_id=$1 AND caption=$2',[atlas,'Atlas Camera Pro'])).derived,true);
 });
 await check(cases,3,async()=>{
  await owner.transaction(async tx=>{const operationId='page-member-identical-material-renewal';await tx.query('UPDATE canonical_v4.operation_receipts SET operation_id=$2 WHERE source_id=$1',[a,operationId]);
   await tx.query("UPDATE canonical_v4.sources SET write_version=write_version+1,operation_id=$2,payload=jsonb_set(payload::jsonb,'{operationId}',to_jsonb($2::text))::text WHERE id=$1",[a,operationId]);});
  await prepareFixtureSources();for(let i=0;i<4;i++){assert.equal(await reindex(original),'completed');await drain();}
  assert.equal(await has(scopeId(atlas),original),true);assert.equal((await one(owner,'SELECT material_digest digest FROM canonical_v4.named_page_root_material WHERE root_id=$1',[original])).digest,oldPage.pageScope.materialDigest);
 });
 await check(cases,4,async()=>{
  await changeFixtureTitle(c,'Atlas Camera Lite battery guide');await changeFixtureTitle(d,'Atlas Camera Lite screen guide');await prepareFixtureSources();await subjects.publish(JSON.stringify(await publicationInput(sourceIds)));await drain();
  const selected=await editor(a);assert.equal(selected.scope.id,atlas);parent=(await one(owner,'SELECT parent_id::text id FROM canonical_v4.named_subject_heads WHERE subject_id=$1',[atlas])).id;assert(parent);
  assert.equal(await has(scopeId(parent),original),true);const card=(await search('Atlas Camera')).topics.find(v=>v.nodeId===scopeId(parent));assert(card?.occupied&&card.human);
  assert.deepEqual((await caption(original)).scope,{kind:'page',id:a,caption:oldPage.pageScope.caption});
 });
 await check(cases,5,async()=>{
  await changeFixtureTitle(a,'Harbor binoculars field guide');await changeFixtureTitle(b,'Harbor binoculars lens review');
  assert.equal(await has(scopeId(atlas),original),false);assert.equal(await has(scopeId(parent),original),false);
  await prepareFixtureSources();await subjects.publish(JSON.stringify(await publicationInput(sourceIds)));const now=await editor(a);assert.equal(now.scope.kind,'named');assert.equal(now.scope.caption,'Harbor binoculars');harbor=now.scope.id;
  await drain();assert.equal(await has(scopeId(harbor),original),false);assert.equal(await has(pageId(a),original),true);assert.equal((await caption(original)).scope.caption,oldPage.pageScope.caption);
  currentRoot=await pagePost(now);await drain();assert.equal(await has(scopeId(harbor),currentRoot),true);assert.equal(await has(scopeId(harbor),aiRoot),false);
  const historic=(await search('Atlas Camera Pro')).topics.find(v=>v.nodeId===pageId(a));assert.equal(historic?.label,oldPage.pageScope.caption);
 });
 await check(cases,6,async()=>{
  const input=await publicationInput(sourceIds),ready=defer(),release=defer();
  const held=worker.transaction(async tx=>{await createAutomaticNamedSubjectRepository({database:tx}).publish(JSON.stringify(input));ready.resolve();await release.promise;});held.catch(error=>ready.resolve({error}));let eventId;
  try{const value=await ready.promise;if(value?.error)throw value.error;heldRoot=await within(pagePost(await within(editor(a))));
   const e=await one(owner,"SELECT event_id::text id FROM canonical_v4.named_feed_events WHERE kind='root' AND root_id=$1",[heldRoot]);eventId=e.id;
   const observerFeed=createAutomaticTopicFeedRepository({database:observer});assert.equal(await within(observerFeed.process(JSON.stringify({generation,eventId}))),'busy');
   assert.equal(await within(has(pageId(a),heldRoot)),true);assert.equal(await has(scopeId(harbor),heldRoot),false);
  }finally{release.resolve();await held;}
  assert.equal(await maintenance.process(JSON.stringify({generation,eventId})),'completed');await drain();assert.equal(await has(scopeId(harbor),heldRoot),true);
 });
 await check(cases,7,async()=>{
  const before=(await one(owner,"SELECT root_id FROM canonical_v4.named_scope_activity WHERE generation=$1 AND scope_kind='named' AND scope_id=$2",[generation,harbor])).root_id;assert.equal(before,heldRoot);
  await lifecycle.command(await expected(),{type:'withdraw',contributionId:heldRoot},actor);
  assert.equal((await one(owner,"SELECT count(*)::integer n FROM canonical_v4.named_topic_directory WHERE scope_kind='named' AND scope_id=$1",[harbor])).n,0);
  await drain();const card=(await search('Harbor binoculars')).topics.find(v=>v.nodeId===scopeId(harbor));assert(card?.occupied&&card.human);
  assert.equal((await one(owner,"SELECT root_id FROM canonical_v4.named_scope_activity WHERE scope_kind='named' AND scope_id=$1",[harbor])).root_id,currentRoot);
  const target=await client.semanticTarget({nodeId:scopeId(harbor),rootId:currentRoot,targetId:currentRoot});
  const r=await client.command(await expected(),{type:'reply',discussionId:target.discussionId,rootId:currentRoot,replyToId:currentRoot,originSourceId:null,body:'Reply through the later confirmed topic',semanticTarget:{nodeId:target.nodeId,topicId:target.topic.id,rootRevision:target.rootRevision,targetRevision:target.targetRevision}},actor.id);replies.push(r.result.contributionId);
  assert.equal((await one(owner,'SELECT root_id FROM canonical_v4.contributions WHERE id=$1',[r.result.contributionId])).root_id,currentRoot);
  for(let i=0;i<3;i++){assert.equal(await reindex(currentRoot),'completed');await drain();}
 });
 await check(cases,8,async()=>{
  for(const role of ['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'])for(const sql of ['SELECT * FROM canonical_v4.named_page_root_material','SELECT * FROM canonical_v4.named_scope_activity',"SELECT canonical_v4.named_note_scope_activity('g','page','s','r')"])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
  assert(!JSON.stringify(await client.semanticFeed({nodeId:pageId(a),limit:20,cursor:null})).includes(oldPage.pageScope.materialDigest));
 });
 const finishEvidence=await runPublishedTopicEvidenceNativeAssertions({...scope,cases:scope.evidenceCases});
 return async()=>{await finishEvidence();return check(cases,9,async()=>{
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.sources')).n,0);assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_page_root_material')).n,0);
  await drain();assert.equal(await has(scopeId(harbor),currentRoot),false);assert.equal(await has(pageId(a),original),true);assert.equal(await has(pageId(a),currentRoot),true);
  assert(!(await search('Harbor binoculars')).topics.some(v=>v.nodeId===scopeId(harbor)));const thread=await client.semanticThread({nodeId:pageId(a),rootId:original,limit:20,cursor:null});assert.equal(thread.scope.caption,oldPage.pageScope.caption);
  for(const root of roots.filter(v=>v!==heldRoot))await lifecycle.command(await expected(),{type:'withdraw',contributionId:root},actor);
  const all=[...roots,...replies];await owner.transaction(async tx=>{for(const table of ['command_receipts','revisions'])await tx.query('DELETE FROM canonical_v4.'+table+' WHERE contribution_id=ANY($1::text[])',[all]);
   await tx.query('DELETE FROM canonical_v4.contributions WHERE id=ANY($1::text[])',[all]);await tx.query('DELETE FROM canonical_v4.id_registry WHERE id=ANY($1::text[])',[all]);});
  await owner.exec(`DROP TRIGGER named_capture_page_material ON canonical_v4.named_root_contexts;
   DROP TRIGGER named_retire_page_material ON canonical_v4.named_page_root_material;DROP TRIGGER named_schedule_activity_repair ON canonical_v4.named_scope_activity;
   ALTER TABLE canonical_v4.named_topic_directory DROP CONSTRAINT named_directory_activity;ALTER TABLE canonical_v4.named_topic_directory DROP COLUMN activity_root_id;
   DROP TABLE canonical_v4.named_scope_activity,canonical_v4.named_page_root_material;
   DROP FUNCTION canonical_v4.named_capture_page_material(),canonical_v4.named_retire_page_material(),canonical_v4.named_schedule_activity_repair(),canonical_v4.named_note_scope_activity(text,text,text,text);`);
  for(const [file,name,tag] of [['automatic-topic-feeds.sql','named_index_root_feed','index'],['automatic-topic-feeds.sql','named_process_feed_event','process'],['automatic-topic-feeds.sql','named_refresh_topic_directory','directory'],['automatic-topic-feeds.sql','named_search_topics','search'],['automatic-topic-public-reads.sql','named_process_feed_event','process']]){
   const source=await readFile(new URL('../canonical-v4/drafts/'+file,import.meta.url),'utf8'),body=source.match(new RegExp('CREATE (?:OR REPLACE )?FUNCTION canonical_v4\\.'+name+'\\([\\s\\S]*?\\n(?:END )?\\$'+tag+'\\$;','u'))[0];
   let statement=body.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');if(file==='automatic-topic-feeds.sql'&&name==='named_process_feed_event')statement=statement.replace('named_process_feed_event(','named_process_feed_core(');
   await owner.exec(statement);
  }
  await owner.exec('UPDATE canonical_v4.named_topic_directory d SET human=c.human,root_ordinal=c.root_ordinal FROM canonical_v4.named_topic_cards c WHERE (d.generation,d.scope_kind,d.scope_id,d.caption)=(c.generation,c.scope_kind,c.scope_id,c.caption)');
 });};
}
