// Additional real owned PostgreSQL assertions over general-web fixtures. No
// live connection, crawler, public capture, inference or provider requests.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {types} from 'node:util';
import {createAutomaticTopicFeedRepository as feedRepository} from '../canonical-v4/automatic-topic-feed-repository.js';
import {createAutomaticAuthorContextRepository as authorRepository} from '../canonical-v4/automatic-author-context-repository.js';
import {createCanonicalV4LifecycleRepository as lifecycle} from '../canonical-v4/lifecycle-repository.js';
import names from './automatic-topic-feed-native-cases.json' with {type:'json'};
export const AUTOMATIC_TOPIC_FEED_NATIVE_CASES=Object.freeze([...names]);
const code=c=>e=>e?.code===c;
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
export function automaticFeedNativeFailure(error,index){
 if(!Number.isInteger(index)||index<0||index>8)throw new TypeError('Invalid feed case');
 const own=key=>{if(!error||types.isProxy(error)||typeof error!=='object')return null;const d=Object.getOwnPropertyDescriptor(error,key);return d&&Object.hasOwn(d,'value')?d.value:null;};
 const raw=own('code'),allowed=['ERR_ASSERTION','42601','42702','42883','23503','23505','42501','P1301','P1303','P1304','conflict','storage-failure','storage-corrupt','invalid'];
 const code=allowed.includes(raw)?raw.toUpperCase().replaceAll('-','_'):'UNKNOWN';
 const position=key=>{const value=own(key);return typeof value==='string'&&/^[1-9][0-9]{0,5}$/u.test(value)?value:'0';};
 return Object.assign(Error('Owned topic feed check did not complete'),{code:`FEED_${index}_${code}_P${position('position')}_I${position('internalPosition')}`});
}
async function test(cases,i,body){const row={name:names[i],status:'running'};cases.push(row);try{await body();row.status='passed';}catch(e){row.status='failed';throw automaticFeedNativeFailure(e,i);}}
async function within(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned topic feed did not complete')),1200);})]);}finally{clearTimeout(timer);}}
function uses(plan,name){return plan&&typeof plan==='object'&&(plan['Index Name']===name||Object.values(plan).some(v=>v&&typeof v==='object'&&(Array.isArray(v)?v.some(p=>uses(p,name)):uses(v,name))));}

// PostgreSQL17's IF scanner stops at an unparenthesized inner THEN. Derive the
// paired compile probe from the actual protected condition, rather than a
// separate corrected expression that could diverge from installed SQL.
export function automaticFeedAncestryCompileProbe(sql,broken=false){
 if(typeof sql!=='string'||typeof broken!=='boolean')throw new TypeError('Invalid feed syntax probe');
 const conditions=[...sql.matchAll(/IF NOT FOUND OR parent_ IS DISTINCT FROM (.+) THEN RETURN NULL;END IF;/gu)];
 if(conditions.length!==1||!conditions[0][1].startsWith('(CASE ')||!conditions[0][1].endsWith(' END)'))throw new TypeError('Invalid feed syntax probe');
 const condition=broken?conditions[0][1].slice(1,-1):conditions[0][1];
 return `DO $probe$ DECLARE ids_ uuid[]:=ARRAY['12345678-1234-4123-8123-123456789abc'::uuid];parent_ uuid;n_ integer:=1;
 BEGIN PERFORM 1;IF NOT FOUND OR parent_ IS DISTINCT FROM ${condition} THEN RAISE EXCEPTION 'Invalid ancestry probe' USING ERRCODE='P1304';END IF;END $probe$;`;
}

export async function runAutomaticTopicFeedNativeAssertions({owner,worker,app,observer,generation,sourceIds,cases}){
 const feeds=feedRepository({database:app}),maintenance=feedRepository({database:worker}),roots=[];let serial=0,leaf=null,parent=null,page=null,first=null;
 const author=authorRepository({database:app,nextId:()=>`feed-native-root-${++serial}`}),raw=JSON.stringify({generation});
 const expected=()=>one(owner,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton');
 const editor=id=>author.editor(JSON.stringify({generation,sourceId:id}));
 const route=s=>(s.kind==='named'?'subject-':'page-')+s.id;
 async function post(context){const r=await author.appendRoot(JSON.stringify({actorId:'demo-alex',requestId:'feed-native-request-'+(++serial),expected:await expected(),
  command:{type:'create-root',topicId:context.topicId,originSourceId:context.scope.sourceId,body:'Exact authored feed question '+serial},scope:context.scope}));roots.push(r.result.contributionId);return r.result.contributionId;}
 const contains=(nodeId,rootId)=>feeds.contains(JSON.stringify({generation,nodeId,rootId}));
 const references=(nodeId,beforeOrdinal=null,limit=100)=>feeds.feedReferences(JSON.stringify({generation,nodeId,beforeOrdinal,limit}));
 const search=(query='',limit=50,cursor=null)=>feeds.search(JSON.stringify({generation,query,limit,cursor}));
 async function drain(){for(let turn=0;turn<128;turn++){const tasks=await maintenance.tasks(raw);if(!tasks.length){assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_feed_events')).n,0);return;}
  for(const eventId of tasks)assert.notEqual(await maintenance.process(JSON.stringify({generation,eventId})),'busy');}assert.fail('Owned bounded feed cohort did not drain');}
 await test(cases,0,async()=>{
  const before=await expected(),original=(await owner.query('SELECT id,discussion_id,root_id,ordinal FROM canonical_v4.contributions ORDER BY ordinal')).rows;
  const sql=await readFile(new URL('../canonical-v4/drafts/automatic-topic-feeds.sql',import.meta.url),'utf8');
  await assert.rejects(owner.transaction(tx=>tx.exec(automaticFeedAncestryCompileProbe(sql,true))),code('42601'));
  await owner.exec(automaticFeedAncestryCompileProbe(sql));await owner.exec(sql);
  assert.deepEqual(await expected(),before);assert.deepEqual((await owner.query('SELECT id,discussion_id,root_id,ordinal FROM canonical_v4.contributions ORDER BY ordinal')).rows,original);
  const counts=await one(owner,'SELECT (SELECT count(*)::integer FROM canonical_v4.named_root_contexts) authored,(SELECT count(*)::integer FROM canonical_v4.named_feed_roots) indexed');assert.equal(counts.authored,counts.indexed);
 });
 await test(cases,1,async()=>{
  leaf=await editor(sourceIds[1]);page=await editor(sourceIds.at(-1));assert.equal(leaf.scope.kind,'named');assert.equal(page.scope.kind,'page');
  parent=await one(owner,'SELECT p.subject_id::text id,p.label FROM canonical_v4.named_subject_heads h JOIN canonical_v4.named_subject_heads p ON p.subject_id=h.parent_id WHERE h.subject_id=$1',[leaf.scope.id]);
  first=await post(leaf);const pageRoot=await post(page);assert.equal(await contains(route(leaf.scope),first),true);assert.equal(await contains(route(page.scope),pageRoot),true);
  assert.equal(await contains('subject-'+parent.id,first),false);assert.equal((await references(route(leaf.scope))).references[0].rootId,first);
 });
 await test(cases,2,async()=>{
  const destinations=(await owner.query('SELECT id,discussion_id FROM canonical_v4.contributions WHERE id=ANY($1::text[])',[roots])).rows;
  await drain();assert.equal(await contains('subject-'+parent.id,first),true);
  const refs=(await references('subject-'+parent.id)).references;assert(refs.some(r=>r.rootId===first));assert(refs.every(r=>r.discussionId==='discussion-semantic-manual'&&r.topicId===leaf.topicId));
  assert.deepEqual((await owner.query('SELECT id,discussion_id FROM canonical_v4.contributions WHERE id=ANY($1::text[])',[roots])).rows,destinations);
  const row=(await search('Orion Console Pro')).topics.find(t=>t.nodeId===route(leaf.scope));assert(row);assert.deepEqual(row.path,['subject-'+parent.id,route(leaf.scope)]);
 });
 await test(cases,3,async()=>{
  const all=await search();assert.equal(new Set(all.topics.map(t=>t.nodeId)).size,all.topics.length);assert(all.topics.some(t=>t.nodeId===route(page.scope)&&t.occupied));
  const hits=await search('ＯＲＩＯＮ Con');assert(hits.topics.some(t=>t.nodeId===route(leaf.scope)&&t.human));
  const firstPage=await search('',1);assert(firstPage.nextCursor);const secondPage=await search('',1,firstPage.nextCursor);assert.notEqual(firstPage.topics[0].nodeId,secondPage.topics[0].nodeId);
  await assert.rejects(search('unrelated',1,firstPage.nextCursor),code('conflict'));
  assert.equal((await one(owner,"SELECT count(*)::integer n FROM canonical_v4.named_feed_roots f LEFT JOIN canonical_v4.named_root_contexts ctx ON ctx.root_id=f.root_id WHERE ctx.root_id IS NULL")).n,0);
 });
 await test(cases,4,async()=>{
  const root=await post(leaf),event=await one(owner,"SELECT event_id::text id FROM canonical_v4.named_feed_events WHERE kind='root' AND root_id=$1",[root]),ready=deferred(),release=deferred();
  const held=worker.transaction(async tx=>{assert.equal(await feedRepository({database:tx}).process(JSON.stringify({generation,eventId:event.id})),'completed');ready.resolve();await release.promise;});held.catch(error=>ready.resolve({error}));
  try{const value=await ready.promise;if(value?.error)throw value.error;
   assert.equal(await within(contains(route(leaf.scope),root)),true);assert((await within(search('Orion'))).topics.length>0);
   await within(observer.query('UPDATE canonical_v4.runtime_state SET revision=revision WHERE singleton'));
   const concurrent=await within(post(leaf));assert.equal(await within(contains(route(leaf.scope),concurrent)),true);
  }finally{release.resolve();await held;}await drain();
 });
 await test(cases,5,async()=>{
  const root=await post(leaf),event=await one(owner,"SELECT event_id::text id FROM canonical_v4.named_feed_events WHERE kind='root' AND root_id=$1",[root]),ready=deferred(),release=deferred();
  const held=observer.transaction(async tx=>{await tx.query('UPDATE canonical_v4.named_subject_heads SET revision=revision WHERE subject_id=$1',[leaf.scope.id]);ready.resolve();await release.promise;});held.catch(error=>ready.resolve({error}));
  try{const value=await ready.promise;if(value?.error)throw value.error;
   assert.equal(await within(maintenance.process(JSON.stringify({generation,eventId:event.id}))),'busy');assert.equal(await within(contains(route(leaf.scope),root)),true);
   assert.equal(await contains('subject-'+parent.id,root),false);assert((await within(search('Orion'))).topics.length>0);
  }finally{release.resolve();await held;}
  // The explicit worker port can process this same durable event after the
  // lock retires; the normal task list observes its 200ms not-before backoff.
  assert.equal(await maintenance.process(JSON.stringify({generation,eventId:event.id})),'completed');assert.equal(await contains('subject-'+parent.id,root),true);await drain();
 });
 await test(cases,6,async()=>{
  for(let i=0;i<17;i++)await post(leaf);await drain();
  const event=await one(owner,"INSERT INTO canonical_v4.named_feed_events(generation,kind,scope_kind,scope_id) VALUES($1,'scope','named',$2) RETURNING event_id::text id",[generation,leaf.scope.id]);
  assert.equal(await maintenance.process(JSON.stringify({generation,eventId:event.id})),'advanced');
  const frozen=await one(owner,'SELECT upper_root::text upper,after_root::text after FROM canonical_v4.named_feed_events WHERE event_id=$1',[event.id]);assert(BigInt(frozen.upper)>BigInt(frozen.after));
  const newer=await post(leaf);await drain();assert.equal(await contains('subject-'+parent.id,newer),true);
  let before=null;const visited=new Set();for(let page=0;page<64;page++){
   const refs=(await references(route(leaf.scope),before,3)).references;if(!refs.length)break;
   for(const ref of refs){assert(!visited.has(ref.rootId));visited.add(ref.rootId);}before=refs.at(-1).ordinal;
  }for(const root of roots.slice(2))assert(visited.has(root));
 });
 await test(cases,7,async()=>{
  for(const role of ['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'])for(const sql of ['SELECT * FROM canonical_v4.named_topic_cards','DELETE FROM canonical_v4.named_feed_events WHERE false'])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
  for(const role of ['murmingle_app','murmingle_crawler_submitter'])await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query('SELECT canonical_v4.named_process_feed_event($1,1)',[generation]);}),code('42501'));
  await owner.transaction(async tx=>{await tx.exec('SET LOCAL enable_seqscan=off');
   const p=await one(tx,"EXPLAIN(FORMAT JSON) SELECT root_id FROM canonical_v4.named_feed_edges WHERE generation=$1 AND scope_kind='named' AND scope_id=$2 ORDER BY root_ordinal DESC LIMIT 20",[generation,leaf.scope.id]);assert(uses(p['QUERY PLAN'],'named_feed_order'));
   const q=await one(tx,"EXPLAIN(FORMAT JSON) SELECT scope_id FROM canonical_v4.named_topic_cards WHERE search@@to_tsquery('simple','orion:*')");assert(uses(q['QUERY PLAN'],'named_topic_card_terms'));
   const r=await one(tx,'EXPLAIN(FORMAT JSON) SELECT scope_id FROM canonical_v4.named_topic_directory WHERE generation=$1 ORDER BY human DESC,root_ordinal DESC,scope_kind COLLATE "C",scope_id LIMIT 20',[generation]);assert(uses(r['QUERY PLAN'],'named_topic_directory_order'));
  });
  await lifecycle({database:app}).command(await expected(),{type:'withdraw',contributionId:first},{id:'demo-alex',type:'human',demo:true});
  assert.equal(await contains(route(leaf.scope),first),false);assert.equal(await contains('subject-'+parent.id,first),false);
  await drain();assert((await search('Orion Console Pro')).topics.some(t=>t.nodeId===route(leaf.scope)&&t.human));
 });
 return async()=>test(cases,8,async()=>{
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.sources')).n,0);
  assert.equal((await one(owner,"SELECT count(*)::integer n FROM canonical_v4.named_feed_edges WHERE basis='ancestor'")).n,0);
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_topic_cards WHERE head_id IS NOT NULL')).n,0);
  const retained=roots.at(-1);assert.equal(await contains(route(leaf.scope),retained),true);assert.equal(await contains('subject-'+parent.id,retained),false);
  await drain();assert((await search('Orion Console Pro')).topics.some(t=>t.nodeId===route(leaf.scope)&&t.occupied&&t.human));
  for(const root of roots.filter(r=>r!==first))await lifecycle({database:app}).command(await expected(),{type:'withdraw',contributionId:root},{id:'demo-alex',type:'human',demo:true});
  for(const root of roots)assert.equal(await contains(route(leaf.scope),root),false);
  await owner.transaction(async tx=>{for(const table of ['command_receipts','revisions'])await tx.query('DELETE FROM canonical_v4.'+table+' WHERE contribution_id=ANY($1::text[])',[roots]);
   await tx.query('DELETE FROM canonical_v4.contributions WHERE id=ANY($1::text[])',[roots]);await tx.query('DELETE FROM canonical_v4.id_registry WHERE id=ANY($1::text[])',[roots]);});
  await owner.exec(`DROP TRIGGER named_schedule_subject_change ON canonical_v4.named_subject_heads;
   DROP TRIGGER named_schedule_new_root ON canonical_v4.named_root_contexts;DROP TRIGGER named_schedule_removed_root ON canonical_v4.named_root_contexts;
   DROP TABLE canonical_v4.named_topic_directory,canonical_v4.named_topic_cards,canonical_v4.named_feed_events,canonical_v4.named_feed_witnesses,canonical_v4.named_feed_edges,canonical_v4.named_feed_roots;
   DROP FUNCTION canonical_v4.named_retire_ancestor_edge(),canonical_v4.named_schedule_root_feed(),canonical_v4.named_schedule_subject_feed(),
    canonical_v4.named_locked_feed_path(text,uuid),canonical_v4.named_refresh_topic_directory(text,text,text),canonical_v4.named_index_root_feed(text),
    canonical_v4.named_feed_tasks(text),canonical_v4.named_process_feed_event(text,bigint),canonical_v4.named_read_feed(text,text,text,bigint,integer),
    canonical_v4.named_root_in_scope(text,text,text),canonical_v4.named_search_topics(text,text[],jsonb,integer);
   DROP INDEX canonical_v4.named_subject_child_order;`);
 });
}
