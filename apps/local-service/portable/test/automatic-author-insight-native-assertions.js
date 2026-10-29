// Owned PostgreSQL checks with invented completed-result proofs, not provider
// execution or proof issuance. Existing physical sessions/resource limits only.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createAutomaticAuthorContextRepository as repository} from '../canonical-v4/automatic-author-context-repository.js';
import {createAutomaticNamedSubjectRepository as subjects} from '../canonical-v4/automatic-named-subject-repository.js';
import {createCanonicalV4LifecycleRepository as lifecycle} from '../canonical-v4/lifecycle-repository.js';
import names from './automatic-author-insight-native-cases.json' with {type:'json'};
export const AUTOMATIC_AUTHOR_INSIGHT_NATIVE_CASES=Object.freeze([...names]);
const actor={id:'demo-alex',type:'human',demo:true},code=c=>e=>e?.code===c;
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function within(work){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('authored AI operation timed out')),1200);})]);}finally{clearTimeout(timer);}}
async function test(cases,index,body){const r={name:names[index],status:'running'};cases.push(r);try{await body();r.status='passed';}catch(e){r.status='failed';throw e;}}

export async function runAutomaticAuthorInsightNativeAssertions(scope){
 const {owner,worker,app,observer,generation,sourceIds,publicationInput,prepareFixtureSources,changeFixtureTitle,cases}=scope;
 let serial=0;const roots=[],repo=repository({database:app,nextId:()=>`authored-ai-native-${++serial}`}),legacy=lifecycle({database:app,nextId:()=>`authored-ai-native-${++serial}`});
 const expected=()=>one(owner,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton');
 const editor=id=>repo.editor(JSON.stringify({generation,sourceId:id})),root=id=>repo.root(JSON.stringify({generation,rootId:id}));
 async function request(e){const command={type:'share-insight',topicId:e.topicId,body:'Exact invented generated result for '+e.scope.caption,
   operationId:`authored-ai-operation-${++serial}`,originSourceId:e.scope.sourceId};
  return {expected:await expected(),command,actor,scope:e.scope,proof:{kind:'generated-insight',operationId:command.operationId,actorId:actor.id,
   topicId:command.topicId,originSourceId:command.originSourceId,body:command.body,rootId:null,replyToId:null,discussionId:null}};
 }
 async function post(r){const value=await repo.shareInsight(JSON.stringify(r));roots.push(value.result.contributionId);return value;}
 const state=()=>one(owner,`SELECT (SELECT revision::text FROM canonical_v4.runtime_state WHERE singleton) revision,
  (SELECT count(*)::integer FROM canonical_v4.contributions) contributions,(SELECT count(*)::integer FROM canonical_v4.command_receipts) receipts,
  (SELECT count(*)::integer FROM canonical_v4.named_root_contexts) contexts,(SELECT count(*)::integer FROM canonical_v4.named_context_receipts) scopes,
  (SELECT write_version::text FROM canonical_v4.discussions WHERE id='discussion-semantic-manual') discussion`);
 const source=sourceIds[1],pageSource=sourceIds.at(-1);let original=null,posted=null;
 await test(cases,0,async()=>{
  const routes=(await owner.query('SELECT source_id,topic_id,payload FROM canonical_v4.source_links ORDER BY source_id')).rows;
  await owner.exec(await readFile(new URL('../canonical-v4/drafts/automatic-author-insight.sql',import.meta.url),'utf8'));
  assert.deepEqual((await owner.query('SELECT source_id,topic_id,payload FROM canonical_v4.source_links ORDER BY source_id')).rows,routes);
  for(const role of ['murmingle_ingest_worker','murmingle_crawler_submitter'])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);
    await tx.query("SELECT canonical_v4.named_share_insight(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}')");}),code('42501'));
  for(const role of ['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);
    await tx.query("SELECT canonical_v4.named_attach_root_context('a','b','c','d','e','{}')");}),code('42501'));
 });
 await test(cases,1,async()=>{
  const e=await editor(source);assert.equal(e.scope.kind,'named');original=await request(e);posted=await post(original);
  const c=await root(posted.result.contributionId);assert.equal(c.scope.id,e.scope.id);assert.equal(c.scope.caption,e.scope.caption);
  assert.equal(c.topicId,e.topicId);assert.equal(c.discussionId,'discussion-semantic-manual');
  const v=await one(owner,"SELECT c.actor_type,c.operator_id,r.payload::jsonb->>'body' body FROM canonical_v4.contributions c JOIN canonical_v4.revisions r ON r.contribution_id=c.id AND r.ordinal=0 WHERE c.id=$1",[posted.result.contributionId]);
  assert.deepEqual(v,{actor_type:'agent',operator_id:actor.id,body:original.command.body});
 });
 await test(cases,2,async()=>{
  await owner.query('DELETE FROM canonical_v4.named_subject_selections WHERE source_id=$1',[source]);const frozen=await editor(source);assert.equal(frozen.scope.kind,'page');
  await subjects({database:worker}).publish(JSON.stringify(await publicationInput(sourceIds)));assert.equal((await editor(source)).scope.kind,'named');
  const r=await post(await request(frozen));assert.equal((await root(r.result.contributionId)).scope.kind,'page');
 });
 await test(cases,3,async()=>{
  const e=await editor(source),before=await state();
  const forged=await request(e);forged.proof.body+=' altered';await assert.rejects(repo.shareInsight(JSON.stringify(forged)),code('forbidden'));assert.deepEqual(await state(),before);
  for(const change of [{caption:'A different topic'},{materialDigest:'f'.repeat(64)}]){
   const r=await request(e);r.scope={...r.scope,...change};await assert.rejects(repo.shareInsight(JSON.stringify(r)),code('conflict'));assert.deepEqual(await state(),before);
  }
  const stale=await request(await editor(pageSource));await changeFixtureTitle(pageSource,'Now a different article');const changed=await state();
  // Global CAS is current, so only the captured material fence can refuse it.
  stale.expected=await expected();await assert.rejects(repo.shareInsight(JSON.stringify(stale)),code('conflict'));assert.deepEqual(await state(),changed);
  await changeFixtureTitle(pageSource,'Unannounced novel product');await prepareFixtureSources();
 });
 await test(cases,4,async()=>{
  const before=await state();assert.deepEqual(await repo.shareInsight(JSON.stringify(original)),posted);assert.deepEqual(await state(),before);
  const changed=structuredClone(original);changed.scope.caption+=' changed';await assert.rejects(repo.shareInsight(JSON.stringify(changed)),code('conflict'));assert.deepEqual(await state(),before);
  const old=await request(await editor(source)),saved=await legacy.command(old.expected,old.command,old.actor,old.proof);roots.push(saved.result.contributionId);
  assert.equal(await root(saved.result.contributionId),null);const after=await state();await assert.rejects(repo.shareInsight(JSON.stringify(old)),code('conflict'));assert.deepEqual(await state(),after);
 });
 await test(cases,5,async()=>{
  const input=await publicationInput(sourceIds),ready=deferred(),release=deferred();
  const held=worker.transaction(async tx=>{await subjects({database:tx}).publish(JSON.stringify(input));ready.resolve();await release.promise;});held.catch(error=>ready.resolve({error}));
  try{const value=await ready.promise;if(value?.error)throw value.error;
   assert.equal((await within(editor(source))).scope.kind,'named');await within(observer.query('UPDATE canonical_v4.runtime_state SET revision=revision WHERE singleton'));
   const r=await within(post(await request(await editor(pageSource))));assert.equal((await root(r.result.contributionId)).scope.kind,'page');
  }finally{release.resolve();await held;}
 });
 return async()=>test(cases,6,async()=>{
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.sources')).n,0);
  const c=await root(posted.result.contributionId);assert.equal(c.scope.caption,original.scope.caption);assert.equal(c.scope.id,original.scope.id);assert.equal(c.topicId,original.command.topicId);
  const body=await one(owner,"SELECT payload::jsonb->>'body' body FROM canonical_v4.revisions WHERE contribution_id=$1 AND ordinal=0",[posted.result.contributionId]);assert.equal(body.body,original.command.body);
  assert.deepEqual(await repo.shareInsight(JSON.stringify(original)),posted);
  await legacy.command(await expected(),{type:'withdraw',contributionId:posted.result.contributionId},actor);assert.equal(await root(posted.result.contributionId),null);
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_root_contexts WHERE root_id=$1',[posted.result.contributionId])).n,0);
  await owner.transaction(async tx=>{
   await tx.query('DELETE FROM canonical_v4.command_receipts WHERE contribution_id=ANY($1::text[])',[roots]);
   await tx.query('DELETE FROM canonical_v4.revisions WHERE contribution_id=ANY($1::text[])',[roots]);
   await tx.query('DELETE FROM canonical_v4.contributions WHERE id=ANY($1::text[])',[roots]);
   await tx.query('DELETE FROM canonical_v4.id_registry WHERE id=ANY($1::text[])',[roots]);
  });
  await owner.exec('DROP FUNCTION canonical_v4.named_share_insight(text,text,text,text,text,bigint,text,text,text,text,text,text,text,text,text,text,text,text,jsonb)');
 });
}
