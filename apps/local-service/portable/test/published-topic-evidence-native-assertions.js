// Owned PostgreSQL/app checks. Invented published text and encoder coordinates;
// no actual model, browser/provider, live connection or semantic quality claim.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {types} from 'node:util';
import {createPublishedTopicEvidenceRepository as repository} from '../canonical-v4/published-topic-evidence-repository.js';
import {createPublishedTopicMaintenance as maintenance} from '../../src/application/published-topic-maintenance.js';
import {publishedTopicInput,PUBLISHED_TOPIC_INPUT_HASH} from '../../src/application/published-topic-evidence.js';
import {createAutomaticAuthorContextRepository} from '../canonical-v4/automatic-author-context-repository.js';
import {createCanonicalV4LifecycleRepository} from '../canonical-v4/lifecycle-repository.js';
import {describeRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';
import {createHash} from 'node:crypto';
import names from './published-topic-evidence-native-cases.json' with {type:'json'};
export const PUBLISHED_TOPIC_EVIDENCE_NATIVE_CASES=Object.freeze([...names]);
const code=c=>e=>e?.code===c,unit=[1,...Array(383).fill(0)],prepared={bodyValues:unit,titleValues:unit,exclusion:null},actor={id:'demo-alex',type:'human',demo:true};
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {resolve,promise};};
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
async function within(p){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Public evidence operation timed out')),1200);})]);}finally{clearTimeout(timer);}}
async function check(cases,index,work){const row={name:names[index],status:'running'};cases.push(row);try{await work();row.status='passed';}catch(e){row.status='failed';
 const d=e&&!types.isProxy(e)&&Object.getOwnPropertyDescriptor(e,'code'),raw=d&&Object.hasOwn(d,'value')?d.value:null;
 const safe=['42601','42702','42883','23503','23505','23514','42501','P1311','P1313','ERR_ASSERTION','conflict','invalid','storage-failure','storage-corrupt','unavailable'].includes(raw)?raw.toUpperCase().replaceAll('-','_'):'UNKNOWN';
 throw Object.assign(Error('Owned public evidence check did not complete'),{code:`EVIDENCE_${index}_${safe}`});}}
export async function runPublishedTopicEvidenceNativeAssertions(scope){
 const {owner,worker,app,observer,generation,matcher,sourceIds,cases}=scope,identity=describeRootedHierarchyMatcher(matcher),
  matcherHash=createHash('sha256').update(JSON.stringify(identity)).digest('hex'),request={generation,matcherHash},raw=JSON.stringify(request);
 let serial=0,context=null,r1=null,r2=null,r3=null,r4=null,firstTask=null,failText=null;const roots=[],encoded=[];
 const author=createAutomaticAuthorContextRepository({database:app,nextId:()=>`public-evidence-root-${++serial}`}),life=createCanonicalV4LifecycleRepository({database:app}),repo=repository({database:worker}),read=repository({database:observer});
 const upkeep=maintenance({repository:repo,resources:{embedCapturedBody:async text=>{encoded.push(text);if(text===failText)throw Error('invented temporary encoder refusal');return {modelId:'e5-small-q8-browser-main-prefix-v1',values:unit};}}});
 const expected=()=>one(owner,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton');
 const editor=id=>author.editor(JSON.stringify({generation,sourceId:id}));
 async function post(body){const r=await author.appendRoot(JSON.stringify({actorId:actor.id,requestId:'public-evidence-request-'+(++serial),expected:await expected(),command:{type:'create-root',topicId:context.topicId,body,originSourceId:context.scope.sourceId},scope:context.scope}));roots.push(r.result.contributionId);return r.result.contributionId;}
 async function edit(root,body){await life.command(await expected(),{type:'edit',contributionId:root,body},actor);}
 async function drain(){for(let i=0;i<256;i++){const t=await repo.tasks(raw);if(!t.length)return;const out=await upkeep.turn(raw);assert(!out.includes('busy'));assert(!out.includes('deferred'));}assert.fail('Public evidence work failed to settle');}
 const candidates=()=>read.candidates(JSON.stringify({generation,representationHash:identity.representationHash,focusKeys:[publishedTopicInput(JSON.stringify({rootId:'r',topicId:context.scope.id,caption:context.scope.caption,body:'Enough public words to bind a representative.'})).focusKey]}));
 const current=()=>candidates().then(rows=>rows.find(r=>r.topicId===context.scope.id));
 const store=(task,p=prepared,db=repo)=>db.store(JSON.stringify({...request,eventId:task.eventId,witness:task.witness,prepared:p}));
 await check(cases,0,async()=>{
  const before=await expected(),contexts=(await owner.query('SELECT * FROM canonical_v4.named_root_contexts ORDER BY root_id')).rows;
  await owner.exec(await readFile(new URL('../canonical-v4/drafts/published-topic-evidence.sql',import.meta.url),'utf8'));
  assert.deepEqual(await expected(),before);assert.deepEqual((await owner.query('SELECT * FROM canonical_v4.named_root_contexts ORDER BY root_id')).rows,contexts);
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_public_prototypes')).n,0);await drain();
  context=await editor(sourceIds[1]);assert.equal(context.scope.kind,'named');
 });
 await check(cases,1,async()=>{
  r1=await post('The binoculars have clear lenses and a comfortable grip for watching birds in the field. \u{1f426}');
  const tasks=await repo.tasks(raw);firstTask=tasks.find(t=>t.witness?.rootId===r1);assert(firstTask);assert.equal(firstTask.skipEncoding,false);
  const before=encoded.length;await drain();assert.equal(encoded.length-before,2);assert.equal((await current()).rootId,r1);
 });
 await check(cases,2,async()=>{
  const c=await current(),body='The binoculars have clear lenses and a comfortable grip for watching birds in the field. \u{1f426}';
  assert.equal(c.publicDigest,publishedTopicInput(JSON.stringify({rootId:r1,topicId:context.scope.id,caption:context.scope.caption,body})).publicDigest);
  assert.deepEqual(c.vector,unit);assert.equal(c.inputHash,PUBLISHED_TOPIC_INPUT_HASH);assert.equal(c.body,body);
  assert.deepEqual(await repo.candidates(JSON.stringify({generation,representationHash:'b'.repeat(64),focusKeys:[c.focusKey]})),[]);
  assert.equal((await one(owner,'SELECT root_version FROM (SELECT write_version::text root_version FROM canonical_v4.contributions WHERE id=$1) r',[r1])).root_version,c.rootVersion);
 });
 await check(cases,3,async()=>{
  const before=encoded.length;r2=await post('The binoculars are useful for birdwatching and their field of view is wide and clear.');await drain();
  assert.equal(encoded.length,before);assert.equal((await current()).rootId,r1);assert.equal(await store(firstTask),'retired');
 });
 await check(cases,4,async()=>{
  const changed='The revised public review now discusses the binoculars battery adapter and their optical image stabilization.';
  await edit(r1,changed);assert.equal(await current(),undefined);const task=(await repo.tasks(raw)).find(t=>t.witness?.rootId===r1);assert(task);assert.equal(task.witness.body,changed);
  await assert.rejects(store({...task,witness:firstTask.witness}),code('conflict'));
  const before=encoded.length;await drain();assert.equal(encoded.length-before,2);assert.equal((await current()).body,changed);assert(encoded.includes(changed));
 });
 await check(cases,5,async()=>{
  for(let i=0;i<17;i++)await post('OK');await drain();
  await edit(r1,'Love it!');assert.equal(await current(),undefined);assert.deepEqual(await upkeep.turn(raw),['excluded']);
  const repair=(await repo.tasks(raw)).find(t=>t.kind==='scope'&&t.scopeId===context.scope.id);assert(repair);
  assert.equal(await repo.repair(JSON.stringify({...request,eventId:repair.eventId})),'advanced');
  const next=await repo.tasks(raw);assert(next.length>0);assert(next.every(t=>t.kind==='root'));assert(next.every(t=>t.eventId!==repair.eventId));
  await drain();assert.equal((await current()).rootId,r2);
  await edit(r1,'These binoculars provide a bright image with useful magnification for watching distant wildlife.');const before=encoded.length;await drain();assert.equal(encoded.length,before);
 });
 await check(cases,6,async()=>{
  failText='This public review temporarily fails encoding while other public contributions can still be indexed.';await edit(r2,failText);
  r3=await post('This independent binoculars review describes lens quality and performance during hiking and bird watching.');
  const out=await upkeep.turn(raw);assert.deepEqual(out,['deferred','stored']);assert.equal((await current()).rootId,r3);
  assert(!(await repo.tasks(raw)).some(t=>t.witness?.rootId===r2));assert((await one(owner,"SELECT EXISTS(SELECT 1 FROM canonical_v4.named_public_events WHERE root_id=$1 AND retry_after>clock_timestamp()) deferred",[r2])).deferred);
  failText=null;
 });
 await check(cases,7,async()=>{
  await edit(r3,'A newly edited public binoculars review evaluates its focus control and low light optical performance.');
  const task=(await repo.tasks(raw)).find(t=>t.witness?.rootId===r3);assert(task);const ready=defer(),release=defer();
  const work=worker.transaction(async tx=>{assert.equal(await store(task,prepared,repository({database:tx})),'stored');ready.resolve();await release.promise;});work.catch(e=>ready.resolve({error:e}));
  try{const r=await ready.promise;if(r?.error)throw r.error;assert.equal(await within(current()),undefined);
   r4=await within(post('Another public review compares binoculars lenses and handling for wildlife watching on longer trips.'));
  }finally{release.resolve();await work;}
  await drain();assert.equal((await current()).rootId,r3);
 });
 await check(cases,8,async()=>{
  const taskRow=await one(owner,"INSERT INTO canonical_v4.named_public_events(generation,kind,scope_id,root_id) VALUES($1,'root',$2,$3) RETURNING event_id::text id",[generation,context.scope.id,r3]);
  const task=(await repo.tasks(raw)).find(t=>t.eventId===taskRow.id);assert(task);const ready=defer(),release=defer();
  const held=owner.transaction(async tx=>{await createCanonicalV4LifecycleRepository({database:tx}).command(await one(tx,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton'),{type:'edit',contributionId:r3,body:'The current revision adds detailed public observations about weather sealing and the binoculars optical performance.'},actor);
   ready.resolve();await release.promise;});held.catch(e=>ready.resolve({error:e}));
  try{const r=await ready.promise;if(r?.error)throw r.error;assert.equal(await within(store(task,null,repository({database:observer}))),'busy');assert.equal((await within(current())).rootId,r3);
  }finally{release.resolve();await held;}
  assert.equal(await current(),undefined);await drain();assert.equal((await current()).rootId,r3);
 });
 await check(cases,9,async()=>{
  const c=await current();await assert.rejects(owner.transaction(async tx=>{
   // Deliberately invented owner-only records test lookup capacity, not a normal
   // publication/issuer path. All writes roll back with the expected refusal.
   for(let i=0;i<65;i++){
    const id='public-evidence-capacity-'+i,topic='a0000000-0000-4000-8000-'+String(i).padStart(12,'0');
    await tx.query('INSERT INTO canonical_v4.named_subject_ids VALUES($1,1)',[topic]);
    await tx.query("INSERT INTO canonical_v4.id_registry(id,kind) VALUES($1,'contributions')",[id]);
    await tx.query(`INSERT INTO canonical_v4.contributions SELECT $1,discussion_id,root_id,reply_to_id,author_id,operator_id,origin_source_id,anchor_source_id,
     actor_type,visibility,withdrawn,created_at,revision_count,nextval('canonical_v4.contribution_ordinal_sequence'),payload,write_version FROM canonical_v4.contributions WHERE id=$2`,[id,r4]);
    await tx.query("INSERT INTO canonical_v4.named_root_contexts VALUES($1,$2,'named',$3,$4)",[id,generation,topic,c.caption]);
    if(i===0)assert.equal((await one(tx,'SELECT count(*)::integer n FROM canonical_v4.named_public_roots WHERE root_id=$1',[id])).n,0,'old incomplete clone has no current public body');
    await tx.query('INSERT INTO canonical_v4.revisions(contribution_id,ordinal,payload) SELECT $1,ordinal,payload FROM canonical_v4.revisions WHERE contribution_id=$2',[id,r4]);
    if(i===0)assert.equal((await one(tx,'SELECT count(*)::integer n FROM canonical_v4.named_public_roots WHERE root_id=$1',[id])).n,1,'copying the revision restores the exact public body');
    const inserted=await tx.query('INSERT INTO canonical_v4.named_public_prototypes SELECT generation,$2,scope_id,root_id,public_digest,$3,$4::double precision[],human,$5 FROM canonical_v4.named_public_roots WHERE root_id=$1',[id,identity.representationHash,c.focusKey,unit,PUBLISHED_TOPIC_INPUT_HASH]);assert.equal(inserted.rowCount,1);
   }
   assert.equal((await one(tx,"SELECT count(*)::integer n FROM canonical_v4.named_public_prototypes WHERE root_id LIKE 'public-evidence-capacity-%'")).n,65);
   await repository({database:tx}).candidates(JSON.stringify({generation,representationHash:identity.representationHash,focusKeys:[c.focusKey]}));
  }),code('invalid'));
  assert.equal((await current()).rootId,r3);
 });
 await check(cases,10,async()=>{
  for(const role of ['murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker'])for(const query of ['SELECT * FROM canonical_v4.named_public_roots','SELECT * FROM canonical_v4.named_public_prototypes','SELECT * FROM canonical_v4.named_public_events'])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(query);}),code('42501'));
  for(const role of ['murmingle_app','murmingle_crawler_submitter'])await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query('SELECT canonical_v4.named_public_tasks($1,$2)',[generation,matcherHash]);}),code('42501'));
  const focus=(await current()).focusKey;const plan=await owner.transaction(async tx=>{await tx.exec('SET LOCAL enable_seqscan=off');return tx.query("EXPLAIN (FORMAT JSON) SELECT * FROM canonical_v4.named_public_prototypes WHERE generation=$1 AND representation_hash=$2 AND focus_key=$3 ORDER BY focus_key,scope_id LIMIT 65",[generation,identity.representationHash,focus]);});
  assert(JSON.stringify(plan.rows).includes('named_public_prototype_focus'));assert(!JSON.stringify(await current()).includes(context.scope.materialDigest));
 });
 return async()=>check(cases,11,async()=>{
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.sources')).n,0);assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_subject_heads')).n,0);
  const before=encoded.length,publicBefore=await current();await drain();const c=await current();assert.equal(c.rootId,r3);assert(c.body.includes('weather sealing'));
  assert.equal(c.publicDigest,publicBefore.publicDigest);assert.deepEqual(c.vector,publicBefore.vector);assert(!encoded.slice(before).includes(publicBefore.body));
  assert(c.identityRevision!=='0');assert(!Object.keys(c).some(k=>['sourceId','operationDigest','materialDigest','originSourceId'].includes(k)));
  await upkeep.close();for(const root of roots)await life.command(await expected(),{type:'withdraw',contributionId:root},actor);
  await owner.transaction(async tx=>{for(const table of ['command_receipts','revisions'])await tx.query('DELETE FROM canonical_v4.'+table+' WHERE contribution_id=ANY($1::text[])',[roots]);
   await tx.query('DELETE FROM canonical_v4.contributions WHERE id=ANY($1::text[])',[roots]);await tx.query('DELETE FROM canonical_v4.id_registry WHERE id=ANY($1::text[])',[roots]);});
  await owner.exec(`DROP TRIGGER named_public_new_context ON canonical_v4.named_root_contexts;DROP TRIGGER named_public_changed_body ON canonical_v4.contributions;
   DROP TRIGGER named_public_removed_prototype ON canonical_v4.named_public_prototypes;
   DROP FUNCTION canonical_v4.named_schedule_public_evidence(),canonical_v4.named_public_tasks(text,text),canonical_v4.named_repair_public_scope(text,text,bigint),
    canonical_v4.named_store_public_evidence(text,text,bigint,jsonb,text,double precision[],double precision[],text,text),canonical_v4.named_public_candidates(text,text,jsonb),canonical_v4.named_defer_public_evidence(text,bigint);
   DROP TABLE canonical_v4.named_public_events,canonical_v4.named_public_prototypes;DROP VIEW canonical_v4.named_public_roots;`);
 });
}
