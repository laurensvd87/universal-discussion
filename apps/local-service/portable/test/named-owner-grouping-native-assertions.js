// Actual owner/app/worker ports on the owned invented fixture. No live DB,
// classifier/model call, personal browsing policy or canonical retargeting.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createAutomaticAuthorContextRepository as authors} from '../canonical-v4/automatic-author-context-repository.js';
import {createCanonicalV4SemanticDiscussionRepository as policyRepository} from '../canonical-v4/semantic-discussion-repository.js';
import {createCanonicalV4LifecycleRepository as lifecycle} from '../canonical-v4/lifecycle-repository.js';
import {createCanonicalV4ReadFacade} from '../canonical-v4/read-facade.js';
import {createPostgresCanonicalService} from '../../src/application/create-postgres-canonical-service.js';
import {createRequestHandler} from '../../src/http/request-handler.js';
import {createCanonicalV4RuntimeRepository} from '../canonical-v4/runtime-repository.js';
import {createLocalServiceClient} from '../../../../spikes/topic-resolution/browser/core/local-service-client.js';
const code=c=>e=>e?.code===c,actor={id:'demo-alex',type:'human',demo:true};
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function one(db,sql,args=[]){const r=await db.query(sql,args);assert.equal(r.rows.length,1);return r.rows[0];}
async function bounded(p){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned grouping operation timed out')),1200);})]);}finally{clearTimeout(timer);}}
export async function runNamedOwnerGroupingNativeAssertions(scope){
 const {owner,app,observer,generation,sourceIds,check}=scope,source=sourceIds[1];let serial=0;
 const policy=policyRepository({database:owner}),prior=await policy.ownerPolicy(),raw=JSON.stringify({generation,sourceId:source}),roots=[];
 const grouped=authors({database:app,ownerGrouping:true,nextId:()=>`group-native-root-${++serial}`}),original=authors({database:app});
 const leaf=(await original.editor(raw)).scope,head=await one(owner,'SELECT parent_id::text parent,ancestor_path FROM canonical_v4.named_subject_heads WHERE subject_id=$1',[leaf.id]);assert(head.parent);
 const parent=head.parent,parentRoute='subject-'+parent,leafRoute='subject-'+leaf.id;
 const expected=(database=owner)=>one(database,'SELECT generation,revision::integer revision FROM canonical_v4.runtime_state WHERE singleton');
 const editor=()=>grouped.editor(raw);
 async function set(defaultMaxDepth,overrides=[]){const p=await policy.ownerPolicy();return policy.setOwnerPolicy({expectedRevision:p.revision,defaultMaxDepth,overrides});}
 async function post(context,body='The owner chose this general discussion group.',headerDatabase=owner){const r=await grouped.appendRoot(JSON.stringify({actorId:actor.id,requestId:'group-native-request-'+(++serial),expected:await expected(headerDatabase),
  command:{type:'create-root',topicId:context.topicId,body,originSourceId:source},scope:context.scope}));roots.push(r.result.contributionId);return r.result.contributionId;}
 const material=()=>owner.query(`SELECT s.id,s.write_version::text,s.payload,e.payload embedding,i.body_wire_hash,i.title_wire_hash,i.supported_path
  FROM canonical_v4.sources s JOIN canonical_v4.embeddings e ON e.source_id=s.id JOIN canonical_v4.semantic_inputs i ON i.source_id=s.id
  ORDER BY s.id,i.matcher_hash`).then(r=>r.rows);
 let beforeMaterial=null,broadRoot=null,capturedBroad=null,reads=null;
 await check(8,async()=>{
  const manifest=(await owner.query('SELECT * FROM canonical_v4.schema_migrations ORDER BY version')).rows,version=await expected();
  await owner.exec(await readFile(new URL('../canonical-v4/drafts/named-owner-grouping.sql',import.meta.url),'utf8'));
  assert.deepEqual(await expected(),version);assert.deepEqual((await owner.query('SELECT * FROM canonical_v4.schema_migrations ORDER BY version')).rows,manifest);assert.deepEqual(await policy.ownerPolicy(),prior);
  beforeMaterial=await material();
 });
 await check(9,async()=>{
  await set(1);const a=await editor(),b=await authors({database:observer,ownerGrouping:true}).editor(raw);
  assert.equal(a.scope.id,parent);assert.equal(b.scope.id,parent);assert.equal((await original.editor(raw)).scope.id,leaf.id);
  assert.equal((await one(owner,'SELECT subject_id::text id FROM canonical_v4.named_subject_selections WHERE source_id=$1',[source])).id,leaf.id);
  assert.deepEqual(await material(),beforeMaterial);capturedBroad=a;
 });
 await check(10,async()=>{
  await set(2,[{nodeId:parentRoute,maxDepth:1}]);assert.equal((await editor()).scope.id,parent,'niche subtree remains broad under a deeper global default');
  await set(1,[{nodeId:parentRoute,maxDepth:2}]);assert.equal((await editor()).scope.id,leaf.id,'popular subtree can be more specific');
 });
 await check(11,async()=>{
  await set(1,[{nodeId:parentRoute,maxDepth:1},{nodeId:leafRoute,maxDepth:2}]);assert.equal((await editor()).scope.id,leaf.id,'deepest explicit topic rule wins');
  // These general-web invented coordinates intentionally abstain in the strict
  // fixed classifier. Do not manufacture a fixed category for this branch.
  assert.deepEqual(head.ancestor_path,[]);await set(1,[{nodeId:'games',maxDepth:2}]);assert.equal((await editor()).scope.id,parent,'an unsupported fixed subtree rule must not affect this learned branch');
  // Separate owner-only metadata control exercises positive inheritance. It is
  // not an issued classification, Source assignment or posting-authority test.
  const marker=Error('Rollback controlled owner metadata');let rolledBack=false;
  try{await owner.transaction(async tx=>{
   const a='c0000000-0000-4000-8000-000000000001',b='c0000000-0000-4000-8000-000000000002';
   await tx.query('INSERT INTO canonical_v4.named_subject_ids VALUES($1,1),($2,1)',[a,b]);
   for(const [id,from,up]of [[a,parent,null],[b,leaf.id,a]])await tx.query(`INSERT INTO canonical_v4.named_subject_heads
    SELECT $1,1,generation,policy_hash,matcher_hash,representation_hash,focus_key,'games',label,label_source_id,$3::uuid,ARRAY['games']::text[],prototype_values
    FROM canonical_v4.named_subject_heads WHERE subject_id=$2`,[id,from,up]);
   assert.equal((await one(tx,'SELECT canonical_v4.named_grouped_subject($1,$2) id',[generation,b])).id,b,'a declared fixed subtree default applies to the controlled learned metadata path');
   throw marker;
  });}catch(e){if(e!==marker)throw e;rolledBack=true;}assert(rolledBack);
 });
 await check(12,async()=>{
  const p=await policy.ownerPolicy();for(const overrides of [[{nodeId:leafRoute,maxDepth:1}],
   [{nodeId:'subject-00000000-0000-4000-8000-000000000099',maxDepth:2}]])
   await assert.rejects(policy.setOwnerPolicy({expectedRevision:p.revision,defaultMaxDepth:1,overrides}),code('invalid'));
  const duplicate=[{nodeId:leafRoute,maxDepth:2},{nodeId:leafRoute,maxDepth:2}];
  await assert.rejects(policy.setOwnerPolicy({expectedRevision:p.revision,defaultMaxDepth:1,overrides:duplicate}),TypeError);
  await assert.rejects(owner.query('SELECT canonical_v4.semantic_set_owner_policy($1,$2,$3::jsonb)',[p.revision,1,JSON.stringify(duplicate)]),code('P1223'));
  await assert.rejects(policy.setOwnerPolicy({expectedRevision:p.revision-1,defaultMaxDepth:1,overrides:[]}),code('conflict'));assert.deepEqual(await policy.ownerPolicy(),p);
 });
 await check(13,async()=>{
  await set(1);broadRoot=await post(await editor());const publicBefore=await grouped.root(JSON.stringify({generation,rootId:broadRoot}));assert.equal(publicBefore.scope.id,parent);
  await set(2);assert.equal((await editor()).scope.id,leaf.id);assert.deepEqual(await grouped.root(JSON.stringify({generation,rootId:broadRoot})),publicBefore);
  assert.equal(await grouped.scopeCurrent(JSON.stringify({generation,topicId:capturedBroad.topicId,scope:capturedBroad.scope})),true,'an already captured broad draft remains valid');
 });
 await check(14,async()=>{
  for(const role of ['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter'])for(const sql of [
   "SELECT canonical_v4.semantic_set_owner_policy(0,1,'[]')","SELECT canonical_v4.named_current_subject_path('g','00000000-0000-4000-8000-000000000001')",
   "SELECT canonical_v4.named_grouped_subject('g','00000000-0000-4000-8000-000000000001')"])
   await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
  for(const role of ['murmingle_ingest_worker','murmingle_crawler_submitter'])await assert.rejects(owner.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query('SELECT canonical_v4.named_read_grouped_editor($1,$2)',[generation,source]);}),code('42501'));
 });
 await check(15,async()=>{
  await set(1);const p=await policy.ownerPolicy(),ready=defer(),release=defer();
  const held=owner.transaction(async tx=>{await policyRepository({database:tx}).setOwnerPolicy({expectedRevision:p.revision,defaultMaxDepth:2,overrides:[]});ready.resolve();await release.promise;});held.catch(e=>ready.resolve({error:e}));
  let posting=null,primary=null;
  try{const r=await ready.promise;if(r?.error)throw r.error;assert.equal((await bounded(editor())).scope.id,parent);
   posting=post(await editor(),'A human post completes while the owner depth update is uncommitted.',app);await bounded(posting);
  }catch(e){primary=e;}finally{release.resolve();for(const work of [held,posting])if(work)try{await work;}catch(e){primary??=e;}}
  if(primary)throw primary;assert.equal((await editor()).scope.id,leaf.id);
 });
 await check(16,async()=>{
  await set(1);reads=createCanonicalV4ReadFacade({database:app,automaticTopics:true});
  const service=createPostgresCanonicalService({reads,runtime:createCanonicalV4RuntimeRepository({database:app}),lifecycle:lifecycle({database:app}),authoredTopics:grouped,semanticDiscussions:true,automaticTopics:true}),config={hostHeader:'127.0.0.1:4174',origin:'chrome-extension://'+'a'.repeat(32),capability:'invented-owner-grouping-capability'},handle=createRequestHandler({config,service});
  const client=createLocalServiceClient({fetchImpl:async(url,options)=>{const u=new URL(url),r=await handle({method:options.method,url:u.pathname,headers:{...options.headers,host:config.hostHeader,origin:config.origin},body:options.body});return new Response(r.body,{status:r.status,headers:r.headers});},getToken:()=>config.capability});
  assert.equal((await client.semanticCapabilities()).protocol,'semantic-topics/v2');assert.equal((await client.authorContext({sourceId:source})).context.scope.id,parent);
  await set(2);assert.equal((await client.authorContext({sourceId:source})).context.scope.id,leaf.id,'the same HTTP client observes the changed owner default');
  await set(1);assert.equal((await client.authorContext({sourceId:source})).context.scope.id,parent);
  const topics=await client.semanticSearch({query:'Orion Console Pro',limit:20,cursor:null});assert(topics.topics.some(t=>t.nodeId===leafRoute),'specific existing conversations remain explicitly searchable');
  assert.deepEqual(await material(),beforeMaterial);
 });
 // Restore the existing fixture's default/rules before its subsequent page tests.
 await set(prior.defaultMaxDepth,prior.overrides);
 return async()=>check(17,async()=>{
  assert.equal((await one(owner,'SELECT count(*)::integer n FROM canonical_v4.sources')).n,0);assert.equal(await editor(),null);
  const retained=await grouped.root(JSON.stringify({generation,rootId:broadRoot}));assert.equal(retained.scope.id,parent);assert.equal(retained.scope.caption,capturedBroad.scope.caption);
  await set(1,[{nodeId:leafRoute,maxDepth:2}]);assert((await policy.ownerPolicy()).overrides.some(r=>r.nodeId===leafRoute));await set(prior.defaultMaxDepth,prior.overrides);
  const life=lifecycle({database:app});for(const root of roots)await life.command(await expected(),{type:'withdraw',contributionId:root},actor);
  await owner.transaction(async tx=>{for(const table of ['command_receipts','revisions'])await tx.query('DELETE FROM canonical_v4.'+table+' WHERE contribution_id=ANY($1::text[])',[roots]);
   await tx.query('DELETE FROM canonical_v4.contributions WHERE id=ANY($1::text[])',[roots]);await tx.query('DELETE FROM canonical_v4.id_registry WHERE id=ANY($1::text[])',[roots]);});
  await owner.exec(`DROP FUNCTION canonical_v4.named_read_grouped_editor(text,text),canonical_v4.named_grouped_subject(text,uuid),canonical_v4.named_current_subject_path(text,uuid),canonical_v4.semantic_set_owner_policy(bigint,integer,jsonb);
   ALTER FUNCTION canonical_v4.semantic_set_static_owner_policy_core(bigint,integer,jsonb) RENAME TO semantic_set_owner_policy;`);
 });
}
