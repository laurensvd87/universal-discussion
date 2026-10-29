// Real public clients/application/SQL and AI job issuer on owned PostgreSQL.
// Invented general-web material; external provider only is stubbed. No live IO.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {types} from 'node:util';
import {createAutomaticTopicFeedRepository} from '../canonical-v4/automatic-topic-feed-repository.js';
import {createAutomaticAuthorContextRepository} from '../canonical-v4/automatic-author-context-repository.js';
import {createAutomaticNamedSubjectRepository} from '../canonical-v4/automatic-named-subject-repository.js';
import {createCanonicalV4ReadFacade} from '../canonical-v4/read-facade.js';
import {createCanonicalV4RuntimeRepository} from '../canonical-v4/runtime-repository.js';
import {createCanonicalV4LifecycleRepository} from '../canonical-v4/lifecycle-repository.js';
import {createPostgresCanonicalService} from '../../src/application/create-postgres-canonical-service.js';
import {createRequestHandler} from '../../src/http/request-handler.js';import {createChatGPTRuntime} from '../../src/ai/chatgpt-runtime.js';
import {createLocalServiceClient} from '../../../../spikes/topic-resolution/browser/core/local-service-client.js';
import {createLocalAiClient} from '../../../../spikes/topic-resolution/browser/core/local-ai-client.js';
import {authoredFixtureInsightContext} from './automatic-author-insight-native-assertions.js';
import {runAutomaticPageTopicNativeAssertions} from './automatic-page-topic-native-assertions.js';
import {runNamedOwnerGroupingNativeAssertions} from './named-owner-grouping-native-assertions.js';
import names from './automatic-topic-public-native-cases.json' with {type:'json'};
export const AUTOMATIC_TOPIC_PUBLIC_NATIVE_CASES=Object.freeze([...names]);
const actor={id:'demo-alex',type:'human',demo:true},code=c=>e=>e?.code===c;
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
async function within(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned public topic check timed out')),1200);})]);}finally{clearTimeout(timer);}}
async function test(cases,index,work){let stage='CALL';const at=value=>{if(!['BUNDLE','CONTEXT','START','RESULT','PUBLISH','THREAD'].includes(value))throw new TypeError('Invalid public check stage');stage=value;};
 const row={name:names[index],status:'running'};cases.push(row);try{await work(at);row.status='passed';}catch(error){row.status='failed';
 const d=error&&!types.isProxy(error)&&Object.getOwnPropertyDescriptor(error,'code'),raw=d&&Object.hasOwn(d,'value')?d.value:null;
 const safe=['ERR_ASSERTION','42601','42702','42883','23503','23505','42501','P1301','P1001','P1221','P1223','P1291','P1293','invalid-response','invalid-request','invalid','conflict','forbidden','unauthorized','storage-failure','storage-corrupt','unavailable'].includes(raw)?raw.toUpperCase().replaceAll('-','_'):'UNKNOWN';
 throw Object.assign(Error('Owned public topic check did not complete'),{code:`PUBLIC_${index}_${stage}_${safe}`});}}

export async function runAutomaticTopicPublicNativeAssertions(scope){
 const {owner,worker,app,observer,generation,sourceIds,publicationInput,cases}=scope;let serial=0,selected=null,root=null,parent=null,reply=null,packet=null,posted=null,ai=null;
 const rootIds=[],replyIds=[],author=createAutomaticAuthorContextRepository({database:app,nextId:()=>`public-native-root-${++serial}`}),reads=createCanonicalV4ReadFacade({database:app,automaticTopics:true});
 const runtime=createCanonicalV4RuntimeRepository({database:app,nextId:()=>`public-native-reply-${++serial}`}),lifecycle=createCanonicalV4LifecycleRepository({database:app,nextId:()=>`public-native-ai-${++serial}`});
 const service=createPostgresCanonicalService({reads,runtime,lifecycle,semanticDiscussions:true,authoredTopics:author,automaticTopics:true});
 const config={hostHeader:'127.0.0.1:4174',origin:'chrome-extension://'+'a'.repeat(32),capability:'invented-owned-public-topic-capability'};
 let handle=createRequestHandler({config,service});const fetchImpl=async(url,options)=>{const u=new URL(url),r=await handle({method:options.method,url:u.pathname,headers:{...options.headers,host:config.hostHeader,origin:config.origin},body:options.body});return new Response(r.body,{status:r.status,headers:r.headers});};
 const client=createLocalServiceClient({fetchImpl,getToken:()=>config.capability}),aiClient=createLocalAiClient({fetchImpl,getToken:()=>config.capability});
 const expected=()=>one(owner,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton');
 const node=()=> 'subject-'+selected.scope.id,target=(nodeId=node(),id=root)=>client.semanticTarget({nodeId,rootId:root,targetId:id});
 async function postRoot(){const r=await author.appendRoot(JSON.stringify({actorId:actor.id,requestId:'public-native-root-request-'+(++serial),expected:await expected(),
  command:{type:'create-root',topicId:selected.topicId,body:'@AI, explain this specific product topic',originSourceId:selected.scope.sourceId},scope:selected.scope}));rootIds.push(r.result.contributionId);return r.result.contributionId;}
 const feeds=createAutomaticTopicFeedRepository({database:worker});
 async function drain(){for(let i=0;i<128;i++){const tasks=await feeds.tasks(JSON.stringify({generation}));if(!tasks.length){assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_feed_events')).n,0);return;}
  for(const eventId of tasks)assert.notEqual(await feeds.process(JSON.stringify({generation,eventId})),'busy');}assert.fail('Public fixture feed did not drain');}
 const command=(view,body)=>({type:'reply',discussionId:view.discussionId,rootId:view.root.id,replyToId:view.targetId,originSourceId:null,body,
  semanticTarget:{nodeId:view.nodeId,topicId:view.topic.id,rootRevision:view.rootRevision,targetRevision:view.targetRevision}});
 const state=()=>one(owner,`SELECT (SELECT count(*)::integer FROM canonical_v4.contributions) contributions,(SELECT count(*)::integer FROM canonical_v4.command_receipts) receipts,
  (SELECT revision::text FROM canonical_v4.runtime_state WHERE singleton) revision`);
 await test(cases,0,async()=>{
  const before=await state(),migrations=(await owner.query('SELECT * FROM canonical_v4.schema_migrations ORDER BY version')).rows;
  await owner.exec(await readFile(new URL('../canonical-v4/drafts/automatic-topic-public-reads.sql',import.meta.url),'utf8'));
  await owner.exec(await readFile(new URL('../canonical-v4/drafts/automatic-topic-replies.sql',import.meta.url),'utf8'));
  assert.deepEqual(await state(),before);assert.deepEqual((await owner.query('SELECT * FROM canonical_v4.schema_migrations ORDER BY version')).rows,migrations);
 });
 await test(cases,1,async()=>{
  assert.equal((await client.semanticCapabilities()).topicSearch,'named-topics/v1');selected=(await client.authorContext({sourceId:sourceIds[1]})).context;assert.equal(selected.scope.kind,'named');
  parent=(await one(owner,'SELECT parent_id::text id FROM canonical_v4.named_subject_heads WHERE subject_id=$1',[selected.scope.id])).id;assert(parent);
  root=await postRoot();const immediate=await client.semanticFeed({nodeId:node(),limit:20,cursor:null});assert(immediate.roots.some(v=>v.root.id===root&&v.scope.caption===selected.scope.caption));
  await drain();const search=await client.semanticSearch({query:'Orion',limit:20,cursor:null});assert(search.topics.some(v=>v.nodeId===node()));
  const view=await target();assert.equal(view.scope.caption,selected.scope.caption);assert.equal(view.topic.id,selected.topicId);assert.equal(view.discussionId,'discussion-semantic-manual');
  const pageId=sourceIds.at(-1),caption='Chef \u{1f468}\u200d\u{1f373} recipes';
  await scope.changeFixtureTitle(pageId,caption);await scope.prepareFixtureSources();
  const emoji=(await client.authorContext({sourceId:pageId})).context;assert.equal(emoji.scope.kind,'page');
  const saved=await author.appendRoot(JSON.stringify({actorId:actor.id,requestId:'public-native-joined-emoji-title',expected:await expected(),
   command:{type:'create-root',topicId:emoji.topicId,body:'An explicitly posted title with a joined emoji',originSourceId:pageId},scope:emoji.scope}));rootIds.push(saved.result.contributionId);
  await drain();const emojiPage=await client.semanticFeed({nodeId:'page-'+pageId,limit:20,cursor:null});assert(emojiPage.roots.some(v=>v.root.id===saved.result.contributionId&&v.scope.caption===caption));
  assert((await client.semanticSearch({query:'Chef',limit:20,cursor:null})).topics.some(v=>v.label===caption));
  await scope.changeFixtureTitle(pageId,'Unannounced novel product');await scope.prepareFixtureSources();
 });
 await test(cases,2,async()=>{
  const view=await target('subject-'+parent);packet={actorId:actor.id,requestId:'public-native-exact-human-reply',expected:await expected(),command:command(view,'Reply through the broader topic')};
  posted=await runtime.command(packet);reply=posted.result.contributionId;replyIds.push(reply);
  const nested=await client.command(await expected(),command(await target(node(),reply),'@Alex, reply remains at one thread level'),actor.id);replyIds.push(nested.result.contributionId);
  const rows=(await owner.query('SELECT id,discussion_id,root_id FROM canonical_v4.contributions WHERE id=ANY($1::text[])',[replyIds])).rows;
  assert(rows.every(v=>v.discussion_id===view.discussionId&&v.root_id===root));assert.deepEqual(await runtime.command(packet),posted);
  const thread=await client.semanticThread({nodeId:node(),rootId:root,limit:20,cursor:null});assert(thread.root.replies.some(v=>v.id===reply));assert.equal(thread.scope.caption,selected.scope.caption);
 });
 await test(cases,3,async()=>{
  const stale=await target();await lifecycle.command(await expected(),{type:'edit',contributionId:root,body:'Edited question keeps its expressly selected topic'},actor);const before=await state();
  await assert.rejects(client.command(await expected(),command(stale,'Cannot answer a stale question'),actor.id),code('conflict'));assert.deepEqual(await state(),before);
  const forged=command(await target(),'Cannot forge another topic');forged.semanticTarget.nodeId='subject-00000000-0000-4000-8000-000000000001';
  await assert.rejects(client.command(await expected(),forged,actor.id),code('conflict'));assert.deepEqual(await state(),before);assert.deepEqual(await runtime.command(packet),posted);
 });
 await test(cases,4,async()=>{
  const before=await expected(),stamp=await reads.semanticStamp();await owner.query('DELETE FROM canonical_v4.named_subject_selections WHERE source_id=$1',[selected.scope.sourceId]);
  assert.deepEqual(await expected(),before);assert.notEqual((await reads.semanticStamp()).revision,stamp.revision);assert.equal((await client.authorContext({sourceId:selected.scope.sourceId})).context.scope.kind,'page');
  await createAutomaticNamedSubjectRepository({database:worker}).publish(JSON.stringify(await publicationInput(sourceIds)));assert.equal((await client.authorContext({sourceId:selected.scope.sourceId})).context.scope.id,selected.scope.id);
  const pending=await reads.semanticStamp();await drain();assert.deepEqual(await expected(),before);assert.notEqual((await reads.semanticStamp()).revision,pending.revision);
 });
 await test(cases,5,async()=>{
  const eventRoot=await postRoot(),event=await one(owner,"SELECT event_id::text id FROM canonical_v4.named_feed_events WHERE root_id=$1 AND kind='root'",[eventRoot]),ready=defer(),release=defer();
  const held=observer.transaction(async tx=>{await tx.query('UPDATE canonical_v4.named_feed_clock SET revision=revision WHERE singleton');ready.resolve();await release.promise;});held.catch(error=>ready.resolve({error}));
  try{const value=await ready.promise;if(value?.error)throw value.error;
   await assert.rejects(within(feeds.process(JSON.stringify({generation,eventId:event.id}))),code('conflict'));
   await within(postRoot());assert((await within(client.semanticSearch({query:'Orion',limit:20,cursor:null}))).topics.length>0);assert.equal((await within(target())).root.id,root);
  }finally{release.resolve();await held;}await drain();
 });
 await test(cases,6,async at=>{
  const view=await target(),semanticTarget={nodeId:view.nodeId,topicId:view.topic.id,rootRevision:view.rootRevision,targetRevision:view.targetRevision};
  at('BUNDLE');const bundle=await service.insightBundle({sourceId:selected.scope.sourceId,topicId:selected.topicId,includeDiscussion:false,includeRelatedSources:false,destinationTopicId:selected.topicId,semanticTarget:{...semanticTarget,targetId:root}});
  at('CONTEXT');const context=authoredFixtureInsightContext(bundle,selected.scope.sourceId,selected.topicId);let calls=0;const inflight=new Set();
  const track=name=>(...args)=>{const pending=Promise.resolve().then(()=>service[name](...args));inflight.add(pending);pending.then(()=>inflight.delete(pending),()=>inflight.delete(pending));return pending;};
  const aiService={...service,insightBundle:track('insightBundle'),insightJobBundle:track('insightJobBundle')};
  ai=createChatGPTRuntime({service:aiService,connectionAdapter:{status:()=>({connected:true,planEnabled:true,pending:false}),dispose(){}},
   insightsAdapter:{async createInsight(){calls++;return {body:'A complete answer to the exact selected product question.',citations:[],model:'synthetic'};},cancel(){},dispose(){}}});
  try{handle=createRequestHandler({config,service,ai});const operationId='public-native-named-ai-reply';
   at('START');await aiClient.start({operationId,model:'synthetic',context,articleText:'Invented captured product evidence',allowWebResearch:false,includeRelatedSources:false,
    followupQuestionId:root,semanticTarget,expected:bundle.version},actor.id);
   // This owned fixture deliberately uses one exclusive physical app session,
   // not the live app pool. As in the existing semantic-insight fixture, wait
   // on the real in-memory terminal event before a SQL-bearing result request.
   const deadline=performance.now()+3000,terminal=()=>ai.diagnostics().events.some(event=>event.kind==='insight');
   while(!terminal()&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
   assert(terminal(),'The original background AI job must settle within its existing deadline');
   at('RESULT');const result=await aiClient.result(operationId,actor.id);assert.equal(result.state,'completed');assert.equal(calls,1);assert(result.semanticPublication);
   at('PUBLISH');const outcome=await client.command(bundle.version,{type:'share-insight-reply',topicId:selected.topicId,discussionId:view.discussionId,rootId:root,replyToId:root,
    body:result.result.body,operationId,originSourceId:selected.scope.sourceId,semanticPublication:result.semanticPublication},actor.id);replyIds.push(outcome.result.contributionId);
   at('THREAD');const thread=await client.semanticThread({nodeId:node(),rootId:root,limit:20,cursor:null});assert(thread.root.replies.some(v=>v.id===outcome.result.contributionId&&v.actorType==='agent'&&v.body===result.result.body));
  }finally{ai.dispose();await Promise.allSettled([...inflight]);ai=null;handle=createRequestHandler({config,service});}
 });
 await test(cases,7,async()=>{
  for(const role of ['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'])for(const sql of ["SELECT canonical_v4.named_reply_member('g','n','r',1,'t','d')",'SELECT * FROM canonical_v4.named_feed_clock',"SELECT canonical_v4.named_process_feed_core('g',1)"])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
  for(const role of ['murmingle_ingest_worker','murmingle_crawler_submitter'])await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query('SELECT canonical_v4.named_read_root_contexts($1,$2::text[])',[generation,[root]]);}),code('42501'));
 });
 const finishGrouping=await runNamedOwnerGroupingNativeAssertions({...scope,check:(index,body)=>test(cases,index,body)});
 const finishPages=await runAutomaticPageTopicNativeAssertions({...scope,cases:scope.pageCases});
 return async()=>{await finishGrouping();await finishPages();return test(cases,18,async()=>{
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.sources')).n,0);await drain();
  const view=await target();assert.equal(view.scope.caption,selected.scope.caption);
  await assert.rejects(service.semanticTarget({nodeId:'subject-'+parent,rootId:root,targetId:root}),code('not-found'));
  // Public non-command HTTP404 is intentionally coarsened by the existing
  // client to unavailable; it must still deliver no removed ancestor thread.
  await assert.rejects(target('subject-'+parent),code('unavailable'));
  assert((await client.semanticSearch({query:'Orion Console Pro',limit:20,cursor:null})).topics.some(v=>v.nodeId===node()&&v.occupied));
  const fresh=await client.command(await expected(),command(view,'The saved authored thread remains open after Source erasure'),actor.id);replyIds.push(fresh.result.contributionId);
  assert.deepEqual(await runtime.command(packet),posted);
  for(const id of rootIds)await lifecycle.command(await expected(),{type:'withdraw',contributionId:id},actor);
  const all=[...rootIds,...replyIds];await owner.transaction(async tx=>{for(const table of ['command_receipts','revisions'])await tx.query('DELETE FROM canonical_v4.'+table+' WHERE contribution_id=ANY($1::text[])',[all]);
   await tx.query('DELETE FROM canonical_v4.contributions WHERE id=ANY($1::text[])',[all]);await tx.query('DELETE FROM canonical_v4.id_registry WHERE id=ANY($1::text[])',[all]);});
  for(const [name,file] of [['runtime_prepare_command','migrations/015-semantic-reply-witness.sql'],['runtime_lifecycle_command','migrations/016-semantic-insight-reply.sql'],['named_share_insight','drafts/automatic-author-insight.sql']]){
   const original=await readFile(new URL('../canonical-v4/'+file,import.meta.url),'utf8');const body=original.match(new RegExp('CREATE (?:OR REPLACE )?FUNCTION canonical_v4\\.'+name+'\\([\\s\\S]*?\\n\\$'+name+'\\$;','u'))[0];
   await owner.exec(body.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
  }
  await owner.exec(`DROP TRIGGER named_schedule_context_read ON canonical_v4.named_subject_selections;
   DROP FUNCTION canonical_v4.named_process_feed_event(text,bigint);ALTER FUNCTION canonical_v4.named_process_feed_core(text,bigint) RENAME TO named_process_feed_event;
   GRANT EXECUTE ON FUNCTION canonical_v4.named_process_feed_event(text,bigint) TO murmingle_ingest_worker;
   DROP FUNCTION canonical_v4.named_schedule_context_read(),canonical_v4.named_read_revision(),canonical_v4.named_read_root_contexts(text,text[]),canonical_v4.named_reply_member(text,text,text,bigint,text,text);
   DROP TABLE canonical_v4.named_feed_clock;`);
 });};
}
