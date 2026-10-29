// Real native SQL/race assertions with invented canonical fixture material.
// Existing owned connections only; no live database or public HTTP request.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPublicSubjectRegistry} from '../canonical-v4/public-subject-registry.js';
import {createPublicSubjectSourceRepository} from '../canonical-v4/public-subject-source-repository.js';
import {createCanonicalV4RuntimeRepository} from '../canonical-v4/runtime-repository.js';
import {sourceStamp,operationDigestFor} from '../../src/domain/source-threads.js';
import names from './public-subject-source-native-cases.json' with {type:'json'};
export const PUBLIC_SOURCE_NATIVE_CASES=Object.freeze([...names]);
const MODEL='e5-small-q8-browser-main-prefix-v1',TOPIC='public-binding-topic',DISCUSSION='public-binding-discussion';
const code=expected=>error=>error?.code===expected;
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const url=(site,title)=>'https://'+site.slice(0,2)+'.wikipedia.org/wiki/'+encodeURIComponent(title.replaceAll(' ','_'));
function publicMetadata(revision=123){const entity=(id,titles)=>({id,type:'item',lastrevid:revision,
 labels:{mul:{language:'mul',value:revision===123?'Atlas':'Atlas revised'}},
 descriptions:{en:{language:'en',value:id==='Q101'?'invented programming language':'invented mountain range'}},
 sitelinks:Object.fromEntries(Object.entries(titles).map(([site,title])=>[site,{site,title}]))});
 return JSON.stringify({entities:{Q101:entity('Q101',{enwiki:'Atlas (programming language)',dewiki:'Atlas (Programmiersprache)'}),Q202:entity('Q202',{enwiki:'Atlas Mountains'})}});
}
async function one(db,sql,args=[]){const {rows}=await db.query(sql,args);assert.equal(rows.length,1);return rows[0];}
async function waiting(observer,pid){
 const end=performance.now()+1200;
 while(performance.now()<end){const row=await one(observer,"SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active' AND wait_event_type='Lock') waiting",[pid]);if(row.waiting)return;await delay(10);}
 assert.fail('expected existing owned connection to wait on its SQL lock');
}
async function within(promise,ms=1200){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('owned concurrent operation did not finish')),ms);})]);}
 catch(error){await promise.catch(()=>{});throw error;}finally{clearTimeout(timer);}}

export async function runPublicSourceNativeAssertions({owner,worker,app,observer,generation,cases}){
 const workerRepo=createPublicSubjectSourceRepository({database:worker}),appRepo=createPublicSubjectSourceRepository({database:app}),registry=createPublicSubjectRegistry({database:owner});
 const sources=new Map();let serial=0,rootId=null;const seededIds=['en','mountains','general','de'].map(s=>'public-binding-source-'+s);
 const request=(sourceId,language='en')=>({generation,sourceId,language});
 const witness=async sourceId=>{const row=await one(owner,`SELECT s.id "sourceId",s.write_version::text "sourceVersion",s.operation_id "operationId",
  r.operation_digest "operationDigest",st.stamp "sourceStamp" FROM canonical_v4.sources s JOIN canonical_v4.operation_receipts r ON r.source_id=s.id
  JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id WHERE s.id=$1`,[sourceId]);return {generation,...row};};
 const candidates=(afterOrdinal=null,limit=50)=>workerRepo.candidates({generation,afterOrdinal,limit});
 const associations=()=>owner.query('SELECT to_jsonb(b) value FROM canonical_v4.public_subject_source_bindings b ORDER BY source_id').then(r=>r.rows);
 const routes=()=>owner.query('SELECT source_id,topic_id,method,payload FROM canonical_v4.source_links ORDER BY source_id').then(r=>r.rows);
 const test=async(index,body)=>{const row={name:names[index],status:'running'};cases.push(row);try{await body();row.status='passed';}catch(error){row.status='failed';throw error;}};
 const ownerPid=Number((await one(owner,'SELECT pg_backend_pid() pid')).pid);
 async function bindHeld(sourceId,body){
  const ready=deferred(),release=deferred(),input=await witness(sourceId);let entered=false;
  const held=worker.transaction(async tx=>{const value=await createPublicSubjectSourceRepository({database:tx}).bind(input);entered=true;ready.resolve({value});await release.promise;});
  held.catch(error=>ready.resolve({error}));let primary;
  try{const state=await ready.promise;if(state.error)throw state.error;await body(state.value,()=>release.resolve());}
  catch(error){primary=error;}
  finally{release.resolve();try{await held;}catch(error){primary??=error;}}
  assert(entered);if(primary)throw primary;
 }
 await test(0,async()=>{
  await owner.exec(await readFile(new URL('../canonical-v4/drafts/public-subject-registry.sql',import.meta.url),'utf8'));
  await owner.exec(await readFile(new URL('../canonical-v4/drafts/public-subject-source-bindings.sql',import.meta.url),'utf8'));
  assert.deepEqual(await associations(),[]);
  for(const title of ['Atlas (programming language)',"O'Brien's Atlas",'Café','Känguru','日本語','Atlas/A','100% Atlas','# Atlas','Atlas: 1','Atlas + one','Atlas?']){
   const expected=url('enwiki',title);assert.equal((await one(owner,'SELECT canonical_v4.subject_wikipedia_url($1,$2) value',['enwiki',title])).value,expected);
   assert.equal((await one(owner,'SELECT canonical_v4.subject_wikipedia_url_key($1) value',[expected])).value,expected);
  }
  for(const value of ['https://en.wikipedia.org/wiki/Atlas/A','https://en.wikipedia.org/wiki/Atlas%2fA'])assert.equal((await one(owner,'SELECT canonical_v4.subject_wikipedia_url_key($1) value',[value])).value,url('enwiki','Atlas/A'));
  for(const value of ['http://en.wikipedia.org/wiki/Atlas','https://en.wikipedia.org.evil.example/wiki/Atlas','https://name:password@en.wikipedia.org/wiki/Atlas','https://en.wikipedia.org:443/wiki/Atlas','https://en.wikipedia.org/wiki/Atlas?oldid=1','https://en.wikipedia.org/wiki/Atlas#part','https://en.wikipedia.org/wiki/%zz','https://en.wikipedia.org/wiki/%ff','https://en.wikipedia.org/wiki/%00','https://en.wikipedia.org/wiki/../Atlas','https://en.wikipedia.org/wiki/%2e%2e/Atlas'])
   assert.equal((await one(owner,'SELECT canonical_v4.subject_wikipedia_url_key($1) value',[value])).value,null);
  await registry.importWikipedia(publicMetadata());
 });
 await test(1,async()=>{
  const createdAt='2026-10-29T00:00:00Z';
  await owner.transaction(async tx=>{
   await tx.query("INSERT INTO canonical_v4.id_registry VALUES($1,'topics'),($2,'discussions')",[TOPIC,DISCUSSION]);
   await tx.query(`INSERT INTO canonical_v4.topics(id,ordinal,payload,kind,title,created_at) VALUES($1,nextval('canonical_v4.topic_ordinal_sequence'),$2,'general',$3,$4)`,
    [TOPIC,JSON.stringify({id:TOPIC,kind:'general',title:'Invented binding destination',createdAt,reference:null}),'Invented binding destination',createdAt]);
   await tx.query(`INSERT INTO canonical_v4.discussions(id,topic_id,ordinal,payload) VALUES($1,$2,nextval('canonical_v4.discussion_ordinal_sequence'),$3)`,[DISCUSSION,TOPIC,JSON.stringify({id:DISCUSSION,topicId:TOPIC})]);
   await tx.query("INSERT INTO canonical_v4.fixed_references(topic_id,payload) VALUES($1,'null')",[TOPIC]);
   for(const [suffix,pageUrl]of [['en',url('enwiki','Atlas (programming language)')],['mountains',url('enwiki','Atlas Mountains')],['general','https://binding.example.org/Atlas'],['de',url('dewiki','Atlas (Programmiersprache)')]]){
    const id='public-binding-source-'+suffix,input={url:pageUrl,title:'Invented Atlas article '+suffix,embedding:{modelId:MODEL,values:Array.from({length:384},(_,i)=>i===0?1:0)},extractorVersion:'crawler-static-html-prefix/v1'};
    const operationId='public-binding-operation-'+suffix,operationDigest=operationDigestFor(input),stamp=sourceStamp(input),policyVersion='ridge1-fixed-reference-radius/v1';
    const payload={id,...input,provenance:'owner-local-page-embedding/v1',operationId,operationDigest,policyVersion,topicIds:[TOPIC]};sources.set(id,{input,operationId,operationDigest,stamp});
    await tx.query("INSERT INTO canonical_v4.id_registry VALUES($1,'sources')",[id]);
    await tx.query(`INSERT INTO canonical_v4.sources(id,ordinal,payload,url,title,provenance,extractor_version,policy_version,operation_id,has_embedding)
     VALUES($1,nextval('canonical_v4.source_ordinal_sequence'),$2,$3,$4,'owner-local-page-embedding/v1',$5,$6,$7,true)`,[id,JSON.stringify(payload),input.url,input.title,input.extractorVersion,policyVersion,operationId]);
    await tx.query('INSERT INTO canonical_v4.embeddings(source_id,payload,model_id,dimensions,values_double) VALUES($1,$2,$3,384,$4::double precision[])',[id,JSON.stringify(input.embedding),MODEL,'{'+input.embedding.values.join(',')+'}']);
    await tx.query('INSERT INTO canonical_v4.operation_receipts VALUES($1,$2,$3)',[id,operationId,operationDigest]);
    await tx.query('INSERT INTO canonical_v4.runtime_source_stamps VALUES($1,$2,true)',[id,stamp]);
    await tx.query('INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal) VALUES($1,$2,0)',[id,TOPIC]);
    await tx.query(`INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method) VALUES($1,$2,nextval('canonical_v4.source_link_ordinal_sequence'),$3,'manual-confirmed')`,[id,TOPIC,JSON.stringify({sourceId:id,topicId:TOPIC,method:'manual-confirmed'})]);
   }
  });
  const all=await candidates();assert.equal(all.length,3);assert(all.every(r=>r.sourceVersion==='0'));assert(!all.some(r=>r.sourceId.endsWith('-general')));
  const first=await candidates(null,1),second=await candidates(first[0].ordinal,1);assert.equal(first.length,1);assert.equal(second.length,1);assert.notEqual(first[0].sourceId,second[0].sourceId);
  assert.equal((await appRepo.context(request(seededIds[0]))).status,'pending');
 });
 await test(2,async()=>{
  const before=await routes();for(const {ordinal,...w} of await candidates())assert.equal((await workerRepo.bind(w)).status,'bound');
  const a=await appRepo.context(request(seededIds[0])),b=await appRepo.context(request(seededIds[1])),d=await appRepo.context(request(seededIds[3],'de'));
  assert.equal(a.subject.subjectId,d.subject.subjectId);assert.notEqual(a.subject.subjectId,b.subject.subjectId);assert.equal(a.subject.label,b.subject.label);assert.equal(d.subject.labelLanguage,'mul');
  assert.equal((await workerRepo.bind(await witness(seededIds[2]))).status,'unresolved');assert.equal((await appRepo.context(request(seededIds[2]))).subject,null);assert.deepEqual(await candidates(),[]);assert.deepEqual(await routes(),before);
 });
 await test(3,async()=>{
  const current=await witness(seededIds[0]),before=await associations();
  for(const change of [{generation:generation+'-stale'},{sourceVersion:'1'},{operationId:'another-operation'},{operationDigest:'f'.repeat(64)},{sourceStamp:'f'.repeat(64)}])await assert.rejects(workerRepo.bind({...current,...change}),code('P1271'));
  await assert.rejects(worker.transaction(async tx=>{await tx.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await createPublicSubjectSourceRepository({database:tx}).bind(current);}),code('P1273'));
  assert.deepEqual(await associations(),before);
 });
 await test(4,async()=>{
  const id=seededIds[0],stale=await witness(id),old=sources.get(id),input={...old.input,title:'Invented changed title'},operationId=old.operationId+'-renewed',operationDigest=operationDigestFor(input);
  await owner.transaction(async tx=>{await tx.query('UPDATE canonical_v4.operation_receipts SET operation_id=$2,operation_digest=$3 WHERE source_id=$1',[id,operationId,operationDigest]);
   await tx.query(`UPDATE canonical_v4.sources SET write_version=write_version+1,title=$2,operation_id=$3,payload=(payload::jsonb||$4::jsonb)::text WHERE id=$1`,[id,input.title,operationId,JSON.stringify({title:input.title,operationId,operationDigest})]);});
  assert.equal((await appRepo.context(request(id))).status,'pending');await assert.rejects(workerRepo.bind(stale),code('P1271'));assert.equal((await workerRepo.bind(await witness(id))).status,'bound');
  await owner.query('UPDATE canonical_v4.runtime_source_stamps SET postable=false WHERE source_id=$1',[id]);assert.equal((await appRepo.context(request(id))).status,'ineligible');assert.equal((await workerRepo.bind(await witness(id))).status,'ineligible');
  await owner.query('UPDATE canonical_v4.runtime_source_stamps SET postable=true WHERE source_id=$1',[id]);assert.equal((await workerRepo.bind(await witness(id))).status,'bound');
  await owner.query('UPDATE canonical_v4.operation_receipts SET operation_digest=$2 WHERE source_id=$1',[id,'e'.repeat(64)]);assert.equal((await appRepo.context(request(id))).status,'pending');await assert.rejects(workerRepo.bind(await witness(id)),code('P1274'));
  await owner.query('UPDATE canonical_v4.operation_receipts SET operation_digest=$2 WHERE source_id=$1',[id,operationDigest]);await workerRepo.bind(await witness(id));
 });
 await test(5,async()=>{
  const w=await witness(seededIds[0]);await assert.rejects(createPublicSubjectSourceRepository({database:app}).bind(w),code('42501'));
  await assert.rejects(createPublicSubjectSourceRepository({database:app}).candidates({generation,afterOrdinal:null,limit:1}),code('42501'));
  await assert.rejects(workerRepo.context(request(seededIds[0])),code('42501'));
  for(const role of ['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'])
   for(const sql of ['SELECT * FROM canonical_v4.public_subject_source_bindings','DELETE FROM canonical_v4.public_subject_source_bindings WHERE false'])
    await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
  await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE murmingle_crawler_submitter');await createPublicSubjectSourceRepository({database:tx}).bind(w);}),code('42501'));
 });
 await test(6,async()=>{
  const sentinel=new Error('invented generation rollback'),acquired=deferred();let change=null;
  try{await bindHeld(seededIds[1],async(_value,release)=>{
   assert.equal((await within(appRepo.context(request(seededIds[1])))).status,'bound');
   await within(observer.query('UPDATE canonical_v4.runtime_state SET revision=revision WHERE singleton'));
   change=owner.transaction(async tx=>{await tx.query('UPDATE canonical_v4.runtime_state SET generation=$1 WHERE singleton',[generation+'-rolled-back']);acquired.resolve();throw sentinel;});change.catch(()=>{});
   await waiting(observer,ownerPid);assert.equal((await within(appRepo.context(request(seededIds[1])))).status,'bound');release();
  });}finally{if(change)await assert.rejects(change,error=>error===sentinel);}
  await acquired.promise;assert.equal((await appRepo.context(request(seededIds[1]))).status,'bound');
 });
 await test(7,async()=>{
  let update=null;
  try{await bindHeld(seededIds[0],async(_value,release)=>{update=registry.importWikipedia(publicMetadata(124));update.catch(()=>{});await waiting(observer,ownerPid);
   const view=await within(appRepo.context(request(seededIds[0])));assert.equal(view.subject.revision,'123');assert.equal(view.subject.label,'Atlas');release();
  });}finally{if(update)await update;}
  assert.equal((await appRepo.context(request(seededIds[0]))).status,'pending');await workerRepo.bind(await witness(seededIds[0]));const latest=await appRepo.context(request(seededIds[0]));assert.equal(latest.subject.revision,'124');assert.equal(latest.subject.label,'Atlas revised');
 });
 await test(8,async()=>{
  const runtime=createCanonicalV4RuntimeRepository({database:app,nextId:kind=>'public-binding-'+kind+'-'+(++serial),now:()=>new Date().toISOString()});
  const expected=await one(owner,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton');
  const posted=await runtime.command({actorId:'demo-alex',requestId:'public-binding-root-request',expected,command:{type:'create-root',topicId:TOPIC,body:'Invented discussion survives Source erasure',originSourceId:seededIds[0]}});rootId=posted.result.contributionId;
  const before=await one(owner,"SELECT c.id,c.discussion_id,r.payload::jsonb->>'body' body FROM canonical_v4.contributions c JOIN canonical_v4.revisions r ON r.contribution_id=c.id AND r.ordinal=0 WHERE c.id=$1",[rootId]);
  assert.equal(before.body,'Invented discussion survives Source erasure');let erasure=null;
  try{await bindHeld(seededIds[0],async(_value,release)=>{erasure=owner.query('SELECT canonical_v4.ingest_forget_source($1,$2)',[generation,seededIds[0]]);erasure.catch(()=>{});await waiting(observer,ownerPid);
   assert.equal((await within(appRepo.context(request(seededIds[0])))).status,'bound');release();
  });}finally{if(erasure)await erasure;}
  await assert.rejects(appRepo.context(request(seededIds[0])),code('P1272'));
  const after=await one(owner,"SELECT c.id,c.discussion_id,r.payload::jsonb->>'body' body,c.origin_source_id,c.anchor_source_id FROM canonical_v4.contributions c JOIN canonical_v4.revisions r ON r.contribution_id=c.id AND r.ordinal=0 WHERE c.id=$1",[rootId]);assert.deepEqual({id:after.id,discussion_id:after.discussion_id,body:after.body},before);assert.equal(after.origin_source_id,null);assert.equal(after.anchor_source_id,null);
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.public_subject_source_bindings WHERE source_id=$1',[seededIds[0]])).n,0);assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.public_subjects')).n,2);
 });
 await test(9,async()=>{
  for(const id of seededIds.slice(1))await owner.query('SELECT canonical_v4.ingest_forget_source($1,$2)',[generation,id]);
  assert.deepEqual(await associations(),[]);
  await owner.transaction(async tx=>{
   await tx.query('DELETE FROM canonical_v4.command_receipts WHERE contribution_id=$1',[rootId]);await tx.query('DELETE FROM canonical_v4.revisions WHERE contribution_id=$1',[rootId]);await tx.query('DELETE FROM canonical_v4.contributions WHERE id=$1',[rootId]);
   await tx.query('DELETE FROM canonical_v4.fixed_references WHERE topic_id=$1',[TOPIC]);await tx.query('DELETE FROM canonical_v4.discussions WHERE id=$1',[DISCUSSION]);await tx.query('DELETE FROM canonical_v4.topics WHERE id=$1',[TOPIC]);await tx.query('DELETE FROM canonical_v4.id_registry WHERE id=ANY($1::text[])',[[...seededIds,rootId,DISCUSSION,TOPIC]]);
  });
  await owner.exec(`DROP TRIGGER subject_source_changed ON canonical_v4.sources;DROP TRIGGER subject_receipt_changed ON canonical_v4.operation_receipts;DROP TRIGGER subject_stamp_changed ON canonical_v4.runtime_source_stamps;
   DROP FUNCTION canonical_v4.subject_invalidate_source_binding(),canonical_v4.subject_bind_source(text,text,bigint,text,text,text),canonical_v4.subject_read_source(text,text,text),canonical_v4.subject_binding_candidates(text,bigint,integer);
   DROP TABLE canonical_v4.public_subject_source_bindings;DROP INDEX canonical_v4.public_subject_sources_wiki_url,canonical_v4.public_subject_runtime_generation_key;
   ALTER TABLE canonical_v4.public_subject_sitelinks DROP COLUMN canonical_url;
   DROP FUNCTION canonical_v4.subject_wikipedia_url_key(text),canonical_v4.subject_wikipedia_url(text,text);
   DROP FUNCTION canonical_v4.subject_import_wikipedia(text,jsonb),canonical_v4.subject_read_wikipedia(text,text,text);
   DROP TABLE canonical_v4.public_subject_sitelinks;ALTER TABLE canonical_v4.public_subjects DROP CONSTRAINT public_subject_current_version;
   DROP TABLE canonical_v4.public_subject_versions;DROP TABLE canonical_v4.public_subjects;`);
  assert.equal((await one(owner,"SELECT to_regclass('canonical_v4.public_subject_source_bindings') value")).value,null);
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.sources')).n,0);
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.contributions')).n,0);
 });
}
