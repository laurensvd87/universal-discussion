// Actual PostgreSQL component checks, invented titles/vectors/identities only.
// Reuses existing owned owner/worker/app/observer connections; no live DB/model.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createAutomaticNamedSubjectRepository as repository} from '../canonical-v4/automatic-named-subject-repository.js';
import {createCanonicalV4SemanticSourceRepository} from '../canonical-v4/semantic-source-repository.js';
import {createStoredSourceHierarchyPreparation} from '../canonical-v4/semantic-source-preparation.js';
import {createCanonicalV4RuntimeRepository} from '../canonical-v4/runtime-repository.js';
import {describeRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';
import {compilePairedE5Input,applyPairedE5Input} from '../../src/domain/hierarchical-e5-paired-input.js';
import {planAutomaticNamedSubjectsV2 as plan,GENERAL_SUBJECT_POLICY_V2_HASH as policyHash} from '../../src/application/automatic-named-subject-plan.js';
import {sourceStamp,operationDigestFor} from '../../src/domain/source-threads.js';
import names from './automatic-subject-native-cases.json' with {type:'json'};
export const AUTOMATIC_SUBJECT_NATIVE_CASES=Object.freeze([...names]);
const sha=x=>createHash('sha256').update(x).digest('hex'),MODEL='e5-small-q8-browser-main-prefix-v1',TOPIC='topic-semantic-manual';
const wire=v=>'{'+v.join(',')+'}',code=expected=>e=>e?.code===expected;
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
async function within(promise,ms=1200){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('bounded general subject operation did not finish')),ms);})]);}finally{clearTimeout(timer);}}
async function waiting(observer,pid){const end=performance.now()+1200;while(performance.now()<end){
 if((await one(observer,"SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active' AND wait_event_type='Lock') waiting",[pid])).waiting)return;
 await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('existing owned connection did not reach its expected SQL lock');}
export function automaticSubjectNativeCommand(input){const p=plan(JSON.stringify(input));return structuredClone({generation:p.generation,policyHash:p.policyHash,matcherHash:p.matcherHash,representationHash:p.representationHash,
 updates:p.updates,selections:p.selections,witnesses:p.commitWitnesses,candidates:input.candidates.map(({subjectId,revision,focusKey,contextRootId})=>({subjectId,revision,focusKey,contextRootId}))});}

export async function runAutomaticSubjectNativeAssertions({owner,worker,app,observer,generation,matcher,cases}){
 const identity=describeRootedHierarchyMatcher(matcher),matcherHash=sha(JSON.stringify(identity)),
  fusion=compilePairedE5Input({bodyWeight:identity.inputDefinition.bodyWeight,titleWeight:identity.inputDefinition.titleWeight,encoderHash:identity.inputDefinition.encoderHash});
 const repo=repository({database:worker}),read=repository({database:app}),stored=createCanonicalV4SemanticSourceRepository({database:worker});
 const titles=['Steam Deck OLED battery replacement','Steam Deck OLED screen replacement','Steam Deck LCD battery replacement','Steam Deck LCD screen replacement',
  'Nintendo Switch 2 repair','Nintendo Switch OLED repair','Unannounced novel product'];
 const ids=titles.map((_,i)=>'general-native-source-'+i),rows=new Map(),byTitle=new Map();let firstIds=null,humanRoot=null,request=null,serial=0;
 const prep=createStoredSourceHierarchyPreparation({matcher,embedTitle:async title=>({modelId:MODEL,values:byTitle.get(title)})});
 const test=async(index,body)=>{const row={name:names[index],status:'running'};cases.push(row);try{await body();row.status='passed';}catch(error){row.status='failed';throw error;}};
 const context=id=>read.source(JSON.stringify({generation,sourceId:id}));
 const state=()=>one(owner,`SELECT (SELECT count(*)::integer FROM canonical_v4.named_subject_ids) identities,
  (SELECT count(*)::integer FROM canonical_v4.named_subject_heads) heads,
  (SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.subject_id),'[]'::jsonb) FROM canonical_v4.named_subject_heads h) metadata,
  (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.source_id),'[]'::jsonb) FROM canonical_v4.named_subject_selections s) selections`);
 const routes=()=>owner.query('SELECT source_id,topic_id,method,payload FROM canonical_v4.source_links ORDER BY source_id').then(r=>r.rows);
 async function prepare(){
  const packet=await stored.candidates({generation,matcherIdentityHash:matcherHash,afterOrdinal:null,limit:50});
  for(const candidate of packet.candidates.filter(c=>ids.includes(c.sourceId))){const value=await prep.prepare(candidate);assert(value);await stored.reclassify({generation,matcherIdentityHash:matcherHash,items:[value]});}
 }
 async function input(selected=ids,{retrieve=true}={}){
  const observations=[],sourceWitnesses=[];
  for(const id of selected){const r=await one(owner,`SELECT s.id,s.title,s.url,s.write_version::text version,s.operation_id,r.operation_digest,st.stamp,
    i.body_values,i.title_values,i.supported_path FROM canonical_v4.sources s JOIN canonical_v4.operation_receipts r ON r.source_id=s.id
    JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id JOIN canonical_v4.semantic_inputs i ON i.source_id=s.id AND i.operation_digest=r.operation_digest
    WHERE s.id=$1 AND i.matcher_hash=$2`,[id,matcherHash]);
   const w={sourceId:id,sourceVersion:r.version,operationId:r.operation_id,operationDigest:r.operation_digest,sourceStamp:r.stamp};sourceWitnesses.push(w);
   const inputHash=sha(JSON.stringify(Object.values(w)));observations.push({sourceId:id,inputHash,materialHash:sha(JSON.stringify([r.title,r.body_values])),title:r.title,
    publisherKey:'general.example.org',acceptedPath:r.supported_path,vector:applyPairedE5Input(fusion,{sourceId:id,sourceVersion:inputHash,bodyVector:r.body_values,titleVector:r.title_values}).vector});
  }
  const a={generation,policyHash,representationHash:identity.representationHash,matcherHash,minimumSimilarity:.8,observations,sourceWitnesses,candidates:[]};
  const scopes=[...new Map(plan(JSON.stringify(a)).updates.map(u=>[u.focusKey+'|'+u.contextRootId,{focusKey:u.focusKey,contextRootId:u.contextRootId}])).values()];
  if(retrieve&&scopes.length)a.candidates=await repo.candidates(JSON.stringify({generation,representationHash:a.representationHash,scopes}));return a;
 }
 async function held(a,body){
  const ready=defer(),release=defer();let primary;const work=worker.transaction(async tx=>{const result=await repository({database:tx}).publish(JSON.stringify(a));ready.resolve({result});await release.promise;});
  work.catch(error=>ready.resolve({error}));try{const r=await ready.promise;if(r.error)throw r.error;await body(r.result,()=>release.resolve());}catch(error){primary=error;}
  finally{release.resolve();try{await work;}catch(error){primary??=error;}}if(primary)throw primary;
 }
 let ownerPid=null;
 await test(0,async()=>{
  await owner.exec(await readFile(new URL('../canonical-v4/drafts/automatic-named-subjects.sql',import.meta.url),'utf8'));
  ownerPid=Number((await one(owner,'SELECT pg_backend_pid() pid')).pid);
  for(const [title,start,end,expected]of [['Koalas',0,6,'Koalas'],['\ud83d\udc28 Koalas',3,9,'Koalas'],['\ud83d\udc28 Koalas',1,2,null],['\ufb01sh',0,4,'fish']])
   assert.equal((await one(owner,'SELECT canonical_v4.named_title_slice($1,$2,$3) value',[title,start,end])).value,expected);
 });
 await test(1,async()=>{
  await owner.transaction(async tx=>{for(let i=0;i<ids.length;i++){
   const values=Array.from({length:384},(_,j)=>j===0?.97:j===i+3?Math.sqrt(1-.97**2):0);byTitle.set(titles[i],values);
   const material={url:'https://general.example.org/products/'+i,title:titles[i],embedding:{modelId:MODEL,values},extractorVersion:'crawler-static-html-prefix/v1'},
    operationId='general-native-operation-'+i,operationDigest=operationDigestFor(material),stamp=sourceStamp(material),policyVersion='ridge1-fixed-reference-radius/v1';
   rows.set(ids[i],{material,operationId,operationDigest,stamp});
   await tx.query("INSERT INTO canonical_v4.id_registry VALUES($1,'sources')",[ids[i]]);
   await tx.query(`INSERT INTO canonical_v4.sources(id,ordinal,payload,url,title,provenance,extractor_version,policy_version,operation_id,has_embedding)
    VALUES($1,nextval('canonical_v4.source_ordinal_sequence'),$2,$3,$4,'owner-local-page-embedding/v1',$5,$6,$7,true)`,
    [ids[i],JSON.stringify({id:ids[i],...material,provenance:'owner-local-page-embedding/v1',operationId,operationDigest,policyVersion,topicIds:[TOPIC]}),material.url,material.title,material.extractorVersion,policyVersion,operationId]);
   await tx.query('INSERT INTO canonical_v4.embeddings(source_id,payload,model_id,dimensions,values_double) VALUES($1,$2,$3,384,$4::double precision[])',[ids[i],JSON.stringify(material.embedding),MODEL,wire(values)]);
   await tx.query('INSERT INTO canonical_v4.operation_receipts VALUES($1,$2,$3)',[ids[i],operationId,operationDigest]);await tx.query('INSERT INTO canonical_v4.runtime_source_stamps VALUES($1,$2,true)',[ids[i],stamp]);
   await tx.query('INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal) VALUES($1,$2,0)',[ids[i],TOPIC]);
   await tx.query(`INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method) VALUES($1,$2,nextval('canonical_v4.source_link_ordinal_sequence'),$3,'manual-confirmed')`,[ids[i],TOPIC,JSON.stringify({sourceId:ids[i],topicId:TOPIC,method:'manual-confirmed'})]);
  }});assert.equal((await context(ids[0])).pageTitle,titles[0]);assert.equal((await context(ids[0])).subject,null);await prepare();
 });
 await test(2,async()=>{
  const before=await routes();request=await input();const expected=plan(JSON.stringify(request));assert.deepEqual(expected.updates.map(u=>u.label).sort(),['Nintendo Switch','Steam Deck','Steam Deck LCD','Steam Deck OLED']);
  const r=await repo.publish(JSON.stringify(request));assert.equal(r.subjects.length,4);assert.equal(r.selections.filter(s=>s.subjectId!==null).length,6);
  firstIds=new Map((await owner.query('SELECT label,subject_id::text id FROM canonical_v4.named_subject_heads')).rows.map(u=>[u.label,u.id]));assert.equal((await context(ids[0])).subject.id,firstIds.get('Steam Deck OLED'));
  assert.equal((await context(ids[0])).subject.parentId,firstIds.get('Steam Deck'));assert.deepEqual(await routes(),before);
 });
 await test(3,async()=>{
  request=await input();assert.equal(request.candidates.length,4);const r=await repo.publish(JSON.stringify(request));
  assert(r.subjects.every(s=>s.revision==='2'));assert.deepEqual(new Set(r.subjects.map(s=>s.subjectId)),new Set(firstIds.values()));
  // Updating one narrow scope cannot remove another scope's assignments.
  await repo.publish(JSON.stringify(await input(ids.slice(0,2))));assert.equal((await context(ids[2])).subject.id,firstIds.get('Steam Deck LCD'));
  // A repeat visit with identical material advances Source/operation fences,
  // while the subject UUID and the existing label/prototype remain stable.
  const renewed=ids[5],operationId='general-native-renewed-operation';
  await owner.transaction(async tx=>{
   await tx.query('UPDATE canonical_v4.operation_receipts SET operation_id=$2 WHERE source_id=$1',[renewed,operationId]);
   await tx.query("UPDATE canonical_v4.sources SET write_version=write_version+1,operation_id=$2,payload=jsonb_set(payload::jsonb,'{operationId}',to_jsonb($2::text))::text WHERE id=$1",[renewed,operationId]);
  });assert.equal((await context(renewed)).subject.id,firstIds.get('Nintendo Switch'));await prepare();
 });
 await test(4,async()=>{
  const before=await state();for(const key of ['sourceVersion','operationId','operationDigest','sourceStamp']){
   const a=await input();const w=a.sourceWitnesses[0];w[key]=key==='sourceVersion'?'9':key==='operationId'?'stale-operation':'f'.repeat(64);
   a.observations.find(o=>o.sourceId===w.sourceId).inputHash=sha(JSON.stringify(Object.values(w)));
   await assert.rejects(repo.publish(JSON.stringify(a)),code('conflict'));
  }await assert.rejects(repo.publish(JSON.stringify(await input(ids,{retrieve:false}))),code('conflict'));assert.deepEqual(await state(),before);
 });
 await test(5,async()=>{
  let update=null;try{await held(await input(),async(_result,release)=>{
   assert.equal((await within(context(ids[0]))).subject.id,firstIds.get('Steam Deck OLED'));
   await within(observer.query('UPDATE canonical_v4.runtime_state SET revision=revision WHERE singleton'));
   const previous=rows.get(ids[0]),material={...previous.material,title:previous.material.title+' updated'},operationId=previous.operationId+'-changed',operationDigest=operationDigestFor(material);
   byTitle.set(material.title,material.embedding.values);
   update=owner.transaction(async tx=>{
    await tx.query('UPDATE canonical_v4.operation_receipts SET operation_id=$2,operation_digest=$3 WHERE source_id=$1',[ids[0],operationId,operationDigest]);
    await tx.query('UPDATE canonical_v4.sources SET write_version=write_version+1,title=$2,operation_id=$3,payload=(payload::jsonb||$4::jsonb)::text WHERE id=$1',
     [ids[0],material.title,operationId,JSON.stringify({title:material.title,operationId,operationDigest})]);
   });update.catch(()=>{});await waiting(observer,ownerPid);
   assert.equal((await within(context(ids[0]))).subject.id,firstIds.get('Steam Deck OLED'));release();
  });}finally{if(update)await update;}
 });
 await test(6,async()=>{
  assert.equal((await context(ids[0])).sourceVersion,'1');assert.equal((await context(ids[0])).subject,null);
  assert.equal((await context(ids[1])).subject,null);assert.equal((await context(ids[4])).subject.id,firstIds.get('Nintendo Switch'));
  const old=await one(owner,'SELECT revision::text revision FROM canonical_v4.named_subject_ids WHERE id=$1',[firstIds.get('Steam Deck OLED')]);assert(BigInt(old.revision)>1n);
  await prepare();await repo.publish(JSON.stringify(await input()));assert((await context(ids[0])).subject);
 });
 await test(7,async()=>{
  const runtime=createCanonicalV4RuntimeRepository({database:app,nextId:kind=>'general-native-'+kind+'-'+(++serial),now:()=>new Date().toISOString()});
  const expected=await one(owner,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton');
  const posted=await runtime.command({actorId:'demo-alex',requestId:'general-native-root-request',expected,command:{type:'create-root',topicId:TOPIC,body:'Human discussion survives general subject withdrawal',originSourceId:ids[0]}});humanRoot=posted.result.contributionId;
  const before=await one(owner,"SELECT c.id,c.discussion_id,r.payload::jsonb->>'body' body FROM canonical_v4.contributions c JOIN canonical_v4.revisions r ON r.contribution_id=c.id AND r.ordinal=0 WHERE c.id=$1",[humanRoot]);
  const identityCount=(await state()).identities;await owner.query('SELECT canonical_v4.ingest_forget_source($1,$2)',[generation,ids[0]]);
  assert.equal(await context(ids[0]),null);assert.equal((await context(ids[1])).subject,null);assert.equal((await state()).identities,identityCount);
  const after=await one(owner,"SELECT c.id,c.discussion_id,r.payload::jsonb->>'body' body FROM canonical_v4.contributions c JOIN canonical_v4.revisions r ON r.contribution_id=c.id AND r.ordinal=0 WHERE c.id=$1",[humanRoot]);assert.deepEqual(after,before);
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_subject_heads WHERE label_source_id=$1',[ids[0]])).n,0);
 });
 await test(8,async()=>{
  for(const role of ['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'])for(const sql of ['SELECT * FROM canonical_v4.named_subject_heads','DELETE FROM canonical_v4.named_subject_ids WHERE false'])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
  for(const role of ['murmingle_app','murmingle_crawler_submitter'])for(const sql of ["SELECT canonical_v4.named_publish('{}')","SELECT canonical_v4.named_candidates('g','h','[]')"])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
 });
 await test(9,async()=>{
  // Withdraw every derived head while retaining prepared material and identities.
  for(const id of ids.slice(1))await owner.query('UPDATE canonical_v4.runtime_source_stamps SET postable=false WHERE source_id=$1',[id]);
  for(const id of ids.slice(1))await owner.query('UPDATE canonical_v4.runtime_source_stamps SET postable=true WHERE source_id=$1',[id]);await prepare();
  const a=await input(ids.slice(1));const c=automaticSubjectNativeCommand(a);assert(c.updates.length>=2);c.updates[0].parentId=c.updates[1].subjectId;c.updates[1].parentId=c.updates[0].subjectId;
  const before=await state();await assert.rejects(worker.query('SELECT canonical_v4.named_publish($1::jsonb)',[JSON.stringify(c)]),code('P1283'));assert.deepEqual(await state(),before);
 });
 await test(10,async()=>{
  const a=await input(ids.slice(1)),stale=JSON.stringify(a);await repo.publish(stale);
  const before=await state();await assert.rejects(repo.publish(stale),code('conflict'));assert.deepEqual(await state(),before);
 });
 await test(11,async()=>{
  await prep.close();for(const id of ids.slice(1))await owner.query('SELECT canonical_v4.ingest_forget_source($1,$2)',[generation,id]);
  await owner.transaction(async tx=>{
   await tx.query('DELETE FROM canonical_v4.command_receipts WHERE contribution_id=$1',[humanRoot]);await tx.query('DELETE FROM canonical_v4.revisions WHERE contribution_id=$1',[humanRoot]);await tx.query('DELETE FROM canonical_v4.contributions WHERE id=$1',[humanRoot]);
   await tx.query('DELETE FROM canonical_v4.id_registry WHERE id=ANY($1::text[])',[[...ids,humanRoot]]);
  });
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.sources')).n,0);assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.named_subject_heads')).n,0);
  await owner.exec(`DROP TRIGGER named_source_invalidation ON canonical_v4.sources;DROP TRIGGER named_receipt_invalidation ON canonical_v4.operation_receipts;
   DROP TRIGGER named_stamp_invalidation ON canonical_v4.runtime_source_stamps;DROP TRIGGER named_embedding_invalidation ON canonical_v4.embeddings;
   DROP FUNCTION canonical_v4.named_invalidate_source(),canonical_v4.named_publish(jsonb),canonical_v4.named_read_source(text,text),canonical_v4.named_candidates(text,text,jsonb),canonical_v4.named_title_slice(text,integer,integer);
   DROP TABLE canonical_v4.named_subject_selections,canonical_v4.named_subject_members,canonical_v4.named_subject_heads,canonical_v4.named_subject_ids;
   DROP INDEX canonical_v4.semantic_runtime_generation_key;`);
 });
}
