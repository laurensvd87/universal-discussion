// Real owned PostgreSQL statements over the existing invented general-web data.
// No extra process, model, crawler or live connection. Root-only assertions.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createAutomaticAuthorContextRepository as repository} from '../canonical-v4/automatic-author-context-repository.js';
import {createAutomaticNamedSubjectRepository as subjectRepository} from '../canonical-v4/automatic-named-subject-repository.js';
import {createCanonicalV4RuntimeRepository} from '../canonical-v4/runtime-repository.js';
import {createCanonicalV4LifecycleRepository} from '../canonical-v4/lifecycle-repository.js';
import {runAutomaticAuthorInsightNativeAssertions} from './automatic-author-insight-native-assertions.js';
import {runAutomaticTopicFeedNativeAssertions} from './automatic-topic-feed-native-assertions.js';
import names from './automatic-author-context-native-cases.json' with {type:'json'};
export const AUTOMATIC_AUTHOR_CONTEXT_NATIVE_CASES=Object.freeze([...names]);
const code=c=>e=>e?.code===c;
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
async function within(work){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('authored context operation timed out')),1200);})]);}finally{clearTimeout(timer);}}
async function test(cases,index,body){const r={name:names[index],status:'running'};cases.push(r);try{await body();r.status='passed';}catch(e){r.status='failed';throw e;}}

export function withdrawAutomaticAuthorFixtureRoot({database,expected,rootId}){
 return createCanonicalV4LifecycleRepository({database}).command(expected,{type:'withdraw',contributionId:rootId},
  {id:'demo-alex',type:'human',demo:true});
}

export async function runAutomaticAuthorContextNativeAssertions(scope){
 const {owner,worker,app,observer,generation,sourceIds,publicationInput,prepareFixtureSources,changeFixtureTitle,cases}=scope;
 let serial=0;const roots=[],requests=[],repo=repository({database:app,nextId:()=>`author-context-native-${++serial}`});
 const editor=id=>repo.editor(JSON.stringify({generation,sourceId:id}));
 const readRoot=id=>repo.root(JSON.stringify({generation,rootId:id}));
 const expected=()=>one(owner,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton');
 const request=async(context,id='author-context-request-'+(++serial))=>({actorId:'demo-alex',requestId:id,expected:await expected(),
  command:{type:'create-root',topicId:context.topicId,body:'The author chose '+context.scope.caption,originSourceId:context.scope.sourceId},scope:context.scope});
 async function post(a){const r=await repo.appendRoot(JSON.stringify(a));roots.push(r.result.contributionId);requests.push(a.requestId);return r;}
 const state=()=>one(owner,`SELECT (SELECT revision::text FROM canonical_v4.runtime_state WHERE singleton) revision,
  (SELECT count(*)::integer FROM canonical_v4.contributions) roots,(SELECT count(*)::integer FROM canonical_v4.command_receipts) receipts,
  (SELECT count(*)::integer FROM canonical_v4.named_root_contexts) contexts,(SELECT count(*)::integer FROM canonical_v4.named_context_receipts) scopes,
  (SELECT write_version::text FROM canonical_v4.discussions WHERE id='discussion-semantic-manual') discussion`);
 const source=sourceIds[1],pageSource=sourceIds.at(-1);let selected=null,namedRequest=null,namedResult=null;
 await test(cases,0,async()=>{
  const before=(await owner.query('SELECT source_id,topic_id,payload FROM canonical_v4.source_links ORDER BY source_id')).rows;
  const migrations=(await owner.query('SELECT * FROM canonical_v4.schema_migrations ORDER BY version')).rows;
  await owner.exec(await readFile(new URL('../canonical-v4/drafts/automatic-author-context.sql',import.meta.url),'utf8'));
  assert.deepEqual((await owner.query('SELECT source_id,topic_id,payload FROM canonical_v4.source_links ORDER BY source_id')).rows,before);
  assert.deepEqual((await owner.query('SELECT * FROM canonical_v4.schema_migrations ORDER BY version')).rows,migrations);
 });
 await test(cases,1,async()=>{
  const page=await within(editor(pageSource));assert.equal(page.scope.kind,'page');assert.equal(page.scope.caption,'Unannounced novel product');
  assert.deepEqual(page.pageScope,page.scope);assert.equal(await repo.scopeCurrent(JSON.stringify({generation,topicId:page.topicId,scope:page.scope})),true);
  const r=await post(await request(page));const read=await readRoot(r.result.contributionId);assert.deepEqual(read.scope,{kind:'page',id:pageSource,caption:page.scope.caption});
  assert.equal(read.topicId,page.topicId);assert.equal(read.discussionId,'discussion-semantic-manual');
 });
 await test(cases,2,async()=>{
  await owner.query('DELETE FROM canonical_v4.named_subject_selections WHERE source_id=$1',[source]);
  const frozen=await editor(source);assert.equal(frozen.scope.kind,'page');
  await subjectRepository({database:worker}).publish(JSON.stringify(await publicationInput(sourceIds)));
  selected=await editor(source);assert.equal(selected.scope.kind,'named');
  const r=await post(await request(frozen));assert.equal((await readRoot(r.result.contributionId)).scope.kind,'page');
 });
 await test(cases,3,async()=>{
  const frozen=await editor(source);await subjectRepository({database:worker}).publish(JSON.stringify(await publicationInput(sourceIds)));
  const operationId='author-context-same-material-renewal';
  await owner.transaction(async tx=>{
   await tx.query('UPDATE canonical_v4.operation_receipts SET operation_id=$2 WHERE source_id=$1',[source,operationId]);
   await tx.query("UPDATE canonical_v4.sources SET write_version=write_version+1,operation_id=$2,payload=jsonb_set(payload::jsonb,'{operationId}',to_jsonb($2::text))::text WHERE id=$1",[source,operationId]);
  });
  assert.deepEqual((await editor(source)).scope,frozen.scope);namedRequest=await request(frozen);namedResult=await post(namedRequest);
  const context=await readRoot(namedResult.result.contributionId);assert.deepEqual(context.scope,{kind:'named',id:frozen.scope.id,caption:frozen.scope.caption});
  await prepareFixtureSources();
 });
 await test(cases,4,async()=>{
  const e=await editor(source),parent=await one(owner,'SELECT p.subject_id::text id,p.label FROM canonical_v4.named_subject_heads h JOIN canonical_v4.named_subject_heads p ON p.subject_id=h.parent_id WHERE h.subject_id=$1',[e.scope.id]);
  const broad={...e,scope:{...e.scope,id:parent.id,caption:parent.label}};assert.notEqual(broad.scope.id,e.scope.id);
  assert.equal(await repo.scopeCurrent(JSON.stringify({generation,topicId:broad.topicId,scope:broad.scope})),true);
  const r=await post(await request(broad));assert.equal((await readRoot(r.result.contributionId)).scope.id,parent.id);
 });
 await test(cases,5,async()=>{
  const before=await state();const historical=await repo.appendRoot(JSON.stringify({...namedRequest,expected:await expected()}));assert.deepEqual(historical,namedResult);assert.deepEqual(await state(),before);
  const changed=structuredClone(namedRequest);changed.scope.caption+=' forged';await assert.rejects(repo.appendRoot(JSON.stringify(changed)),code('conflict'));assert.deepEqual(await state(),before);
  const legacy=await request(await editor(source),'author-context-legacy-receipt'),runtime=createCanonicalV4RuntimeRepository({database:app,nextId:()=>`author-context-native-${++serial}`});
  const {scope:unusedScope,...legacyCommand}=legacy;
  const r=await runtime.command(legacyCommand);roots.push(r.result.contributionId);requests.push(legacy.requestId);
  assert.equal(await readRoot(r.result.contributionId),null);const after=await state();await assert.rejects(repo.appendRoot(JSON.stringify(legacy)),code('conflict'));assert.deepEqual(await state(),after);
 });
 await test(cases,6,async()=>{
  const e=await editor(source),before=await state();
  for(const change of [{materialDigest:'f'.repeat(64)},{caption:'Forged different meaning'},{id:'00000000-0000-4000-8000-000000000001'}]){
   const a=await request(e);a.scope={...a.scope,...change};await assert.rejects(repo.appendRoot(JSON.stringify(a)),code('conflict'));assert.deepEqual(await state(),before);
  }
  const pageDraft=await request(await editor(pageSource));
  await changeFixtureTitle(pageSource,'This page now describes a different product');const changed=await state();
  assert.equal(await repo.scopeCurrent(JSON.stringify({generation,topicId:pageDraft.command.topicId,scope:pageDraft.scope})),false);
  await assert.rejects(repo.appendRoot(JSON.stringify(pageDraft)),code('conflict'));assert.deepEqual(await state(),changed);
  await changeFixtureTitle(pageSource,'Unannounced novel product');await prepareFixtureSources();
 });
 await test(cases,7,async()=>{
  const a=await publicationInput(sourceIds),ready=deferred(),release=deferred();let pending;
  const held=worker.transaction(async tx=>{await subjectRepository({database:tx}).publish(JSON.stringify(a));ready.resolve();await release.promise;});held.catch(error=>ready.resolve({error}));
  try{const r=await ready.promise;if(r?.error)throw r.error;
   assert.equal((await within(editor(source))).scope.id,selected.scope.id);
   await within(observer.query('UPDATE canonical_v4.runtime_state SET revision=revision WHERE singleton'));
   // A page-only author needs no derived head lock while publication is held.
   pending=await request(await editor(pageSource));const posted=await within(post(pending));assert.equal((await readRoot(posted.result.contributionId)).scope.kind,'page');
  }finally{release.resolve();await held;}
 });
 await test(cases,8,async()=>{
  for(const role of ['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'])for(const sql of ['SELECT * FROM canonical_v4.named_root_contexts','DELETE FROM canonical_v4.named_context_receipts WHERE false'])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
  for(const role of ['murmingle_ingest_worker','murmingle_crawler_submitter'])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query('SELECT canonical_v4.named_read_editor($1,$2)',[generation,source]);}),code('42501'));
  const r=await post(await request(await editor(source))),id=r.result.contributionId;
  await withdrawAutomaticAuthorFixtureRoot({database:app,expected:await expected(),rootId:id});
  assert.equal(await readRoot(id),null);assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_root_contexts WHERE root_id=$1',[id])).n,0);
 });
 const finishInsight=await runAutomaticAuthorInsightNativeAssertions({...scope,cases:scope.insightCases});
 const finishFeeds=await runAutomaticTopicFeedNativeAssertions({...scope,cases:scope.feedCases});
 // Called only after the outer fixture's real, committed Source-forget loop.
 // It must prove authored captions survive without retaining the derived heads.
 return async()=>{await finishFeeds();await finishInsight();return test(cases,9,async()=>{
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.sources')).n,0);
  const retained=await readRoot(namedResult.result.contributionId);assert(retained);assert.equal(retained.scope.caption,namedRequest.scope.caption);
  assert.equal(retained.topicId,namedRequest.command.topicId);assert.equal(retained.scope.id,namedRequest.scope.id);
  const body=await one(owner,"SELECT payload::jsonb->>'body' body FROM canonical_v4.revisions WHERE contribution_id=$1 AND ordinal=0",[namedResult.result.contributionId]);assert.equal(body.body,namedRequest.command.body);
  assert.deepEqual(await repo.appendRoot(JSON.stringify(namedRequest)),namedResult);
  await owner.transaction(async tx=>{
   await tx.query('DELETE FROM canonical_v4.command_receipts WHERE contribution_id=ANY($1::text[])',[roots]);
   await tx.query('DELETE FROM canonical_v4.revisions WHERE contribution_id=ANY($1::text[])',[roots]);
   await tx.query('DELETE FROM canonical_v4.contributions WHERE id=ANY($1::text[])',[roots]);
   await tx.query('DELETE FROM canonical_v4.id_registry WHERE id=ANY($1::text[])',[roots]);
  });
  await owner.exec(`DROP TRIGGER named_authored_withdrawal ON canonical_v4.contributions;
   DROP FUNCTION canonical_v4.named_check_editor_scope(text,text,jsonb),canonical_v4.named_attach_root_context(text,text,text,text,text,jsonb),canonical_v4.named_valid_editor_scope(jsonb),canonical_v4.named_read_editor(text,text),
    canonical_v4.named_append_root(text,text,text,text,text,text,text,text,text,text,jsonb),canonical_v4.named_read_root_context(text,text),canonical_v4.named_erase_authored_context();
   DROP TABLE canonical_v4.named_context_receipts,canonical_v4.named_root_contexts;`);
 });};
}
